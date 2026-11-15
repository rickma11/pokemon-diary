// 旧版离线缓存已迁到站点根目录 sw.js。
// 这个文件只为已经注册的旧 SW 保留：浏览器来更新时会命中它，随即自我注销，
// 避免旧的 js/ 作用域继续拦截请求。新代码不再注册这个文件。
self.addEventListener('install', function () { self.skipWaiting(); });
self.addEventListener('activate', function (event) {
  event.waitUntil(
    self.registration.unregister().then(function () { return self.clients.claim(); })
  );
});
