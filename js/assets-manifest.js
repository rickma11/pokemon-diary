window.APP = window.APP || {};

(function (APP) {
  'use strict';

  // ===== 统一素材清单（唯一来源）=====
  // 背景：以前「统计口径」「下载清单」「后台预加载」各写各的，
  // 加新素材漏掉一份，就出现「显示 99% 但乐园/探险一堆图首次现下」。
  // 这里把全部素材目录列成一份清单，三处都读它，以后绝不对不上。
  //
  // tier 三档：
  //   core  —— 图片/动画，体验直接用到；点「下载图鉴/其他素材」立即下
  //   quiet —— 叫声/徽章，体验影响小；core 下完后空闲静默下
  //   stat  —— 仅统计不下：386 张 PNG 兜底大图（50MB，老浏览器才用，现代设备用 WebP）
  //
  // button 归口：
  //   dex  —— 「下载图鉴素材」按钮（图鉴小图）
  //   other—— 「下载其他素材」按钮（其余 core + quiet）
  //   none —— 只在统计里显示，不归任何下载按钮

  // 乐园/探险里一只宝可梦的动画帧。用构建时扫描磁盘生成的精确索引
  // （js/pmd-frame-index.js），而不是「dex × 6 动作」硬推 —— 因为部分 dex 缺动作，
  // 硬推会多报数百张并制造一串 404。索引里每个 dex 实际有哪些动作都记好了。
  var ACT_NAME = { w: 'walk', i: 'idle', a: 'attack', h: 'hurt', f: 'faint', c: 'charge' };
  function pmdFrames(which) {
    var idx = window.PMD_FRAME_INDEX || {};
    var str = which === 'shiny' ? idx.shiny : idx.pmd;
    if (!str) return [];
    var base = which === 'shiny' ? 'assets/pmd-sliced-shiny/' : 'assets/pmd-sliced/';
    var out = [], entries = str.split(';'), i, j;
    for (i = 0; i < entries.length; i++) {
      var colon = entries[i].indexOf(':');
      if (colon < 0) continue;
      var dex = entries[i].slice(0, colon), acts = entries[i].slice(colon + 1);
      for (j = 0; j < acts.length; j++) {
        var nm = ACT_NAME[acts[j]];
        if (nm) out.push(base + dex + '/' + nm + '.png');
      }
    }
    return out;
  }

  var ELEMS = ['berry_bush', 'flower_white', 'grass_tall_A', 'grass_tall_B', 'hay',
    'mushroom_red', 'rock_cluster', 'stump', 'sunflower_A', 'sunflower_B', 'sunflower_C',
    'tree_big_A', 'tree_big_B', 'tree_big_C', 'tree_small_A', 'tree_small_B'];
  var NPCS = ['hero-1', 'hero-2', 'hero-3', 'hero-4',
    'npc-01', 'npc-02', 'npc-03', 'npc-04', 'npc-05', 'npc-06', 'npc-07', 'npc-08', 'npc-09', 'npc-10'];
  var BADGES = ['01-rock', '02-water', '03-electric', '04-fire', '04-grass',
    '05-psychic', '06-ground', '07-dragon'];

  function pad3(n) { return APP.pad3 ? APP.pad3(n) : ('00' + n).slice(-3); }
  function ids386() {
    var out = [];
    for (var i = 1; i <= 386; i++) out.push(i);
    return out;
  }
  function mapIds(fn) {
    return ids386().map(fn);
  }

  var ESSENTIAL_SCENE = 'assets/catch/scenes/marsh.webp'; // 外出捕捉默认场景
  var ESSENTIAL_BATTLE = 'assets/pic/1.webp';             // 外出战斗默认擂台

  // 场景 / 躲藏点：从 catchData 主题里取实际引用的 .webp（避免统计到不用的 PNG 兜底）
  // 默认场景 marsh 归到 essentials（必要档），这里排除掉避免两档重复统计。
  function sceneUrls() {
    var out = [], themes = (APP.catchData && APP.catchData.THEMES) || [];
    for (var i = 0; i < themes.length; i++) {
      if (themes[i].scene !== ESSENTIAL_SCENE) out.push(themes[i].scene);
      var hides = themes[i].hides || [];
      for (var j = 0; j < hides.length; j++) out.push(hides[j]);
    }
    return dedupe(out);
  }

  function battleUrls() {
    var out = [];
    for (var i = 1; i <= 9; i++) {
      var u = 'assets/pic/' + i + '.webp';
      if (u !== ESSENTIAL_BATTLE) out.push(u); // 默认擂台归 essentials
    }
    return out;
  }

  function dedupe(urls) {
    var seen = Object.create(null), out = [];
    for (var i = 0; i < urls.length; i++) {
      if (!seen[urls[i]]) { seen[urls[i]] = 1; out.push(urls[i]); }
    }
    return out;
  }

  // 清单项延迟生成（PMD_MANIFEST / catchData 是 defer 脚本，模块加载时未必就绪，
  // 所以 urls 存函数，真正统计/下载时才调用）。
  var GROUPS = [
    { key: 'sm', name: '图鉴小图', tier: 'core', button: 'dex', urls: function () { return mapIds(function (n) { return 'assets/pokemon/sm/' + pad3(n) + '.png'; }); } },
    // 功能解锁时保证有图：乐园背景 + 外出捕捉默认场景 + 外出战斗默认擂台，
    // 三张并入「必要资源」，开局就下好，避免 Lv5/Lv7/打卡7次解锁后第一次进页面现下卡顿。
    { key: 'essentials', name: '功能默认背景', tier: 'core', button: 'dex', urls: function () { return ['assets/env/ranch/bg.jpg', ESSENTIAL_SCENE, ESSENTIAL_BATTLE]; } },
    { key: 'lg', name: '大图立绘', tier: 'core', button: 'other', urls: function () { return mapIds(function (n) { return 'assets/pokemon/' + pad3(n) + '.webp'; }); } },
    { key: 'gif', name: '出场动图', tier: 'core', button: 'other', urls: function () { return mapIds(function (n) { return 'assets/pokemon/animated/' + pad3(n) + '.gif'; }); } },
    { key: 'gifBack', name: '背面动图', tier: 'core', button: 'other', urls: function () { return mapIds(function (n) { return 'assets/pokemon/animated/back/' + pad3(n) + '.gif'; }); } },
    { key: 'scene', name: '场景与躲藏点', tier: 'core', button: 'other', urls: sceneUrls },
    { key: 'battle', name: '战斗背景', tier: 'core', button: 'other', urls: battleUrls },
    { key: 'elems', name: '乐园装饰', tier: 'core', button: 'other', urls: function () { return ELEMS.map(function (e) { return 'assets/env/ranch/elems/' + e + '.png'; }); } },
    { key: 'pmd', name: '乐园动画帧', tier: 'core', button: 'other', urls: function () { return pmdFrames('pmd'); } },
    { key: 'shiny', name: '闪光动画帧', tier: 'core', button: 'other', urls: function () { return pmdFrames('shiny'); } },
    { key: 'npc', name: 'NPC 与训练师', tier: 'core', button: 'other', urls: function () { return NPCS.map(function (n) { return ['assets/npc-v6/' + n + '-bust.png', 'assets/npc-v6/' + n + '-full.png']; }).reduce(function (a, b) { return a.concat(b); }, []); } },
    { key: 'cries', name: '宝可梦叫声', tier: 'quiet', button: 'other', urls: function () { return mapIds(function (n) { return 'assets/cries/' + pad3(n) + '.ogg'; }); } },
    { key: 'badges', name: '徽章', tier: 'quiet', button: 'other', urls: function () { return BADGES.map(function (b) { return 'assets/hzicon/' + b + '-badge.png'; }); } },
    { key: 'lgPng', name: '大图兜底(仅统计)', tier: 'stat', button: 'none', urls: function () { return mapIds(function (n) { return 'assets/pokemon/' + pad3(n) + '.png'; }); } }
  ];

  var cache = {};
  function urlsOf(g) {
    if (!cache[g.key]) {
      try { cache[g.key] = dedupe(g.urls() || []); } catch (e) { cache[g.key] = []; }
    }
    return cache[g.key];
  }

  function all() { return GROUPS; }
  function byKey(k) {
    for (var i = 0; i < GROUPS.length; i++) if (GROUPS[i].key === k) return GROUPS[i];
    return null;
  }

  // 按按钮/tier 汇总 URL（去重）。
  // download('small') → dex 档；download('other') → core 的 other + quiet 档。
  function urlsForScope(scope) {
    var out = [];
    for (var i = 0; i < GROUPS.length; i++) {
      var g = GROUPS[i];
      var take = false;
      if (scope === 'small') take = (g.button === 'dex');
      else if (scope === 'other') take = (g.button === 'other');
      else if (scope === 'quiet') take = (g.tier === 'quiet');
      else if (scope === 'core') take = (g.tier === 'core');
      if (take) out = out.concat(urlsOf(g));
    }
    return dedupe(out);
  }

  // 下载档位（bucket）：复用 button 字段做归类，不另建一套配置。
  //   necessary 必要资源 —— button=dex，只有图鉴小图（386 张 / 3.2M）。
  //     状态栏头像、选宠、养成页、家人卡全靠它；前期 1-3 天靠这一档就够用。
  //   extra     额外资源 —— button=other，大图/出场动图/场景/战斗/乐园动画帧/叫声等。
  //     捕捉(Lv5)、战斗(Lv7)、乐园(打卡7次)、道馆(Lv10) 都是几天后才陆续开放，
  //     没必要首次下载就全下 —— 用到时再下，或按需由 preload 预热。
  //   stat      仅统计   —— button=none，PNG 兜底大图，永不下载。
  function bucketOf(g) {
    return g.button === 'dex' ? 'necessary' : (g.button === 'none' ? 'stat' : 'extra');
  }
  function urlsForBucket(bucket) {
    if (bucket === 'necessary') return urlsForScope('small');
    if (bucket === 'extra') return urlsForScope('other');
    return []; // stat 与未知档位一律不下
  }
  // 供「我的数据」页按档显示两条进度：只统计可下载档，不含 stat。
  function statBuckets() {
    return [
      { key: 'necessary', name: '必要资源', urls: urlsForBucket('necessary') },
      { key: 'extra', name: '额外资源', urls: urlsForBucket('extra') }
    ];
  }

  // 供「我的数据」页统计：返回每组的 {key,name,tier,urls}（urls 已展开）
  function statGroups() {
    return GROUPS.map(function (g) {
      return { key: g.key, name: g.name, tier: g.tier, bucket: bucketOf(g), urls: urlsOf(g) };
    });
  }

  APP.assetsManifest = {
    all: all,
    byKey: byKey,
    urlsOf: urlsOf,
    urlsForScope: urlsForScope,
    statGroups: statGroups,
    bucketOf: bucketOf,
    urlsForBucket: urlsForBucket,
    statBuckets: statBuckets
  };
})(window.APP);
