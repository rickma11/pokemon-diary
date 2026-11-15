// 版本号每发一次新版就 +1：换号会连带清掉旧缓存。
// 必须放在站点根目录、注册时 scope 为 './'，才能缓存 index.html 等全站资源。
// 旧版放在 js/ 子目录，作用域只覆盖 js/，既缓存不到首页，又会把没缓存的 JS
// 换成 index.html 壳（浏览器当 JS 解析失败 → 名字表缺失、选宠只显示 #编号）。
var CACHE = 'pokedex-checkin-v82';
var SHELL = 'index.html'; // 首页壳统一用这个 key，避免 / 与 /index.html 存两份

self.addEventListener('install', function () { self.skipWaiting(); });

// 通知所有已打开的页面：首页内容有新版，页面侧会自动刷新一次
function notify(ver) {
  self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function (list) {
    for (var i = 0; i < list.length; i++) {
      list[i].postMessage({ type: 'SHELL_UPDATED', ver: ver || CACHE });
    }
  })['catch'](function () {});
}

self.addEventListener('activate', function (event) {
  event.waitUntil(
    caches.keys().then(function (keys) {
      var upgraded = false;
      return Promise.all(keys.map(function (key) {
        if (key === CACHE) return null;
        if (key.indexOf('pokedex-checkin-') === 0) upgraded = true;
        return caches.delete(key);
      })).then(function () { return upgraded; });
    }).then(function (upgraded) {
      return self.clients.claim().then(function () {
        if (!upgraded) return;
        // 从旧版本升级时，已打开的页面跑的还是旧代码，没有消息监听。
        // 直接把它导航到带版本号的新 URL，强制加载一次新版 HTML。
        return self.clients.matchAll({ type: 'window', includeUncontrolled: true })
          .then(function (list) {
            for (var i = 0; i < list.length; i++) {
              try {
                var u = new URL(list[i].url);
                u.searchParams.set('_sw', CACHE);
                var p = list[i].navigate(u.toString());
                if (p && p['catch']) p['catch'](function () {});
              } catch (e) {}
            }
          });
      });
    })
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
    // 首页：有缓存立刻返回（回访秒开），网络在后台把新版写进缓存。
    // 关键：GitHub Pages 给 HTML 设了 Cache-Control: max-age=600，后台那次请求
    // 必须 no-store，否则拿到的是 10 分钟内的旧副本，刷新也永远是旧版。
    // 首次没缓存时必须老实等网络，绝不把别的资源当首页返回。
    var job = caches.open(CACHE).then(function (cache) {
      return cache.match(SHELL).then(function (cached) {
        var net = fetch(request.url, { cache: 'no-store' }).then(function (r) {
          if (!r || !r.ok) return r;
          var oldTag = cached && cached.headers.get('etag');
          var newTag = r.headers.get('etag');
          return cache.put(SHELL, r.clone()).then(function () {
            // 内容真的变了才通知，避免每次打开都刷新
            if (oldTag && newTag && oldTag !== newTag) notify(newTag);
            return r;
          }, function () { return r; });
        })['catch'](function () { return null; });
        return { cached: cached, net: net };
      });
    });
    // 保活后台更新：页面已经用旧缓存秒开了，避免 SW 被提前终止导致新版没写进缓存
    event.waitUntil(job.then(function (r) { return r.net; })['catch'](function () {}));
    event.respondWith(job.then(function (r) {
      if (r.cached) return r.cached;
      return r.net.then(function (x) {
        return x || new Response('离线且无缓存', { status: 503 });
      });
    }));
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
