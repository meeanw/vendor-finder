/* Furniture Vendor Finder service worker. Version is stamped at build time (v1.3, content hash 11462705b6). */
var VERSION='1.3-11462705b6';
var CACHE='vf-'+VERSION;
var PRECACHE=['./','index.html','manifest.json','apple-touch-icon.png','icon-192.png','icon-512.png','og.png','favicon.png','favicon.ico'];
self.addEventListener('install',function(e){
  // fetch with cache:'reload' so we never precache a stale copy from the HTTP cache
  e.waitUntil(caches.open(CACHE).then(function(c){
    return Promise.all(PRECACHE.map(function(u){return c.add(new Request(u,{cache:'reload'}))}));
  }));
});
self.addEventListener('activate',function(e){
  e.waitUntil(caches.keys().then(function(ks){
    return Promise.all(ks.filter(function(k){return k.indexOf('vf-')===0&&k!==CACHE}).map(function(k){return caches.delete(k)}));
  }).then(function(){return self.clients.claim()}));
});
self.addEventListener('message',function(e){if(e.data&&e.data.type==='SKIP_WAITING')self.skipWaiting()});
self.addEventListener('fetch',function(e){
  var req=e.request;
  if(req.method!=='GET')return;
  var url=new URL(req.url);
  if(url.origin!==self.location.origin)return; // vendor sites etc. go straight to the network
  e.respondWith(caches.open(CACHE).then(function(cache){
    var key=req;
    if(req.mode==='navigate'){key=new Request(new URL('index.html',self.registration.scope).href)}
    return cache.match(key,{ignoreSearch:true}).then(function(hit){
      // background revalidate (bypass the 10-minute HTTP cache); update the cache for next time
      var net=fetch(req.mode==='navigate'?new Request(key,{cache:'no-cache'}):new Request(req,{cache:'no-cache'})).then(function(r){
        if(r&&r.ok&&r.type==='basic')cache.put(key,r.clone());return r}).catch(function(){return null});
      if(hit){e.waitUntil(net);return hit}
      return net.then(function(r){return r||new Response('Offline and not cached yet. Open this page once with a connection.',{status:503,headers:{'Content-Type':'text/plain'}})});
    });
  }));
});
