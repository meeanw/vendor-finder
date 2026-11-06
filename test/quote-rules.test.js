'use strict';
var test = require('node:test');
var assert = require('node:assert/strict');
var VFQ = require('../quote-rules.js');

var DISCLOSURE = 'Financing terms longer than 18 months cannot be combined with sale pricing. Regular prices apply.';

test('18 months does not restrict sale pricing; longer than 18 months does', function(){
  assert.equal(VFQ.restrictsSale(18), false);
  assert.equal(VFQ.restrictsSale(0), false);
  assert.equal(VFQ.restrictsSale(12), false);
  assert.equal(VFQ.restrictsSale(19), true);
  assert.equal(VFQ.restrictsSale(36), true);
});

test('blank delivery is not zero; explicit 0 is allowed; negatives are rejected', function(){
  assert.equal(VFQ.deliveryCents(''), null);
  assert.equal(VFQ.deliveryCents('   '), null);
  assert.equal(VFQ.deliveryCents(null), null);
  assert.equal(VFQ.deliveryCents('0'), 0);
  assert.equal(VFQ.deliveryCents('0.00'), 0);
  assert.equal(VFQ.deliveryCents('$199'), 19900);
  assert.equal(VFQ.deliveryCents('-1'), null);
  assert.equal(VFQ.deliveryCents('free'), null);
  var blank = VFQ.quoteTotals(10000, VFQ.deliveryCents(''));
  assert.equal(blank.deliveryCents, null);
  assert.equal(blank.taxCents, null);
  assert.equal(blank.totalCents, null);
  var free = VFQ.quoteTotals(36575, 0);
  assert.equal(free.deliveryCents, 0);
  assert.ok(free.taxCents > 0);
  assert.equal(free.totalCents, 36575 + free.taxCents);
  var charged = VFQ.quoteTotals(10000, 19900);
  assert.equal(charged.taxCents, Math.floor(((10000 + 19900) * 6625 + 50000) / 100000));
  assert.equal(charged.totalCents, 10000 + 19900 + charged.taxCents);
});

test('customer lines itemize delivery, NJ tax, and the grand total', function(){
  var lines = VFQ.totalLines({itemsCents: 20000, deliveryCents: 10000, taxCents: 1988, totalCents: 31988}, '08002');
  assert.deepEqual(lines, [
    'Items: $200.00',
    'Delivery to 08002: $100.00',
    'NJ sales tax (6.625%): $19.88',
    'Estimated total: $319.88'
  ]);
  var free = VFQ.totalLines({itemsCents: 20000, deliveryCents: 0, taxCents: 1325, totalCents: 21325}, '');
  assert.equal(free[1], 'Delivery: $0.00');
  assert.equal(free[3], 'Estimated total: $213.25');
});

test('exact 9-digit SKU match does not accept a shorter, longer, or neighboring SKU', function(){
  var payload = {response: {results: [
    {value: 'Other sofa', data: {}, variations: [
      {value: 'Lugano Microfiber Reclining Sofa', data: {variation_id: '200092233', url: '/outlet/sofas/lugano-microfiber-reclining-sofa-200092233', Pricing: '{"price":854.95,"originalPrice":899.95,"priceStyle":"Outlet"}', facets: [{name: 'Color', values: ['Gray']}]}}
    ]},
    {value: 'Parent', data: {}, variations: [
      {value: 'Lugano Microfiber Left Arm Facing Recliner', data: {
        variation_id: '218092233',
        url: '/outlet/sofas-sectionals-clearance/lugano-microfiber-left-arm-facing-recliner-218092233',
        Pricing: '{"price":365.75,"originalPrice":385,"priceStyle":"Outlet"}',
        facets: [
          {name: 'Fabrics', values: ['Microfiber']},
          {name: 'Color', values: ['Gray']},
          {name: 'LeadTime', values: [3]},
          {name: 'OOSDeliverableDate', values: [20261203]},
          {name: 'InStock', values: ['False']}
        ]
      }}
    ]}
  ]}};
  assert.equal(VFQ.sku9('21809223'), '');
  assert.equal(VFQ.sku9('2180922330'), '');
  assert.equal(VFQ.sku9('SKU 218092233'), '218092233');
  var hit = VFQ.matchResults(payload, '218092233', '08807');
  assert.equal(hit.nm, 'Lugano Microfiber Left Arm Facing Recliner');
  assert.equal(hit.sku, '218092233');
  assert.equal(hit.p, 365.75);
  assert.equal(hit.o, 385);
  assert.equal(hit.color, 'Gray');
  assert.equal(hit.colorState, 'website');
  assert.equal(hit.nm.indexOf('Reclining Sofa'), -1);
  assert.equal(VFQ.matchResults(payload, '217092232', ''), null);
  var neighbor = VFQ.matchResults(payload, '200092233', '');
  assert.equal(neighbor.nm, 'Lugano Microfiber Reclining Sofa');
  assert.notEqual(neighbor.sku, hit.sku);
  assert.equal(hit.delState, 'unconfirmed');
  assert.equal(hit.delText, '');
  assert.equal(JSON.stringify(hit).indexOf('20261203'), -1);
  assert.equal(JSON.stringify(hit).indexOf('LeadTime'), -1);
});

test('stock dates and lead times are never a ZIP delivery promise', function(){
  var assessed = VFQ.deliveryAssessment({
    facets: [
      {name: 'LeadTime', values: [3]},
      {name: 'OOSDeliverableDate', values: [20261203]}
    ],
    HasDeliveryDate: true
  }, '08807');
  assert.equal(assessed.state, 'unconfirmed');
  assert.equal(assessed.text, '');
  assert.match(assessed.reason, /08807/);
  assert.doesNotMatch(assessed.reason, /2026/);
  assert.doesNotMatch(assessed.reason, /3 Days/);
  var zipEstimate = VFQ.deliveryAssessment({
    zipDeliveryEstimate: 'Thu, Nov 12',
    zipDeliveryZip: '08807'
  }, 'Bridgewater 08807');
  assert.equal(zipEstimate.state, 'website');
  assert.equal(zipEstimate.text, 'Thu, Nov 12');
  var otherZip = VFQ.deliveryAssessment({
    zipDeliveryEstimate: 'Thu, Nov 12',
    zipDeliveryZip: '08807'
  }, '08002');
  assert.equal(otherZip.state, 'unconfirmed');
  assert.equal(otherZip.text, '');
});

test('a website check goes stale when the SKU or ZIP changes', function(){
  var w = {ok: 1, sku: '218092233', zip: '08807'};
  assert.equal(VFQ.websiteStale(w, '218092233', '08807'), false);
  assert.equal(VFQ.websiteStale(w, '217092232', '08807'), true);
  assert.equal(VFQ.websiteStale(w, '218092233', '08002'), true);
  assert.equal(VFQ.websiteStale(w, '218092233', '08807 '), true);
});

test('extended financing apply uses regular price and does not put the sale price back', function(){
  var web = {price: 365.75, original: 385, style: 'Outlet'};
  var open = VFQ.websitePricePlan(web, false);
  assert.equal(open.ok, true);
  assert.equal(open.price, 365.75);
  assert.equal(open.regular, 385);
  var locked = VFQ.websitePricePlan(web, true);
  assert.equal(locked.ok, true);
  assert.equal(locked.price, 385);
  assert.equal(locked.regular, 385);
  assert.notEqual(locked.price, 365.75);
  var missing = VFQ.websitePricePlan({price: 365.75, original: null, style: 'Sale'}, true);
  assert.equal(missing.ok, false);
  assert.equal(missing.reason, 'missing-regular');
  var retail = VFQ.websitePricePlan({price: 499, original: 499, style: 'Retail'}, true);
  assert.equal(retail.ok, true);
  assert.equal(retail.price, 499);
});

test('quoted amount follows the 18-month boundary for every discounted item', function(){
  var sale = {price: 100, regular: 150, discounted: true};
  var at18 = VFQ.quotedUnit(18, sale);
  assert.equal(at18.ok, true);
  assert.equal(at18.amount, 100);
  assert.equal(at18.basis, 'current');
  var over = VFQ.quotedUnit(19, sale);
  assert.equal(over.ok, true);
  assert.equal(over.amount, 150);
  assert.equal(over.basis, 'regular');
  var blocked = VFQ.quotedUnit(36, {price: 100, regular: null, discounted: true});
  assert.equal(blocked.ok, false);
  assert.equal(blocked.reason, 'missing-regular');
  var plain = VFQ.quotedUnit(36, {price: 80, regular: null, discounted: false});
  assert.equal(plain.ok, true);
  assert.equal(plain.amount, 80);
});

test('both customer text and email include the financing disclosure, including when extended financing is off', function(){
  [false, true].forEach(function(extended){
    var out = VFQ.customerMessages({
      extended: extended,
      name: 'Jamie',
      zip: '08807',
      items: [{name: 'Lugano chair', qty: 1, price: 100, regular: 150, discounted: true}],
      delivery: '0'
    });
    assert.match(out.text, new RegExp(DISCLOSURE.replace(/[.]/g, '\\.')));
    assert.match(out.email, new RegExp(DISCLOSURE.replace(/[.]/g, '\\.')));
    assert.match(out.text, /Financing options:/);
    assert.match(out.email, /financing options:/i);
    var textAt = out.text.indexOf(DISCLOSURE);
    var emailAt = out.email.indexOf(DISCLOSURE);
    assert.ok(textAt > out.text.indexOf('Financing options:'));
    assert.ok(emailAt > out.email.toLowerCase().indexOf('financing options'));
    assert.match(out.text, /Delivery to 08807: \$0\.00/);
    assert.match(out.email, /Delivery to 08807: \$0\.00/);
    assert.match(out.text, /NJ sales tax \(6\.625%\)/);
    assert.match(out.email, /NJ sales tax \(6\.625%\)/);
    assert.match(out.text, /Estimated total:/);
    assert.match(out.email, /ESTIMATED TOTAL:/);
    if(extended){
      assert.match(out.text, /Displayed prices are regular prices\./);
      assert.match(out.email, /Displayed prices are regular prices\./);
      assert.match(out.text, /Regular price: \$150\.00/);
      assert.match(out.email, /Regular price: \$150\.00/);
      assert.equal(out.text.indexOf('$100.00'), -1);
      assert.equal(out.email.indexOf('$100.00'), -1);
    }else{
      assert.match(out.text, /\$100\.00/);
      assert.equal(out.text.indexOf('Displayed prices are regular prices.'), -1);
    }
  });
});

test('preview is required per channel and any edit invalidates it', function(){
  var quote = {
    extended: false,
    name: 'Jamie',
    zip: '08002',
    items: [{name: 'Sofa', qty: 1, price: 200, regular: null, discounted: false}],
    delivery: ''
  };
  var blocked = VFQ.preview(quote, 'sms');
  assert.equal(blocked.ok, false);
  assert.equal(blocked.reason, 'delivery');
  quote.delivery = '50';
  var text = VFQ.preview(quote, 'sms');
  assert.equal(text.ok, true);
  assert.match(text.body, new RegExp(DISCLOSURE.replace(/[.]/g, '\\.')));
  assert.equal(VFQ.canCompose(text.state, 'sms', quote), true);
  assert.equal(VFQ.canCompose(text.state, 'mail', quote), false);
  quote.delivery = '75';
  assert.equal(VFQ.canCompose(text.state, 'sms', quote), false);
  var email = VFQ.preview(quote, 'mail');
  assert.equal(email.ok, true);
  assert.match(email.body, /ESTIMATED TOTAL:/);
  assert.equal(VFQ.canCompose(email.state, 'mail', quote), true);
  assert.equal(email.body.indexOf('Na’eem Ward'), -1);
  assert.equal(email.body.indexOf('Cell '), -1);
  quote.extended = true;
  quote.items = [{name: 'Sofa', qty: 1, price: 200, regular: null, discounted: true}];
  var missing = VFQ.preview(quote, 'mail');
  assert.equal(missing.ok, false);
  assert.equal(missing.reason, 'missing-regular');
});

test('a single-letter import name is incomplete, and a later crop cannot replace a real name with it', function(){
  assert.equal(VFQ.productNameState('A'), 'incomplete');
  assert.equal(VFQ.productNameState('A.'), 'incomplete');
  assert.equal(VFQ.productNameState(''), 'missing');
  assert.equal(VFQ.productNameState('   '), 'missing');
  assert.equal(VFQ.productNameState('- -'), 'unresolved');
  assert.equal(VFQ.productNameState('---'), 'unresolved');
  assert.equal(VFQ.productNameState('TV'), 'ok');
  assert.equal(VFQ.productNameState('XL'), 'ok');
  assert.equal(VFQ.productNameState('Magdalena 7pc Dining set'), 'ok');
  assert.equal(VFQ.productNameBlocks('- -', true), true);
  assert.equal(VFQ.productNameBlocks('A', false), true);
  assert.equal(VFQ.productNameBlocks('A', true), false);
  assert.equal(VFQ.productNameBlocks('   ', true), true);
  assert.equal(VFQ.preferProductName('Magdalena 7pc Dining set', 'A'), 'Magdalena 7pc Dining set');
  assert.equal(VFQ.preferProductName('Magdalena 7pc Dining set', '- -'), 'Magdalena 7pc Dining set');
  assert.equal(VFQ.preferProductName('A', '- -'), 'A');
  assert.equal(VFQ.preferProductName('A', 'Magdalena 7pc Dining set'), 'Magdalena 7pc Dining set');
  assert.equal(VFQ.preferProductName('TV', 'Television stand'), 'Television stand');
});

test('showroom delivery accepts a Get it by date or a Get it in range for ZIP 08807 only', function(){
  var dateFixture = {code:'219092234', postalCode:'08807', date:{year:2026, month:11, day:9, text:'Monday, November 9', label:'Get it by', isDelivery:true, isTimeline:false}, addToCartOutOfStockSubheading:null};
  var date = VFQ.showroomDeliveryFromTimeline(dateFixture, '219092234');
  assert.equal(date.ok, true);
  assert.equal(date.kind, 'date');
  assert.equal(date.text, 'Get it by Monday, November 9');
  assert.equal(date.zip, '08807');
  var rangeFixture = {code:'233012360', postalCode:'08807', date:{year:null, month:null, day:null, text:'3-5 Weeks', label:'Delivery Timeline', isDelivery:false, isTimeline:true}, addToCartOutOfStockSubheading:'Back in stock 11/30/2026'};
  var range = VFQ.showroomDeliveryFromTimeline(rangeFixture, '233012360');
  assert.equal(range.ok, true);
  assert.equal(range.kind, 'range');
  assert.equal(range.text, 'Get it in 3-5 Weeks');
  assert.equal(range.text.indexOf('November'), -1);
  assert.equal(range.text.indexOf('11/30'), -1);
  var otherZip = VFQ.showroomDeliveryFromTimeline({code:'219092234', postalCode:'14127', date:dateFixture.date}, '219092234');
  assert.equal(otherZip.ok, false);
  assert.equal(otherZip.reason, 'zip-mismatch');
  var stockOnly = VFQ.showroomDeliveryFromTimeline({code:'218092233', postalCode:'08807', date:{year:2026, month:11, day:30, text:'Monday, November 30', label:'Get it by', isDelivery:false, isTimeline:false}}, '218092233');
  assert.equal(stockOnly.ok, false);
});

test('cart importer preview stays hidden until pieces are added', function(){
  assert.equal(VFQ.cartPreviewVisible({rows: [], added: false}), false);
  assert.equal(VFQ.cartPreviewVisible({rows: [{on: true}], added: false}), false);
  assert.equal(VFQ.cartPreviewVisible({rows: [{on: true}], added: true}), true);
});
