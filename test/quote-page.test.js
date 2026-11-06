'use strict';
var test = require('node:test');
var assert = require('node:assert/strict');
var fs = require('fs');
var path = require('path');
var {JSDOM} = require('jsdom');

var root = path.join(__dirname, '..');
var DISCLOSURE = 'Financing terms longer than 18 months cannot be combined with sale pricing. Regular prices apply.';

function loadPage(){
  var html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  var rules = fs.readFileSync(path.join(root, 'quote-rules.js'), 'utf8');
  html = html.replace('<script src="quote-rules.js"></script>', '');
  var dom = new JSDOM(html, {
    runScripts: 'dangerously',
    url: 'https://meeanw.github.io/vendor-finder/',
    pretendToBeVisual: true,
    beforeParse: function(window){ window.eval(rules); }
  });
  var api = dom.window.vfQuoteApi;
  var err = dom.window.document.getElementById('nj-err');
  assert.ok(api, 'quote API did not load' + (err && err.textContent ? ': ' + err.textContent.slice(0, 300) : ''));
  return {dom: dom, api: api};
}

test('the page source keeps cart preview hidden until pieces are added and does not ship new secrets', function(){
  var html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  var rules = fs.readFileSync(path.join(root, 'quote-rules.js'), 'utf8');
  assert.match(html, /store:'Bridgewater'/);
  assert.match(html, /store:'Cherry Hill'/);
  assert.match(html, /function cartPreviewReady\(\)\{return CART\.added\.length>0/);
  assert.match(html, /pv\.hidden=!cartPreviewReady\(\)/);
  assert.match(html, /data-cart="preview"'\+\(cartPreviewReady\(\)\?'':' hidden'\)/);
  assert.equal(rules.indexOf('NAEEM_REP_PIN'), -1);
  assert.equal(rules.indexOf('HANS_REP_PIN'), -1);
  assert.equal(rules.indexOf('LOG_TOKEN'), -1);
  assert.equal(html.indexOf('XW9222'), -1);
});

test('both real text and email include the disclosure, and longer than 18 months quotes the regular price', function(){
  var api = loadPage().api;
  api.load({
    name: 'Jamie',
    phone: '9085550100',
    email: 'jamie@example.com',
    zip: '08807',
    dl: '0',
    ext: false,
    notes: '',
    pn: '',
    items: [{v: 'Raymour & Flanigan', d: 'Lugano chair', sku: '218092233', p: '100.00', rg: '150.00', q: '1', fin: 'Gray'}]
  });
  var text = api.text();
  var email = api.email();
  assert.ok(text.indexOf(DISCLOSURE) > text.indexOf('Financing options:'));
  assert.ok(email.indexOf(DISCLOSURE) > email.toLowerCase().indexOf('financing options'));
  assert.equal(text.indexOf('Displayed prices are regular prices.'), -1);
  assert.match(text, /\$100\.00/);
  assert.match(text, /Delivery to 08807: \$0\.00/);
  assert.match(text, /NJ sales tax \(6\.625%\)/);
  assert.match(text, /Estimated total:/);
  assert.match(email, /ESTIMATED TOTAL:/);
  assert.match(text, /72 hours/);
  assert.match(text, /Reply YES \(Quote #/);
  assert.match(email, /reply YES to this email \(Quote #/i);
  assert.match(text, /Cell /);
  assert.match(text, /Bridgewater/);
  assert.equal(email.indexOf('Cell '), -1);
  assert.match(email, /Prepared by /);

  api.load({
    name: 'Jamie', phone: '9085550100', email: 'jamie@example.com', zip: '08807', dl: '0', ext: true, notes: '', pn: '',
    items: [{v: 'Raymour & Flanigan', d: 'Lugano chair', sku: '218092233', p: '100.00', rg: '150.00', q: '1'}]
  });
  text = api.text();
  email = api.email();
  assert.match(text, /Regular price: \$150\.00/);
  assert.match(email, /Regular price: \$150\.00/);
  assert.match(text, /Displayed prices are regular prices\./);
  assert.match(email, /Displayed prices are regular prices\./);
  assert.equal(text.indexOf('$100.00'), -1);
  assert.equal(email.indexOf('$100.00'), -1);
  assert.ok(api.valid('sms').length === 0, JSON.stringify(api.valid('sms')));
});

test('missing regular price blocks preview, blank delivery is not zero, and edits invalidate preview', function(){
  var page = loadPage();
  var api = page.api;
  var dom = page.dom;
  api.load({
    name: 'Jamie', phone: '9085550100', email: 'jamie@example.com', zip: '08002', dl: '', ext: false, notes: '', pn: '',
    items: [{v: 'Raymour & Flanigan', d: 'Sofa', p: '200.00', q: '1'}]
  });
  var blocked = api.preview('sms');
  assert.equal(blocked.sms, '');
  assert.equal(dom.window.document.getElementById('rpreview').hidden, true);
  assert.ok(api.valid('sms').some(function(row){return row[0] === 'rdel'}));
  assert.equal(api.text().indexOf('Delivery: $0.00'), -1);
  assert.match(api.text(), /Delivery: not entered|enter the delivery charge/);

  api.load({
    name: 'Jamie', phone: '9085550100', email: 'jamie@example.com', zip: '08002', dl: '0', ext: false, notes: '', pn: '',
    items: [{v: 'Raymour & Flanigan', d: 'Sofa', p: '200.00', q: '1'}]
  });
  var preview = api.preview('sms');
  assert.ok(preview.sms.indexOf(DISCLOSURE) > 0);
  assert.match(preview.sms, /Delivery to 08002: \$0\.00/);
  assert.equal(preview.hidden, false);
  var emailPreview = api.preview('mail');
  assert.ok(emailPreview.mail.indexOf(DISCLOSURE) > 0);

  var field = dom.window.document.getElementById('rdel');
  field.value = '25';
  field.dispatchEvent(new dom.window.Event('input', {bubbles: true}));
  assert.equal(dom.window.document.getElementById('rpreview').hidden, true);
  assert.notEqual(api.text(), preview.sms);
  var again = api.preview('sms');
  assert.match(again.sms, /Delivery to 08002: \$25\.00/);
  assert.match(again.body, new RegExp(DISCLOSURE.replace(/[.]/g, '\\.')));

  api.load({
    name: 'Jamie', phone: '9085550100', email: 'jamie@example.com', zip: '08002', dl: '25', ext: true, notes: '', pn: '',
    items: [{v: 'Raymour & Flanigan', d: 'Sofa', p: '200.00', q: '1', tg: {t: 'sale'}}]
  });
  var missing = api.preview('mail');
  assert.equal(missing.mail, '');
  assert.ok(api.valid('mail').some(function(row){return /regular price/i.test(row[1])}));
});

test('applying website prices while financing is longer than 18 months does not put the sale price back', function(){
  var api = loadPage().api;
  var web = {ok: 1, t: Date.now(), p: 365.75, o: 385, st: 'Outlet', u: '/outlet/sofas-sectionals-clearance/lugano-microfiber-left-arm-facing-recliner-218092233', nm: 'Lugano Microfiber Left Arm Facing Recliner', color: '', colorState: 'unconfirmed', delState: 'unconfirmed', delText: '', delReason: 'No ZIP-based delivery estimate for 08807 is in the website search. Stock dates and lead times are not delivery promises.', sku: '218092233', zip: '08807', discounted: 1};
  api.load({
    name: 'Jamie', phone: '9085550100', email: 'jamie@example.com', zip: '08807', dl: '199', ext: true, notes: '', pn: '',
    items: [{v: 'Raymour & Flanigan', d: 'My note name', sku: '218092233', fin: 'Rep color', p: '10.00', rg: '', q: '1', e: 'Ask the warehouse', w: web}]
  });
  assert.equal(api.items()[0].d, 'My note name');
  assert.equal(api.items()[0].fin, 'Rep color');
  assert.equal(api.items()[0].e, 'Ask the warehouse');
  api.applyPrice(0);
  assert.equal(api.items()[0].p, '385.00');
  assert.equal(api.items()[0].rg, '385.00');
  assert.notEqual(api.items()[0].p, '365.75');
  assert.equal(api.items()[0].d, 'My note name');
  assert.equal(api.items()[0].e, 'Ask the warehouse');
  api.applyName(0);
  assert.equal(api.items()[0].d, 'Lugano Microfiber Left Arm Facing Recliner');
  var text = api.text();
  assert.match(text, /Regular price: \$385\.00/);
  assert.equal(text.indexOf('$365.75'), -1);
  assert.match(text, /Ask the warehouse/);
});

test('added-items confirmation follows the quote item, not the stale import name', function(){
  var page = loadPage();
  var api = page.api;
  var cart = page.dom.window.vfCart;
  api.load({
    name:'Jamie Cole', phone:'9085550100', email:'jamie@example.com', zip:'08002', dl:'0', ext:false, notes:'', pn:'',
    items:[
      {v:'Raymour & Flanigan', d:'Magdalena Server', sku:'750015022', q:'1', p:'714.97', rg:'714.97'},
      {v:'Raymour & Flanigan', d:'Magdalena 7pc Dining set', sku:'797015027', q:'2', p:'1099.00', rg:'1099.00'}
    ]
  });
  cart.seed([
    {sku:'750015022', name:'Magdalena Server', price:'714.97', reg:'714.97'},
    {sku:'797015027', name:'A', price:'10.00', reg:'10.00'}
  ]);
  var shown = cart.confirmText();
  assert.match(shown, /Magdalena 7pc Dining set/);
  assert.match(shown, /2 × \$1,099\.00/);
  assert.equal(shown.indexOf('\nA\n'), -1);
  assert.doesNotMatch(shown, /^A$/m);
  var preview = cart.previewText();
  assert.match(preview, /Magdalena 7pc Dining set/);
  assert.doesNotMatch(preview, /\n1\. A\n/);
  page.dom.window.document.getElementById('rq1').value = '1';
  page.dom.window.document.getElementById('rq1').dispatchEvent(new page.dom.window.Event('input', {bubbles:true}));
  assert.match(cart.confirmText(), /1 × \$1,099\.00/);
  page.dom.window.document.querySelector('[data-rrm="1"]').click();
  assert.equal(cart.confirmText().indexOf('797015027'), -1);
  assert.match(cart.confirmText(), /Magdalena Server/);
});

test('a one-letter name cannot be sent until the rep confirms it, and a short real name can', function(){
  var api = loadPage().api;
  api.load({
    name:'Jamie Cole', phone:'9085550100', email:'jamie@example.com', zip:'08002', dl:'0', ext:false, notes:'', pn:'',
    items:[{v:'Raymour & Flanigan', d:'A', sku:'797015027', q:'1', p:'1099.00', rg:'1099.00'}]
  });
  assert.equal(api.preview('sms').sms, '');
  assert.ok(api.valid('sms').some(function(row){return /incomplete/i.test(row[1])}));
  api.load({
    name:'Jamie Cole', phone:'9085550100', email:'jamie@example.com', zip:'08002', dl:'0', ext:false, notes:'', pn:'',
    items:[{v:'Raymour & Flanigan', d:'A', sku:'797015027', q:'1', p:'1099.00', rg:'1099.00', nameOk:true}]
  });
  assert.match(api.text(), /\n1\. A\n/);
  api.load({
    name:'Jamie Cole', phone:'9085550100', email:'jamie@example.com', zip:'08002', dl:'0', ext:false, notes:'', pn:'',
    items:[{v:'Raymour & Flanigan', d:'TV', sku:'797015027', q:'1', p:'1099.00', rg:'1099.00', e:'Get it in 3-5 Weeks'}]
  });
  var text = api.text();
  var email = api.email();
  assert.match(text, /Est\. delivery \(showroom ZIP 08807\): Get it in 3-5 Weeks/);
  assert.match(email, /showroom ZIP 08807/);
  assert.match(text, /subject to confirmation and is not a guarantee/);
  assert.equal(text.indexOf('November 9'), -1);
});

test('mobile layout keeps preview actions in the quote sheet', function(){
  var dom = loadPage().dom;
  var doc = dom.window.document;
  var form = doc.getElementById('rform');
  form.hidden = false;
  doc.getElementById('rgate').hidden = true;
  doc.getElementById('rsheet').className = 'qsheet rsheet open repmode';
  var preview = doc.getElementById('rpreviewtext');
  var email = doc.getElementById('rpreviewmail');
  var sheet = doc.getElementById('rsheet');
  assert.ok(preview);
  assert.ok(email);
  assert.equal(preview.hidden, false);
  assert.ok(sheet.contains(preview));
  assert.equal(doc.getElementById('rpreview').hidden, true);
  assert.equal(doc.getElementById('rcartpreview'), null);
  var css = Array.prototype.map.call(doc.styleSheets, function(s){
    try{return Array.prototype.map.call(s.cssRules, function(r){return r.cssText}).join('\n')}catch(e){return ''}
  }).join('\n');
  assert.match(css, /max-width:\s*479px/);
  assert.match(css, /flex-direction:\s*column/);
});
