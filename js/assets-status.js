window.APP = window.APP || {};

(function (APP) {
  'use strict';

  // ===== 素材下载状态（我的数据页用）=====
  // 背景：素材池 pokedex-assets-static 永不清空，只有真正请求过的图才会进缓存。
  // 图鉴页是懒加载，没滚到的编号不会下载，于是出现「一半有一半没」。
  // 本模块做三件事：
  //   ① 数清楚池里到底有多少图；
  //   ② 一键把缺的补齐，并且**由页面自己把文件写进缓存池**；
  //   ③ 下载进度实时反馈到卡片，下载中也能再次点开进度弹窗。

  var ASSETS = 'pokedex-assets-static';
  var CONC = 5;   // 并发下载数
  var job = null; // 当前下载任务
  var subs = [];  // 进度订阅者（卡片 / 弹窗共用同一份数据）

  function emit(type, data) {
    for (var i = 0; i < subs.length; i++) {
      try { subs[i](type, data); } catch (e) {}
    }
  }

  function norm(u) {
    try { return new URL(u, location.href).href; } catch (e) { return u; }
  }

  // 统计/下载口径统一从 assets-manifest 读 —— 不再各写各的清单。
  // statGroups() 返回全部 13 类（每类 {key,name,tier,urls}），这就是「完整盘点」的全部素材。
  function groups() {
    if (APP.assetsManifest && APP.assetsManifest.statGroups) return { list: APP.assetsManifest.statGroups() };
    return { list: [] };
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

  // 统计：异步。groups 列出全部 13 类真实进度（含 tier=stat 的仅统计类）；
  // cached/total 是「可下载档」(core+quiet) 合计，用于顶部进度条 —— 不含从不下载的
  // PNG 兜底图，否则进度条永远到不了 100%。
  function stat(cb) {
    var list = groups().list;
    openKeys().then(function (reqs) {
      var have = haveSet(reqs);
      var out = [], tc = 0, tt = 0;
      for (var k = 0; k < list.length; k++) {
        var g = list[k], c = 0;
        for (var j = 0; j < g.urls.length; j++) if (have[norm(g.urls[j])]) c++;
        out.push({ key: g.key, name: g.name, tier: g.tier, cached: c, total: g.urls.length });
        if (g.tier !== 'stat') { tc += c; tt += g.urls.length; }
      }
      cb({ groups: out, cached: tc, total: tt });
    })['catch'](function () { cb(null); });
  }

  // 下载清单：small=图鉴小图（下载图鉴素材）；other=其余 core 图片动画 + quiet 叫声徽章。
  // quiet 档排在清单末尾 → 自然「最后静默下」。tier=stat 的兜底图从不进下载。
  // 全部由 assets-manifest 统一给出，两个按钮分工不重叠。
  function targetList(kind) {
    if (APP.assetsManifest && APP.assetsManifest.urlsForScope) {
      return APP.assetsManifest.urlsForScope(kind === 'small' ? 'small' : 'other');
    }
    return [];
  }

  // 下载一张，并**由页面自己写进素材池**。
  // 为什么不交给 Service Worker 顺手存：
  // 手机上从桌面图标打开 PWA 时，第一个页面常常还没被 SW 接管，
  // 此时的 fetch 只走网络、不落缓存 —— 表现就是「提示下载 100%，刷新进度还是 0」。
  // 页面自己 cache.put 就不依赖 SW 是否接管这份页面，落在哪儿都是稳的。
  function fetchAndStore(url) {
    var abs = norm(url);
    if (!('caches' in window)) {
      // 没有 Cache API（本地双击打开）：只能走网络，算下完但不会进池
      return fetch(abs).then(function (res) {
        if (!res || !res.ok) throw new Error('HTTP ' + (res && res.status));
        return true;
      });
    }
    return fetch(abs).then(function (res) {
      if (!res || !res.ok) throw new Error('HTTP ' + (res && res.status));
      var copy = res.clone();
      return caches.open(ASSETS).then(function (cache) {
        return cache.put(abs, copy);
      }).then(function () { return true; });
    });
  }

  // 串行队列 + 并发 5 张。成功和失败分别计数 —— 以前失败也算「下载成功」，
  // 才会出现「提示 100% 但一张没存下来」的假象。
  // 任务对象在发起时就同步建好，调用方能立刻拿到句柄（弹窗要靠它渲染）。
  function startRun(j, list) {
    var idx = 0, done = 0, failed = 0, total = list.length;
    j.total = total;
    if (!total) { finish(j); return j; }

    function one() {
      if (j.stopped || idx >= total) return;
      var u = list[idx++];
      fetchAndStore(u).then(function () {
        done++;
      }, function () {
        failed++;
      }).then(function () {
        j.done = done; j.failed = failed;
        emit('progress', j);
        if (j.stopped) { finish(j); return; }
        if (done + failed >= total) { finish(j); return; }
        one();
      });
    }
    for (var i = 0; i < CONC && i < total; i++) one();
    return j;
  }

  function finish(j) {
    // 留一点时间让最后几张的 cache.put 落盘，再通知外部刷新统计
    setTimeout(function () {
      if (job === j) job = null;
      emit('done', j);
      if (j._end) { j._end(); j._end = null; }
    }, 400);
  }

  function isDownloading() { return !!job; }

  // 当前任务快照：卡片用它显示「下载中 X/Y」
  function state() {
    if (!job) return null;
    return { kind: job.kind, done: job.done, failed: job.failed, total: job.total, stopped: job.stopped };
  }

  // 下载入口（保留给外部/测试调用）。
  // onProgress(done, failed, total)，onDone(ok, done, failed, total)
  function download(kind, onProgress, onDone) {
    if (job) { if (onDone) onDone(false, 0, 0, 0); return null; }
    var j = { kind: kind, total: 0, done: 0, failed: 0, stopped: false };
    job = j;
    var unsub = null;
    if (onProgress || onDone) {
      unsub = on(function (type, data) {
        if (data !== j) return;
        if (type === 'progress' && onProgress) onProgress(data.done, data.failed, data.total);
        if (type === 'done' && onDone) { onDone(true, data.done, data.failed, data.total); }
      });
    }
    function end() { if (unsub) { unsub(); unsub = null; } }
    var origFinish = finish;
    openKeys().then(function (reqs) {
      var have = haveSet(reqs);
      var all = targetList(kind);
      // 只下缺的：已缓存的没必要再走一遍
      var list = [], i;
      for (i = 0; i < all.length; i++) if (!have[norm(all[i])]) list.push(all[i]);
      startRun(j, list);
    })['catch'](function () {
      // 读不到缓存清单就全量下一遍
      startRun(j, targetList(kind));
    });
    j._end = end;
    return j;
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

  function labelOf(kind) { return kind === 'small' ? '图鉴素材' : '其他素材'; }

  function progressHtml(j) {
    var pct = j.total ? Math.round((j.done + j.failed) / j.total * 100) : 0;
    return '<h3 class="ui-modal__title">正在下载' + labelOf(j.kind) + '</h3>' +
      '<p class="ui-modal__msg" id="dlPct" style="text-align:center;font-size:26px;font-weight:500;margin:6px 0 2px">' + pct + '%</p>' +
      '<p class="ui-modal__msg" id="dlCount" style="text-align:center;margin:0">' + countText(j) + '</p>' +
      '<div class="asset-bar" style="margin:14px 0"><div class="asset-bar__fill" id="dlBar" style="width:' + pct + '%"></div></div>' +
      '<div class="row" style="margin-top:6px">' +
        '<button type="button" class="btn btn--primary" data-dl="bg">后台下载</button>' +
        '<button type="button" class="btn" data-dl="stop">停止下载</button>' +
      '</div>' +
      '<p class="field__hint" style="text-align:center">关掉弹窗也会继续下，进度显示在「素材资源」卡片上。</p>';
  }

  function countText(j) {
    var t = '已下载 ' + j.done + ' / ' + j.total + ' 张';
    if (j.failed) t += '（失败 ' + j.failed + '）';
    return t;
  }

  // 打开/重开进度弹窗。j 为当前任务（可传已存在的任务，实现「下载中再点按钮仍能看进度」）
  function openProgress(j) {
    modalOpen = true;
    var el = modalShell(progressHtml(j));
    el.onclick = function (e) {
      var a = e.target.getAttribute && e.target.getAttribute('data-dl');
      if (a === 'bg') { closeModal(); }              // 后台下载：关掉弹窗，继续下
      else if (a === 'stop') { if (job) job.stopped = true; closeModal(); }
    };
  }

  function updateProgress(j) {
    if (!modalOpen) return;
    var p = document.getElementById('dlPct');
    var c = document.getElementById('dlCount');
    var b = document.getElementById('dlBar');
    if (!p && !c && !b) return;
    var pct = j.total ? Math.round((j.done + j.failed) / j.total * 100) : 0;
    if (p) p.textContent = pct + '%';
    if (c) c.textContent = countText(j);
    if (b) b.style.width = pct + '%';
  }

  function showDone(j) {
    var okMsg = j.stopped
      ? '已停止，本次补齐 ' + j.done + ' 张素材。'
      : '本次补齐 ' + j.done + ' 张素材。';
    if (j.failed) okMsg += '另有 ' + j.failed + ' 张没下成功。';
    modalOpen = true;
    modalShell(
      '<h3 class="ui-modal__title">' + (j.stopped ? '已停止' : '下载完成') + '</h3>' +
      '<p class="ui-modal__msg" style="text-align:center">' + okMsg + '</p>' +
      '<button type="button" class="btn btn--primary btn--block" id="dlDone">知道啦</button>'
    );
    var doneBtn = document.getElementById('dlDone');
    if (doneBtn) doneBtn.onclick = closeModal;
  }

  // 对外的统一起手式：开弹窗 + 发起下载。
  // 下载中再次点击按钮 → 不再静默返回，而是重开弹窗显示当前进度。
  function downloadWithModal(kind) {
    if (job) { openProgress(job); return job; }
    var j = download(kind, null, null);
    openProgress(j);
    return j;
  }

  // 订阅进度：on(fn) 返回取消订阅函数
  function on(fn) {
    subs.push(fn);
    return function () {
      var i = subs.indexOf(fn);
      if (i >= 0) subs.splice(i, 1);
    };
  }

  // 卡片与弹窗共用同一份进度数据
  on(function (type, data) {
    if (type === 'progress') {
      updateProgress(data);
      if (APP.assetsCardProgress) APP.assetsCardProgress(data);
    } else if (type === 'done') {
      if (modalOpen) showDone(data);
      if (APP.assetsCardProgress) APP.assetsCardProgress(null);
      if (APP.refresh) APP.refresh(); // 回到卡片，进度已更新
    }
  });

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

  APP.assetsStatus = {
    stat: stat,
    download: download,
    downloadWithModal: downloadWithModal,
    isDownloading: isDownloading,
    state: state,
    on: on,
    checkUpdate: checkUpdate,
    version: function () { return window.APP_BUILD_VERSION || ''; }
  };
})(window.APP);
