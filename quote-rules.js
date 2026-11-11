/* Quote rules for Vendor Finder. Public product fields only: no PINs, tokens, or vendor stock numbers. */
(function(root, factory){
  var api = factory();
  if(typeof module === 'object' && module.exports) module.exports = api;
  if(root) root.VFQ = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function(){
  var FINANCE_DISCLOSURE = 'Financing terms longer than 18 months cannot be combined with sale pricing. Regular prices apply.';
  var PET_EXCLUSION = 'Damage caused by pets is not covered.';
  var COLOR_NAMES = {color:1, colour:1, finish:1, colorfamily:1, primarycolor:1, upholsterycolor:1, framecolor:1};
  var DISCOUNT_STYLES = {Sale:1, Outlet:1, Clearance:1};

  function restrictsSale(months){return +months > 18}

  function moneyFromCents(cents){
    var n = cents / 100, sign = n < 0 ? '-' : '', parts = Math.abs(n).toFixed(2).split('.');
    return sign + '$' + parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ',') + '.' + parts[1];
  }

  function deliveryCents(raw){
    var s = String(raw == null ? '' : raw).trim();
    if(!s) return null;
    var x = s.replace(/[$,\s]/g, '');
    if(!/^\d+(\.\d+)?$/.test(x)) return null;
    var n = parseFloat(x);
    if(!isFinite(n) || n < 0) return null;
    return Math.round(n * 100);
  }

  function quoteTotals(itemsCents, delCents){
    if(delCents === null || delCents === undefined) return {itemsCents:itemsCents, deliveryCents:null, taxCents:null, totalCents:null};
    var base = itemsCents + delCents;
    var tax = Math.floor((base * 6625 + 50000) / 100000);
    return {itemsCents:itemsCents, deliveryCents:delCents, taxCents:tax, totalCents:base + tax};
  }

  function totalLines(totals, zip, full){
    var z = String(zip || '').trim();
    var del = (z ? 'Delivery to ' + z + ': ' : 'Delivery: ') + moneyFromCents(totals.deliveryCents);
    return [
      'Items: ' + moneyFromCents(totals.itemsCents),
      del,
      'NJ sales tax (6.625%): ' + moneyFromCents(totals.taxCents),
      (full ? 'ESTIMATED TOTAL' : 'Estimated total') + ': ' + moneyFromCents(totals.totalCents)
    ];
  }

  function sku9(raw){
    var d = String(raw == null ? '' : raw).replace(/\D/g, '');
    return /^\d{9}$/.test(d) ? d : '';
  }

  function round2(n){return Math.round((+n) * 100) / 100}

  function skuOf(data){
    data = data || {};
    var id = String(data.variation_id || '');
    if(/^\d{9}$/.test(id)) return id;
    try{
      var aid = String(JSON.parse(data.Analytics || '{}').id || '');
      if(/^\d{9}$/.test(aid)) return aid;
    }catch(e){}
    var m = /-(\d{9})$/.exec(String(data.url || '').split('?')[0]);
    return m ? m[1] : '';
  }

  function colorFromFacets(facets){
    var found = {};
    (facets || []).forEach(function(f){
      if(!f || !f.name) return;
      var key = String(f.name).toLowerCase();
      if(!COLOR_NAMES[key]) return;
      var v = f.values && f.values.length ? String(f.values[0]).trim() : '';
      if(v) found[key] = v;
    });
    var parts = [];
    ['color','colour','finish','colorfamily','primarycolor','upholsterycolor','framecolor'].forEach(function(n){
      if(found[n]) parts.push(found[n]);
    });
    if(!parts.length) return {color:'', state:'unconfirmed'};
    return {color:parts.join(' / ').slice(0, 80), state:'website'};
  }

  function deliveryAssessment(data, zip){
    var raw = String(zip || '');
    var zip5 = (raw.match(/\d{5}/) || [])[0] || '';
    var estimate = '';
    if(data && typeof data.zipDeliveryEstimate === 'string' && data.zipDeliveryEstimate.trim() && zip5 && String(data.zipDeliveryZip || '') === zip5)
      estimate = data.zipDeliveryEstimate.trim().slice(0, 100);
    if(estimate) return {state:'website', text:estimate, zip:zip5, reason:''};
    var reason = zip5
      ? 'No ZIP-based delivery estimate for ' + zip5 + ' is in the website search. Stock dates and lead times are not delivery promises.'
      : 'No ZIP-based delivery estimate is in the website search. Enter the customer ZIP and confirm the time frame yourself. Stock dates are not delivery promises.';
    return {state:'unconfirmed', text:'', zip:zip5, reason:reason};
  }

  function parsePricing(raw){
    var pr = {};
    try{pr = typeof raw === 'string' ? JSON.parse(raw || '{}') : (raw || {})}catch(e){pr = {}}
    var price = +pr.price, original = +pr.originalPrice;
    if(!(price > 0)) return null;
    var style = /^(Sale|Outlet|Retail|Clearance)$/.test(pr.priceStyle || '') ? pr.priceStyle : '';
    return {
      price:round2(price),
      original:original > 0 ? round2(original) : null,
      style:style
    };
  }

  function parseVariation(value, data, zip, sku){
    var pricing = parsePricing(data.Pricing);
    if(!pricing) return null;
    var color = colorFromFacets(data.facets);
    var delivery = deliveryAssessment(data, zip);
    var path = String(data.url || '').split('?')[0];
    if(!/^\/[A-Za-z0-9\/_.-]{3,200}$/.test(path)) path = '';
    var discounted = (pricing.original != null && pricing.original > pricing.price) || !!DISCOUNT_STYLES[pricing.style];
    return {
      ok:1,
      p:pricing.price,
      o:pricing.original == null ? undefined : pricing.original,
      st:pricing.style,
      u:path,
      nm:String(value || '').trim().slice(0, 120),
      color:color.color,
      colorState:color.state,
      delState:delivery.state,
      delText:delivery.state === 'website' ? delivery.text : '',
      delReason:delivery.reason || '',
      sku:sku,
      zip:String(zip || ''),
      discounted:discounted ? 1 : 0
    };
  }

  function matchResults(payload, sku, zip){
    var want = sku9(sku);
    if(!want) return null;
    var results = (payload && payload.response && payload.response.results) || (payload && payload.results) || [];
    for(var i = 0; i < results.length; i++){
      var item = results[i] || {};
      var vars = item.variations && item.variations.length ? item.variations : [item];
      for(var k = 0; k < vars.length; k++){
        var data = (vars[k] && vars[k].data) || {};
        if(skuOf(data) !== want) continue;
        var hit = parseVariation(vars[k].value || item.value, data, zip, want);
        if(hit) return hit;
      }
    }
    return null;
  }

  function websiteStale(w, sku, zip){
    if(!w || !w.ok) return false;
    if(String(w.sku || '') !== sku9(sku)) return true;
    if(String(w.zip == null ? '' : w.zip) !== String(zip == null ? '' : zip)) return true;
    return false;
  }

  function websitePricePlan(web, extended){
    var price = round2(web.price);
    var original = web.original == null || web.original === '' ? null : round2(web.original);
    var style = web.style || '';
    var discounted = (original != null && original > price) || !!DISCOUNT_STYLES[style];
    if(extended && discounted){
      if(!(original > 0)) return {ok:false, reason:'missing-regular'};
      return {ok:true, price:original, regular:original, quoted:original};
    }
    return {ok:true, price:price, regular:(original != null && original > price) ? original : null, quoted:price};
  }

  function quotedUnit(months, item){
    if(restrictsSale(months) && item.discounted){
      if(!(item.regular > 0)) return {ok:false, amount:null, reason:'missing-regular', basis:'regular'};
      return {ok:true, amount:item.regular, basis:'regular'};
    }
    return {ok:true, amount:item.price, basis:restrictsSale(months) ? 'regular' : 'current'};
  }

  function financeMonths(extended){return extended ? 19 : 18}

  function customerFinanceLines(extended){
    var lines = [FINANCE_DISCLOSURE];
    if(extended) lines.push('Displayed prices are regular prices.');
    return lines;
  }

  function coverageProblem(body){
    var text = String(body || '');
    if(/Spills and pets|pets happen|has you covered/i.test(text)) return 'retired-pet-coverage';
    var mentionsProtection = /platinum|protection plan|protection:/i.test(text);
    if(mentionsProtection && text.indexOf(PET_EXCLUSION) === -1) return 'missing-pet-exclusion';
    return '';
  }

  function amountSavedCents(rows){
    var saved = 0;
    (rows || []).forEach(function(row){
      var qty = row && row.qty > 0 ? Math.round(row.qty) : 1;
      var quoted = row ? row.quotedCents : null;
      var was = row ? row.wasCents : null;
      if(quoted == null || was == null || !(was > quoted)) return;
      saved += (was - quoted) * qty;
    });
    return saved;
  }

  function composeGate(quote){
    if(deliveryCents(quote && quote.delivery) === null) return {ok:false, reason:'delivery'};
    var months = financeMonths(quote && quote.extended);
    var items = (quote && quote.items) || [];
    for(var i = 0; i < items.length; i++){
      var q = quotedUnit(months, items[i] || {});
      if(!q.ok) return {ok:false, reason:q.reason};
    }
    return {ok:true, months:months};
  }

  function simpleCustomerMessages(quote){
    var months = financeMonths(quote && quote.extended);
    var cents = 0;
    var blocks = [];
    var rows = [];
    ((quote && quote.items) || []).forEach(function(item, i){
      var q = quotedUnit(months, item);
      var amount = q.ok ? q.amount : 0;
      var qty = item.qty > 0 ? item.qty : 1;
      var quotedCents = Math.round(amount * 100);
      cents += quotedCents * qty;
      var wasCents = item.regular > 0 ? Math.round(item.regular * 100) : null;
      rows.push({qty:qty, quotedCents:quotedCents, wasCents:wasCents});
      var title = (item.name || 'Item') + (item.label ? ', ' + item.label : '');
      var price = moneyFromCents(quotedCents);
      blocks.push((i + 1) + '. ' + title + ' — ' + (qty > 1 ? price + ' each, Qty ' + qty + ' = ' + moneyFromCents(quotedCents * qty) : price));
    });
    var totals = quoteTotals(cents, deliveryCents(quote.delivery));
    var saved = amountSavedCents(rows);
    function finish(full){
      var lines = ['Hi ' + (quote.name || 'there') + ',', ''].concat(blocks).concat(['']).concat(totalLines(totals, quote.zip, full));
      if(saved > 0) lines.push('Amount saved: ' + moneyFromCents(saved));
      lines.push('');
      customerFinanceLines(!!quote.extended).forEach(function(l){ lines.push(l); });
      return lines.join('\n');
    }
    return {text:finish(false), email:finish(true)};
  }

  function customerMessages(quote){
    if(quote && quote.simple) return simpleCustomerMessages(quote);
    var gate = composeGate(quote);
    var months = gate.months || financeMonths(quote && quote.extended);
    var items = (quote && quote.items) || [];
    var cents = 0;
    var blocks = [];
    items.forEach(function(item, i){
      var q = quotedUnit(months, item);
      var amount = q.ok ? q.amount : 0;
      var qty = item.qty > 0 ? item.qty : 1;
      cents += Math.round(amount * 100) * qty;
      var label = (quote.extended || q.basis === 'regular') && quote.extended ? 'Regular price: ' : 'Price: ';
      if(quote.extended) label = 'Regular price: ';
      blocks.push((i + 1) + '. ' + (item.name || 'Item'));
      blocks.push('   ' + label + moneyFromCents(Math.round(amount * 100)) + (qty > 1 ? ' each, Qty ' + qty : ', Qty ' + qty));
    });
    var totals = quoteTotals(cents, deliveryCents(quote.delivery));
    var textLines = ['Hi ' + (quote.name || 'there') + ',', ''].concat(blocks).concat(['', 'YOUR INVESTMENT']).concat(totalLines(totals, quote.zip, false));
    textLines.push('');
    textLines.push(PET_EXCLUSION);
    textLines.push('Want to spread out the payments? Financing options:');
    textLines.push('https://www.raymourflanigan.com/raymour-services/financing-options');
    customerFinanceLines(!!quote.extended).forEach(function(l){textLines.push(l)});
    var emailLines = ['Hi ' + (quote.name || 'there') + ',', ''].concat(blocks).concat(['', 'YOUR INVESTMENT']).concat(totalLines(totals, quote.zip, true));
    emailLines.push('');
    emailLines.push(PET_EXCLUSION);
    emailLines.push('Want to spread out the payments? Here are your financing options:');
    emailLines.push('https://www.raymourflanigan.com/raymour-services/financing-options');
    customerFinanceLines(!!quote.extended).forEach(function(l){emailLines.push(l)});
    return {text:textLines.join('\n'), email:emailLines.join('\n')};
  }

  function preview(quote, kind){
    var gate = composeGate(quote);
    if(!gate.ok) return {ok:false, reason:gate.reason, state:{sms:'', mail:''}};
    var msgs = customerMessages(quote);
    var body = kind === 'mail' ? msgs.email : msgs.text;
    var state = {sms:'', mail:''};
    state[kind === 'mail' ? 'mail' : 'sms'] = body;
    return {ok:true, body:body, state:state};
  }

  function canCompose(state, kind, quote){
    if(!state) return false;
    var msgs = customerMessages(quote);
    var body = kind === 'mail' ? msgs.email : msgs.text;
    var key = kind === 'mail' ? 'mail' : 'sms';
    if(coverageProblem(body) || coverageProblem(state[key])) return false;
    return !!state[key] && state[key] === body;
  }

  function cartPreviewVisible(s){
    return !!(s && s.added && s.rows && s.rows.length);
  }

  var SHOWROOM_ZIP='08807';
  function productNameState(name){
    var s=String(name==null?'':name).replace(/\s+/g,' ').trim();
    var letters=(s.match(/[A-Za-z]/g)||[]).join('');
    if(!s) return 'missing';
    if(!letters.length) return 'unresolved';
    if(letters.length===1) return 'incomplete';
    return 'ok';
  }
  function productNameBlocks(name, nameOk){
    var st=productNameState(name);
    if(st==='ok') return false;
    if(st==='incomplete' && nameOk===true) return false;
    return true;
  }
  function canStartSkuLookup(name, sku){
    return !!sku9(sku);
  }
  function officialNameFromProductCard(payload, sku){
    var want=sku9(sku);
    var list=payload&&payload.products;
    if(!want||!list||!list.length) return null;
    for(var i=0;i<list.length;i++){
      var p=list[i]||{};
      if(String(p.code||'')!==want) continue;
      var name=String(p.displayName||'').replace(/\s+/g,' ').trim();
      if(!name) return null;
      var path=String(p.url||'').split('?')[0];
      if(!/^\/[A-Za-z0-9\/_.-]{3,200}$/.test(path)) path='';
      return {sku:want, name:name.slice(0,200), url:path};
    }
    return null;
  }
  function preferProductName(previous, next){
    var a=String(previous==null?'':previous).replace(/\s+/g,' ').trim();
    var b=String(next==null?'':next).replace(/\s+/g,' ').trim();
    if(!b) return a;
    if(!a) return b;
    var rank={missing:0, unresolved:1, incomplete:2, ok:3};
    var sa=productNameState(a), sb=productNameState(b);
    if(rank[sa]>rank[sb]) return a;
    if(rank[sb]>rank[sa]) return b;
    if(sa==='ok') return b;
    return b.length>a.length?b:a;
  }
  // Accept only the public delivery-timeline shape for showroom ZIP 08807.
  // A range stays a range. A stock/restock message is never a delivery promise.
  function showroomDeliveryFromTimeline(payload, sku){
    var want=sku9(sku);
    if(!payload||typeof payload!=='object'||!want) return {ok:false, reason:'missing'};
    if(String(payload.code||'')!==want) return {ok:false, reason:'sku-mismatch'};
    if(String(payload.postalCode||'')!==SHOWROOM_ZIP) return {ok:false, reason:'zip-mismatch'};
    var d=payload.date||{}, text=String(d.text||'').trim();
    if(d.isDelivery===true && String(d.label||'')==='Get it by' && d.year && d.month && d.day && text && d.isTimeline!==true)
      return {ok:true, kind:'date', text:'Get it by '+text, zip:SHOWROOM_ZIP, basis:'08807'};
    if(d.isTimeline===true && text && !d.year && !d.month && !d.day)
      return {ok:true, kind:'range', text:'Get it in '+text, zip:SHOWROOM_ZIP, basis:'08807'};
    return {ok:false, reason:'not-a-verified-timeframe'};
  }

  return {
    FINANCE_DISCLOSURE:FINANCE_DISCLOSURE,
    restrictsSale:restrictsSale,
    financeMonths:financeMonths,
    deliveryCents:deliveryCents,
    quoteTotals:quoteTotals,
    totalLines:totalLines,
    moneyFromCents:moneyFromCents,
    sku9:sku9,
    matchResults:matchResults,
    deliveryAssessment:deliveryAssessment,
    colorFromFacets:colorFromFacets,
    websiteStale:websiteStale,
    websitePricePlan:websitePricePlan,
    quotedUnit:quotedUnit,
    customerFinanceLines:customerFinanceLines,
    PET_EXCLUSION:PET_EXCLUSION,
    coverageProblem:coverageProblem,
    amountSavedCents:amountSavedCents,
    customerMessages:customerMessages,
    composeGate:composeGate,
    preview:preview,
    canCompose:canCompose,
    cartPreviewVisible:cartPreviewVisible,
    SHOWROOM_ZIP:SHOWROOM_ZIP,
    productNameState:productNameState,
    productNameBlocks:productNameBlocks,
    canStartSkuLookup:canStartSkuLookup,
    officialNameFromProductCard:officialNameFromProductCard,
    preferProductName:preferProductName,
    showroomDeliveryFromTimeline:showroomDeliveryFromTimeline
  };
});
