window.APP = window.APP || {};

(function (APP) {
  'use strict';

  // ===== 后台静默预加载 =====
  //
  // 目的：还没解锁的玩法要用的图（捕捉场景 / 战斗擂台 / 图鉴立绘）体积大，
  // 等玩家真的点进去才现下载就会卡一下。这里在玩家完成新手流程进入主界面后，
  // 趁空闲先把它们悄悄下载好，之后进那个功能直接读缓存，不等网络。
  //
  // 三条纪律：
  //   1. 不抢首屏 —— 只有登录后、选好主力宝可梦（新手流程走完）才启动，还延后 1.5 秒；
  //   2. 不重复下载 —— 内存 Set 去重，且 Service Worker 对图片是 cache-first，
  //      预加载过的图页面再取时零网络；
  //   3. 不阻塞界面 —— requestIdleCallback 空档里一张一张下，单张失败静默跳过。

  var started = false;
  var grabbed = Object.create(null);

  function idle(fn, timeout) {
    if (window.requestIdleCallback) {
      window.requestIdleCallback(fn, { timeout: timeout || 2000 });
    } else {
      setTimeout(fn, 150);
    }
  }

  // 取一张图：不进 DOM，只让浏览器把它读进缓存
  function grab(url) {
    if (!url || grabbed[url]) return;
    grabbed[url] = 1;
    try {
      var img = new Image();
      img.onload = function () { if (img.decode) { try { img.decode(); } catch (e) {} } };
      img.onerror = function () {};
      img.src = url;
    } catch (e) {}
  }

  // 捕捉页：7 张场景背景 + 21 张躲藏点
  function sceneList() {
    var out = [];
    var themes = (APP.catchData && APP.catchData.THEMES) || [];
    for (var i = 0; i < themes.length; i++) {
      out.push(themes[i].scene);
      var hides = themes[i].hides || [];
      for (var j = 0; j < hides.length; j++) out.push(hides[j]);
    }
    return out;
  }

  // 战斗页：9 张擂台背景
  function battleList() {
    var out = [];
    for (var i = 1; i <= 9; i++) out.push('assets/pic/' + i + '.webp');
    return out;
  }

  // 捕捉池 59 只的出场 GIF（野外遇到谁是从这个池按稀有度抽的）。
  // 不提前下好，投石问路后就会出现「有名字没形象」的空舞台——用户反馈的正是这个。
  // 59 只合计约 1.4MB，空闲时分批下载，不抢首屏。
  function wildGifList() {
    var out = [];
    try {
      var pools = (APP.catchData && APP.catchData.POOLS) || {};
      var ids = Object.create(null), k, i;
      for (k in pools) {
        if (!Object.prototype.hasOwnProperty.call(pools, k)) continue;
        var arr = pools[k] || [];
        for (i = 0; i < arr.length; i++) ids[arr[i].id] = 1;
      }
      var keys = Object.keys(ids).map(Number).sort(function (a, b) { return a - b; });
      for (i = 0; i < keys.length; i++) {
        out.push('assets/pokemon/animated/' + APP.pad3(keys[i]) + '.gif');
      }
    } catch (e) {}
    return out;
  }

  // 图鉴 / 状态栏：已拥有的宝可梦立绘（小图优先，编号小的先下）
  // 小图 128px 只有 5KB，先把它们铺满，状态栏和图鉴立刻能出图；
  // 大图 475px 23KB 稍后再补。
  function ownedList() {
    var out = [];
    try {
      var s = APP.store.get() || {};
      var ids = Object.create(null), i;
      var cs = s.catches || [], ps = s.pokemon || [];
      for (i = 0; i < cs.length; i++) ids[Number(cs[i].dexNo)] = 1;
      for (i = 0; i < ps.length; i++) ids[Number(ps[i].dexNo)] = 1;
      var keys = Object.keys(ids).map(Number).sort(function (a, b) { return a - b; });
      for (i = 0; i < keys.length && i < 40; i++) out.push(APP.art.sm(keys[i]));
      for (i = 0; i < keys.length && i < 20; i++) out.push(APP.art.lg(keys[i]));
    } catch (e) {}
    return out;
  }

  // 主力宝可梦：最高优先级（小图 + 大图 + 养成页动图）
  function mainList() {
    var out = [];
    try {
      var p = APP.store.activePokemon();
      if (p && p.dexNo) {
        out.push(APP.art.sm(p.dexNo));
        out.push(APP.art.lg(p.dexNo));
        out.push('assets/pokemon/animated/' + APP.pad3(p.dexNo) + '.gif');
      }
    } catch (e) {}
    return out;
  }

  // 一张一张来：每张之间让出主线程，界面始终可操作
  function drain(list) {
    var i = 0;
    function next() {
      if (i >= list.length) return;
      grab(list[i++]);
      idle(next);
    }
    idle(next);
  }

  // 图鉴名单里的全部编号（含进化形态与对战专用）——「补图鉴小图」就按这个清单来。
  // 只有名单内的编号才会出现在图鉴页，别按磁盘上的 001–386 全量下，白费流量。
  function allValidIds() {
    var out = [];
    try {
      var v = APP.dexData.validIds();
      for (var k in v) if (Object.prototype.hasOwnProperty.call(v, k)) out.push(Number(k));
      out.sort(function (a, b) { return a - b; });
    } catch (e) {}
    return out;
  }
  function smallAllList() {
    var ids = allValidIds(), out = [];
    for (var i = 0; i < ids.length; i++) out.push(APP.art.sm(ids[i]));
    return out;
  }
  function largeAllList() {
    var ids = allValidIds(), out = [];
    for (var i = 0; i < ids.length; i++) out.push(APP.art.lg(ids[i]));
    return out;
  }

  function maybeStart() {
    if (started) return;
    if (APP.auth && APP.auth.needLogin && APP.auth.needLogin()) return;
    if (APP.onboarding && APP.onboarding.active && APP.onboarding.active()) return;
    var p = null;
    try { p = APP.store.activePokemon(); } catch (e) {}
    if (!p) return; // 还没选宝可梦：新手流程没走完，先不预热
    started = true;
    setTimeout(function () {
      // 主力宝可梦 → 自己的立绘 → 捕捉场景 → 野外 GIF → 战斗背景
      drain(mainList().concat(ownedList(), sceneList(), wildGifList(), battleList()));
    }, 1500);
  }

  APP.preload = {
    maybeStart: maybeStart,
    // 给「我的数据」页的素材统计/一键下载复用，保证两边清单口径完全一致
    lists: {
      smallAll: smallAllList,
      largeAll: largeAllList,
      scene: sceneList,
      wildGif: wildGifList,
      battle: battleList
    }
  };
})(window.APP);
