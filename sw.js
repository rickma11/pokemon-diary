// 代码缓存版本号每发一次新版就 +1：换号只清代码，不动素材缓存。
// 必须放在站点根目录、注册时 scope 为 './'，才能缓存 index.html 等全站资源。
// 旧版放在 js/ 子目录，作用域只覆盖 js/，既缓存不到首页，又会把没缓存的 JS
// 换成 index.html 壳（浏览器当 JS 解析失败 → 名字表缺失、选宠只显示 #编号）。
var CACHE = 'pokedex-checkin-v99';
// 素材缓存故意不带版本号——图片/GIF/音效体积大、下载慢，绝不能因为发版就清空。
// 以前图片和代码共用一个带版本号的 cache，结果每次发版（v87→v92 连升 5 次）
// 都把图片一起删光，玩家每次打开都要重下 80MB 素材，慢得打不开。
// 现在素材单独放这个池，代码升级时原样保留；素材更新靠改文件名 / URL 加查询串失效。
var ASSETS = 'pokedex-assets-static';
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

// 把旧代码缓存里的图片/GIF/音效搬进素材池，避免这次升级又全部重下。
// 只在缓存 API 内部复制，不走网络，几百张图也就几十毫秒。
function migrateAssets(oldCaches) {
  if (!oldCaches.length) return Promise.resolve();
  return caches.open(ASSETS).then(function (dest) {
    return Promise.all(oldCaches.map(function (c) {
      return c.keys().then(function (reqs) {
        return Promise.all(reqs.map(function (req) {
          var p = new URL(req.url).pathname;
          if (!/\.(webp|png|jpe?g|gif|svg|mp3|ogg|wav|avif)$/i.test(p)) return null;
          return dest.match(req).then(function (has) {
            if (has) return null; // 素材池里已经有了，别重复写
            return c.match(req).then(function (res) {
              if (res && res.ok) return dest.put(req, res);
              return null;
            });
          })['catch'](function () { return null; });
        }));
      })['catch'](function () { return null; });
    }));
  })['catch'](function () { return null; });
}

self.addEventListener('activate', function (event) {
  event.waitUntil(
    caches.keys().then(function (keys) {
      var upgraded = false;
      var oldCode = [];
      keys.forEach(function (key) {
        if (key === CACHE || key === ASSETS) return;
        if (key.indexOf('pokedex-checkin-') === 0) {
          upgraded = true;
          oldCode.push(key); // 这些旧代码缓存里可能有图片，删之前先搬走
        }
      });
      return Promise.all(oldCode.map(function (k) { return caches.open(k); }))
        .then(function (cs) { return migrateAssets(cs); })
        .then(function () {
          return Promise.all(oldCode.map(function (k) { return caches.delete(k); }));
        })
        .then(function () { return upgraded; });
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
          // 同上：写入必须挂 waitUntil，否则 SW 被回收时代码没落盘，离线打开会白屏。
          event.waitUntil(
            caches.open(CACHE).then(function (cache) { return cache.put(request, copy); })['catch'](function () {})
          );
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

  // 图片 / GIF / 音效：缓存优先，写进「永不清空」的素材池。
  // 只在素材池里找，不再全局 caches.match —— 免得误命中代码缓存里的同名 key。
  // 404 一律不缓存（否则宝可梦会永远是坏图）。
  event.respondWith(
    caches.open(ASSETS).then(function (cache) {
      return cache.match(request).then(function (cached) {
        if (cached && cached.ok) return cached;
        return fetch(request).then(function (response) {
          if (response && response.ok) {
            var copy = response.clone();
            // 必须挂 waitUntil：不挂的话 SW 可能在 cache.put 落盘前就被回收，
            // 表现就是「图看着下完了，缓存池里却一张没有」。
            event.waitUntil(cache.put(request, copy)['catch'](function () {}));
          }
          return response;
        });
      });
    })
  );
});
