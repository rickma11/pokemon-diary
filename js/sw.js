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

// 缓存兜底：优先命中所请求的文件，完全没缓存时退回首页壳。
function fromCache(request) {
  return caches.match(request).then(function (cached) {
    if (cached) return cached;
    return caches.match('index.html').then(function (shell) {
      return shell || new Response('离线', { status: 503 });
    });
  });
}

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
    // 国内访问 github.io 常有几秒抖动：代码文件先等网络 900ms，
    // 超时就直接用缓存秒开，网络请求继续在后台把新版写进缓存（下次生效）。
    // 比原来的「纯 network-first」少等一整串请求，又比纯 cache-first 更容易拿到修复版。
    var net = fetch(request).then(function (response) {
      if (response && response.ok) {
        var copy = response.clone();
        caches.open(CACHE).then(function (cache) { cache.put(request, copy); });
      }
      return response;
    })['catch'](function () { return null; });
    var slow = new Promise(function (resolve) {
      setTimeout(function () { resolve(null); }, 900);
    });
    event.respondWith(
      Promise.race([net, slow]).then(function (response) {
        return response || fromCache(request);
      })['catch'](function () { return fromCache(request); })
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
