/* Darts web app (iPhone and browsers): works offline once opened.
   The page itself is fetched from the network first, so a new version arrives on the next launch with a connection;
   fonts and icons come from the cache. The build stamps SW_VERSION, which retires the old cache. */
const SW_VERSION='dev';
const CACHE='darts-'+SW_VERSION;
const CORE=['./','index.html','manifest.webmanifest','icons/apple-touch-icon.png','icons/icon-192.png','icons/icon-512.png','icons/maskable-512.png',
  'fonts/barlow-condensed-latin-600-normal.woff2','fonts/barlow-condensed-latin-700-normal.woff2','fonts/barlow-condensed-latin-800-normal.woff2',
  'fonts/barlow-latin-400-normal.woff2','fonts/barlow-latin-500-normal.woff2','fonts/barlow-latin-600-normal.woff2'];
self.addEventListener('install',e=>{e.waitUntil(caches.open(CACHE).then(c=>c.addAll(CORE)).then(()=>self.skipWaiting()))});
self.addEventListener('activate',e=>{e.waitUntil(caches.keys().then(ks=>Promise.all(ks.filter(k=>k.startsWith('darts-')&&k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim()))});
self.addEventListener('fetch',e=>{
  const r=e.request;if(r.method!=='GET')return;
  const url=new URL(r.url);if(url.origin!==location.origin)return;   // GitHub API and anything external: straight to the network
  if(r.mode==='navigate'){
    e.respondWith(fetch(r).then(res=>{const c=res.clone();caches.open(CACHE).then(k=>k.put('index.html',c));return res})
      .catch(()=>caches.match('index.html').then(m=>m||caches.match('./'))));
    return;
  }
  e.respondWith(caches.match(r).then(m=>m||fetch(r).then(res=>{if(res.ok){const c=res.clone();caches.open(CACHE).then(k=>k.put(r,c))}return res})));
});
