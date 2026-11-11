/* Furniture Vendor Finder service worker. Version is stamped at build time (v2.6.1, content hash bb784610a4). */
var VERSION='2.6.1-bb784610a4';
var CACHE='vf-'+VERSION;
var PRECACHE=['./','index.html','quote-rules.js','manifest.json','manifest-naeem.json','manifest-hans.json','zxing-0.21.3.min.js','apple-touch-icon.png','naeem.jpg','icon-192.png','icon-512.png','og.png','favicon.png','favicon.ico','ocr/tesseract-5.1.1/tesseract.min.js','ocr/tesseract-5.1.1/worker.min.js','ocr/core-5.1.1/tesseract-core-lstm.wasm.js','ocr/core-5.1.1/tesseract-core-simd-lstm.wasm.js','ocr/lang/eng.traineddata.gz'];
self.addEventListener('install',function(e){
  // fetch with cache:'reload' so we never precache a stale copy from the HTTP cache
  e.waitUntil(caches.open(CACHE).then(function(c){
    return Promise.all(PRECACHE.map(function(u){return c.add(new Request(u,{cache:'reload'}))}));
  }).then(function(){return self.skipWaiting()}));
});
self.addEventListener('activate',function(e){
  e.waitUntil(caches.keys().then(function(ks){
    return Promise.all(ks.filter(function(k){return k.indexOf('vf-')===0&&k!==CACHE}).map(function(k){return caches.delete(k)}));
  }).then(function(){return self.clients.claim()}));
});
self.addEventListener('message',function(e){if(e.data&&e.data.type==='SKIP_WAITING')self.skipWaiting()});
function shellRequest(url,req){
  if(req.mode==='navigate')return true;
  return /\/(?:index\.html|quote-rules\.js)$/.test(url.pathname)||url.pathname.endsWith('/');
}
self.addEventListener('fetch',function(e){
  var req=e.request;
  if(req.method!=='GET')return;
  var url=new URL(req.url);
  if(url.origin!==self.location.origin)return; // vendor sites etc. go straight to the network
  if(url.pathname.endsWith('/sw.js'))return; // the browser must see worker-script changes directly
  var shell=shellRequest(url,req);
  e.respondWith(caches.open(CACHE).then(function(cache){
    var key=req;
    if(req.mode==='navigate'){key=new Request(new URL('index.html',self.registration.scope).href)}
    function store(r){if(r&&r.ok&&r.type==='basic')cache.put(key,r.clone());return r}
    function offline(){return cache.match(key,{ignoreSearch:true}).then(function(hit){return hit||new Response('Offline and not cached yet. Open this page once with a connection.',{status:503,headers:{'Content-Type':'text/plain'}})})}
    if(shell){
      return fetch(req.mode==='navigate'?new Request(key,{cache:'no-cache'}):new Request(req,{cache:'no-cache'})).then(store).catch(offline);
    }
    return cache.match(key,{ignoreSearch:true}).then(function(hit){
      // background revalidate (bypass the 10-minute HTTP cache); update the cache for next time
      var net=fetch(new Request(req,{cache:'no-cache'})).then(store).catch(function(){return null});
      if(hit){e.waitUntil(net);return hit}
      return net.then(function(r){return r||offline()});
    });
  }));
});
