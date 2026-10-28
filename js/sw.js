// Bump V on every deploy so phones pick up new files.
const V='receipt-v3';
const SHELL=['./','index.html','css/style.css','js/app.js','js/firebase.js','js/logic.js','manifest.json','icons/icon-192.png','icons/icon-512.png'];
const HOSTS=['www.gstatic.com','fonts.googleapis.com','fonts.gstatic.com','cdnjs.cloudflare.com'];
self.addEventListener('install',e=>e.waitUntil(caches.open(V).then(c=>c.addAll(SHELL)).then(()=>self.skipWaiting())));
self.addEventListener('activate',e=>e.waitUntil(caches.keys().then(k=>Promise.all(k.filter(x=>x!==V).map(x=>caches.delete(x)))).then(()=>clients.claim())));
// Stale-while-revalidate for the app shell and CDN files. Firestore calls are never touched.
self.addEventListener('fetch',e=>{
  const r=e.request,u=new URL(r.url);
  if(r.method!=='GET'||(u.origin!==location.origin&&!HOSTS.includes(u.hostname)))return;
  e.respondWith(caches.open(V).then(async c=>{
    const hit=await c.match(r);
    const net=fetch(r).then(res=>{if(res.ok||res.type==='opaque')c.put(r,res.clone());return res})
      .catch(()=>hit||(r.mode==='navigate'?c.match('index.html'):Response.error()));
    return hit||net;
  }));
});
