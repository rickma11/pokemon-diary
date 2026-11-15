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

  function maybeStart() {
    if (started) return;
    if (APP.auth && APP.auth.needLogin && APP.auth.needLogin()) return;
    if (APP.onboarding && APP.onboarding.active && APP.onboarding.active()) return;
    var p = null;
    try { p = APP.store.activePokemon(); } catch (e) {}
    if (!p) return; // 还没选宝可梦：新手流程没走完，先不预热
    started = true;
    setTimeout(function () {
      // 主力宝可梦 → 自己的立绘 → 捕捉场景 → 战斗背景
      drain(mainList().concat(ownedList(), sceneList(), battleList()));
    }, 1500);
  }

  APP.preload = { maybeStart: maybeStart };
})(window.APP);
