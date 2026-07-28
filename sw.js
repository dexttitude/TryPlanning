/* TryPlanning service worker.
   Bump SW_VERSION on every deploy — that byte change is what makes browsers
   notice a new release. HTML is network-first so an update always lands. */
const SW_VERSION='2026.07.28.2';
const CACHE='tp-v'+SW_VERSION;
const SHELL=['./','./index.html','./manifest.webmanifest','./icons/icon-192.png','./icons/icon-512.png','./icons/icon-maskable-512.png','./icons/apple-touch-icon-180.png'];
const FONT_HOSTS=['fonts.googleapis.com','fonts.gstatic.com'];

self.addEventListener('install',e=>{
  e.waitUntil(caches.open(CACHE).then(c=>Promise.allSettled(SHELL.map(u=>c.add(new Request(u,{cache:'reload'}))))));
});

self.addEventListener('activate',e=>{
  e.waitUntil((async()=>{
    const ks=await caches.keys();
    await Promise.all(ks.filter(k=>k!==CACHE).map(k=>caches.delete(k)));
    await self.clients.claim();
  })());
});

self.addEventListener('message',e=>{
  if(!e.data)return;
  if(e.data.type==='SKIP_WAITING')self.skipWaiting();
  if(e.data.type==='GET_VERSION'&&e.source)e.source.postMessage({type:'VERSION',version:SW_VERSION});
});

self.addEventListener('fetch',e=>{
  const req=e.request;
  if(req.method!=='GET')return;
  let url;try{url=new URL(req.url)}catch(err){return}
  if(url.protocol!=='http:'&&url.protocol!=='https:')return;

  // Google Fonts — cache-first with an explicit CORS fetch so the response is storable
  if(FONT_HOSTS.includes(url.hostname)){
    e.respondWith((async()=>{
      const c=await caches.open(CACHE),hit=await c.match(req);
      if(hit)return hit;
      try{const r=await fetch(url.href,{mode:'cors'});if(r&&r.ok)await c.put(req,r.clone());return r;}
      catch(err){return Response.error();}
    })());
    return;
  }

  if(url.origin!==location.origin)return;

  // Documents — network-first. This is what defeats GitHub Pages' CDN cache.
  const isDoc=req.mode==='navigate'||url.pathname.endsWith('/')||url.pathname.endsWith('.html');
  if(isDoc){
    e.respondWith((async()=>{
      try{
        const r=await fetch(url.href,{cache:'reload'});
        if(r&&r.ok){const c=await caches.open(CACHE);await c.put(req,r.clone());}
        return r;
      }catch(err){
        const c=await caches.open(CACHE);
        return (await c.match(req))||(await c.match('./index.html'))||(await c.match('./'))||
          new Response('<!DOCTYPE html><meta charset="utf-8"><title>Offline</title><body style="font:16px system-ui;padding:40px">Offline, and no cached copy yet. Reconnect once and it will work offline after that.</body>',{headers:{'Content-Type':'text/html'}});
      }
    })());
    return;
  }

  // Everything else — cache-first, quietly refreshed in the background
  e.respondWith((async()=>{
    const c=await caches.open(CACHE),hit=await c.match(req);
    if(hit){fetch(req).then(r=>{if(r&&r.ok)c.put(req,r.clone())}).catch(()=>{});return hit;}
    try{const r=await fetch(req);if(r&&r.ok)await c.put(req,r.clone());return r;}
    catch(err){return Response.error();}
  })());
});
