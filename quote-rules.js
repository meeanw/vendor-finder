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

  // Destination sales tax. Rates are not guessed.
  // NJ 6.625%: NJ Division of Taxation, https://www.nj.gov/treasury/businesses/salestax/ (page states 6.625%). Delivery is part of the taxable receipt: N.J.A.C. 18:24-27.2 and Sales Tax Guide SU-4 (rev. 07/22). No Urban Enterprise Zone rate: UEZ depends on the seller's location, not the customer ZIP. ZIP range 07001–08999 is the owner's rule for a New Jersey delivery ZIP.
  // PA state 6%, Allegheny County +1% (7% combined), Philadelphia +2% (8% combined): PA Department of Revenue, https://www.pa.gov/agencies/revenue/resources/tax-rates and local-sales-tax page. Destination sourcing for those local taxes is enforced from October 1, 2026 (Act 21 of 2026). Delivery of taxable goods is taxed: 61 Pa. Code § 54.1 and § 31.5(a)(3).
  // Philadelphia ZIPs below are Philadelphia County codes from the City of Philadelphia ZIP map (Sept 2026) plus the Pennsylvania ZIP/county list that names Philadelphia County, excluding 19113 (that list places 19113 in Delaware County).
  // Allegheny ZIPs below are the unstarred codes on the PA DPW "ZIP CODES—ALLEGHENY COUNTY" list. Starred codes on that list cross a county line, so they are not applied automatically.
  // DE 0%: Delaware Division of Revenue, no state or local sales tax (https://revenue.delaware.gov/business-tax-forms/exemption-certificates/). ZIP prefixes 197–199.
  // CT 6.35% statewide, no local sales tax, and the seller's delivery charge is in the sales price: Connecticut DRS, https://portal.ct.gov/drs/sales-tax/tax-information and DRS-143 (Aug 2023). ZIP prefixes 060–069, except 06390 (Fishers Island, New York).
  // NY combined rates: Publication 718, effective March 1, 2025 (revised Feb 2025), https://www.tax.ny.gov/pdf/publications/sales/pub718.pdf. New York City is 8.875%. Delivery the seller bills is taxable: TB-ST-838. Publication 718 says ZIP codes do not match tax jurisdictions, so a New York ZIP is never applied automatically.
  // USPS ZIP prefixes used only to choose a state: CT 060–069, NJ 070–089, NY 100–149, PA 150–196, DE 197–199.
  var NJ_RATE = 6625;
  var PHILADELPHIA_ZIPS = '19101 19102 19103 19104 19105 19106 19107 19108 19109 19110 19111 19112 19114 19115 19116 19118 19119 19120 19121 19122 19123 19124 19125 19126 19127 19128 19129 19130 19131 19132 19133 19134 19135 19136 19137 19138 19139 19140 19141 19142 19143 19144 19145 19146 19147 19148 19149 19150 19151 19152 19153 19154 19155 19160';
  var ALLEGHENY_ZIPS = '15006 15007 15014 15015 15018 15020 15024 15025 15028 15030 15031 15032 15034 15035 15037 15045 15046 15047 15049 15051 15056 15064 15065 15071 15075 15076 15082 15084 15086 15088 15090 15091 15095 15101 15102 15104 15106 15108 15110 15112 15116 15120 15122 15127 15129 15132 15133 15134 15135 15136 15137 15139 15140 15142 15144 15145 15146 15147 15148 15201 15202 15203 15204 15205 15206 15207 15208 15209 15210 15211 15212 15213 15214 15215 15216 15217 15218';
  var ALLEGHENY_SHARED_ZIPS = '15003 15005 15012 15017 15026 15044 15057 15063 15068 15083 15085 15089 15126 15131 15143';

  function formatPct(bp){
    return (bp / 1000).toFixed(3).replace(/0+$/, '').replace(/\.$/, '') + '%';
  }
  function zip5(raw){
    var m = String(raw == null ? '' : raw).match(/(\d{5})(?:-\d{4})?/);
    return m ? m[1] : '';
  }
  function zipListed(list, zip){return list.indexOf(zip) !== -1}
  function taxResult(o){
    o.deliveryTaxed = o.deliveryTaxed !== false;
    o.label = o.label || ('Sales tax (' + (o.place || o.state || 'confirmed') + ' ' + formatPct(o.rateBp) + ')');
    return o;
  }
  function salesTaxForZip(raw){
    var zip = zip5(raw);
    var typed = String(raw == null ? '' : raw).trim();
    if(!typed) return taxResult({zip:'', confident:true, needsConfirm:false, rateBp:NJ_RATE, deliveryTaxed:true, state:'NJ', jurisdiction:'NJ', place:'NJ', guess:false, note:''});
    if(!zip) return {zip:'', confident:false, needsConfirm:true, rateBp:null, guessBp:null, deliveryTaxed:true, state:'', jurisdiction:'', guess:false, label:'', note:'Enter a 5-digit delivery ZIP, or type the sales tax rate and confirm it. New Jersey’s 6.625% is not used for this entry.'};
    var n = +zip;
    if(n >= 7001 && n <= 8999) return taxResult({zip:zip, confident:true, needsConfirm:false, rateBp:NJ_RATE, deliveryTaxed:true, state:'NJ', jurisdiction:'NJ', place:'NJ', guess:false, note:''});
    if(n >= 19700 && n <= 19999) return taxResult({zip:zip, confident:true, needsConfirm:false, rateBp:0, deliveryTaxed:true, state:'DE', jurisdiction:'DE', place:'DE', guess:false, note:''});
    if(zip === '06390') return {zip:zip, confident:false, needsConfirm:true, rateBp:null, guessBp:null, deliveryTaxed:true, state:'NY', jurisdiction:'', guess:false, label:'', note:'ZIP 06390 is Fishers Island, New York, not Connecticut. Enter the combined New York rate from Publication 718 (effective March 1, 2025). It is not applied until you confirm it.'};
    if(n >= 6000 && n <= 6999) return taxResult({zip:zip, confident:true, needsConfirm:false, rateBp:6350, deliveryTaxed:true, state:'CT', jurisdiction:'CT', place:'CT', guess:false, note:''});
    if(zipListed(PHILADELPHIA_ZIPS, zip)) return taxResult({zip:zip, confident:true, needsConfirm:false, rateBp:8000, deliveryTaxed:true, state:'PA', jurisdiction:'Philadelphia', place:'PA, Philadelphia', guess:false, note:''});
    if(zipListed(ALLEGHENY_ZIPS, zip)) return taxResult({zip:zip, confident:true, needsConfirm:false, rateBp:7000, deliveryTaxed:true, state:'PA', jurisdiction:'Allegheny County', place:'PA, Allegheny County', guess:false, note:''});
    if(zipListed(ALLEGHENY_SHARED_ZIPS, zip)) return {zip:zip, confident:false, needsConfirm:true, rateBp:null, guessBp:7000, deliveryTaxed:true, state:'PA', jurisdiction:'Allegheny County', guess:true, label:'Sales tax (PA, Allegheny County 7%)', note:'Best guess for ZIP ' + zip + ': 7% if this address is in Allegheny County, or 6% if it is across the county line. The Pennsylvania list marks this ZIP as shared. Confirm the rate before preview. It is not applied yet.'};
    if(n >= 10000 && n <= 10282) return {zip:zip, confident:false, needsConfirm:true, rateBp:null, guessBp:8875, deliveryTaxed:true, state:'NY', jurisdiction:'New York City', guess:true, label:'Sales tax (NY, New York City 8.875%)', note:'Best guess for ZIP ' + zip + ': New York City 8.875% (Publication 718, effective March 1, 2025). New York says a ZIP code is not a tax boundary, so confirm it before preview. It is not applied yet.'};
    if(n >= 10000 && n <= 14999) return {zip:zip, confident:false, needsConfirm:true, rateBp:null, guessBp:null, deliveryTaxed:true, state:'NY', jurisdiction:'', guess:false, label:'', note:'ZIP ' + zip + ' is in New York. Publication 718 (effective March 1, 2025) sets a combined state and local rate by city or county, and it says not to use the ZIP code alone. Enter that combined rate. New Jersey’s 6.625% is not used.'};
    if(n >= 15000 && n <= 19699) return {zip:zip, confident:false, needsConfirm:true, rateBp:null, guessBp:6000, deliveryTaxed:true, state:'PA', jurisdiction:'PA', guess:true, label:'Sales tax (PA 6%)', note:'Best guess for ZIP ' + zip + ': Pennsylvania state rate 6%. This ZIP is not in the Philadelphia or single-county Allegheny lists. Confirm it before preview. It is not applied yet.'};
    return {zip:zip, confident:false, needsConfirm:true, rateBp:null, guessBp:null, deliveryTaxed:true, state:'', jurisdiction:'', guess:false, label:'', note:'ZIP ' + zip + ' is not a New Jersey delivery ZIP in this table. Enter the destination combined sales tax rate. New Jersey’s 6.625% is not used.'};
  }
  function rateBpFromPercent(raw){
    var s = String(raw == null ? '' : raw).replace(/%/g, '').trim();
    if(!s || !/^\d+(\.\d+)?$/.test(s)) return null;
    var n = parseFloat(s);
    if(!isFinite(n) || n < 0 || n > 20) return null;
    return Math.round(n * 1000);
  }
  function appliedSalesTax(raw, confirm){
    var found = salesTaxForZip(raw);
    if(!found.needsConfirm && found.rateBp != null) return found;
    var zip = found.zip || zip5(raw);
    var rate = confirm ? confirm.rateBp : null;
    if(confirm && confirm.ok && confirm.zip === zip && rate != null){
      var sameGuess = found.guessBp != null && rate === found.guessBp && found.label;
      return taxResult({zip:zip, confident:true, needsConfirm:false, rateBp:rate, deliveryTaxed:found.deliveryTaxed !== false, state:found.state, jurisdiction:found.jurisdiction || ('ZIP ' + zip), place: sameGuess ? '' : ('ZIP ' + zip), label: sameGuess ? found.label : '', confirmed:true, guess:false, note:''});
    }
    return {zip:zip, confident:false, needsConfirm:true, rateBp:null, guessBp:found.guessBp, deliveryTaxed:found.deliveryTaxed !== false, state:found.state, jurisdiction:found.jurisdiction || '', guess:!!found.guess, label:found.label || '', note:found.note};
  }
  function quoteTotals(itemsCents, delCents, tax){
    if(delCents === null || delCents === undefined) return {itemsCents:itemsCents, deliveryCents:null, taxCents:null, totalCents:null, taxLabel:'', rateBp:null, jurisdiction:''};
    var rate = tax && Object.prototype.hasOwnProperty.call(tax, 'rateBp') ? tax.rateBp : NJ_RATE;
    if(rate == null) return {itemsCents:itemsCents, deliveryCents:delCents, taxCents:null, totalCents:null, taxLabel:'', rateBp:null, jurisdiction:tax && tax.jurisdiction || ''};
    var deliveryTaxed = !tax || tax.deliveryTaxed !== false;
    var label = tax && tax.label ? tax.label : 'Sales tax (NJ 6.625%)';
    var base = itemsCents + (deliveryTaxed ? delCents : 0);
    var taxCents = Math.floor((base * rate + 50000) / 100000);
    return {itemsCents:itemsCents, deliveryCents:delCents, taxCents:taxCents, totalCents:itemsCents + delCents + taxCents, taxLabel:label, rateBp:rate, jurisdiction:(tax && tax.jurisdiction) || 'NJ'};
  }

  function totalLines(totals, zip, full){
    var z = String(zip || '').trim();
    var del = (z ? 'Delivery to ' + z + ': ' : 'Delivery: ') + moneyFromCents(totals.deliveryCents);
    var taxLabel = totals.taxLabel || 'Sales tax (NJ 6.625%)';
    return [
      'Items: ' + moneyFromCents(totals.itemsCents),
      del,
      taxLabel + ': ' + moneyFromCents(totals.taxCents),
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

  function customerMessages(quote){
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
    var tax = appliedSalesTax(quote && quote.zip, quote && quote.taxConfirm);
    var totals = quoteTotals(cents, deliveryCents(quote.delivery), tax.needsConfirm ? {rateBp:null, jurisdiction:tax.jurisdiction} : tax);
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
    salesTaxForZip:salesTaxForZip,
    appliedSalesTax:appliedSalesTax,
    rateBpFromPercent:rateBpFromPercent,
    formatPct:formatPct,
    zip5:zip5,
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
