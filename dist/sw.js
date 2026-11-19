const VERSION = 'morning-pull-0.1.0-test.2';
const OCR_CACHE = VERSION+'-ocr';
const CORE = [
  './','./offline.js','./version.js','./style.css','./app.js','./core.js','./storage.js','./ui.js','./views.js','./recipes.js','./recipe-import.js','./chat.js','./espresso-coach.js','./coach-ui.js','./selection.js',
  './app.webmanifest','./icon-192.png','./icon-512.png','./cafe.webp','./fonts/pixel.woff2','./fonts/dm.woff2'
];
const scope=new URL(self.registration.scope);
const assets = new Set(CORE.map(path => new URL(path,scope).href));

self.addEventListener('install',event=>{
  event.waitUntil(caches.open(VERSION).then(cache=>cache.addAll([...assets])).then(()=>self.skipWaiting()));
});
self.addEventListener('activate',event=>{
  event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(key=>key.startsWith('morning-pull-')&&key!==VERSION&&key!==OCR_CACHE).map(key=>caches.delete(key))))
    .then(()=>self.clients.claim()));
});
self.addEventListener('message',event=>{
  const reply=event.ports[0];
  if(event.data!=='check-offline'||!reply) return;
  event.waitUntil(caches.open(VERSION).then(async cache=>
    reply.postMessage((await Promise.all([...assets].map(url=>cache.match(url)))).every(response=>response?.ok))
  ).catch(()=>reply.postMessage(false)));
});
self.addEventListener('fetch',event=>{
  const url=new URL(event.request.url);
  if(event.request.method!=='GET'||url.origin!==scope.origin||!url.pathname.startsWith(scope.pathname)) return;
  if(event.request.mode==='navigate'){
    event.respondWith((async()=>{
      let response;
      try {
        response = await fetch(event.request);
        if (![502,503,504].includes(response.status)) return response;
      } catch {}
      return (await (await caches.open(VERSION)).match(scope.href)) ?? response ?? Response.error();
    })());
  } else if(assets.has(url.href)){
    event.respondWith(caches.open(VERSION).then(async cache=>(await cache.match(event.request))??fetch(event.request)));
  } else if(url.pathname.startsWith(new URL('./ocr/',scope).pathname)){
    event.respondWith((async()=>{
      const cache=await caches.open(OCR_CACHE);
      const cached=await cache.match(event.request);
      if(cached) return cached;
      const response=await fetch(event.request);
      if(response.ok) await cache.put(event.request,response.clone());
      return response;
    })());
  }
});
