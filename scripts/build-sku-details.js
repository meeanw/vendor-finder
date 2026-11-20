'use strict';
/* Incremental public details for sku-index.json.
   Writes sku-details.json only. Never saves page text or internal codes such as WSTW-.
   Each run fetches up to 2,000 new SKUs (3 at a time) and stops after 45 minutes,
   plus up to 300 oldest delivery notes. A 403 or 429 stops the run and keeps
   the rows already saved. It does not fetch the whole catalog in one night.
   Delivery comes from the public product-card JSON for showroom ZIP 08807.
   Dimensions come from that product page's CompositeWidthDepthHeight field
   ("W: … x D: … x H: …"), not the swapped length/width field.
   Run: node scripts/build-sku-details.js
*/
var fs = require('fs');
var path = require('path');

var INDEX_FILE = path.join(__dirname, '..', 'sku-index.json');
var OUT = path.join(__dirname, '..', 'sku-details.json');
var CARD = 'https://www.raymourflanigan.com/api/custom/product-card';
var SITE = 'https://www.raymourflanigan.com';
var NEW_CAP = Math.max(1, +(process.env.SKU_DETAILS_NEW || 2000));
var REFRESH_CAP = Math.max(0, +(process.env.SKU_DETAILS_REFRESH || 300));
var MINUTES = Math.max(1, +(process.env.SKU_DETAILS_MINUTES || 45));
var CONCURRENCY = Math.min(4, Math.max(2, +(process.env.SKU_DETAILS_CONCURRENCY || 3)));
var PRIORITY = ['545060179', '280019716', '464034239', '700294001'];

function unescapePage(raw){
  return String(raw || '')
    .replace(/&quot;/g, '"')
    .replace(/&#34;/g, '"')
    .replace(/\\u0022/g, '"')
    .replace(/\\"/g, '"')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&');
}
function internal(raw){
  return /WSTW-|\b[A-Z]{2,6}-\d{2,}\b/.test(String(raw || ''));
}
function cleanText(raw, max){
  var s = String(raw || '').replace(/\s+/g, ' ').trim();
  if(!s || internal(s) || s.length > (max || 140)) return '';
  return s;
}
function num(raw){
  var n = +raw;
  if(!isFinite(n) || n <= 0 || n > 500) return 0;
  return Math.round(n * 100) / 100;
}
function skuBlock(text, sku){
  var key = sku + '_dimension';
  var at = text.indexOf(key);
  if(at < 0) at = text.indexOf('"code":"' + sku + '"');
  if(at < 0) return '';
  var next = text.indexOf('_dimension', at + key.length);
  var end = next > at ? next : at + 15000;
  return text.slice(at, end);
}
function attrValue(block, name){
  var re = new RegExp('"name":"' + name + '","displayName":"[^"]*","value":\\["([^"]*)"\\]');
  var m = re.exec(block);
  return m ? m[1].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim() : '';
}
function parseDimensions(html, sku){
  var text = unescapePage(html);
  var block = skuBlock(text, sku);
  if(!block) return null;
  var dim = /CompositeWidthDepthHeight","displayName":"Dimensions \(in\)","value":\["W: ([\d.]+)" x D: ([\d.]+)" x H: ([\d.]+)"/.exec(block);
  if(!dim) return null;
  var out = {w:num(dim[1]), d:num(dim[2]), h:num(dim[3])};
  if(!out.w || !out.d || !out.h) return null;
  var leaf = /L:\s*([\d.]+)"[^<\]]{0,80}\(W\/\s*leaf\)/i.exec(block);
  if(leaf && num(leaf[1])) out.leaf = num(leaf[1]);
  var pieces = [];
  var re = /([^<>"]{3,80})<br \/>L: ([\d.]+)" x W: ([\d.]+)" x H: ([\d.]+)"/g;
  var m;
  while((m = re.exec(block))){
    var name = m[1].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
    if(/^(weight|seat depth|seat height|arm height|frame height|inside arm)\b/i.test(name)) continue;
    var piece = {name:name, l:num(m[2]), w:num(m[3]), h:num(m[4])};
    if(piece.l && piece.w && piece.h && !internal(name)) pieces.push(piece);
  }
  var seenPiece = {};
  pieces = pieces.filter(function(p){
    var key = p.name + '|' + p.l + '|' + p.w + '|' + p.h;
    if(seenPiece[key]) return false;
    seenPiece[key] = 1;
    return true;
  });
  if(pieces.length) out.pieces = pieces.slice(0, 8);
  var color = '';
  ['Color', 'UpholsteryColor', 'Finish', 'PrimaryColor'].some(function(key){
    var v = cleanText(attrValue(block, key), 80);
    if(v && /^[A-Za-z0-9][A-Za-z0-9 /&,'-]{0,60}$/.test(v)){ color = v; return true; }
    return false;
  });
  if(color) out.color = color;
  return out;
}
function deliveryFromCard(product){
  var timeline = product && product.deliveryTimeline;
  var date = timeline && timeline.date;
  if(!date) return '';
  var label = String(date.label || '').replace(/\s+/g, ' ').trim();
  var text = String(date.text || '').replace(/\s+/g, ' ').trim();
  if(!/^(Get it by|Get it in)$/i.test(label) || !text) return '';
  return cleanText(label + ' ' + text, 80);
}
function colorFromCard(product){
  var rows = product && product.colorSelections;
  if(!Array.isArray(rows)) return '';
  for(var i = 0; i < rows.length; i++){
    var row = rows[i] || {};
    var name = cleanText(row.name || row.displayName || row.color || '', 80);
    if(name && /^[A-Za-z0-9][A-Za-z0-9 /&,'-]{0,60}$/.test(name)) return name;
  }
  return '';
}
function todayIso(){
  if(/^\d{4}-\d{2}-\d{2}$/.test(process.env.SKU_DETAILS_DATE || '')) return process.env.SKU_DETAILS_DATE;
  var d = new Date();
  var m = d.getMonth() + 1, day = d.getDate();
  return d.getFullYear() + '-' + (m < 10 ? '0' : '') + m + '-' + (day < 10 ? '0' : '') + day;
}
function choose(index, details, caps){
  caps = caps || {};
  var newCap = caps.newCap != null ? caps.newCap : NEW_CAP;
  var refreshCap = caps.refreshCap != null ? caps.refreshCap : REFRESH_CAP;
  var want = [];
  var seen = {};
  function add(sku, refresh){
    if(!index[sku] || seen[sku]) return;
    seen[sku] = 1;
    want.push({sku:sku, refresh:!!refresh, path:index[sku][1]});
  }
  PRIORITY.forEach(function(sku){
    var row = details[sku];
    if(!row || !(row.w > 0 && row.d > 0 && row.h > 0)) add(sku, false);
  });
  Object.keys(index).sort().some(function(sku){
    if(want.filter(function(job){ return !job.refresh; }).length >= newCap) return true;
    if(!details[sku]) add(sku, false);
    return false;
  });
  var oldest = Object.keys(details).filter(function(sku){ return details[sku] && details[sku].checked && index[sku]; })
    .sort(function(a, b){ return String(details[a].checked).localeCompare(String(details[b].checked)) || a.localeCompare(b); });
  var n = 0;
  oldest.forEach(function(sku){
    if(n >= refreshCap || seen[sku]) return;
    add(sku, true);
    n++;
  });
  return want;
}
function keep(row){
  var out = {};
  if(row.color) out.color = row.color;
  if(row.delivery) out.delivery = row.delivery;
  if(row.checked) out.checked = row.checked;
  if(row.w && row.d && row.h){ out.w = row.w; out.d = row.d; out.h = row.h; }
  if(row.leaf) out.leaf = row.leaf;
  if(row.pieces && row.pieces.length) out.pieces = row.pieces;
  return out;
}

async function getJson(url){
  var res = await fetch(url, {headers:{'Accept':'application/json', 'User-Agent':'Mozilla/5.0 vendor-finder-details'}});
  if(res.status === 403 || res.status === 429){ var err = new Error('blocked ' + res.status); err.blocked = true; throw err; }
  if(!res.ok) throw new Error('HTTP ' + res.status);
  return res.json();
}
async function getHtml(url){
  var res = await fetch(url, {headers:{'Accept':'text/html', 'User-Agent':'Mozilla/5.0 vendor-finder-details'}});
  if(res.status === 403 || res.status === 429){ var err = new Error('blocked ' + res.status); err.blocked = true; throw err; }
  if(!res.ok) throw new Error('HTTP ' + res.status);
  return res.text();
}
async function enrichJob(job, details, checked, fetchCard, fetchPage){
  var prev = details[job.sku] || {};
  var next = {
    color: prev.color || '',
    delivery: prev.delivery || '',
    checked: prev.checked || '',
    w: prev.w || 0,
    d: prev.d || 0,
    h: prev.h || 0
  };
  if(prev.leaf) next.leaf = prev.leaf;
  if(prev.pieces) next.pieces = prev.pieces;
  var card = await fetchCard(job.sku);
  var delivery = deliveryFromCard(card);
  var color = colorFromCard(card);
  if(delivery){ next.delivery = delivery; next.checked = checked; }
  if(color && !next.color) next.color = color;
  if(!job.refresh && !(next.w && next.d && next.h) && job.path){
    var html = await fetchPage(job.path, job.sku);
    var parsed = parseDimensions(html, job.sku);
    if(parsed){
      next.w = parsed.w; next.d = parsed.d; next.h = parsed.h;
      if(parsed.leaf) next.leaf = parsed.leaf; else delete next.leaf;
      if(parsed.pieces) next.pieces = parsed.pieces; else delete next.pieces;
      if(parsed.color && !next.color) next.color = parsed.color;
    }
  }
  return keep(next);
}

// Workers pull jobs until the list, the clock, or a 403/429 says stop.
// In-flight requests finish. Whatever was saved stays in details.
async function runBudget(opts){
  var jobs = opts.jobs || [];
  var details = opts.details;
  var concurrency = Math.min(4, Math.max(1, opts.concurrency || CONCURRENCY));
  var now = opts.now || Date.now;
  var deadline = opts.deadline != null ? opts.deadline : now() + MINUTES * 60 * 1000;
  var checked = opts.checked || todayIso();
  var fetchCard = opts.fetchCard;
  var fetchPage = opts.fetchPage;
  var cursor = 0;
  var stopped = false;
  var blocked = 0;
  var failed = 0;
  var updated = 0;
  async function worker(){
    while(!stopped){
      if(now() >= deadline){ stopped = true; return; }
      var i = cursor++;
      if(i >= jobs.length) return;
      var job = jobs[i];
      try{
        var saved = await enrichJob(job, details, checked, fetchCard, fetchPage);
        if(stopped) return;
        if(saved.w || saved.delivery || saved.color){ details[job.sku] = saved; updated++; }
      }catch(err){
        if(err && err.blocked){ blocked++; stopped = true; process.stderr.write('stopped: site returned ' + (err.message || 'a block') + '\n'); return; }
        failed++;
        process.stderr.write(job.sku + ' ' + (err && err.message) + '\n');
      }
    }
  }
  var workers = [];
  for(var w = 0; w < concurrency; w++) workers.push(worker());
  await Promise.all(workers);
  return {updated:updated, blocked:blocked, failed:failed, stopped:stopped};
}

async function main(){
  var index = JSON.parse(fs.readFileSync(INDEX_FILE, 'utf8'));
  var details = {};
  if(fs.existsSync(OUT)) details = JSON.parse(fs.readFileSync(OUT, 'utf8'));
  var jobs = choose(index, details);
  var started = Date.now();
  process.stderr.write('details jobs ' + jobs.length + ' new cap ' + NEW_CAP + ' refresh cap ' + REFRESH_CAP + ' minutes ' + MINUTES + ' concurrency ' + CONCURRENCY + '\n');
  var result = await runBudget({
    jobs: jobs,
    details: details,
    concurrency: CONCURRENCY,
    deadline: started + MINUTES * 60 * 1000,
    checked: todayIso(),
    fetchCard: async function(sku){
      var url = CARD + '?codes=' + encodeURIComponent(sku) +
        '&postalCode=08807&showAlternateItems=false&showDeliveryTimeline=true&showSecondDimension=true';
      var data = await getJson(url);
      var products = data.products || [];
      for(var i = 0; i < products.length; i++) if(products[i] && String(products[i].code) === String(sku)) return products[i];
      return null;
    },
    fetchPage: function(urlPath){ return getHtml(SITE + urlPath); }
  });
  var ordered = {};
  Object.keys(details).sort().forEach(function(sku){ ordered[sku] = details[sku]; });
  fs.writeFileSync(OUT, JSON.stringify(ordered));
  var withDims = Object.keys(ordered).filter(function(sku){ var r = ordered[sku]; return r.w && r.d && r.h; }).length;
  process.stderr.write('sku-details ' + Object.keys(ordered).length + ' with dimensions ' + withDims + ' updated ' + result.updated + ' blocked ' + result.blocked + ' failed ' + result.failed + ' minutes ' + ((Date.now() - started) / 60000).toFixed(1) + '\n');
}

module.exports = {
  parseDimensions:parseDimensions,
  deliveryFromCard:deliveryFromCard,
  choose:choose,
  runBudget:runBudget,
  internal:internal,
  cleanText:cleanText,
  NEW_CAP:NEW_CAP,
  REFRESH_CAP:REFRESH_CAP,
  MINUTES:MINUTES,
  CONCURRENCY:CONCURRENCY,
  PRIORITY:PRIORITY
};

if(require.main === module){
  main().catch(function(err){
    console.error(err && err.stack || err);
    process.exit(1);
  });
}
