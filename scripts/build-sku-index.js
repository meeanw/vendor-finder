'use strict';
/* Build sku-index.json from the public Constructor browse feed.
   Maps each 9-digit website SKU to [name, url path]. No prices.
   Run: node scripts/build-sku-index.js
*/
var fs = require('fs');
var path = require('path');

var KEY = 'key_1tigFZoUEs7Ygkww';
var OUT = path.join(__dirname, '..', 'sku-index.json');
var PAGE_SIZE = 200;
var MAX_PAGES = 80;

function sku9(raw){
  var d = String(raw == null ? '' : raw).replace(/\D/g, '');
  return /^\d{9}$/.test(d) ? d : '';
}
function cleanName(raw){
  return String(raw || '').replace(/\s+/g, ' ').trim().slice(0, 120);
}
function cleanPath(raw){
  var p = String(raw || '').split('?')[0];
  return /^\/[A-Za-z0-9\/_.-]{3,200}$/.test(p) ? p : '';
}
function pathSku(urlPath){
  var m = /-(\d{9})$/.exec(cleanPath(urlPath));
  return m ? m[1] : '';
}

function collect(payload, index){
  var results = (payload && payload.response && payload.response.results) || [];
  var added = 0;
  results.forEach(function(item){
    var vars = item && item.variations && item.variations.length ? item.variations : [item];
    vars.forEach(function(v){
      if(!v) return;
      var data = v.data || {};
      var name = cleanName(v.value || item.value);
      var urlPath = cleanPath(data.url || (item.data && item.data.url) || '');
      if(!name || !urlPath) return;
      var ids = {};
      var vid = sku9(data.variation_id);
      var fromUrl = pathSku(urlPath);
      if(vid) ids[vid] = 1;
      if(fromUrl) ids[fromUrl] = 1;
      Object.keys(ids).forEach(function(id){
        var prev = index[id];
        if(!prev || String(name).length > String(prev[0]).length){
          index[id] = [name, urlPath];
          added++;
        }
      });
    });
  });
  return added;
}

function browseUrl(page){
  return 'https://ac.cnstrc.com/browse/group_id/all?key=' + KEY +
    '&num_results_per_page=' + PAGE_SIZE + '&page=' + page;
}

async function main(){
  var index = {};
  var page = 1;
  var total = 0;
  while(page <= MAX_PAGES){
    var res = await fetch(browseUrl(page), {headers:{'Accept':'application/json'}});
    if(!res.ok) throw new Error('browse page ' + page + ' HTTP ' + res.status);
    var payload = await res.json();
    var results = (payload.response && payload.response.results) || [];
    if(page === 1) total = +(payload.response && payload.response.total_num_results) || 0;
    if(!results.length) break;
    collect(payload, index);
    process.stderr.write('page ' + page + ' +' + results.length + ' skus ' + Object.keys(index).length + ' total ' + total + '\n');
    page++;
  }
  var keys = Object.keys(index).sort();
  var ordered = {};
  keys.forEach(function(k){ ordered[k] = index[k]; });
  fs.writeFileSync(OUT, JSON.stringify(ordered));
  process.stderr.write('wrote ' + keys.length + ' skus, ' + fs.statSync(OUT).size + ' bytes\n');
}

if(require.main === module){
  main().catch(function(err){
    console.error(err && err.stack || err);
    process.exit(1);
  });
}

module.exports = {collect:collect, sku9:sku9, pathSku:pathSku};
