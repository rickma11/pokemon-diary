// 版本号每发一次新版就 +1：换号会连带清掉旧缓存，
// 避免早期版本缓存到的 404（那时 animated/ 目录还不存在）一直挡住宝可梦图片。
var CACHE = 'pokedex-checkin-v72';

self.addEventListener('install', function () {
  self.skipWaiting();
});

self.addEventListener('activate', function (event) {
  event.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(keys.map(function (key) {
        if (key !== CACHE) return caches.delete(key);
        return null;
      }));
    }).then(function () {
      return self.clients.claim();
    })
  );
});

self.addEventListener('fetch', function (event) {
  var request = event.request;
  if (request.method !== 'GET') return;

  var url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // 接口请求一律不走缓存：存档/照片必须拿实时数据，缓存会造成「打钩不同步」的假象
  if (url.pathname.indexOf('/api/') === 0) return;

  var isCode = url.pathname === '/' ||
    url.pathname.indexOf('/index.html') >= 0 ||
    /\.(html|js|css|json)$/.test(url.pathname);

  if (isCode) {
    event.respondWith(
      fetch(request).then(function (response) {
        var copy = response.clone();
        caches.open(CACHE).then(function (cache) {
          cache.put(request, copy);
        });
        return response;
      })['catch'](function () {
        return caches.match(request).then(function (cached) {
          return cached || caches.match('index.html');
        });
      })
    );
    return;
  }

  event.respondWith(
    caches.match(request).then(function (cached) {
      // 只认成功响应：404/失败响应一旦被缓存，宝可梦就永远是坏图
      if (cached && cached.ok) return cached;
      return fetch(request).then(function (response) {
        if (response && response.ok) {
          var copy = response.clone();
          caches.open(CACHE).then(function (cache) {
            cache.put(request, copy);
          });
        }
        return response;
      });
    })
  );
});
