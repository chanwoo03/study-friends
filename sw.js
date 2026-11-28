// 앱 화면 파일을 저장해 두어 빨리 열리게 하는 파일. 서버 기록(api.php, oauth)은 저장하지 않아요
const CACHE = "study-friends-v20";
const FILES = ["./", "./index.html", "./assets/app.css?v=20", "./assets/js/main.js?v=20", "./manifest.webmanifest", "./icon-192.png", "./icon.svg"];

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

// ===== 푸시 알림 (아이폰 홈 화면 웹앱·컴퓨터 브라우저) =====
// 서버가 Firebase 로 '데이터 메시지'를 보내면 여기서 알림을 띄워요. (아이폰은 받은 푸시마다 꼭 알림을 보여 줘야 해요)
self.addEventListener("push", (e) => {
  let d = {};
  try { const p = e.data ? e.data.json() : {}; d = p.data || p; } catch (err) {}
  const title = d.title || "공부 친구";
  e.waitUntil(self.registration.showNotification(title, {
    body: d.body || "",
    icon: "icon-192.png",
    badge: "icon-192.png",
    tag: (d.kind || "") + (d.link || ""),   // 같은 대화·계획 알림은 새 것으로 바꿔 끼워요
    renotify: true,
    data: { link: d.link || "" },
  }));
});
// 알림을 누르면 그 화면으로 (열려 있는 창이 있으면 그 창에서)
self.addEventListener("notificationclick", (e) => {
  e.notification.close();
  const link = (e.notification.data && e.notification.data.link) || "";
  const url = new URL("./" + (link ? "#" + link : ""), self.registration.scope).href;
  e.waitUntil(self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((list) => {
    for (const c of list) if (c.url.startsWith(self.registration.scope)) { c.navigate(url).catch(() => {}); return c.focus(); }
    return self.clients.openWindow(url);
  }));
});
