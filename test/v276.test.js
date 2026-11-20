'use strict';
var test = require('node:test');
var assert = require('node:assert/strict');
var fs = require('fs');
var path = require('path');
var {JSDOM} = require('jsdom');

var root = path.join(__dirname, '..');

function loadPage(prep){
  var html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  var rules = fs.readFileSync(path.join(root, 'quote-rules.js'), 'utf8');
  html = html.replace('<script src="quote-rules.js"></script>', '');
  var dom = new JSDOM(html, {
    runScripts: 'dangerously',
    url: 'https://meeanw.github.io/vendor-finder/',
    pretendToBeVisual: true,
    beforeParse: function(window){ window.eval(rules); if(prep) prep(window); }
  });
  var api = dom.window.vfQuoteApi;
  assert.ok(api, 'quote API did not load');
  return {dom:dom, api:api, win:dom.window, doc:dom.window.document};
}
function base(extra){
  var o = {name:'Jamie Cole', phone:'9085550100', email:'jamie@example.com', zip:'08807', dl:'0', notes:'', pn:'', items:[{v:'Raymour & Flanigan', d:'Chair', p:'100.00', q:'1'}]};
  Object.keys(extra || {}).forEach(function(k){ o[k] = extra[k]; });
  return o;
}
function wait(){ return new Promise(function(r){ setTimeout(r, 40); }); }

test('floor samples and a sale that ends inside the hold are stated in the text and the email', function(){
  var api = loadPage().api;
  api.load(base({items:[
    {v:'Raymour & Flanigan', d:'Floor sample chair', p:'400.00', q:'1', tg:{t:'floor', w:'800'}},
    {v:'Raymour & Flanigan', d:'Sale sofa', p:'200.00', rg:'300.00', q:'1', tg:{t:'sale', se:'2026-11-21'}}
  ]}));
  var text = api.text();
  var email = api.email();
  [text, email].forEach(function(msg){
    assert.match(msg, /Floor sample, sold as is\. No layaways, no warranties\./);
    assert.match(msg, /Sale price good through Nov 21, 2026; quote otherwise valid 72 hours/);
  });
  assert.match(text, /\$400\.00/);
  assert.match(text, /\$200\.00/);
});

test('an unreadable name, a bad price, a bad quantity, a blank ZIP, and junk option delivery block sending', function(){
  var api = loadPage().api;
  api.load(base({items:[{v:'Raymour & Flanigan', d:'BR ~ Hie AR RE', sku:'280019716', p:'10.00', q:'1'}]}));
  assert.ok(api.valid('sms').some(function(row){ return /website-name button or retype/.test(row[1]); }));

  api.load(base({items:[{v:'Raymour & Flanigan', d:'Chair', p:'', q:'1'}]}));
  assert.ok(api.valid('sms').some(function(row){ return /needs a price/.test(row[1]); }));
  api.load(base({items:[{v:'Raymour & Flanigan', d:'Chair', p:'-5', q:'1'}]}));
  assert.ok(api.valid('sms').some(function(row){ return /Negative prices/.test(row[1]); }));
  api.load(base({items:[{v:'Raymour & Flanigan', d:'Chair', p:'abc', q:'1'}]}));
  assert.ok(api.valid('sms').some(function(row){ return /must be a number/.test(row[1]); }));
  api.load(base({items:[{v:'Raymour & Flanigan', d:'Chair', p:'.5', q:'1'}]}));
  assert.equal(api.valid('sms').length, 0);

  api.load(base({dl:'free', items:[{v:'Raymour & Flanigan', d:'Chair', p:'10.00', q:'1'}]}));
  assert.match(api.text(), /Delivery to 08807: \$0\.00/);
  api.load(base({dl:'.5', items:[{v:'Raymour & Flanigan', d:'Chair', p:'10.00', q:'1'}]}));
  assert.match(api.text(), /Delivery to 08807: \$0\.50/);

  api.load(base({items:[{v:'Raymour & Flanigan', d:'Chair', p:'10.00', q:'1.5'}]}));
  assert.equal(api.items()[0].q, '1.5');
  assert.ok(api.valid('sms').some(function(row){ return /whole number/.test(row[1]); }));
  assert.doesNotMatch(api.text(), /Qty 15/);

  api.load(base({zip:'', items:[{v:'Raymour & Flanigan', d:'Chair', p:'10.00', q:'1'}]}));
  assert.ok(api.valid('sms').some(function(row){ return row[0] === 'rzip'; }));
  assert.doesNotMatch(api.text(), /NJ 6\.625%/);

  api.load(base({items:[
    {v:'Raymour & Flanigan', d:'Main chair', p:'10.00', q:'1'},
    {v:'Raymour & Flanigan', d:'Other chair', p:'10.00', q:'1', opt:2, adl:'soon'}
  ]}));
  assert.ok(api.valid('sms').some(function(row){ return /Option 2 delivery/.test(row[1]); }));
  api.load(base({dl:'25', items:[
    {v:'Raymour & Flanigan', d:'Main chair', p:'10.00', q:'1'},
    {v:'Raymour & Flanigan', d:'Other chair', p:'10.00', q:'1', opt:2, adl:''}
  ]}));
  assert.equal(api.valid('sms').some(function(row){ return /Option 2 delivery/.test(row[1]); }), false);
});

test('a protector-only quote still needs an item name, and a restored draft keeps its quote number', function(){
  var page = loadPage(function(window){
    window.localStorage.setItem('vf-rep-v1', JSON.stringify({
      qn:'Q-251119-ABCD', name:'Jamie Cole', phone:'9085550100', email:'jamie@example.com', zip:'08807', dl:'0',
      items:[{v:'Raymour & Flanigan', d:'Chair', p:'100.00', q:'1'}]
    }));
  });
  assert.equal(page.api.quoteNo(), 'Q-251119-ABCD');
  assert.match(page.api.email(), /Quote #Q-251119-ABCD/);
  page.api.load(base({items:[{v:'Raymour & Flanigan', d:'', sku:'MAT5VERQU', p:'279.99', q:'1'}]}));
  assert.ok(page.api.valid('mail').some(function(row){ return /needs a product name/.test(row[1]); }));
});

test('outlet and sale prices stay separate, and long financing quotes the regular price', function(){
  var page = loadPage();
  var api = page.api;
  var web = {ok:1, t:Date.now(), p:499.99, o:899.99, st:'Outlet', u:'/outlet/chairs-recliners-clearance/adrienne-power-recliner-280019716', nm:'Adrienne Power Recliner', colorState:'unconfirmed', delState:'unconfirmed', sku:'280019716', zip:'08807', discounted:1};
  api.load(base({ext:true, items:[{v:'Raymour & Flanigan', d:'Adrienne', sku:'280019716', p:'10.00', rg:'', q:'1', w:web}]}));
  api.applyPrice(0);
  assert.equal(api.items()[0].p, '499.99');
  assert.equal(api.items()[0].rg, '899.99');
  assert.match(api.text(), /Items: \$899\.99/);
  assert.match(api.text(), /Financing terms longer than 18 months cannot be combined with sale pricing\. Regular prices apply\./);
  assert.match(api.email(), /Regular price: \$899\.99/);
  assert.match(api.email(), /Outlet/);
  api.setExt(false);
  assert.equal(api.items()[0].p, '499.99');
  assert.match(api.text(), /Items: \$499\.99/);
  assert.doesNotMatch(api.text(), /Items: \$899\.99/);
});

test('moving an item onto an option takes that option fee, and short texts include size and prices', function(){
  var page = loadPage();
  var api = page.api;
  var doc = page.doc;
  api.load(base({items:[
    {v:'Raymour & Flanigan', d:'Stay', p:'20.00', q:'1', opt:2, adl:'49'},
    {v:'Raymour & Flanigan', d:'Move me', p:'30.00', q:'1', opt:3, adl:'80', sz:'32" W x 35" D x 41" H'}
  ]}));
  var sel = doc.getElementById('rplace1');
  sel.value = '2';
  sel.dispatchEvent(new page.win.Event('change', {bubbles:true}));
  assert.equal(api.items()[1].opt, 2);
  assert.equal(api.items()[1].adl, '49');
  api.load(base({items:[{v:'Raymour & Flanigan', d:'Ella Marie chair', p:'100.00', q:'1', e:'Get it by Monday', sz:'32" W x 35" D x 41" H'}]}));
  var email = api.email();
  assert.match(email, /Estimated delivery: Get it by Monday/);
  assert.doesNotMatch(email, /Est\. delivery \(showroom ZIP 08807\)/);
  assert.match(email, /Your Investment/);
  assert.match(email, /Size: 32" W x 35" D x 41" H/);
  var text = api.text();
  assert.match(text, /\$100\.00/);
  assert.match(text, /Size: 32" W x 35" D x 41" H/);
  api.load(base({email:'', items:[
    {v:'Raymour & Flanigan', d:'One', p:'100.00', q:'1'},
    {v:'Raymour & Flanigan', d:'Two', p:'100.00', q:'1'},
    {v:'Raymour & Flanigan', d:'Three', p:'100.00', q:'1'},
    {v:'Raymour & Flanigan', d:'Four', p:'100.00', q:'1'}
  ]}));
  assert.equal(api.text().indexOf('details in the email'), -1);
  assert.doesNotMatch(api.text(), /^1\. /m);
});

test('a missing SKU stops, a second tap does not start another lookup, and saved details fill the quote', async function(){
  var page = loadPage();
  var api = page.api;
  var doc = page.doc;
  var searches = 0;
  page.win.fetch = function(url){
    var s = String(url);
    if(s.indexOf('sku-index.json') >= 0) return Promise.resolve({ok:true, json:function(){ return Promise.resolve({'111111111':['Other chair','/chairs/other-111111111']}); }});
    if(s.indexOf('sku-details.json') >= 0) return Promise.resolve({ok:false, status:404, json:function(){ return Promise.resolve({}); }});
    if(s.indexOf('/search/') >= 0) searches++;
    return Promise.resolve({ok:true, json:function(){ return Promise.resolve({response:{total_num_results:0, results:[]}}); }});
  };
  api.load(base({items:[{v:'Raymour & Flanigan', d:'Chair', sku:'280019716', p:'10.00', q:'1'}]}));
  doc.querySelector('[data-wp="0"]').click();
  doc.querySelector('[data-wp="0"]').click();
  await wait();
  assert.equal(searches, 0);
  assert.match(doc.getElementById('rw0').textContent, /SKU not found on raymourflanigan.com/);

  var page2 = loadPage();
  api = page2.api;
  doc = page2.doc;
  searches = 0;
  var details = {'545060179':{color:'Gray', delivery:'Get it by Monday, November 23', checked:'2026-11-20', w:32, d:35, h:41}};
  page2.win.fetch = function(url){
    var s = String(url);
    if(s.indexOf('sku-index.json') >= 0) return Promise.resolve({ok:true, json:function(){ return Promise.resolve({'545060179':['Ella Marie Triple Power Swivel Glider Recliner','/nursery/rocking-chairs/ella-marie-triple-power-swivel-glider-recliner-545060179']}); }});
    if(s.indexOf('sku-details.json') >= 0) return Promise.resolve({ok:true, json:function(){ return Promise.resolve(details); }});
    if(s.indexOf('/search/') >= 0){ searches++; return Promise.resolve({ok:true, json:function(){ return Promise.resolve({response:{total_num_results:0, results:[]}}); }}); }
    return Promise.resolve({ok:false, status:404, json:function(){ return Promise.resolve({}); }});
  };
  api.load(base({items:[{v:'Raymour & Flanigan', d:'BR ~ Hie AR RE', sku:'545060179', p:'10.00', q:'1'}]}));
  var btn = doc.querySelector('[data-wp="0"]');
  btn.click();
  btn.click();
  await wait();
  assert.equal(searches, 1);
  doc.querySelector('[data-wpall="0"]').click();
  assert.equal(doc.getElementById('rd0').value, 'Ella Marie Triple Power Swivel Glider Recliner');
  assert.equal(doc.getElementById('rfn0').value, 'Gray');
  assert.equal(doc.getElementById('re0').value, 'Get it by Monday, November 23 (checked Nov 20, 2026)');
  assert.equal(doc.getElementById('rsz0').value, '32" W x 35" D x 41" H');
  assert.match(api.email(), /Size: 32" W x 35" D x 41" H/);
  assert.match(api.text(), /Size: 32" W x 35" D x 41" H/);
});

test('logging reads a text response and a rep with no log URL is told so', async function(){
  var page = loadPage();
  var api = page.api;
  api.sign('hans');
  assert.match(api.logText(), /Hans has no quote log set up/);
  api.sign('naeem');
  api.load(base());
  var seen = [];
  page.win.fetch = function(url, opts){
    seen.push(opts && opts.mode);
    seen.push(opts && opts.headers && opts.headers['Content-Type']);
    return Promise.resolve({ok:true, text:function(){ return Promise.resolve('{"ok":true}'); }});
  };
  api.sendLog('mail');
  await wait();
  assert.equal(seen[0], 'cors');
  assert.match(String(seen[1]), /text\/plain/);
  assert.equal(api.logText(), 'Logged');
  page.win.fetch = function(){ return Promise.resolve({ok:false, text:function(){ return Promise.resolve('no'); }}); };
  api.sendLog('sms');
  await wait();
  assert.equal(api.logText(), 'Not logged, will retry');
  var queued = JSON.parse(page.win.localStorage.getItem('vf-logq-v1-naeem') || '[]');
  assert.ok(queued.length >= 1);
});

test('the service worker can install when the SKU files are missing', function(){
  var sw = fs.readFileSync(path.join(root, 'sw.js'), 'utf8');
  assert.match(sw, /VERSION='2\.7\.6'/);
  var precache = sw.match(/var PRECACHE=\[(.*?)\]/)[1];
  assert.equal(precache.indexOf('sku-index.json'), -1);
  assert.equal(precache.indexOf('sku-details.json'), -1);
  assert.match(sw, /LAZY=\['sku-index\.json','sku-details\.json'\]/);
  var html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  assert.match(html, /inputmode="numeric"/);
  assert.match(html, /TODO: rotate the public log token/);
  var rules = fs.readFileSync(path.join(root, 'quote-rules.js'), 'utf8');
  assert.equal(rules.indexOf('LOG_TOKEN'), -1);
  assert.equal(rules.indexOf('WSTW-'), -1);
});
