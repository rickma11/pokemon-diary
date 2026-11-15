// 版本号每发一次新版就 +1：换号会连带清掉旧缓存。
// 必须放在站点根目录、注册时 scope 为 './'，才能缓存 index.html 等全站资源。
// 旧版放在 js/ 子目录，作用域只覆盖 js/，既缓存不到首页，又会把没缓存的 JS
// 换成 index.html 壳（浏览器当 JS 解析失败 → 名字表缺失、选宠只显示 #编号）。
var CACHE = 'pokedex-checkin-v76';
var SHELL = 'index.html'; // 首页壳统一用这个 key，避免 / 与 /index.html 存两份

self.addEventListener('install', function () { self.skipWaiting(); });

self.addEventListener('activate', function (event) {
  event.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(keys.map(function (key) {
        return key === CACHE ? null : caches.delete(key);
      }));
    }).then(function () { return self.clients.claim(); })
  );
});

self.addEventListener('fetch', function (event) {
  var request = event.request;
  if (request.method !== 'GET') return;

  var url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.indexOf('/api/') === 0) return; // 账号/存档必须拿实时数据

  var isShell = request.mode === 'navigate' ||
    url.pathname === '/' || /\/index\.html$/.test(url.pathname);

  if (isShell) {
    // 首页：有缓存就立刻返回（回访秒开），网络在后台把新版写进缓存；
    // 首次没缓存时必须老实等网络，绝不把别的资源当首页返回。
    event.respondWith(
      caches.open(CACHE).then(function (cache) {
        return cache.match(SHELL).then(function (cached) {
          var net = fetch(request).then(function (r) {
            if (r && r.ok) cache.put(SHELL, r.clone());
            return r;
          })['catch'](function () { return null; });
          if (cached) return cached;
          return net.then(function (r) {
            return r || new Response('离线且无缓存', { status: 503 });
          });
        });
      })
    );
    return;
  }

  var isCode = /\.(html|js|css|json)$/.test(url.pathname);
  if (isCode) {
    // 代码文件：网络优先，失败才读缓存。
    // 关键：缓存没命中时不能退回 index.html —— HTML 被当 JS/CSS 解析会静默失效。
    event.respondWith(
      fetch(request).then(function (r) {
        if (r && r.ok) {
          var copy = r.clone();
          caches.open(CACHE).then(function (cache) { cache.put(request, copy); });
        }
        return r;
      })['catch'](function () {
        return caches.match(request).then(function (cached) {
          return cached || new Response('', { status: 503, statusText: 'offline' });
        });
      })
    );
    return;
  }

  // 图片 / 音效：缓存优先，只缓存成功响应（404 一旦被缓存，宝可梦就永远是坏图）
  event.respondWith(
    caches.match(request).then(function (cached) {
      if (cached && cached.ok) return cached;
      return fetch(request).then(function (response) {
        if (response && response.ok) {
          var copy = response.clone();
          caches.open(CACHE).then(function (cache) { cache.put(request, copy); });
        }
        return response;
      });
    })
  );
});
