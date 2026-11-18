window.APP = window.APP || {};

(function (APP) {
  'use strict';

  // ===== Task 8a：乐园 · 牧场养育场首页（Phase 1；V5.1 劳动/休息改版）=====
  // 形态：队伍全员（最多 5 只）住在牧场里，体力 ≥50 劳动走动、<50 原地休息（💤）；
  // 「我的队伍」条回到本页（乐园动画下方，只显示体力）；队伍编成 / 换主力入口在「宝可梦中心」。

  var rootEl = null;
  var REST_AT = 50;   // 体力 < 50 → 自动休息（与 store.produceRanchIdle 的判定一致）

  function esc(t) {
    return String(t === undefined || t === null ? '' : t)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }
  function gifSrc(dex) { return 'assets/pokemon/animated/' + APP.pad3(dex) + '.gif'; }
  function stillSrc(dex) { return APP.art.sm(dex); }
  function stillBig(dex) { return APP.art.lg(dex); }
  function nameOf(p) {
    if (p.nickname) return p.nickname;
    var info = APP.evo && APP.evo.get ? APP.evo.get(p.dexNo) : null;
    return (info && info.name) || ('#' + APP.pad3(p.dexNo));
  }
  function statOf(p, key, dft) {
    if (!p.stats || typeof p.stats[key] !== 'number') return dft;
    return p.stats[key];
  }
  function foodOf(p) { return statOf(p, 'food', 80); }
  function moodOf(p) { return statOf(p, 'mood', 80); }
  function energyOf(p) { return statOf(p, 'energy', 80); }
  function isResting(p) { return energyOf(p) < REST_AT; }

  // ===== 新版牧场场景（2026-11-08）：天空 + 围栏 + 大草地背景 =====
  // 背景原始像素 1920×1390；坐标统一在「背景像素空间」里算，DOM 用 % 定位，容器变宽自动等比缩放
  var BW = 1920, BH = 1390;
  var ELEM_SCALE = 1.5;   // 装饰整体放大到 150%
  var PM_SCALE = 4.8;     // 宝可梦放大到 150%（3.2 × 1.5）
  var MIN_GAP = 285;      // 目标点最小间距：照搬「最大间隙选点」，从行为上减少相遇
  // 草地顶部边界（距图片顶部 %），80 点采样；两端抬高是背景里的大树
  var BOUND = [41.08, 41.08, 39.78, 36.84, 34.85, 34.5, 34.5, 34.5, 34.5, 34.5, 34.5, 34.5, 34.5, 34.5,
    34.5, 34.5, 34.5, 34.5, 34.5, 34.5, 34.5, 34.5, 34.5, 34.5, 34.5, 34.5, 34.5, 34.5, 34.5, 34.5,
    34.5, 34.5, 34.5, 34.5, 34.5, 34.5, 34.5, 34.5, 34.5, 34.5, 34.5, 34.5, 34.5, 34.5, 34.5, 34.5,
    34.5, 34.5, 34.5, 34.5, 34.5, 34.5, 34.5, 34.5, 34.5, 34.5, 34.5, 34.5, 34.5, 34.5, 34.5, 34.5,
    34.5, 34.5, 34.5, 34.5, 34.5, 34.5, 34.5, 34.5, 34.5, 34.5, 34.5, 34.85, 36.79, 39.62, 40.86, 40.86];
  function boundAt(xp) {
    var f = Math.max(0, Math.min(79, xp / 100 * 79));
    var i = Math.floor(f), t = f - i;
    return BOUND[i] + (BOUND[Math.min(79, i + 1)] - BOUND[i]) * t;
  }
  function pmHeightPct(def) { return def.fh * PM_SCALE / BH * 100; }
  // 精灵会在 walk / idle / attack / charge / hurt 间切换，帧高不一致；
  // 统一取最高的那帧来算边界和碰撞半径，保证任何动作下整只都在草地里
  function pmDef(dexNo) {
    var m = window.PMD_MANIFEST && window.PMD_MANIFEST[dexNo];
    if (!m) return { fw: 40, fh: 64 };
    var fw = 32, fh = 40, acts = ['walk', 'idle', 'attack', 'charge', 'hurt'];
    for (var i = 0; i < acts.length; i++) {
      if (!m[acts[i]]) continue;
      fw = Math.max(fw, m[acts[i]].fw); fh = Math.max(fh, m[acts[i]].fh);
    }
    return { fw: fw, fh: fh };
  }
  // 宝可梦用 bottom 定位：整只（含头顶）都在草地内须 bottom <= 100 - boundAt(x) - pmH
  function yMaxAt(xp, pmH) { return Math.max(6, 100 - boundAt(xp) - pmH - 1.5); }

  // 16 个独立透明素材的原始尺寸
  var ELEM_SIZE = {
    tree_big_A: [163, 205], tree_small_A: [81, 98], tree_big_B: [139, 195], tree_small_B: [81, 98],
    mushroom_red: [39, 41], tree_big_C: [189, 210], stump: [107, 63], rock_cluster: [156, 87],
    berry_bush: [152, 96], grass_tall_A: [138, 80], grass_tall_B: [150, 83], hay: [115, 79],
    flower_white: [162, 69], sunflower_A: [50, 93], sunflower_B: [47, 94], sunflower_C: [48, 93]
  };
  // 固定装饰：石头 / 两丛长草 / 白花打散到不同区域；红蘑菇放大且五只大小各不相同
  var FIXED_PROPS = [
    ['tree_big_C',    8.5, 49.0, 0.92], ['tree_small_A', 20.5, 46.0, 0.85],
    ['berry_bush',   29.0, 53.0, 1.05], ['mushroom_red', 36.0, 45.5, 1.40],
    ['grass_tall_B',  9.0, 88.0, 0.95], ['rock_cluster', 66.0, 55.0, 1.00],
    ['tree_small_B', 80.0, 44.5, 0.85], ['hay',          89.0, 60.0, 0.90],
    ['berry_bush',   15.0, 78.0, 0.90], ['berry_bush',   61.0, 76.0, 0.95],
    ['berry_bush',   81.0, 86.0, 1.00], ['mushroom_red', 23.0, 62.0, 1.80],
    ['mushroom_red', 73.0, 66.0, 1.55], ['mushroom_red', 43.0, 79.0, 2.10],
    ['mushroom_red', 91.0, 82.0, 1.65], ['grass_tall_A', 26.0, 91.0, 1.15],
    ['flower_white', 45.0, 92.0, 1.00], ['stump',        51.0, 68.0, 1.00]
  ];
  var SUNFLOWERS = ['sunflower_A', 'sunflower_B', 'sunflower_C'];
  var BERRY_KEYS = { berry_bush: 1, mushroom_red: 1 };
  var PICK_COOLDOWN = 9000;
  function colliderOf(key, k, x, y) {
    var d = ELEM_SIZE[key], w = d[0] * k * ELEM_SCALE, h = d[1] * k * ELEM_SCALE;
    return { cx: x / 100 * BW, cy: y / 100 * BH - h * 0.30, r: Math.max(w * 0.36, h * 0.42),
             w: w, h: h, x: x, y: y, key: key, berry: !!BERRY_KEYS[key], ready: true, el: null };
  }
  function colDist(a, b) { var dx = a.cx - b.cx, dy = a.cy - b.cy; return Math.sqrt(dx * dx + dy * dy); }
  // 三朵向日葵每次进乐园都随机散落，自动避开所有装饰和彼此（不再排成一行）
  function buildProps() {
    var props = [], i;
    for (i = 0; i < FIXED_PROPS.length; i++) {
      var p = FIXED_PROPS[i]; props.push(colliderOf(p[0], p[3], p[1], p[2]));
    }
    var picks = [], fallback = [[16, 58], [54, 52], [86, 72]];
    for (var s = 0; s < SUNFLOWERS.length; s++) {
      var key = SUNFLOWERS[s], k = 0.90, x = 0, y = 0, c = null;
      for (var t = 0; t < 400; t++) {
        var tx = 12 + Math.random() * 78;
        var yMin = Math.max(48, boundAt(tx) + 8);
        var ty = yMin + Math.random() * (86 - yMin);
        var cc = colliderOf(key, k, tx, ty), ok = true, j;
        for (j = 0; j < props.length; j++) {
          if (colDist(cc, props[j]) < cc.r + props[j].r + 22) { ok = false; break; }
        }
        for (j = 0; ok && j < picks.length; j++) if (colDist(cc, picks[j]) < 235) ok = false;
        if (ok) { x = +tx.toFixed(2); y = +ty.toFixed(2); c = cc; break; }
      }
      if (!c) { x = fallback[s][0]; y = fallback[s][1]; c = colliderOf(key, k, x, y); }
      c.x = x; c.y = y; picks.push(c); props.push(c);
    }
    return props;
  }
  function propsHtml(props) {
    var s = '<div class="ranch-yard__props">';
    for (var i = 0; i < props.length; i++) {
      var p = props[i];
      s += '<img class="ranch-prop" data-pi="' + i + '" src="assets/env/ranch/elems/' + p.key + '.png" alt=""' +
        ' style="left:' + p.x + '%;bottom:' + (100 - p.y).toFixed(2) + '%;' +
        'width:' + (p.w / BW * 100).toFixed(3) + '%;height:' + (p.h / BH * 100).toFixed(3) + '%;' +
        'z-index:' + (100 + Math.round(p.y * 2)) + '">';
    }
    return s + '</div>';
  }
  // 初始落点：草地内、避开所有装饰碰撞圈，且尽量拉开彼此间距
  function initialPos(props, def, taken) {
    var pmH = pmHeightPct(def), pmR = def.fw * PM_SCALE * 0.30;
    var best = null, bestClear = -1;
    for (var a = 0; a < 40; a++) {
      var x = 3 + Math.random() * 94, ym = yMaxAt(x, pmH);
      var y = 4 + Math.random() * (ym - 4);
      var cx = x / 100 * BW, cy = (100 - y) / 100 * BH, blocked = false;
      for (var j = 0; j < props.length; j++) {
        var ex = cx - props[j].cx, ey = cy - props[j].cy;
        if (Math.sqrt(ex * ex + ey * ey) < props[j].r + pmR * 0.6) { blocked = true; break; }
      }
      if (blocked) continue;
      var minD = Infinity;
      for (var k = 0; k < taken.length; k++) {
        var dx = (x - taken[k].x) / 100 * BW, dy = (y - taken[k].y) / 100 * BH;
        var d = Math.sqrt(dx * dx + dy * dy); if (d < minD) minD = d;
      }
      if (minD > bestClear) { bestClear = minD; best = { x: x, y: y }; }
      if (minD >= MIN_GAP) break;
    }
    return best || { x: 50, y: 30 };
  }
  function pmHtml(p, pos) {
    var rest = isResting(p);
    return '<div class="ranch-pm' + (rest ? ' is-rest' : '') + '" data-id="' + esc(p.id) +
      '" data-dex="' + p.dexNo + '" role="button" tabindex="0" ' +
      'style="left:' + pos.x.toFixed(1) + '%;bottom:' + pos.y.toFixed(1) + '%;' +
      'z-index:' + (100 + Math.round((100 - pos.y) * 2)) + '">' +
        '<div class="ranch-pm__glow"></div>' +
        '<div class="ranch-pm__spr">' + (rest ? '<div class="ranch-pm__zzz">💤</div>' : '') + '</div>' +
      '</div>';
  }
  function yardHtml(team, props) {
    var taken = [];
    var h = '<div class="gba-shell ranch-shell">' +
      '<div class="gba-shell__top"><span class="gba-shell__led"></span><span class="gba-shell__brand">POWER</span></div>' +
      '<div class="ranch-yard ranch-yard--scene" style="--gl-op:0.12;--ol:0">' +
        '<div class="ranch-yard__ground"></div>' + propsHtml(props);
    for (var i = 0; i < team.length; i++) {
      var def = pmDef(team[i].dexNo);
      var pos = initialPos(props, def, taken); taken.push(pos);
      h += pmHtml(team[i], pos);
    }
    return h + '</div><div class="gba-shell__foot">POKEMON</div></div>';
  }
  var roamTimer = null;
  var fxTimer = null;
  var countdownTimer = null;
  var sceneState = null;
  // 乐园仓库资源道具的说明文案：点击 / 触摸弹出浮窗展示（鼠标、手指通用）
  var RES_INFO = {
    berries: { name: '果实 🍒', desc: '喂给主力宝可梦可以回复体力与心情；乐园里劳动的宝可梦每天也会产出果实。' },
    balls:   { name: '精灵球', desc: '野外探险时用来捕捉新伙伴，可在兑换中心用碎片兑换。' },
    potions: { name: '伤药 💊', desc: '探险或战斗后给宝可梦回血用，每 3 天自动 +1。' },
    outs:    { name: '外出次数 🎫', desc: '带宝可梦出门战斗 / 训练的次数，每周刷新一次。' },
    shards:  { name: '碎片', desc: '乐园里劳动的宝可梦每天有概率产出，攒够后可在兑换中心换精灵球 / 战斗券。' }
  };
  function stopRoam() {
    if (roamTimer) { clearInterval(roamTimer); roamTimer = null; }
    if (fxTimer) { clearInterval(fxTimer); fxTimer = null; }
    if (countdownTimer) { clearInterval(countdownTimer); countdownTimer = null; }
  }
  // ===== 逐帧游走：最大间隙选点 + 装饰碰撞圈推开 + 走到果丛/蘑菇拾取 =====
  // 与预览版一致：从选点阶段就避开装饰，逐帧再推出碰撞圈，宝可梦不会穿过任何元素、不会上围栏/天空
  function pickTarget(st) {
    var S = sceneState, pmH = pmHeightPct(st.def), pmR = st.def.fw * PM_SCALE * 0.30;
    // 35% 概率「专程去摘果子」
    if (Math.random() < 0.35) {
      var ready = [];
      for (var q = 0; q < S.props.length; q++) if (S.props[q].berry && S.props[q].ready) ready.push(S.props[q]);
      if (ready.length) {
        var c = ready[Math.floor(Math.random() * ready.length)];
        var ang = Math.random() * Math.PI * 2;
        var px = c.cx + Math.cos(ang) * (c.r + 40);
        var py = c.cy + Math.sin(ang) * (c.r + 40) * 0.7;
        var x = px / BW * 100, y = 100 - py / BH * 100;
        if (x > 3 && x < 97 && y >= 4 && y <= yMaxAt(x, pmH)) { st.tx = x; st.ty = y; return; }
      }
    }
    var best = null, bestClear = -1;
    for (var a = 0; a < 40; a++) {
      var x2 = 3 + Math.random() * 94, y2m = yMaxAt(x2, pmH);
      var y2 = 4 + Math.random() * (y2m - 4);
      var cxp = x2 / 100 * BW, cyp = (100 - y2) / 100 * BH, blocked = false;
      for (var j = 0; j < S.props.length; j++) {
        var cc = S.props[j], ex = cxp - cc.cx, ey = cyp - cc.cy;
        if (Math.sqrt(ex * ex + ey * ey) < cc.r + pmR * 0.6) { blocked = true; break; }
      }
      if (blocked) continue;
      var minD = Infinity;
      for (var k = 0; k < S.pms.length; k++) {
        var o = S.pms[k]; if (o === st) continue;
        var dx = (x2 - o.tx) / 100 * BW, dy = (y2 - o.ty) / 100 * BH;
        var dd = Math.sqrt(dx * dx + dy * dy); if (dd < minD) minD = dd;
      }
      if (minD > bestClear) { bestClear = minD; best = { x: x2, y: y2 }; }
      if (minD >= MIN_GAP) break;
    }
    if (!best) best = { x: 50, y: 30 };
    st.tx = best.x; st.ty = best.y;
  }
  // 拾取动画：果丛摇晃 → 果实飞向宝可梦 → 头顶 +1 → 9 秒冷却后长回来
  function harvest(c, st) {
    var yard = sceneState.yard;
    c.ready = false;
    if (c.el) {
      c.el.classList.add('is-picked', 'is-shake');
      setTimeout(function () { c.el.classList.remove('is-shake'); }, 520);
      setTimeout(function () { c.el.classList.remove('is-picked'); c.ready = true; }, PICK_COOLDOWN);
    } else c.ready = true;
    var startLeft = c.cx / BW * 100;
    var startBottom = 100 - (c.cy - c.h * 0.35) / BH * 100;
    var endBottom = st.y + pmHeightPct(st.def) * 0.85;
    var fly = document.createElement('div');
    fly.className = 'berry-fly';
    fly.textContent = c.key === 'berry_bush' ? '🍒' : '🍄';
    fly.style.left = startLeft + '%';
    fly.style.bottom = startBottom + '%';
    fly.style.setProperty('--dx', ((st.x - startLeft) / 100 * yard.clientWidth) + 'px');
    fly.style.setProperty('--dy', (-(endBottom - startBottom) / 100 * yard.clientHeight) + 'px');
    yard.appendChild(fly);
    setTimeout(function () { if (fly.parentNode) fly.parentNode.removeChild(fly); }, 1000);
    var gain = document.createElement('div');
    gain.className = 'pm-gain';
    gain.textContent = '+1 ' + (c.key === 'berry_bush' ? '🍒' : '🍄');
    st.el.appendChild(gain);
    setTimeout(function () { if (gain.parentNode) gain.parentNode.removeChild(gain); }, 1900);
  }
  function step(st) {
    if (st.rest) return;
    var S = sceneState, now = Date.now();
    if (now < st.waitUntil) return;
    var pmH = pmHeightPct(st.def), pmR = st.def.fw * PM_SCALE * 0.30;
    var px = st.x / 100 * BW, py = (100 - st.y) / 100 * BH;
    var tpx = st.tx / 100 * BW, tpy = (100 - st.ty) / 100 * BH;
    var dx = tpx - px, dy = tpy - py, dist = Math.sqrt(dx * dx + dy * dy);
    if (dist < 14) {
      if (Math.random() < 0.35) st.waitUntil = now + 900 + Math.random() * 2200;
      pickTarget(st); return;
    }
    var sp = 6.5;
    px += dx / dist * sp; py += dy / dist * sp;
    // 逐帧推出所有装饰碰撞圈，绝不穿模
    for (var pass = 0; pass < 2; pass++) {
      for (var j = 0; j < S.props.length; j++) {
        var c = S.props[j], ex = px - c.cx, ey = py - c.cy;
        var d = Math.sqrt(ex * ex + ey * ey), minD = c.r + pmR * 0.6;
        if (d < minD) {
          var nx = d > 0.01 ? ex / d : 1, ny = d > 0.01 ? ey / d : 0;
          px = c.cx + nx * minD; py = c.cy + ny * minD;
          if (now > st.bumpUntil) { st.bumpUntil = now + 900; pickTarget(st); }
        }
      }
    }
    // 夹住草地边界与左右边界（整只宝可梦，含头顶，都在草地内）
    px = Math.max(3 / 100 * BW, Math.min(97 / 100 * BW, px));
    st.x = px / BW * 100;
    st.y = Math.max(4, Math.min(yMaxAt(st.x, pmH), 100 - py / BH * 100));
    var bx = st.x / 100 * BW, by = (100 - st.y) / 100 * BH;
    for (var q = 0; q < S.props.length; q++) {
      var b = S.props[q];
      if (!b.berry || !b.ready) continue;
      var ddx = bx - b.cx, ddy = by - b.cy;
      if (Math.sqrt(ddx * ddx + ddy * ddy) < b.r + 78) { harvest(b, st); break; }
    }
    if (Math.abs(dx) > 8) st.spr.style.transform = dx < 0 ? 'scaleX(-1) scale(var(--pscale))' : 'scale(var(--pscale))';
    st.el.style.left = st.x.toFixed(2) + '%';
    st.el.style.bottom = st.y.toFixed(2) + '%';
    st.el.style.zIndex = 100 + Math.round((100 - st.y) * 2);
  }
  function applyPscale(yard) {
    yard.style.setProperty('--pscale', (PM_SCALE * yard.clientWidth / BW).toFixed(4));
  }
  function setupScene(container, props) {
    stopRoam();
    var yard = container.querySelector('.ranch-yard');
    if (!yard) return;
    applyPscale(yard);
    var nodes = container.querySelectorAll('.ranch-pm'), pms = [], i;
    for (i = 0; i < nodes.length; i++) {
      var el = nodes[i];
      var def = pmDef(el.getAttribute('data-dex'));
      var x = parseFloat(el.style.left), y = parseFloat(el.style.bottom);
      pms.push({ el: el, spr: el.querySelector('.ranch-pm__spr'), def: def,
                 rest: el.classList.contains('is-rest'), x: x, y: y, tx: x, ty: y,
                 waitUntil: 0, bumpUntil: 0 });
    }
    var propEls = container.querySelectorAll('.ranch-prop[data-pi]');
    for (i = 0; i < propEls.length; i++) props[+propEls[i].getAttribute('data-pi')].el = propEls[i];
    sceneState = { yard: yard, props: props, pms: pms };
    roamTimer = setInterval(function () {
      if (!sceneState || !document.body.contains(yard)) { stopRoam(); return; }
      for (var n = 0; n < sceneState.pms.length; n++) step(sceneState.pms[n]);
    }, 40);
  }
  // 宽度变化时同步精灵缩放（装饰用 % 定位，无需重排）
  window.addEventListener('resize', function () {
    if (sceneState && document.body.contains(sceneState.yard)) applyPscale(sceneState.yard);
  });

  // 劳动产出小动画：每隔几秒挑一只劳动中的宝可梦，头顶飘出水果后消散。
  // 纯视觉表现（真实结算是每天 settle 一次），让孩子能直观看到「它们在干活、有产出」。
  var WORK_FX_ITEMS = ['🍒', '🍎', '🍇', '🍐', '🍓', '🍊', '🍑', '🍋']; // 水果样式多一点，随机飘
  function startWorkFx(container) {
    if (fxTimer) clearInterval(fxTimer);
    fxTimer = setInterval(function () {
      if (!container || !container.ownerDocument || !container.ownerDocument.body.contains(container)) { stopRoam(); return; }
      var pms = container.querySelectorAll('.ranch-pm:not(.is-rest)');
      if (!pms.length) return;
      var pm = pms[Math.floor(Math.random() * pms.length)];
      var item = WORK_FX_ITEMS[Math.floor(Math.random() * WORK_FX_ITEMS.length)];
      var fx = pm.ownerDocument.createElement('div');
      fx.className = 'ranch-float';
      fx.textContent = item;
      pm.appendChild(fx);
      setTimeout(function () { if (fx.parentNode) fx.parentNode.removeChild(fx); }, 1900);
    }, 3600);
  }

  // 碰撞表现已移除：不做「!」气泡 / 弹开。改为在选点阶段就拉开间距（pickTarget 的最大间隙选点），
  // 让宝可梦自然分散、很少走到一起 —— 从行为上避免相撞，而不是撞了再给反馈。

  // 休息恢复倒计时：体力 <50 自动休息，每天结算 +50，故恢复到「下一次每日结算」（即次日 0 点）。
  // 只在「我的队伍」休息标签里实时跳秒显示，纯展示。
  function nextSettleTs() { var d = new Date(); d.setHours(24, 0, 0, 0); return d.getTime(); }
  function fmtRemain(ms) {
    if (ms < 0) ms = 0;
    var s = Math.floor(ms / 1000), p = function (n) { return (n < 10 ? '0' : '') + n; };
    return p(Math.floor(s / 3600)) + ':' + p(Math.floor((s % 3600) / 60)) + ':' + p(s % 60);
  }
  function startCountdown(container) {
    if (countdownTimer) clearInterval(countdownTimer);
    function tick() {
      if (!container || !container.ownerDocument || !container.ownerDocument.body.contains(container)) { stopRoam(); return; }
      var txt = fmtRemain(nextSettleTs() - Date.now());
      var els = container.querySelectorAll('.rk-chip__cd');
      for (var i = 0; i < els.length; i++) els[i].textContent = txt;
    }
    tick();
    countdownTimer = setInterval(tick, 1000);
  }

  // 精灵描边：ol=0 关闭（8 向 drop-shadow 堆叠会放大成粗黑圈）
  var RANCH_VIS = { ol: 0 };
  // 新版场景的装饰 / 边界 / 碰撞数据都在文件开头；这里不再使用旧的 atlas 精灵切图

  function findP(id) {
    var list = APP.store.get().pokemon || [];
    for (var i = 0; i < list.length; i++) {
      if (list[i] && list[i].id === id) return list[i];
    }
    return null;
  }

  // ---------- 牧场场景 HTML（pmHtml / yardHtml）已移到文件开头的新版场景模块 ----------

  // 按 manifest 驱动 PMD 帧条动画：walk→idle→attack→charge 循环；饿了用 hurt 静止去色
  var ranchTimers = [];
  function buildOutline(ol) {
    // 只保留描边（8 向 drop-shadow 堆叠），不再叠加任何落地影/投影
    if (!ol || ol <= 0) return 'none';
    var c = 'rgba(12,18,30,.95)', d = ol, parts = [];
    for (var dx = -1; dx <= 1; dx++) for (var dy = -1; dy <= 1; dy++) {
      if (dx === 0 && dy === 0) continue;
      parts.push('drop-shadow(' + (dx * d) + 'px ' + (dy * d) + 'px 0 ' + c + ')');
    }
    return parts.join(' ');
  }
  function initRanchSprites(container) {
    ranchTimers.forEach(clearInterval); ranchTimers = [];
    var M = window.PMD_MANIFEST; if (!M) return;
    var SHEETS = window.PMD_SHEET_INDEX || {};
    var order = ['walk', 'idle', 'attack', 'charge'];
    container.querySelectorAll('.ranch-pm__spr').forEach(function (spr) {
      var pm = spr.parentNode, dex = pm.getAttribute('data-dex'), meta = M[dex];
      if (!meta) return;
      // 图集：一只一张竖排图，切动作只改 background-position-y；x 帧动画照旧。
      var sheet = SHEETS.pmd && SHEETS.pmd[dex];
      function applyAct(a, animate) {
        var d = meta[a]; if (!d) return;
        spr.style.width = d.fw + 'px'; spr.style.height = d.fh + 'px';
        spr.style.setProperty('--fr', d.n);
        spr.style.setProperty('--dist', '-' + (d.fw * d.n) + 'px');
        spr.style.setProperty('--dur', (a === 'idle' ? 0.9 : (a === 'attack' ? 0.5 : 0.7)) + 's');
        if (sheet && sheet.acts[a]) {
          // 换动作时重启 x 动画，避免沿用上一动作的帧进度；y 用负值把对应行上移到视窗
          if (animate) { spr.style.animation = 'none'; void spr.offsetWidth; spr.style.animation = ''; }
          spr.style.backgroundImage = "url('assets/pmd-sheets/" + dex + ".png')";
          spr.style.backgroundPositionY = -(sheet.acts[a].y) + 'px';
        } else {
          // 回退：图集缺该动作时用旧单图（兼容未生成的 dex）
          if (animate) { spr.style.animation = 'none'; void spr.offsetWidth; spr.style.animation = ''; }
          spr.style.backgroundPositionY = '0px';
          spr.style.backgroundImage = "url('assets/pmd-sliced/" + dex + "/" + a + ".png')";
        }
      }
      if (pm.classList.contains('is-rest')) {
        var hh = meta.hurt || meta.idle;
        if (sheet && sheet.acts.hurt) {
          spr.style.backgroundImage = "url('assets/pmd-sheets/" + dex + ".png')";
          spr.style.backgroundPositionY = -(sheet.acts.hurt.y) + 'px';
        } else {
          spr.style.backgroundImage = "url('assets/pmd-sliced/" + dex + "/hurt.png')";
        }
        spr.style.width = hh.fw + 'px'; spr.style.height = hh.fh + 'px';
        spr.style.setProperty('--fr', hh.n);
        spr.style.setProperty('--dist', '-' + (hh.fw * hh.n) + 'px');
        spr.style.setProperty('--dur', '0.9s');
        spr.classList.add('is-hungry');
        return;
      }
      // 用 walk 起手
      applyAct('walk', false);
      spr.style.filter = buildOutline(RANCH_VIS.ol);
      // 个性化动作序列：加权池洗牌（散步/发呆多、攻击/蓄力少）+ 每只随机切换节奏，
      // 打破之前全体按同一顺序循环的高重复感
      var seq = [];
      var pool = { walk: 3, idle: 3, attack: 1, charge: 1 };
      for (var pk in pool) { for (var pn = 0; pn < pool[pk]; pn++) seq.push(pk); }
      for (var sv = seq.length - 1; sv > 0; sv--) {
        var sj = Math.floor(Math.random() * (sv + 1));
        var st = seq[sv]; seq[sv] = seq[sj]; seq[sj] = st;
      }
      var seqIdx = 0;
      var t = setInterval(function () {
        seqIdx = (seqIdx + 1) % seq.length;
        applyAct(seq[seqIdx], true);
      }, 2200 + Math.floor(Math.random() * 1200));
      ranchTimers.push(t);
    });
  }

  // ---------- 小组件 ----------
  function barHtml(label, v) {
    return '<div class="ranch-bar">' +
      '<span class="ranch-bar__l">' + esc(label) + '</span>' +
      '<span class="ranch-bar__t"><i style="width:' + APP.clamp(v, 0, 100) + '%"></i></span>' +
      '<span class="ranch-bar__n">' + Math.round(v) + '</span>' +
    '</div>';
  }

  function growHtml(p) {
    var need = (APP.store.settings() && APP.store.settings().expPerLevel) || 100;
    var bond = p.bond || { stars: 0, daysCared: 0 };
    // V5.1：非主力只展示体力（饱食/心情只对主力有意义）
    var stRow = (APP.store.activePokemon() && APP.store.activePokemon().id === p.id)
      ? '<div class="ranch-grow__row"><span>状态</span><b>饱食 ' + Math.round(foodOf(p)) + ' · 心情 ' + Math.round(moodOf(p)) + ' · 体力 ' + Math.round(energyOf(p)) + '</b></div>'
      : '<div class="ranch-grow__row"><span>状态</span><b>体力 ' + Math.round(energyOf(p)) + (isResting(p) ? '（休息中）' : '（劳动中）') + '</b></div>';
    return '<div class="ranch-grow">' +
      '<div class="ranch-grow__row"><span>等级</span><b>Lv.' + p.level + '</b></div>' +
      '<div class="ranch-grow__row"><span>经验</span><b>' + (p.exp || 0) + ' / ' + need + '</b></div>' +
      '<div class="ranch-grow__row"><span>羁绊</span><b>★ ' + (bond.stars || 0) + '（照顾 ' + (bond.daysCared || 0) + ' 天）</b></div>' +
      stRow +
    '</div>';
  }

  // ---------- V5.1：「我的队伍」条（乐园动画下方；chip 只显示体力，<50 变红 💤）----------
  function teamBarHtml(team) {
    var chips = '';
    for (var i = 0; i < team.length; i++) {
      var p = team[i];
      var e = Math.round(energyOf(p));
      var rest = isResting(p);
      chips += '<button type="button" class="rk-chip' + (rest ? ' is-rest' : '') + '" data-id="' + esc(p.id) + '">' +
        '<span class="rk-chip__art"><img src="' + stillSrc(p.dexNo) + '" alt=""></span>' +
        '<span class="rk-chip__name">' + esc(nameOf(p)) + '</span>' +
        '<span class="rk-chip__stat' + (rest ? ' is-low' : '') + '"><i>体</i>' +
          '<em><b style="width:' + APP.clamp(e, 0, 100) + '%"></b></em><u>' + e + '</u></span>' +
        (rest ? '<span class="rk-chip__tag" title="距下次恢复">💤 <b class="rk-chip__cd">--:--:--</b></span>' : '') +
      '</button>';
    }
    return '<section class="card rk-team">' +
      '<div class="rk-team__head"><h2>我的队伍</h2>' +
        '<span class="rk-team__n">' + team.length + '/5</span>' +
        '<span class="rk-team__tip">体力不足会自动休息 · 点宝可梦中心调整队伍</span>' +
        '<button type="button" class="rk-team__pc" data-act="pc">' +
          '<svg class="rk-team__pc-ball" viewBox="0 0 20 20" aria-hidden="true">' +
            '<circle cx="10" cy="10" r="8.3" fill="#fff" stroke="#4A3728" stroke-width="1.6"/>' +
            '<path d="M1.7 10a8.3 8.3 0 0 1 16.6 0Z" fill="#E24B4A"/>' +
            '<path d="M1.7 10h16.6" stroke="#4A3728" stroke-width="1.6"/>' +
            '<circle cx="10" cy="10" r="2.7" fill="#fff" stroke="#4A3728" stroke-width="1.6"/>' +
          '</svg><span>宝可梦中心</span></button>' +
      '</div>' +
      '<div class="rk-team__row">' + (chips || '<div class="rk-team__none">还没有宝可梦，去家长后台添加</div>') + '</div>' +
    '</section>';
  }

  // ---------- 弹层（复用 ui.js 的 overlay） ----------
  function openModal(title, bodyHtml, mount) {
    var el = document.getElementById('uiOverlay');
    if (!el) {
      el = document.createElement('div');
      el.id = 'uiOverlay';
      el.className = 'ui-overlay';
      document.body.appendChild(el);
    }
    el.style.display = '';
    el.innerHTML =
      '<div class="ui-overlay__bg" data-close="1"></div>' +
      '<div class="ui-modal ui-modal--ranch" role="dialog" aria-label="' + esc(title) + '">' +
        '<button type="button" class="ui-modal__x" data-close="1" aria-label="关闭">×</button>' +
        '<h3 class="ui-modal__title">' + esc(title) + '</h3>' +
        bodyHtml +
      '</div>';
    el.onclick = function (e) {
      if (e.target.getAttribute && e.target.getAttribute('data-close')) closeModal();
    };
    if (mount) mount(el);
  }
  function closeModal() {
    if (APP.ui && APP.ui.close) APP.ui.close();
  }
  function reload() {
    if (APP.refresh) APP.refresh();
    else if (rootEl) render(rootEl);
  }
  function flash(msg) {
    if (!msg) return;
    if (APP.statusbar && APP.statusbar.notice) APP.statusbar.notice(msg);
  }
  function after(msg) {
    closeModal();
    reload();
    flash(msg);
  }

  // ---------- 单只宝可梦的选人弹层 ----------
  function openPmSheet(id) {
    var p = findP(id);
    if (!p) return;
    var isBox = p.slot === 'box';
    var isCare = !isBox && APP.store.activePokemon() && APP.store.activePokemon().id === p.id;
    var full = APP.store.listParty().length >= 5;

    var acts = '';
    if (isBox) {
      acts += full
        ? '<button type="button" class="btn btn--block" data-a="swap">与队伍成员交换位置</button>'
        : '<button type="button" class="btn btn--primary btn--block" data-a="add">加入队伍</button>';
    } else {
      if (!isCare) acts += '<button type="button" class="btn btn--primary btn--block" data-a="set-care">设为主力</button>';
      else acts += '<button type="button" class="btn btn--primary btn--block" data-a="go-care">主力中 · 回养成页照顾</button>';
      acts += '<button type="button" class="btn btn--block" data-a="tobox">送回仓库休息</button>';
    }

    var rest = isResting(p);
    var body =
      '<div class="ranch-sheet">' +
        '<div class="ranch-sheet__top">' +
          '<img class="ranch-sheet__img" src="' + gifSrc(p.dexNo) + '" alt="" ' +
            'onerror="this.onerror=null;this.src=\'' + stillBig(p.dexNo) + '\'">' +
          '<div class="ranch-sheet__meta">' +
            '<div class="ranch-sheet__name">' + esc(nameOf(p)) + (isCare ? ' <b>主力中</b>' : '') + '</div>' +
            '<div class="ranch-sheet__sub">' +
              (isBox ? '在仓库里休息' : (rest ? '体力不足，正在休息 💤' : '正在劳动')) +
            '</div>' +
          '</div>' +
        '</div>' +
        '<div class="ranch-sheet__bars">' +
          barHtml('体力', energyOf(p)) +
          (isCare ? barHtml('饱食', foodOf(p)) + barHtml('心情', moodOf(p)) : '') +
        '</div>' +
        '<div class="ranch-sheet__grow-t">成长</div>' + growHtml(p) +
        '<div class="ranch-sheet__acts">' + acts + '</div>' +
      '</div>';

    openModal(nameOf(p), body, function (el) {
      var btns = el.querySelectorAll('[data-a]');
      for (var i = 0; i < btns.length; i++) {
        btns[i].addEventListener('click', function () {
          var a = this.getAttribute('data-a');
          if (a === 'go-care') { closeModal(); window.location.hash = '#/care'; return; }
          if (a === 'set-care') {
            closeModal();
            if (!APP.ui || !APP.ui.confirm) { after(APP.store.setCareTarget(id).msg); return; }
            APP.ui.confirm('让 ' + esc(nameOf(p)) + ' 当主力宝可梦吗？养成页以后照顾它。',
              '好，就它', '再想想').then(function (yes) {
              if (!yes) return;
              after(APP.store.setCareTarget(id).msg);
            });
            return;
          }
          if (a === 'add') { after(APP.store.addToParty(id).msg); return; }
          if (a === 'tobox') { after(APP.store.sendToBox(id).msg); return; }
          if (a === 'swap') { closeModal(); openSwapSheet(id); return; }
        });
      }
    });
  }

  // 队伍满员时：从队伍里挑一只与仓库这只对调
  function openSwapSheet(boxId) {
    var team = APP.store.listParty();
    var rows = '';
    for (var i = 0; i < team.length; i++) {
      var p = team[i];
      rows += '<button type="button" class="ranch-swap" data-id="' + esc(p.id) + '">' +
        '<img src="' + stillSrc(p.dexNo) + '" alt="">' +
        '<span>' + esc(nameOf(p)) + ' Lv.' + p.level + '</span>' +
        '<em>换出</em>' +
      '</button>';
    }
    openModal('换谁回仓库？', '<div class="ranch-sheet"><div class="ranch-swap__list">' + rows + '</div></div>', function (el) {
      var btns = el.querySelectorAll('[data-id]');
      for (var j = 0; j < btns.length; j++) {
        btns[j].addEventListener('click', function () {
          var rid = this.getAttribute('data-id');
          after(APP.store.swapParty(boxId, rid).msg);
        });
      }
    });
  }

  // ---------- 乐园规则弹窗（参考养成页羁绊规则的样式与交互） ----------
  var RANCH_RULES_HTML =
    '<div class="rules-sec"><div class="rules-t">队伍与劳动</div>' +
      '<div class="rules-li">队伍最多 5 只，全员平等，都会劳动；在仓库的宝可梦不参与</div>' +
      '<div class="rules-li">体力 ≥50 → 当天劳动；体力 &lt;50 → 自动休息（队伍条变红 + 💤）</div>' +
      '<div class="rules-li">劳动消耗体力：每天 −10~40（每只天生不同，勤快的消耗小）；休息一天 +50</div>' +
      '<div class="rules-li">喂食 +10 体力、抚摸 30% 概率 +5；锻炼 / 玩耍会消耗体力</div>' +
    '</div>' +
    '<div class="rules-sec"><div class="rules-t">🍒 果实产出</div>' +
      '<div class="rules-li">每天保底 +1 颗</div>' +
      '<div class="rules-li">有宝可梦在劳动的日子：90% 概率再 +1、20% 概率又 +1（翻倍）</div>' +
      '<div class="rules-li">平均约 1.1 颗/天，主力喂食每天约用 1 颗，略有盈余</div>' +
    '</div>' +
    '<div class="rules-sec"><div class="rules-t"><i class="shard shard--sm"></i> 碎片与伤药</div>' +
      '<div class="rules-li">每只劳动中的宝可梦每天 30% 概率 +1 碎片，可在兑换中心换精灵球 / 战斗券</div>' +
      '<div class="rules-li">伤药每 3 天 +1（探险 / 战斗回血用）</div>' +
    '</div>' +
    '<div class="rules-sec"><div class="rules-t">🎯 外出</div>' +
      '<div class="rules-li">三个出门玩法都在「探险」页顶部的页签：外出捕捉 / 外出战斗 / 外出训练</div>' +
      '<div class="rules-li">外出捕捉：平日每 2 天 1 次、周末 / 节假日每天 3 次，每次消耗 1 个精灵球</div>' +
      '<div class="rules-li">外出战斗：仅周末开放；外出次数战斗 / 训练共用，每周刷新 4 次</div>' +
      '<div class="rules-li">野外探险已开放；战斗 / 训练玩法正在建设中</div>' +
    '</div>' +
    '<div class="rules-sec"><div class="rules-t">💤 关掉页面也算</div>' +
      '<div class="rules-li">离线期间劳动照常结算、自动补算，最多补 5 天</div>' +
    '</div>';

  function openRanchRules() {
    openModal('📖 乐园规则',
      RANCH_RULES_HTML +
      '<div class="row"><button type="button" class="btn btn--primary btn--block" data-close="1">知道啦</button></div>');
  }

  // ---------- 首页 ----------
  function render(container) {
    rootEl = container;
    var s = APP.store.get();
    var team = APP.store.listParty();

    // 新版场景每次 render 都从队伍重建全部落点，换队后动画阵容立即刷新（不再有旧位置表残留）
    var outs = APP.store.getOutings();
    var w = s.wallet || { balls: 0, berries: 0, potions: 0, shards: 0 };

    var html = '';

    // 1) 我的队伍（置顶压缩版：只显示体力；入口到宝可梦中心）
    html += teamBarHtml(team);

    // 2) 牧场场景（GBA 外壳包裹；体力 ≥50 劳动走动，<50 原地休息 💤）
    var props = buildProps();
    html += yardHtml(team, props);

    // 3) 乐园仓库（资源 + 规则入口；队伍状态与产出规则收进规则弹窗）
    html += '<section class="card ranch-head">' +
      '<div class="ranch-head__top"><h2 class="ranch-head__t">乐园仓库</h2>' +
        '<button type="button" class="bond-rules" data-act="rules">📖 规则</button>' +
      '</div>' +
      '<div class="ranch-res">' +
        '<span class="ranch-res__i" data-res="berries" title="果实：喂主力消耗 / 乐园劳动产出">🍒 <b>' + (w.berries || 0) + '</b></span>' +
        '<span class="ranch-res__i" data-res="balls" title="精灵球：野外探险消耗，可用碎片兑换"><i class="pkball"></i> <b>' + ((w.tickets && w.tickets.capture) || 0) + '</b></span>' +
        '<span class="ranch-res__i" data-res="potions" title="伤药：探险 / 战斗回血">💊 <b>' + (w.potions || 0) + '</b></span>' +
        '<span class="ranch-res__i" data-res="outs" title="外出次数：战斗 / 训练共用，每周刷新">🎫 <b>' + outs + '</b></span>' +
        '<span class="ranch-res__i ranch-res__i--shard" data-res="shards" title="碎片：乐园劳动有概率产出，可在兑换中心换精灵球 / 战斗券"><i class="shard"></i> <b>' + (w.shards || 0) + '</b></span>' +
      '</div>' +
    '</section>';

    // 4) 出门入口已移到「探险」页顶部三页签（2026-11-07）

    container.innerHTML = html;
    initRanchSprites(container);
    setupScene(container, props);
    startWorkFx(container);
    startCountdown(container);

    // —— 事件绑定（每次 render 都是新 DOM，直接绑不会重复累积）——
    var pms = container.querySelectorAll('.ranch-pm[data-id]');
    for (var a = 0; a < pms.length; a++) {
      pms[a].addEventListener('click', function () { openPmSheet(this.getAttribute('data-id')); });
    }
    // 队伍条：点头像看这只宝可梦的体力 / 操作
    var rkChips = container.querySelectorAll('.rk-chip[data-id]');
    for (var r2 = 0; r2 < rkChips.length; r2++) {
      rkChips[r2].addEventListener('click', function () { openPmSheet(this.getAttribute('data-id')); });
    }
    // 资源道具：点一下弹出文字介绍（鼠标 / 手指通用）
    var resItems = container.querySelectorAll('.ranch-res__i[data-res]');
    for (var ri = 0; ri < resItems.length; ri++) {
      resItems[ri].addEventListener('click', function () {
        var info = RES_INFO[this.getAttribute('data-res')];
        if (info) openModal(info.name, '<p class="res-pop">' + info.desc + '</p>');
      });
    }
    var acts = container.querySelectorAll('[data-act]');
    for (var c = 0; c < acts.length; c++) {
      acts[c].addEventListener('click', function () {
        var act = this.getAttribute('data-act');
        if (act === 'pc') {
          // 宝可梦中心（换主力 + 队伍编辑），复用养成页弹窗
          if (APP.screens.care && APP.screens.care.openSwitcher) APP.screens.care.openSwitcher();
        } else if (act === 'rules') {
          openRanchRules();
        }
      });
    }
  }

  APP.screens.ranch = { render: render };
})(window.APP);
