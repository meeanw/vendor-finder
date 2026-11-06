'use strict';
/* Live public-catalog check. Not a unit test. Records Constructor matches and the
   CORS/ZIP limits of the product document. Does not store vendor stock numbers. */
var fs = require('fs');
var path = require('path');
var VFQ = require('../quote-rules.js');

var SKUS = ['218092233', '217092232', '220092237', '219092234', '222092239'];
var KEY = 'key_1tigFZoUEs7Ygkww';
var ZIP = '08807';

function get(url, headers){
  return fetch(url, {headers: headers || {'Accept': 'application/json', 'User-Agent': 'vendor-finder-live-check'}}).then(function(r){
    return r.text().then(function(body){
      return {status: r.status, headers: r.headers, body: body};
    });
  });
}

function searchPages(term){
  var page = 1, all = [];
  function one(){
    var url = 'https://ac.cnstrc.com/search/' + encodeURIComponent(term) + '?key=' + KEY + '&num_results_per_page=100&page=' + page;
    return get(url).then(function(res){
      if(res.status !== 200) throw new Error('search ' + res.status);
      var json = JSON.parse(res.body);
      all.push(json);
      var total = (json.response && +json.response.total_num_results) || 0;
      if(page * 100 >= total || page >= 3) return all;
      page++;
      return one();
    });
  }
  return one();
}

function facetNames(payload, sku){
  var names = [];
  var results = (payload.response && payload.response.results) || [];
  results.forEach(function(item){
    var vars = item.variations && item.variations.length ? item.variations : [item];
    vars.forEach(function(v){
      var data = v.data || {};
      var id = String(data.variation_id || '');
      if(id !== sku) return;
      (data.facets || []).forEach(function(f){
        if(f && f.name && ['Color','Colour','Finish','ColorFamily','Fabrics','LeadTime','OOSDeliverableDate','InStock'].indexOf(f.name) >= 0)
          names.push(f.name + '=' + JSON.stringify(f.values));
      });
      ['HasDeliveryDate','DeliveryEligibleItem','NextDayEligibleItem'].forEach(function(k){
        if(k in data) names.push(k + '=' + JSON.stringify(data[k]));
      });
    });
  });
  return names;
}

function findSku(pages, sku){
  for(var i = 0; i < pages.length; i++){
    var hit = VFQ.matchResults(pages[i], sku, ZIP);
    if(hit) return {page: i + 1, hit: hit, facets: facetNames(pages[i], sku)};
  }
  return null;
}

function productProbe(sku){
  var url = 'https://www.raymourflanigan.com/outlet/sofas-sectionals-clearance/probe-' + sku;
  // The public product path is only fetched after Constructor tells us the path.
  return url;
}

async function main(){
  var skuOnly = await get('https://ac.cnstrc.com/search/218092233?key=' + KEY + '&num_results_per_page=5');
  var skuOnlyJson = JSON.parse(skuOnly.body);
  var pages = await searchPages('Lugano');
  var corsHeaders = {'Accept': 'application/json', 'Origin': 'https://meeanw.github.io', 'User-Agent': 'vendor-finder-live-check'};
  var items = SKUS.map(function(sku){
    var found = findSku(pages, sku);
    if(!found) return {sku: sku, matched: false, source: 'live-constructor'};
    var hit = found.hit;
    return {
      sku: sku,
      matched: hit.sku === sku,
      source: 'live-constructor',
      page: found.page,
      name: hit.nm,
      price: hit.p,
      regular: hit.o == null ? null : hit.o,
      priceStyle: hit.st,
      colorState: hit.colorState,
      color: hit.color,
      deliveryState: hit.delState,
      deliveryText: hit.delText,
      deliveryReason: hit.delReason,
      publicFacetsKeptForAudit: found.facets
    };
  });
  var samplePath = '';
  pages.some(function(p){
    var hit = VFQ.matchResults(p, '218092233', ZIP);
    if(hit && hit.u){samplePath = hit.u; return true}
    return false;
  });
  var product = {fetched: false};
  if(samplePath){
    var prod = await get('https://www.raymourflanigan.com' + samplePath, corsHeaders);
    var acao = prod.headers.get('access-control-allow-origin');
    var keys = [];
    try{
      var doc = JSON.parse(prod.body);
      ['color','zip','postalCode','defaultDeliveryTime','localDeliveryTime','extendedLocalDeliveryTime','nationwideDeliveryTime','outOfMarketDeliveryTime','outOfStockDate'].forEach(function(k){
        if(doc && Object.prototype.hasOwnProperty.call(doc, k)){
          var v = doc[k] && doc[k].value !== undefined ? doc[k].value : doc[k];
          keys.push({field: k, present: true, preview: typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean' ? v : Array.isArray(v) ? v.slice(0, 3) : 'non-scalar'});
        }
      });
      product = {fetched: true, status: prod.status, contentType: prod.headers.get('content-type'), accessControlAllowOrigin: acao, zipFieldPresent: keys.some(function(k){return k.field === 'zip' || k.field === 'postalCode'}), fields: keys, usedByApp: false, whyNotUsed: 'The product document does not send Access-Control-Allow-Origin for https://meeanw.github.io, and it has no ZIP field. Catalog delivery bands are not a delivery estimate for the customer ZIP, so the quote does not copy them.'};
    }catch(e){
      product = {fetched: true, status: prod.status, accessControlAllowOrigin: acao, parse: 'not-json', usedByApp: false};
    }
  }
  var evidence = {
    kind: 'live',
    fetchedAt: new Date().toISOString(),
    zipTried: ZIP,
    skuOnlySearch: {query: '218092233', total: (skuOnlyJson.response && skuOnlyJson.response.total_num_results) || 0, note: 'Public Constructor search does not return a product when the query is only the SKU.'},
    nameSearch: {query: 'Lugano', pages: pages.length, total: (pages[0].response && pages[0].response.total_num_results) || 0},
    items: items,
    productDocument: product,
    appBehavior: 'Exact 9-digit variation id from the name search. Color only if a color/finish facet exists. Delivery text only for an explicit ZIP estimate, which this response does not contain. LeadTime and OOSDeliverableDate are ignored.'
  };
  var out = path.join(__dirname, 'live-lugano-evidence.json');
  fs.writeFileSync(out, JSON.stringify(evidence, null, 2));
  var bad = items.filter(function(x){return !x.matched || x.deliveryState !== 'unconfirmed' || x.deliveryText});
  if(skuOnlyJson.response.total_num_results !== 0) bad.push({skuOnly: skuOnlyJson.response.total_num_results});
  if(bad.length){
    console.error(JSON.stringify(bad, null, 2));
    process.exit(1);
  }
  console.log('LIVE_OK ' + items.length + ' SKUs');
  items.forEach(function(x){console.log([x.sku, x.name, x.price, x.regular, x.priceStyle, x.colorState, x.deliveryState].join(' | '))});
  console.log('sku-only total', evidence.skuOnlySearch.total);
  console.log('product ACAO', product.accessControlAllowOrigin, 'zip', product.zipFieldPresent);
}

main().catch(function(e){console.error(e); process.exit(1)});
