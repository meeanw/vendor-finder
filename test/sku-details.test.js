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

test('the nightly picker keeps the priority SKUs and caps new and refresh work', function(){
  assert.equal(details.NEW_CAP, 2000);
  assert.equal(details.REFRESH_CAP, 300);
  assert.equal(details.MINUTES, 45);
  assert.ok(details.CONCURRENCY >= 2 && details.CONCURRENCY <= 4);
  assert.deepEqual(details.PRIORITY, ['545060179', '280019716', '464034239', '700294001']);
  var index = {'111111111':['A','/a'], '222222222':['B','/b'], '545060179':['Ella','/ella'], '333333333':['C','/c']};
  var chosen = details.choose(index, {'222222222':{w:1, d:1, h:1, checked:'2026-11-01', delivery:'Get it in 2-4 weeks'}}, {newCap:2, refreshCap:1});
  var skus = chosen.map(function(row){ return row.sku; });
  assert.equal(skus[0], '545060179');
  assert.ok(skus.indexOf('222222222') >= 0);
  assert.equal(chosen.filter(function(job){ return !job.refresh; }).length, 2);
});

test('a details run stops on the clock or a block and keeps rows already saved', async function(){
  var saved = {};
  var calls = 0;
  var clock = 0;
  var blocked = await details.runBudget({
    jobs:[{sku:'1', refresh:false, path:'/a'}, {sku:'2', refresh:false, path:'/b'}, {sku:'3', refresh:false, path:'/c'}],
    details:saved,
    concurrency:1,
    now:function(){ return clock; },
    deadline:10,
    checked:'2026-11-20',
    fetchCard:async function(){
      calls++;
      clock += 6;
      if(calls >= 2){ var err = new Error('blocked 429'); err.blocked = true; throw err; }
      return {deliveryTimeline:{date:{label:'Get it by', text:'Monday, November 23'}}};
    },
    fetchPage:async function(){ return ''; }
  });
  assert.equal(blocked.blocked, 1);
  assert.equal(Object.keys(saved).length, 1);
  assert.equal(saved['1'].delivery, 'Get it by Monday, November 23');
  var timed = {};
  clock = 0;
  await details.runBudget({
    jobs:[{sku:'9', refresh:true, path:'/z'}, {sku:'8', refresh:true, path:'/y'}],
    details:timed,
    concurrency:1,
    now:function(){ return clock; },
    deadline:5,
    checked:'2026-11-20',
    fetchCard:async function(){ clock += 5; return {deliveryTimeline:{date:{label:'Get it in', text:'2-4 weeks'}}}; },
    fetchPage:async function(){ throw new Error('page should not be fetched for a refresh'); }
  });
  assert.deepEqual(Object.keys(timed), ['9']);
});
