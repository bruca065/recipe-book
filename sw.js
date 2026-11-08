const CACHE = 'recipe-v5';
const ASSETS = ['./', './index.html', './app.js', './classify.js', './style.css', './manifest.webmanifest', './icon-192.png', './icon-512.png'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS)));
  self.skipWaiting();
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))));
  self.clients.claim();
});

// インスタ等から「共有」されたデータを受け取り、IndexedDBの受け箱に入れてアプリへ渡す
self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  if (e.request.method === 'POST' && url.pathname.endsWith('/share-target')) {
    e.respondWith((async () => {
      const form = await e.request.formData();
      const files = form.getAll('images').filter(f => f && f.size);
      const item = {
        title: form.get('title') || '',
        text: form.get('text') || '',
        url: form.get('url') || '',
        images: files,
        at: Date.now()
      };
      await putShared(item);
      return Response.redirect('./index.html?shared=1', 303);
    })());
    return;
  }
  if (e.request.method !== 'GET') return;
  // 同じサイトのファイルは「通信優先・失敗時キャッシュ」で常に最新版を使う
  if (url.origin !== location.origin) return;
  e.respondWith(fetch(e.request).then(res => { const c = res.clone(); caches.open(CACHE).then(ca => ca.put(e.request, c)); return res; }).catch(() => caches.match(e.request, { ignoreSearch: true })));
});

function putShared(item) {
  return new Promise((res, rej) => {
    const req = indexedDB.open('recipe-db', 1);
    req.onupgradeneeded = () => upgrade(req.result);
    req.onsuccess = () => {
      const tx = req.result.transaction('inbox', 'readwrite');
      tx.objectStore('inbox').add(item);
      tx.oncomplete = () => res();
      tx.onerror = () => rej(tx.error);
    };
    req.onerror = () => rej(req.error);
  });
}
function upgrade(db) {
  if (!db.objectStoreNames.contains('recipes')) db.createObjectStore('recipes', { keyPath: 'id' });
  if (!db.objectStoreNames.contains('inbox')) db.createObjectStore('inbox', { keyPath: 'k', autoIncrement: true });
}
