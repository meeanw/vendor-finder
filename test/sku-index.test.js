'use strict';
var test = require('node:test');
var assert = require('node:assert/strict');
var fs = require('fs');
var path = require('path');
var build = require('../scripts/build-sku-index.js');

test('the SKU index collector keeps variation ids and the SKU on the url, without prices', function(){
  var index = {};
  build.collect({response:{results:[{
    value:'Parent name',
    data:{url:'/nursery/rocking-chairs/ella-marie-triple-power-swivel-glider-recliner-545060179', id:'uuid-1'},
    variations:[
      {value:'Ella Marie Triple Power Swivel Glider Recliner', data:{variation_id:'545060179', url:'/nursery/rocking-chairs/ella-marie-triple-power-swivel-glider-recliner-545060179', Pricing:'{"price":999}'}},
      {value:'Other size', data:{variation_id:'111111111', url:'/nursery/rocking-chairs/other-222222222'}}
    ]
  },{
    value:'Adrienne Power Recliner',
    variations:[{value:'Adrienne Power Recliner', data:{variation_id:'280019716', url:'/outlet/chairs-recliners-clearance/adrienne-power-recliner-280019716?x=1'}}]
  }]}}, index);
  assert.deepEqual(index['545060179'], ['Ella Marie Triple Power Swivel Glider Recliner', '/nursery/rocking-chairs/ella-marie-triple-power-swivel-glider-recliner-545060179']);
  assert.deepEqual(index['222222222'], ['Other size', '/nursery/rocking-chairs/other-222222222']);
  assert.deepEqual(index['280019716'], ['Adrienne Power Recliner', '/outlet/chairs-recliners-clearance/adrienne-power-recliner-280019716']);
  assert.equal(JSON.stringify(index).indexOf('999'), -1);
});

test('the shipped SKU index contains the recliner and the nursery glider', function(){
  var file = path.join(__dirname, '..', 'sku-index.json');
  var raw = fs.readFileSync(file, 'utf8');
  var index = JSON.parse(raw);
  assert.deepEqual(index['545060179'], ['Ella Marie Triple Power Swivel Glider Recliner', '/nursery/rocking-chairs/ella-marie-triple-power-swivel-glider-recliner-545060179']);
  assert.deepEqual(index['280019716'], ['Adrienne Power Recliner', '/outlet/chairs-recliners-clearance/adrienne-power-recliner-280019716']);
  assert.ok(Object.keys(index).length > 1000);
  assert.equal(raw.indexOf('"price"'), -1);
});
