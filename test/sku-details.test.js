'use strict';
var test = require('node:test');
var assert = require('node:assert/strict');
var details = require('../scripts/build-sku-details.js');
var VFQ = require('../quote-rules.js');

function block(sku, body){
  return sku + '_dimension","attributes":[' + body + ']';
}
function dims(w, d, h){
  return '{"name":"CompositeWidthDepthHeight","displayName":"Dimensions (in)","value":["W: ' + w + '\\" x D: ' + d + '\\" x H: ' + h + '\\""]}';
}

test('dimensions use the W x D x H field for the exact SKU, including a table leaf', function(){
  var ella = block('545060179', dims(32, 35, 41));
  assert.deepEqual(details.parseDimensions(ella, '545060179'), {w:32, d:35, h:41});
  var adrienne = block('280019716', dims(36, 39.5, 41));
  assert.deepEqual(details.parseDimensions(adrienne, '280019716'), {w:36, d:39.5, h:41});
  var mattress = block('111111111', dims(75, 39, 12)) + block('464034239', dims(79, 60, 12)) + block('222222222', dims(80, 39, 12));
  assert.deepEqual(details.parseDimensions(mattress, '464034239'), {w:79, d:60, h:12});
  var fowler = block('700294001', dims(60, 42, 30) + ',{"name":"AdditionalDimensions","displayName":"Additional Dimensions","value":["&lt;br /&gt;L: 78\\" x W: 42\\" x H: 30\\" (W/ leaf)&lt;br /&gt;"]}');
  var table = details.parseDimensions(fowler, '700294001');
  assert.equal(table.w, 60);
  assert.equal(table.d, 42);
  assert.equal(table.h, 30);
  assert.equal(table.leaf, 78);
  assert.equal(VFQ.formatSize(table), '60" W x 42" D x 30" H (78" W with leaf)');
  assert.equal(VFQ.formatSize({w:32, d:35, h:41}), '32" W x 35" D x 41" H');
  var set = block('100004882', dims(118, 95, 29) + ',{"name":"AdditionalDimensions","displayName":"Additional Dimensions","value":["Everest Left Arm Facing Loveseat&lt;br /&gt;L: 74\\" x W: 43\\" x H: 35.5\\"<br />Everest Right Arm Facing Armless Chaise&lt;br /&gt;L: 90\\" x W: 43\\" x H: 35.5\\""]}');
  var parsed = details.parseDimensions(set, '100004882');
  assert.equal(parsed.w, 118);
  assert.equal(parsed.pieces.length, 2);
  assert.equal(parsed.pieces[0].name, 'Everest Left Arm Facing Loveseat');
  assert.equal(parsed.pieces[0].l, 74);
  assert.match(VFQ.formatSize(parsed), /118" W x 95" D x 29" H; Everest Left Arm Facing Loveseat: 74" L x 43" W x 35.5" H/);
});

test('saved fields drop internal codes and delivery notes stay public', function(){
  assert.equal(details.internal('WSTW-12345'), true);
  assert.equal(details.cleanText('WSTW-12345'), '');
  assert.equal(details.deliveryFromCard({deliveryTimeline:{date:{label:'Get it by', text:'Monday, November 23', isDelivery:true}}}), 'Get it by Monday, November 23');
  assert.equal(details.deliveryFromCard({deliveryTimeline:{date:{label:'Get it in', text:'6-8 weeks', isTimeline:true}}}), 'Get it in 6-8 weeks');
  assert.equal(details.deliveryFromCard({deliveryTimeline:{date:{label:'In stock', text:'Now'}}}), '');
  assert.equal(details.cleanText('Get it by Monday, November 23'), 'Get it by Monday, November 23');
});

test('the nightly picker fetches missing SKUs and a rolling refresh, not the whole catalog', function(){
  var index = {'111111111':['A','/a'], '222222222':['B','/b'], '545060179':['Ella','/ella'], '333333333':['C','/c']};
  var chosen = details.choose(index, {'222222222':{w:1, d:1, h:1, checked:'2026-11-01', delivery:'Get it in 2-4 weeks'}});
  var skus = chosen.map(function(row){ return row.sku; });
  assert.ok(skus.indexOf('545060179') >= 0);
  assert.ok(skus.indexOf('111111111') >= 0);
  assert.equal(skus.indexOf('222222222') >= 0, process.env.SKU_DETAILS_REFRESH !== '0');
  assert.ok(skus.length < 20);
});
