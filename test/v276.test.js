'use strict';
var test = require('node:test');
var assert = require('node:assert/strict');
var fs = require('fs');
var path = require('path');
var {JSDOM} = require('jsdom');

var root = path.join(__dirname, '..');
var openPages = [];

function trackTimers(window){
  var ids = [];
  var st = window.setTimeout.bind(window);
  var si = window.setInterval.bind(window);
  window.setTimeout = function(){ var id = st.apply(window, arguments); ids.push(id); return id; };
  window.setInterval = function(){ var id = si.apply(window, arguments); ids.push(id); return id; };
  window.__vfStop = function(){ ids.splice(0).forEach(function(id){ window.clearTimeout(id); window.clearInterval(id); }); };
}
function loadPage(prep){
  var html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  var rules = fs.readFileSync(path.join(root, 'quote-rules.js'), 'utf8');
  html = html.replace('<script src="quote-rules.js"></script>', '');
  var dom = new JSDOM(html, {
    runScripts: 'dangerously',
    url: 'https://meeanw.github.io/vendor-finder/',
    pretendToBeVisual: true,
    beforeParse: function(window){ trackTimers(window); window.eval(rules); if(prep) prep(window); }
  });
  openPages.push(dom);
  var api = dom.window.vfQuoteApi;
  assert.ok(api, 'quote API did not load');
  return {dom:dom, api:api, win:dom.window, doc:dom.window.document};
}
test.afterEach(function(){
  while(openPages.length){
    var dom = openPages.pop();
    try{ dom.window.__vfStop(); }catch(e){}
    try{ dom.window.close(); }catch(e){}
  }
});
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
  assert.match(api.text(), /1\. One — \$100\.00/);
  assert.match(api.text(), /4\. Four — \$100\.00/);
  assert.equal(api.text().indexOf('and 3 more'), -1);
});

test('option items show their size in the email and in a short text of three or fewer items', function(){
  var api = loadPage().api;
  var leaf = '60" W x 42" D x 30" H (78" W with leaf)';
  api.load(base({items:[
    {v:'Raymour & Flanigan', d:'Main chair', p:'100.00', q:'1', sz:'32" W x 35" D x 41" H'},
    {v:'Raymour & Flanigan', d:'Fowler Dining Table', p:'200.00', q:'1', opt:2, sz:leaf},
    {v:'Raymour & Flanigan', d:'No size chair', p:'50.00', q:'1', opt:2, sz:''}
  ]}));
  var email = api.email();
  var opt = email.slice(email.indexOf('Option 2'));
  assert.match(opt, /1\. Fowler Dining Table/);
  assert.ok(opt.indexOf('   Size: ' + leaf) > opt.indexOf('1. Fowler Dining Table'));
  assert.ok(opt.indexOf('   Size: ' + leaf) < opt.indexOf('2. No size chair'));
  assert.equal(opt.split('Size:').length, 2);
  var text = api.text();
  assert.match(text, /Size: 32" W x 35" D x 41" H/);
  assert.match(text, /Option 2, Fowler Dining Table size: 60" W x 42" D x 30" H \(78" W with leaf\)/);

  api.load(base({items:[
    {v:'Raymour & Flanigan', d:'Main chair', p:'100.00', q:'1', sz:'32" W x 35" D x 41" H'},
    {v:'Raymour & Flanigan', d:'One', p:'10.00', q:'1', opt:2, sz:leaf},
    {v:'Raymour & Flanigan', d:'Two', p:'10.00', q:'1', opt:3},
    {v:'Raymour & Flanigan', d:'Three', p:'10.00', q:'1', opt:3}
  ]}));
  assert.equal(api.text().indexOf('Size:'), -1);
  assert.match(api.email(), /Size: 60" W x 42" D x 30" H \(78" W with leaf\)/);
});

test('an option item can take the website size from its own buttons', function(){
  var page = loadPage();
  var api = page.api;
  var doc = page.doc;
  var web = {ok:1, t:Date.now(), p:499.99, st:'Retail', nm:'Adrienne Power Recliner', sku:'280019716', sz:'36" W x 39.5" D x 41" H', u:'/outlet/chairs-recliners-clearance/adrienne-power-recliner-280019716', colorState:'unconfirmed', delState:'unconfirmed'};
  api.load(base({items:[{v:'Raymour & Flanigan', d:'Chair', sku:'280019716', p:'10.00', q:'1', opt:2, sz:'', w:web}]}));
  assert.equal(doc.getElementById('rplace0').value, '2');
  assert.ok(doc.getElementById('rsz0'));
  assert.ok(doc.querySelector('[data-wpsize="0"]'));
  doc.querySelector('[data-wpsize="0"]').click();
  assert.equal(doc.getElementById('rsz0').value, '36" W x 39.5" D x 41" H');
  assert.equal(api.items()[0].opt, 2);
  api.load(base({items:[{v:'Raymour & Flanigan', d:'Chair', sku:'280019716', p:'10.00', q:'1', opt:2, sz:'', w:web}]}));
  doc.querySelector('[data-wpall="0"]').click();
  assert.equal(doc.getElementById('rsz0').value, '36" W x 39.5" D x 41" H');
  assert.equal(doc.getElementById('rd0').value, 'Adrienne Power Recliner');
  assert.equal(api.items()[0].opt, 2);
  assert.match(api.email(), /Size: 36" W x 39\.5" D x 41" H/);
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

test('a SKU in the index but not yet in the details file still fills name and price', async function(){
  var page = loadPage();
  var api = page.api;
  var doc = page.doc;
  var priced = {response:{total_num_results:1, results:[{value:'Ella Marie Triple Power Swivel Glider Recliner', variations:[{value:'Ella Marie Triple Power Swivel Glider Recliner', data:{
    variation_id:'545060179',
    url:'/nursery/rocking-chairs/ella-marie-triple-power-swivel-glider-recliner-545060179',
    Pricing:JSON.stringify({price:799, originalPrice:999, priceStyle:'Sale'})
  }}]}]}};
  page.win.fetch = function(url){
    var s = String(url);
    if(s.indexOf('sku-index.json') >= 0) return Promise.resolve({ok:true, json:function(){ return Promise.resolve({'545060179':['Ella Marie Triple Power Swivel Glider Recliner','/nursery/rocking-chairs/ella-marie-triple-power-swivel-glider-recliner-545060179']}); }});
    if(s.indexOf('sku-details.json') >= 0) return Promise.resolve({ok:true, json:function(){ return Promise.resolve({}); }});
    if(s.indexOf('/search/') >= 0) return Promise.resolve({ok:true, json:function(){ return Promise.resolve(priced); }});
    return Promise.resolve({ok:false, status:404, json:function(){ return Promise.resolve({}); }});
  };
  api.load(base({items:[{v:'Raymour & Flanigan', d:'BR ~ Hie AR RE', sku:'545060179', p:'10.00', q:'1', e:'', sz:''}]}));
  doc.querySelector('[data-wp="0"]').click();
  await wait();
  assert.match(doc.getElementById('rw0').textContent, /Size and delivery aren.t available yet/);
  doc.querySelector('[data-wpall="0"]').click();
  assert.equal(doc.getElementById('rd0').value, 'Ella Marie Triple Power Swivel Glider Recliner');
  assert.equal(doc.getElementById('rp0').value, '799.00');
  assert.equal(doc.getElementById('rsz0').value, '');
  assert.equal(doc.getElementById('re0').value, '');
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

test('quote wording fixes from the v2.7.7 sample review', function(){
  var api = loadPage().api;
  var long = '162" W x 93" D x 29" H; Artemis I Right Arm Facing Chaise: 38" L x 66" W x 29" H; Artemis I Armless Loveseat: 64" L x 38" W x 29" H; Artemis I Armless Chair: 29" L x 38" W x 29" H';
  assert.ok(long.length > 140 && long.length < 500);
  api.load(base({items:[{v:'Raymour & Flanigan', d:'Artemis sectional', p:'1000.00', q:'1', sz:long}]}));
  assert.equal(api.items()[0].sz, long);
  var email = api.email();
  assert.match(email, /   Size: 162" W x 93" D x 29" H\n      Artemis I Right Arm Facing Chaise: 38" L x 66" W x 29" H\n      Artemis I Armless Loveseat/);
  assert.doesNotMatch(email, /Size: 162".*Armless Chair: 29/);
  assert.match(api.text(), /Size: 162" W x 93" D x 29" H/);
  assert.equal(api.text().indexOf('Armless Chair'), -1);

  api.load(base({items:[
    {v:'Raymour & Flanigan', d:'Adrienne Power Recliner', p:'499.99', q:'1', sz:'36" W x 39.5" D x 41" H', fin:'Linen'},
    {v:'Raymour & Flanigan', d:'Ella Marie chair', p:'799.00', q:'1', sz:'32" W x 35" D x 41" H', fin:'Fog'}
  ]}));
  assert.match(api.text(), /Adrienne Power Recliner size: 36" W x 39\.5" D x 41" H/);
  assert.match(api.text(), /Ella Marie chair size: 32" W x 35" D x 41" H/);

  api.load(base({ext:true, items:[{v:'Raymour & Flanigan', d:'Adrienne Power Recliner', p:'499.99', rg:'899.99', q:'1', fin:'Linen', tg:{t:'outlet'}}]}));
  email = api.email();
  var block = email.slice(email.indexOf('1. Adrienne'), email.indexOf('Your Investment'));
  assert.match(block, /Adrienne Power Recliner, Linen, Outlet/);
  assert.equal(block.split('Regular price:').length, 2);
  assert.match(block, /Outlet pricing does not apply with extended financing\./);
  assert.equal(block.indexOf('sale prices do not apply'), -1);
  api.load(base({ext:true, items:[{v:'Raymour & Flanigan', d:'Main sofa', p:'100.00', q:'1'}, {v:'Raymour & Flanigan', d:'Adrienne Power Recliner', p:'499.99', rg:'899.99', q:'1', fin:'Linen', opt:2, tg:{t:'outlet'}}]}));
  var opt = api.email().slice(api.email().indexOf('Option 2'), api.email().indexOf('Make It Last'));
  assert.match(opt, /Adrienne Power Recliner, Linen, Outlet/);
  assert.match(opt, /Outlet pricing does not apply with extended financing\./);

  api.load(base({ext:false, items:[{v:'Raymour & Flanigan', d:'Sale sofa', p:'200.00', rg:'300.00', q:'1', tg:{t:'sale', se:'2026-11-21'}}]}));
  assert.match(api.email(), /Sale price good through Nov 21, 2026 only\./);

  api.load(base({items:[{v:'Raymour & Flanigan', d:'Floor sample chair', p:'400.00', q:'1', tg:{t:'floor'}}]}));
  email = api.email();
  assert.match(email, /This price is good for 72 hours, until .+\. Floor samples are one of a kind and can’t be reserved, so the piece may sell before then\./);
  assert.equal(email.indexOf("can't be held"), -1);
  assert.equal(email.indexOf('can’t be held'), -1);
  assert.match(email, /Floor sample, sold as is\. No layaways, no warranties\./);

  api.load(base({email:'jamie@example.com', items:[
    {v:'Raymour & Flanigan', d:'One', p:'10.00', q:'1'},
    {v:'Raymour & Flanigan', d:'Two', p:'20.00', q:'1'},
    {v:'Raymour & Flanigan', d:'Three', p:'30.00', q:'1'},
    {v:'Raymour & Flanigan', d:'Four', p:'40.00', q:'1'}
  ]}));
  assert.match(api.text(), /and 3 more/);
  assert.doesNotMatch(api.text(), /^1\. One/m);

  api.load(base({email:'', items:[{v:'Raymour & Flanigan', d:'BEDGEAR Ver-Tex Performance Mattress Protector', sku:'MAT5VERQU', p:'279.99', q:'1'}]}));
  assert.match(api.text(), /Here’s your quote for BEDGEAR Ver-Tex Performance Protector\./);
  assert.match(api.email(), /This protector includes the 5-Year Platinum Mattress Plan\./);
  assert.equal(api.email().indexOf('5-year Platinum Protection:'), -1);

  api.load(base({zip:'088071', dl:'199.99', items:[{v:'Raymour & Flanigan', d:'Chair', p:'100.00', q:'1'}]}));
  assert.match(api.text(), /Delivery: ZIP needed/);
  assert.equal(api.text().indexOf('Delivery to 088071'), -1);
  assert.equal(api.email().indexOf('Delivery to 088071'), -1);
});

test('the quote number sits on its own line, with no period before a dot', function(){
  var api = loadPage().api;
  function noDot(msg){ assert.equal(msg.indexOf('. \u00b7'), -1, msg); assert.equal(msg.indexOf('.\u00b7'), -1); }
  api.load(base({items:[{v:'Raymour & Flanigan', d:'Chair', p:'100.00', q:'1'}]}));
  noDot(api.text()); noDot(api.email());
  assert.match(api.text(), /This price is held for you for 72 hours, until .+\nQuote #Q-/);
  api.load(base({items:[{v:'Raymour & Flanigan', d:'Sale sofa', p:'200.00', rg:'300.00', q:'1', tg:{t:'sale', se:'2026-11-21'}}]}));
  noDot(api.text()); noDot(api.email());
  assert.match(api.text(), /quote otherwise valid 72 hours\.\nQuote #Q-/);
  api.load(base({items:[{v:'Raymour & Flanigan', d:'Floor sample chair', p:'400.00', q:'1', tg:{t:'floor'}}]}));
  noDot(api.text()); noDot(api.email());
  assert.match(api.text(), /may sell before then\.\nQuote #Q-/);
});

test('the service worker can install when the SKU files are missing', function(){
  var sw = fs.readFileSync(path.join(root, 'sw.js'), 'utf8');
  assert.match(sw, /VERSION='2\.7\.7'/);
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
