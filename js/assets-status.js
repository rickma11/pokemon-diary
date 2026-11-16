window.APP = window.APP || {};

(function (APP) {
  'use strict';

  // ===== 素材下载状态（我的数据页用）=====
  // 背景：素材池 pokedex-assets-static 永不清空，只有真正请求过的图才会进缓存。
  // 图鉴页是懒加载，没滚到的编号不会下载，于是出现「一半有一半没」。
  // 本模块做两件事：① 数清楚池里到底有多少图；② 一键把缺的补齐。
  // 清单口径全部复用 preload.js 的 lists，保证「统计 / 后台预热 / 一键下载」三处一致。

  var ASSETS = 'pokedex-assets-static';
  var downloading = false;

  function norm(u) {
    try { return new URL(u, location.href).href; } catch (e) { return u; }
  }

  // 统计用的三组（与原型图一致）。大图立绘并入「图鉴立绘」按需统计，
  // 但「下载全部」会把大图也一起补上。
  function groups() {
    var L = (APP.preload && APP.preload.lists) || {};
    var small = L.smallAll ? L.smallAll() : [];
    var large = L.largeAll ? L.largeAll() : [];
    var wild = L.wildGif ? L.wildGif() : [];
    var scene = L.scene ? L.scene() : [];
    var battle = L.battle ? L.battle() : [];
    return {
      small: { name: '图鉴立绘', urls: small },
      wild: { name: '出场动图', urls: wild },
      scene: { name: '场景与擂台', urls: scene.concat(battle) },
      _all: { small: small, large: large, wild: wild, scene: scene, battle: battle }
    };
  }

  function haveSet(reqs) {
    var have = Object.create(null);
    for (var i = 0; i < reqs.length; i++) have[reqs[i].url] = 1;
    return have;
  }

  function openKeys() {
    if (!('caches' in window)) return Promise.reject(new Error('no cache api'));
    return caches.open(ASSETS).then(function (cache) { return cache.keys(); });
  }

  // 统计：异步，回调 { groups:[{key,name,cached,total}], cached, total }，失败回调 null
  function stat(cb) {
    var gs = groups();
    openKeys().then(function (reqs) {
      var have = haveSet(reqs);
      var out = [], tc = 0, tt = 0;
      ['small', 'wild', 'scene'].forEach(function (k) {
        var g = gs[k], c = 0;
        for (var j = 0; j < g.urls.length; j++) if (have[norm(g.urls[j])]) c++;
        out.push({ key: k, name: g.name, cached: c, total: g.urls.length });
        tc += c; tt += g.urls.length;
      });
      cb({ groups: out, cached: tc, total: tt });
    })['catch'](function () { cb(null); });
  }

  // 下载清单：small=只补图鉴小图；all=小图+大图+动图+场景+擂台
  function targetList(kind) {
    var g = groups()._all;
    var urls;
    if (kind === 'small') {
      urls = g.small.slice();
    } else {
      urls = g.small.concat(g.large, g.wild, g.scene, g.battle);
    }
    var seen = Object.create(null), out = [];
    for (var i = 0; i < urls.length; i++) {
      if (!seen[urls[i]]) { seen[urls[i]] = 1; out.push(urls[i]); }
    }
    return out;
  }

  function download(kind, onProgress, onDone) {
    if (downloading) { if (onDone) onDone(false, 0, '正在下载中'); return; }
    openKeys().then(function (reqs) {
      var have = haveSet(reqs);
      var all = targetList(kind);
      // 只下缺的：已缓存的 fetch 也会命中缓存，但没必要再走一遍
      var list = [], i;
      for (i = 0; i < all.length; i++) if (!have[norm(all[i])]) list.push(all[i]);
      if (!list.length) { if (onDone) onDone(true, 0); return; }
      run(list, onProgress, onDone);
    })['catch'](function () {
      run(targetList(kind), onProgress, onDone);
    });
  }

  // 并发 6 张，一张完成就补下一张；fetch 经 SW 自动写进素材池
  function run(list, onProgress, onDone) {
    downloading = true;
    var idx = 0, done = 0, total = list.length, CONC = 6;
    function one() {
      if (idx >= total) return;
      var u = list[idx++];
      try {
        fetch(u).then(tick, tick);
      } catch (e) { tick(); }
    }
    function tick() {
      done++;
      if (onProgress) onProgress(done, total);
      if (done >= total) {
        downloading = false;
        // SW 的 cache.put 是异步的，稍等再让页面重新统计
        setTimeout(function () { if (onDone) onDone(true, total); }, 600);
        return;
      }
      one();
    }
    for (var i = 0; i < CONC && i < total; i++) one();
  }

  function isDownloading() { return downloading; }

  // 检查 SW 更新：有新版会由现有 SHELL_UPDATED 机制自动刷新页面
  function checkUpdate(cb) {
    if (!('serviceWorker' in navigator)) { cb('unsupported'); return; }
    navigator.serviceWorker.getRegistration().then(function (reg) {
      if (!reg) { cb('none'); return; }
      var found = false;
      reg.addEventListener && reg.addEventListener('updatefound', function () { found = true; });
      reg.update().then(function () {
        setTimeout(function () { cb(found ? 'found' : 'latest'); }, 800);
      })['catch'](function () { cb('error'); });
    })['catch'](function () { cb('error'); });
  }

  // ===== 下载进度弹窗 =====
  // 用 APP.ui 的 uiOverlay + ui-modal 外壳，但内容要实时刷新，所以单独管理。
  // 下载中：进度条 + 张数；完成：汇总 + 关闭按钮；可「后台下载」关掉继续用。
  var modalOpen = false;

  function overlayEl() {
    var el = document.getElementById('uiOverlay');
    if (!el) {
      el = document.createElement('div');
      el.id = 'uiOverlay';
      el.className = 'ui-overlay';
      document.body.appendChild(el);
    }
    el.style.display = '';
    return el;
  }
  function closeModal() {
    modalOpen = false;
    var el = document.getElementById('uiOverlay');
    if (el) { el.innerHTML = ''; el.onclick = null; el.style.display = 'none'; }
  }

  function modalShell(inner) {
    var el = overlayEl();
    el.innerHTML =
      '<div class="ui-overlay__bg"></div>' +
      '<div class="ui-modal ui-modal--notice" role="dialog" aria-label="素材下载进度">' + inner + '</div>';
    return el;
  }

  // 打开进度弹窗并发起下载。kind='small'|'all'
  function downloadWithModal(kind) {
    if (downloading) return;
    var label = kind === 'small' ? '图鉴小图' : '全部素材';
    modalOpen = true;
    modalShell(
      '<h3 class="ui-modal__title">正在下载' + label + '</h3>' +
      '<p class="ui-modal__msg" id="dlPct" style="text-align:center;font-size:26px;font-weight:500;margin:6px 0 2px">0%</p>' +
      '<p class="ui-modal__msg" id="dlCount" style="text-align:center;margin:0">准备中…</p>' +
      '<div class="asset-bar" style="margin:14px 0"><div class="asset-bar__fill" id="dlBar" style="width:0%"></div></div>' +
      '<div class="row" style="margin-top:6px">' +
        '<button type="button" class="btn btn--primary" data-dl="bg">后台下载</button>' +
        '<button type="button" class="btn" data-dl="cancel">关闭窗口</button>' +
      '</div>' +
      '<p class="field__hint" style="text-align:center">下载完会自动补齐，下次图鉴再翻到就是秒开。</p>'
    );
    var el = document.getElementById('uiOverlay');
    var cancelled = false;
    el.onclick = function (e) {
      var a = e.target.getAttribute && e.target.getAttribute('data-dl');
      if (a === 'bg') { modalOpen = false; closeModal(); }
      else if (a === 'cancel') { cancelled = true; closeModal(); }
    };

    download(kind, function (done, total) {
      if (!modalOpen) return; // 已点「后台下载」，只更新卡片不弹窗
      var pct = total ? Math.round(done / total * 100) : 0;
      var p = document.getElementById('dlPct');
      var c = document.getElementById('dlCount');
      var b = document.getElementById('dlBar');
      if (p) p.textContent = pct + '%';
      if (c) c.textContent = '已下载 ' + done + ' / ' + total + ' 张';
      if (b) b.style.width = pct + '%';
    }, function (ok, total) {
      if (cancelled) return;
      if (modalOpen) {
        modalShell(
          '<h3 class="ui-modal__title">' + (ok ? '下载完成' : '已取消') + '</h3>' +
          '<p class="ui-modal__msg" style="text-align:center">' +
            (ok ? '本次补齐 ' + total + ' 张素材。' : '下载已停止。') + '</p>' +
          '<button type="button" class="btn btn--primary btn--block" id="dlDone">知道啦</button>'
        );
        var doneBtn = document.getElementById('dlDone');
        if (doneBtn) doneBtn.onclick = closeModal;
      }
      if (APP.refresh) APP.refresh(); // 回到卡片，进度已更新
    });
  }

  APP.assetsStatus = {
    stat: stat,
    download: download,
    downloadWithModal: downloadWithModal,
    isDownloading: isDownloading,
    checkUpdate: checkUpdate,
    version: function () { return window.APP_BUILD_VERSION || ''; }
  };
})(window.APP);
