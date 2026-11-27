// 앱 화면 파일을 저장해 두어 빨리 열리게 하는 파일. 서버 기록(api.php, oauth)은 저장하지 않아요
const CACHE = "study-friends-v5";
const FILES = ["./", "./index.html", "./assets/app.css?v=5", "./assets/js/main.js?v=5", "./manifest.webmanifest", "./icon-192.png", "./icon.svg"];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(FILES)).catch(() => {}).then(() => self.skipWaiting()));
});
self.addEventListener("activate", (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
// 항상 새 버전을 먼저 받아 오고, 인터넷이 없을 때만 저장해 둔 화면을 보여 줘요
self.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== "GET" || url.origin !== location.origin || url.pathname.endsWith("api.php") || url.pathname.includes("/oauth/")) return;
  e.respondWith(
    fetch(e.request).then((res) => {
      if (res.ok) { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(e.request, copy)); }
      return res;
    }).catch(() => caches.match(e.request).then((r) => r || caches.match("./index.html")))
  );
});
