(function () {
  'use strict';

  /* ========================================================================
     B4 外出战斗 · GBA 战场（V2）
     F0 待机 → F1 敌登场 → F2 我登场 → F3 三格菜单 → F4 四招 → F4.5 出招小游戏
     → F5/F6 我方攻击与扣血 → F7/F8 敌方回合 → F9 下回合(+10 体力) → F3
     → F10 敌方倒下 → F11 胜利奖励 → F12 升级演出 → F13 结算；分支 B1 背包 / B3 逃跑 / B4 战败
     口径见 docs/B4战斗细节优化-方案（待确认）.md；纯数值在 js/data/battle-moves.js。
     ======================================================================== */
  var APP = window.APP;
  APP.screens = APP.screens || {};
  var M = APP.battleMoves;
  var D = APP.catchData;

  var host = null;
  var B = null;
  var seq = {
    busy: false, timers: [], iv: null, decay: null, typeIv: null,
    clicked: false, tTarget: 0, holding: false, p: 0, dir: 1, taps: 0, grade: null
  };

  function $(id) { return document.getElementById('b4-' + id); }
  function pad3(n) { return APP.pad3(n); }
  function isInk() { return document.body && document.body.classList.contains('ink'); }
  function esc(t) {
    return String(t === undefined || t === null ? '' : t)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }
  function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }

  function cfg() {
    var s = {};
    try { s = APP.store.settings() || {}; } catch (e) {}
    var mode = s.catchGameMode || 'timing';
    if (['off', 'timing', 'tap', 'hold'].indexOf(mode) < 0) mode = 'timing';
    return {
      soundOn: s.soundOn !== false,
      celebrateOn: s.celebrateOn !== false,
      animOn: s.catchAnimOn !== false,
      gameMode: mode
    };
  }
  function animated() { return cfg().animOn && !isInk(); }
  function sfx(name) {
    try { if (APP.audio && typeof APP.audio[name] === 'function') APP.audio[name](); } catch (e) {}
  }
  function cry(dex) { try { if (APP.audio) APP.audio.playCry(dex); } catch (e) {} }

  function alive() { return !!(host && host.parentNode && $('scene')); }
  function later(ms, fn) {
    seq.timers.push(setTimeout(function () { if (alive()) fn(); }, ms));
  }
  function clearSeq() {
    for (var i = 0; i < seq.timers.length; i++) clearTimeout(seq.timers[i]);
    seq.timers = [];
    if (seq.iv) { clearInterval(seq.iv); seq.iv = null; }
    if (seq.decay) { clearInterval(seq.decay); seq.decay = null; }
    if (seq.typeIv) { clearInterval(seq.typeIv); seq.typeIv = null; }
    seq.holding = false; seq.grade = null;
  }

  function toast(msg, bad) {
    var el = document.createElement('div');
    el.className = 'toast' + (bad ? ' is-bad' : ' is-ok');
    el.textContent = msg;
    document.body.appendChild(el);
    setTimeout(function () {
      el.classList.add('is-out');
      setTimeout(function () { if (el.parentNode) el.parentNode.removeChild(el); }, 320);
    }, 1800);
  }

  // ===== 页面骨架（只在 mount 时建一次；三个 pane 常驻 DOM，只切 is-on） =====
  function shellHtml() {
    return '<div class="b3-shell">' +
      '<div class="b3-shell__top"><span class="b3-shell__led"></span><span>POWER</span></div>' +
      '<div class="b3-scene b3-scene--battle b4-scene" id="b4-scene">' +
        '<div class="b4-sky"></div><div class="b4-floor"></div>' +
        '<div class="b4-plat b4-plat--foe"></div><div class="b4-plat b4-plat--mine"></div>' +
        '<img class="b4-pm b4-pm--foe" id="b4-foe" alt="对手">' +
        '<img class="b4-pm b4-pm--mine" id="b4-mine" alt="我方">' +
        '<div class="b4-ib b4-ib--foe" id="b4-ibFoe"></div>' +
        '<div class="b4-ib b4-ib--mine" id="b4-ibMine"></div>' +
        '<div class="b4-fx" id="b4-fx"></div>' +
        '<div class="b4-mini" id="b4-mini"></div>' +
        '<div class="b4-center" id="b4-center"></div>' +
        '<div class="b4-bottom">' +
          '<div class="b4-say" id="b4-say"></div>' +
          '<div class="b4-menu" id="b4-menu"></div>' +
        '</div>' +
      '</div>' +
      // 战斗记录：场景正下方，默认折叠，只保留最近 5 天
      '<div class="b4-log" id="b4-log">' +
        '<button type="button" class="b4-log__hd" data-bt="log-toggle">⚔️ 战斗记录' +
          '<small>最近 5 天</small><span class="b4-log__arrow">▸</span></button>' +
        '<div class="b4-log__body">' +
          '<div id="b4-logRows"></div>' +
          '<div class="b4-log__ft">' +
            '<button type="button" class="b4-log__pg" id="b4-logPrev" data-bt="log-prev">‹ 上一页</button>' +
            '<span class="b4-log__pgn" id="b4-logPage"></span>' +
            '<button type="button" class="b4-log__pg" id="b4-logNext" data-bt="log-next">下一页 ›</button>' +
          '</div>' +
        '</div>' +
      '</div>' +
    '</div>';
  }

  // ===== 信息框：HP 三色条 + 橙色体力条；双方字段统一，均带数量、无 EXP =====
  function hpCls(hp) { return hp > 50 ? '' : (hp > 20 ? ' is-mid' : ' is-low'); }
  // 信息框：不显示性别（存档无该参数）、不显示「对手」小标签，也不带右下角三角
  function ibHtml(u) {
    var hmax = u.hpMax || M.HP_MAX;
    var w = Math.max(0, Math.min(100, Math.round(u.hp / hmax * 100)));
    var sw = Math.max(0, Math.min(100, u.stamina));
    return '<div class="b4-ib__row"><span class="b4-ib__nm">' + esc(u.name) + '</span>' +
        '<span class="b4-ib__lv">Lv.' + u.level + '</span></div>' +
      '<div class="b4-ib__line"><span>HP</span><div class="b4-bar b4-bar--hp' + hpCls(w) +
        '"><i style="width:' + w + '%"></i></div></div>' +
      '<div class="b4-ib__num">' + u.hp + ' / ' + hmax + '</div>' +
      '<div class="b4-ib__line"><span>体力</span><div class="b4-bar b4-bar--st"><i style="width:' +
        sw + '%"></i></div></div>' +
      '<div class="b4-ib__num b4-ib__num--st">体力 ' + u.stamina + ' / ' + M.STAMINA_MAX + '</div>';
  }
  function renderInfo() {
    if (!B || !alive()) return;
    var f = $('ibFoe'), m = $('ibMine');
    if (f) f.innerHTML = ibHtml(B.foe);
    if (m) m.innerHTML = ibHtml(B.mine);
    f && f.classList.toggle('is-hide', B.phase === 'idle');
    m && m.classList.toggle('is-hide', B.phase === 'idle');
  }
  function floatNum(text, side, cls) {
    if (!animated()) return;
    var box = $('fx');
    if (!box) return;
    var d = document.createElement('div');
    d.className = 'b4-float b4-float--' + side + (cls ? ' ' + cls : '');
    d.textContent = text;
    box.appendChild(d);
    setTimeout(function () { if (d.parentNode) d.parentNode.removeChild(d); }, 900);
  }
  function fxClear() { var f = $('fx'); if (f) f.innerHTML = ''; }

  // ===== 底栏：逐字叙述 + 菜单 =====
  function say(text, cb) {
    var el = $('say');
    if (!el) { if (cb) cb(); return; }
    if (!animated()) { el.textContent = text; el.classList.add('is-done'); if (cb) cb(); return; }
    if (seq.typeIv) { clearInterval(seq.typeIv); seq.typeIv = null; }
    el.textContent = '';
    el.classList.remove('is-done');
    var i = 0;
    seq.typeIv = setInterval(function () {
      i++;
      el.textContent = text.slice(0, i);
      if (i >= text.length) {
        clearInterval(seq.typeIv); seq.typeIv = null;
        el.classList.add('is-done');
        if (cb) cb();
      }
    }, 20);
  }
  function menuHtml(cells, cls) {
    var h = '';
    for (var i = 0; i < cells.length; i++) {
      var c = cells[i];
      h += c.info
        ? '<div class="b4-cell b4-cell--info">' + c.info + '</div>'
        : '<button type="button" class="b4-cell' + (c.off ? ' is-off' : '') +
          '" data-bt="' + c.act + '"' + (c.off ? ' disabled' : '') + '>' + c.html + '</button>';
    }
    var m = $('menu');
    if (m) { m.className = 'b4-menu' + (cls ? ' ' + cls : ''); m.innerHTML = h; }
  }
  function center(title, desc, buttons) {
    var c = $('center');
    if (!c) return;
    var h = '<h3>' + title + '</h3><p>' + desc + '</p><div class="b4-center__row">';
    for (var i = 0; i < buttons.length; i++) {
      h += '<button type="button" class="b4-btn' + (buttons[i].yes ? ' b4-btn--yes' : '') +
        '" data-bt="' + buttons[i].act + '">' + buttons[i].text + '</button>';
    }
    c.innerHTML = h + '</div>';
    c.classList.add('is-on');
  }
  function hideCenter() { var c = $('center'); if (c) { c.classList.remove('is-on'); c.innerHTML = ''; } }
  function hideMini() {
    var m = $('mini');
    if (m) { m.className = 'b4-mini'; m.innerHTML = ''; }
    if (seq.iv) { clearInterval(seq.iv); seq.iv = null; }
    if (seq.decay) { clearInterval(seq.decay); seq.decay = null; }
    seq.holding = false;
  }

  function partyInfo() {
    var p = null;
    try { p = (APP.store.listParty() || [])[0]; } catch (e) {}
    var dex = p && p.dexNo ? p.dexNo : 25;
    var lv = p && p.level ? p.level : 1;
    var expPct = 0;
    try { expPct = (APP.store.levelProgress() || {}).percent || 0; } catch (e) {}
    return {
      dexNo: dex, name: p && p.nickname ? p.nickname : M.nameOf(dex),
      level: lv, expPct: expPct, types: M.typesOf(dex)
    };
  }

  // ===== F0 待机 =====
  function showIdle() {
    clearSeq();
    hideMini(); fxClear();
    seq.busy = false;
    B = null;
    var mine = partyInfo();
    setPm('mine', mine.dexNo, true);
    setPm('foe', 0, false);
    var sc = $('scene');
    if (sc) sc.className = 'b3-scene b3-scene--battle b4-scene b4-idle';
    var s = APP.store.get();
    var tk = (s.wallet && s.wallet.tickets && s.wallet.tickets.battle) || 0;
    var g = APP.store.canPlay('battle');
    var gate = g.ok
      ? (g.demo ? '演示模式 · 不限次数' : (g.left ? '剩余战斗次数 ' + g.left + ' 次' : '今日可入场'))
      : gateToast(g);
    say('要出门对战吗？');
    menuHtml([{ info: '⚔️<br>外出战斗' }], 'is-single');
    center('⚔️ 对战擂台',
      '带上主力来赢一场～<br>消耗 <b>1 张战斗券 + 1 次入场机会</b><br>' +
      '当前 <b>' + tk + ' 张</b>战斗券 · ' + gate,
      [{ text: '开始对战', yes: true, act: 'start' }]);
    renderInfoIdle(mine);
  }
  function renderInfoIdle(mine) {
    var m = $('ibMine'), f = $('ibFoe');
    if (m) { m.innerHTML = ibHtml({ name: mine.name, level: mine.level, hp: 100, stamina: 100 }); m.classList.remove('is-hide'); }
    if (f) { f.innerHTML = ''; f.classList.add('is-hide'); }
  }

  function setPm(side, dex, show) {
    var el = $(side === 'mine' ? 'mine' : 'foe');
    if (!el) return;
    if (!show || !dex) { el.classList.add('is-hide'); el.removeAttribute('src'); return; }
    el.classList.remove('is-hide');
    el.src = (side === 'mine' ? D.GIF_BASE + 'back/' : D.GIF_BASE) + pad3(dex) + '.gif';
  }

  // 入场门禁不足：由 NPC 在邀战卡上说出口（战斗券不足由调用方单独判断）
  function gateMsg(g) {
    if (g.reason === 'cooldown') {
      return '今天休息，无法对战，等 ' + g.waitDays + ' 天后再来找我吧！';
    }
    if (g.reason === 'holidayLimit') return '你今天已经没有战斗次数，请明天再来挑战吧！';
    return '暂时不能出门';
  }
  // 系统 toast / 旧待机屏用简短口径，避免「来找我吧」出现在系统提示里
  function gateToast(g) {
    if (g.reason === 'cooldown') return '今日休息，' + g.waitDays + ' 天后可进行对战';
    if (g.reason === 'holidayLimit') return '今天的入场次数用完啦';
    return '暂时不能出门';
  }

  function askStart() {
    var s = APP.store.get();
    var tk = (s.wallet && s.wallet.tickets && s.wallet.tickets.battle) || 0;
    var g = APP.store.canPlay('battle');
    if (!g.demo && tk < 1) { toast('你目前没有战斗券，请先前往兑换', true); return; }
    if (!g.ok) { toast(gateToast(g), true); return; }
    center('要消耗 1 张战斗券吗？',
      '去会一会野外的对手。<br>消耗 <b>1 张战斗券 + 1 次入场机会</b>，打赢有经验和碎片。',
      [{ text: '再想想', act: 'cancel' }, { text: '是，开打', yes: true, act: 'confirm' }]);
  }

  function doStartPaid() {
    var r = APP.store.spendTicket('battle');
    if (!r.ok) { toast(r.msg, true); if (intro) introShowInvite(); return; }
    renderIntroHud();
    if (intro && intro.root) {
      // 此刻锁定对手与等级：P2 对阵牌、亮相 GIF 与正式战斗用同一只
      var mine = partyInfo();
      var foe = M.randomFoe() || { dexNo: 1, name: '妙蛙种子', types: ['grass'] };
      var foeLv = clamp(mine.level + (Math.floor(Math.random() * 7) - 3), 1, 100);
      intro.foe = { dexNo: foe.dexNo, name: M.nameOf(foe.dexNo, foe.name), level: foeLv, types: M.typesOf(foe.dexNo, foe.types) };
      intro.foeLv = foeLv;
      fillRunway();
      if (animated()) { introShowEntrance(); return; }
      var f = intro.foe, lv = foeLv;
      teardownIntro(); // 墨水屏 / 关动画：跳过入场动画直接开战
      start({ foe: f, foeLv: lv, npc: NPCS[intro.rot] });
      return;
    }
    start({});
  }
  // 对阵牌 + 双方宝可梦亮相图（P2 与正式战斗同一只对手）
  function typeZhList(types) {
    var out = [];
    for (var i = 0; i < (types || []).length; i++) {
      var t = M.TPL[types[i]];
      out.push(t ? t.zh : types[i]);
    }
    return out.join('·');
  }
  function fillRunway() {
    if (!intro) return;
    var mine = partyInfo(), foe = intro.foe;
    var eM = document.getElementById('b4-entryMine');
    var eF = document.getElementById('b4-entryFoe');
    if (eM) eM.innerHTML = '<b>' + esc(mine.name) + '</b><span>Lv.' + mine.level + '</span><em>' + esc(typeZhList(mine.types)) + '</em>';
    if (eF) eF.innerHTML = '<b>' + esc(foe.name) + '</b><span>Lv.' + foe.level + '</span><em>' + esc(typeZhList(foe.types)) + '</em>';
    var rf = document.getElementById('b4-rezFoe'), rm = document.getElementById('b4-rezMine');
    if (rf) rf.src = D.GIF_BASE + pad3(foe.dexNo) + '.gif';
    if (rm) rm.src = D.GIF_BASE + 'back/' + pad3(mine.dexNo) + '.gif';
  }

  // ===== 开局（F1 / F2）=====
  // 出场动画辅助：移除→强制回流→再加类，保证每次登场都重放
  function pmIn(id, cls) {
    var el = document.getElementById(id);
    if (!el) return;
    el.classList.remove('is-in--foe', 'is-in--mine');
    void el.offsetWidth;
    el.classList.add(cls);
  }
  function start(opts) {
    opts = opts || {};
    clearSeq(); hideCenter(); hideMini(); fxClear(); hideMovePanel();
    teardownIntro();   // 收掉 P0 野外开场遮罩（NPC / 场景 / 气泡），否则真实战斗界面被盖住
    // 新一场开始先清掉右下角：上一场结算的「第 N 回合 / 本场结束」不能再挂着
    var mn = $('menu');
    if (mn) { mn.className = 'b4-menu'; mn.innerHTML = ''; }
    var mine = partyInfo();
    var foe = opts.foe || M.randomFoe() || { dexNo: 1, name: '妙蛙种子', types: ['grass'] };
    var foeLv = opts.foeLv || clamp(mine.level + (Math.floor(Math.random() * 7) - 3), 1, 100);
    var gy = opts.gym || null;
    var foeHp = gy ? gy.roles[gy.stage].hp : M.HP_MAX;
    B = {
      phase: 'intro', round: 1, fromCatch: !!opts.fromCatch, cheer: false,
      gym: gy,
      pendingMove: null, result: '', defending: false, foeDefending: false,
      mine: {
        dexNo: mine.dexNo, name: mine.name, level: mine.level,
        types: mine.types, hp: M.HP_MAX, hpMax: M.HP_MAX, stamina: M.STAMINA_MAX,
        moves: M.movesFor(mine.dexNo, mine.types), beforeLv: mine.level
      },
      foe: {
        dexNo: foe.dexNo, name: M.nameOf(foe.dexNo, foe.name), level: foeLv,
        types: M.typesOf(foe.dexNo, foe.types), hp: foeHp, hpMax: foeHp, stamina: M.STAMINA_MAX,
        moves: M.movesFor(foe.dexNo, foe.types)
      }
    };
    APP.store.markSeen(foe.dexNo);
    var sc = $('scene');
    if (sc) sc.className = 'b3-scene b3-scene--battle b4-scene';
    setPm('mine', 0, false);
    setPm('foe', B.foe.dexNo, true);
    pmIn('b4-foe', 'is-in--foe'); // 敌方与我方统一做出场动画
    renderInfo();
    seq.busy = true;
    cry(B.foe.dexNo);
    // 对手来源：NPC 邀战 = NPC 的宝可梦；捕捉小游戏 = 野生宝可梦
    say(opts.npc ? opts.npc + ' 的 ' + B.foe.name + ' 出场！' : '野生的 ' + B.foe.name + ' 出现了！');
    later(animated() ? 950 : 220, function () {
      setPm('mine', B.mine.dexNo, true);
      pmIn('b4-mine', 'is-in--mine');
      cry(B.mine.dexNo);
      say('去吧！' + B.mine.name + '！');
      later(animated() ? 950 : 220, function () {
        seq.busy = false;
        showMenu();
      });
    });
  }

  // ===== F3 主菜单：四个指令 2×2 宫格（战斗 / 防守 / 背包 / 逃跑），不裁切 =====
  function showMenu() {
    if (!B) return;
    B.phase = 'menu'; B.pendingMove = null;
    seq.busy = false;
    hideCenter(); hideMini(); fxClear(); hideMovePanel();
    say(B.mine.name + ' 要做什么呢？');
    menuHtml([
      { act: 'menu-fight', html: '战斗' },
      { act: 'menu-defend', html: '防守' },
      { act: 'menu-bag', html: '背包' },
      { act: 'menu-run', html: '逃跑' }
    ], 'is-grid');
    renderInfo();
  }

  // ===== F4 招式面板：悬浮大面板，四招完整展示（不滚动），点击选择 =====
  function hideMovePanel() {
    var d = document.getElementById('b4-mvpDim');
    if (d && d.style) d.style.display = 'none';
    var p = document.getElementById('b4-mvp');
    if (p && p.parentNode && typeof p.parentNode.removeChild === 'function') p.parentNode.removeChild(p);
  }
  function showMoves() {
    if (!B) return;
    B.phase = 'moves';
    say('选一个招式吧');
    var sc = $('scene');
    if (!sc) return;
    var dim = document.getElementById('b4-mvpDim');
    if (!dim) { dim = document.createElement('div'); dim.id = 'b4-mvpDim'; dim.className = 'b4-mvp-dim'; sc.appendChild(dim); }
    dim.style.display = 'block';
    var h = '<div class="b4-mvp__hd"><span>选择招式</span><small>体力 ' + B.mine.stamina + ' / ' + M.STAMINA_MAX + '</small></div>';
    for (var i = 0; i < B.mine.moves.length; i++) {
      var m = B.mine.moves[i], off = !M.canUse(B.mine.stamina, m);
      h += '<button type="button" class="b4-mvp__row' + (off ? ' is-off' : '') + '" data-bt="move-' + m.slot + '"' + (off ? ' disabled' : '') + '>' +
        '<span class="b4-mvp__nm">' + esc(m.name) + (m.signature ? ' <i class="b4-mv__sig">专属</i>' : '') + '</span>' +
        '<i class="b4-mv__tp" style="background:' + m.color + '">' + esc(m.typeZh) + '</i>' +
        '<span class="b4-mvp__meta">威力 ' + m.power + ' · 耗体力 ' + m.cost + ' · 命中 ' + (m.acc || 80) + '%' +
        (off ? '<em> 体力不足</em>' : '') + '</span>' +
      '</button>';
    }
    h += '<button type="button" class="b4-mvp__back" data-bt="back">← 返回</button>';
    var panel = document.getElementById('b4-mvp');
    if (!panel) {
      panel = document.createElement('div');
      panel.id = 'b4-mvp';
      sc.appendChild(panel);
    }
    panel.className = 'b4-mvp';
    panel.innerHTML = h;
    var mEl = $('menu');
    if (mEl) mEl.innerHTML = '';
  }

  // ===== B1 背包：伤药 + 加油（不设体力药、不放精灵球）=====
  function showBag() {
    if (!B) return;
    B.phase = 'bag';
    say('要使用哪个道具？');
    menuHtml([
      { act: 'bag-potion', html: '🧴 伤药<small>回复 30 HP</small>' },
      { act: 'bag-cheer', html: '📣 加油<small>下次出招更好打中</small>' },
      { act: 'back', html: '← 返回' },
      { info: '用道具会<br>消耗这一回合' }
    ], 'is-list');
  }

  function usePotion() {
    if (!B) return;
    var before = B.mine.hp;
    B.mine.hp = Math.min(M.HP_MAX, B.mine.hp + 30);
    B.phase = 'anim'; seq.busy = true;
    renderInfo();
    floatNum('+' + (B.mine.hp - before), 'mine', 'is-heal');
    sfx('sfxDing');
    say(B.mine.name + ' 回复了 ' + (B.mine.hp - before) + ' 点 HP！');
    later(animated() ? 700 : 120, enemyTurn);
  }
  function useCheer() {
    if (!B) return;
    B.cheer = true;
    B.phase = 'anim'; seq.busy = true;
    say('加油！下次出招会更容易打中～');
    later(animated() ? 700 : 120, enemyTurn);
  }
  // 防守：不耗体力的保底指令。本回合对手伤害 -40%，回合结算时体力回复 ×1.5（10 → 15）
  function doDefend() {
    if (!B) return;
    B.defending = true;
    B.phase = 'anim'; seq.busy = true;
    say(B.mine.name + ' 摆出了防御姿态！');
    later(animated() ? 700 : 120, enemyTurn);
  }

  // ===== F4.5 出招小游戏：选招后自动出招，小游戏只提高命中率（perfect +15 / good +8）；
  //       不玩也按招式基础命中 70–90% 结算，不再「不点就必空」 =====
  function startMini(move) {
    if (!B) return;
    if (!M.canUse(B.mine.stamina, move)) { toast('体力不够，换一个招吧', true); return; }
    B.phase = 'mini'; B.pendingMove = move;
    seq.busy = true; seq.clicked = false; seq.taps = 0; seq.grade = null;
    seq.p = 0; seq.dir = 1; seq.holding = false;
    var mode = isInk() ? 'off' : cfg().gameMode;
    if (mode === 'off' || !animated()) { finishMini('good', 0); return; } // 墨水屏/关动画：按「良好」自动出招

    var m = $('mini');
    if (!m) { finishMini('none'); return; }
    m.className = 'b4-mini is-on b4-mini--' + mode;
    var tip = mode === 'timing' ? '圆环缩到中心时点这块面板！命中更高'
      : mode === 'tap' ? '1.2 秒内连点这块面板！点得越多命中越高' : '按住面板，松手停在绿区！命中更高';
    m.innerHTML = '<div class="b4-mini__tip" id="b4-miniTip">' + tip + '</div>' +
      '<div class="b4-mini__track" id="b4-miniTrack">' +
        '<i class="b4-mini__zone"></i><span class="b4-mini__fill" id="b4-miniFill"></span>' +
        '<span class="b4-mini__ring" id="b4-miniRing"></span>' +
        '<span class="b4-mini__knob" id="b4-miniKnob"></span>' +
      '</div>' +
      '<div class="b4-mini__auto">不点也会自动出招 · 基础命中 ' + (move.acc || 80) + '%</div>';
    var widen = B.cheer ? 1.5 : 1;

    if (mode === 'timing') {
      seq.tTarget = performance.now() + 800;
      m.onclick = function () {
        if (seq.clicked) return;
        seq.clicked = true;
        var d = Math.abs(performance.now() - seq.tTarget);
        var g = d < 150 * widen ? 'perfect' : (d < 480 * widen ? 'good' : 'none');
        miniTip(g);
        finishMini(g);
      };
      later(1200, function () { if (!seq.clicked) { miniTip('none'); finishMini('none'); } });
    } else if (mode === 'tap') {
      var need = Math.max(3, Math.round(5 / widen));
      m.onclick = function () {
        seq.taps++;
        var fill = document.getElementById('b4-miniFill');
        if (fill) fill.style.width = Math.min(100, seq.taps / need * 100) + '%';
        var tp = document.getElementById('b4-miniTip');
        if (tp) tp.textContent = '快速连点！ ' + seq.taps + ' / ' + need;
      };
      later(1200, function () {
        var g = seq.taps >= need ? 'perfect' : (seq.taps >= Math.max(2, need - 2) ? 'good' : 'none');
        miniTip(g);
        finishMini(g);
      });
    } else {
      m.onpointerdown = function (e) {
        if (e && e.preventDefault) e.preventDefault();
        if (seq.holding) return;
        seq.holding = true;
        seq.iv = setInterval(function () {
          seq.p += seq.dir * 3.2;
          if (seq.p >= 100) { seq.p = 100; seq.dir = -1; }
          if (seq.p <= 0) { seq.p = 0; seq.dir = 1; }
          var k = document.getElementById('b4-miniKnob');
          if (k) k.style.left = clamp(seq.p, 0, 97) + '%';
        }, 30);
      };
      var up = function (e) {
        if (e && e.preventDefault) e.preventDefault();
        if (!seq.holding || seq.grade) return;
        seq.holding = false;
        if (seq.iv) { clearInterval(seq.iv); seq.iv = null; }
        var lo = 62 - (widen - 1) * 7, hi = 85 + (widen - 1) * 7;
        var g = (seq.p >= lo && seq.p <= hi) ? 'perfect'
          : (Math.min(Math.abs(seq.p - lo), Math.abs(seq.p - hi)) <= 12 * widen ? 'good' : 'none');
        miniTip(g);
        finishMini(g);
      };
      m.onpointerup = up; m.onpointerleave = up; m.onpointercancel = up;
      later(1600, function () { if (!seq.holding && !seq.grade) { miniTip('none'); finishMini('none'); } });
      later(3000, up);
    }
  }
  function miniTip(grade) {
    var t = document.getElementById('b4-miniTip');
    if (!t) return;
    if (grade === 'perfect') t.textContent = '完美！命中大幅提升！';
    else if (grade === 'good') t.textContent = '不错！命中率提升了';
    else t.textContent = '自动出招！';
  }
  // 出招结算：命中 = 招式基础命中（70–90%）+ 小游戏加成（perfect +15 / good +8），封顶 100。
  // roll 传 0~1 便于测试固定结果；打空不扣体力、不造成伤害，敌方照常行动。
  function finishMini(grade, roll) {
    clearSeq(); // 收掉小游戏的自动判定 / 游标
    hideMini();
    seq.grade = grade;
    B.cheer = false; // 加油只对这一次出招生效
    var move = B.pendingMove;
    if (!move) return;
    var acc = Math.min(100, (move.acc || 80) + (grade === 'perfect' ? 15 : grade === 'good' ? 8 : 0));
    var hitRoll = (roll === undefined ? Math.random() : roll) * 100;
    if (hitRoll >= acc) {
      say('可惜，' + B.mine.name + ' 的 ' + move.name + ' 打空了！');
      later(animated() ? 620 : 60, enemyTurn);
      return; // 打空：不扣体力
    }
    B.mine.stamina = M.spend(B.mine.stamina, move);
    renderInfo();
    playerAttack(move, grade === 'perfect' ? 'perfect' : 'good');
  }

  // ===== F5 / F6 我方攻击：0–900ms 六步分镜 =====
  function playerAttack(move, grade) {
    B.phase = 'anim'; seq.busy = true;
    var ctx = {
      level: B.mine.level, attackerTypes: B.mine.types, defenderTypes: B.foe.types,
      grade: M.GRADE[grade], crit: Math.random() < move.crit,
      rand: 0.85 + Math.random() * 0.15
    };
    var dmg = M.damage(move, ctx);
    // 敌方上一回合「防守」：这一次受击伤害 -40%（与我方防守同一套机制）
    if (B.foeDefending) dmg = Math.max(1, Math.round(dmg * 0.6));
    B.foeDefending = false;
    var eff = M.typeEffect(move.type, B.foe.types);
    var capped = dmg >= M.DMG_CAP;
    var extra = grade === 'perfect' ? '打得漂亮！'
      : capped ? '极限一击！' : ctx.crit ? '命中要害！' : eff > 1 ? '效果拔群！' : '';
    var sc = $('scene');
    var anim = animated();
    say(B.mine.name + ' 使用了 ' + move.name + '！');
    cry(B.mine.dexNo);
    if (anim) {
      sc && sc.classList.add('atk-mine');
      later(250, function () {
        var f = $('fx');
        if (f) f.innerHTML = '<i class="b4-orb b4-orb--' + move.shape + '" style="background:' + move.color + '"></i>';
        sfx('sfxClick');
      });
      later(450, function () {
        sc && sc.classList.remove('atk-mine');
        sc && sc.classList.add('hit-foe', 'is-shake');
        sfx('sfxHit');
        if (extra) sfx('sfxSuper');
      });
    }
    later(anim ? 600 : 0, function () {
      B.foe.hp = Math.max(0, B.foe.hp - dmg);
      renderInfo();
      fxClear();
      floatNum('-' + dmg, 'foe', capped ? 'is-cap' : '');
      sc && sc.classList.remove('hit-foe', 'is-shake');
      say('野生的 ' + B.foe.name + ' 受到了 ' + dmg + ' 点伤害！' + (extra ? ' ' + extra : ''));
    });
    later(anim ? 900 : 60, function () {
      if (B.foe.hp <= 0) foeFaint();
      else enemyTurn();
    });
  }

  // ===== F7 / F8 敌方回合：镜像分镜，伤害 ×0.75 =====
  function enemyTurn() {
    if (!B || B.phase === 'end') return;
    B.phase = 'anim'; seq.busy = true;
    var move = M.enemyPick(B.foe.moves, B.foe.stamina);
    // 体力不足：敌方和我方一样不能出招，转为「防守」——不攻击、不扣体力，
    // 回合结算回体力 ×1.5，并让下一次我方攻击伤害 -40%。
    if (!move) {
      B.foeDefending = true;
      say('野生的 ' + B.foe.name + ' 体力不够，摆出了防御姿态！');
      renderInfo();
      later(animated() ? 700 : 120, nextRound);
      return;
    }
    B.foe.stamina = M.spend(B.foe.stamina, move);
    renderInfo();
    var foeMult = B.gym
      ? (APP.gymData.RULES.foeMult * B.gym.roles[B.gym.stage].mult) : 1;
    var dmg = M.damage(move, {
      level: B.foe.level, attackerTypes: B.foe.types, defenderTypes: B.mine.types,
      grade: M.GRADE.good, crit: Math.random() < move.crit,
      rand: 0.85 + Math.random() * 0.15, enemy: true, foeMult: foeMult
    });
    if (B.defending) dmg = Math.max(1, Math.round(dmg * 0.6)); // 防守：伤害 -40%
    var sc = $('scene'), anim = animated();
    say('野生的 ' + B.foe.name + ' 使用了 ' + move.name + '！');
    cry(B.foe.dexNo);
    if (anim) {
      sc && sc.classList.add('atk-foe');
      later(250, function () {
        var f = $('fx');
        if (f) f.innerHTML = '<i class="b4-orb b4-orb--back b4-orb--' + move.shape + '" style="background:' + move.color + '"></i>';
      });
      later(450, function () {
        sc && sc.classList.remove('atk-foe');
        sc && sc.classList.add('hit-mine', 'is-shake');
        sfx('sfxHit');
      });
    }
    later(anim ? 600 : 0, function () {
      B.mine.hp = Math.max(0, B.mine.hp - dmg);
      renderInfo();
      fxClear();
      floatNum('-' + dmg, 'mine');
      sc && sc.classList.remove('hit-mine', 'is-shake');
      say(B.mine.name + (B.defending ? ' 防守卸掉了部分冲击！' : '') + '受到了 ' + dmg + ' 点伤害！');
    });
    later(anim ? 900 : 60, function () {
      if (B.mine.hp <= 0) lose();
      else nextRound();
    });
  }

  // ===== F9 下一回合：双方各 +10 体力；任一方本回合防守则回复 ×1.5（+15） =====
  function nextRound() {
    if (!B) return;
    B.round++;
    var guard = B.defending;
    var foeGuard = B.foeDefending;   // 敌方防守同样回体力 ×1.5；标记留到下一次我方攻击再消费
    B.mine.stamina = guard
      ? Math.min(M.STAMINA_MAX, B.mine.stamina + Math.round(M.STAMINA_REGEN * 1.5))
      : M.regen(B.mine.stamina);
    B.foe.stamina = foeGuard
      ? Math.min(M.STAMINA_MAX, B.foe.stamina + Math.round(M.STAMINA_REGEN * 1.5))
      : M.regen(B.foe.stamina);
    B.defending = false;
    renderInfo();
    floatNum('+' + (guard ? Math.round(M.STAMINA_REGEN * 1.5) : M.STAMINA_REGEN), 'mine', 'is-st');
    sfx('sfxDing');
    later(animated() ? 480 : 60, showMenu);
  }

  // ===== F10 / F11 / F12 胜利与奖励 =====
  function foeFaint() {
    B.phase = 'anim'; seq.busy = true;
    var sc = $('scene');
    sc && sc.classList.add('faint-foe');
    sfx('sfxFaint');
    say((B.gym ? B.foe.name : '野生的 ' + B.foe.name) + ' 倒下了！');
    later(animated() ? 700 : 80, function () {
      if (B.gym) return gymStageWin();   // 道馆：逐场推进，奖励统一在全通/失败时结算
      var gained = 0, after = B.mine.beforeLv;
      try {
        gained = APP.store.addExp(30, '战斗胜利');
        after = partyInfo().level;
      } catch (e) {}
      try { APP.store.addShards(2, '战斗胜利'); } catch (e) {}
      try { APP.store.markSeen(B.foe.dexNo); } catch (e) {}
      B.gained = gained;
      renderInfo();
      sfx('sfxWin');
      if (cfg().celebrateOn && !isInk() && APP.events) APP.events.confetti();
      say('获得了胜利！' + B.mine.name + ' 得到了 ' + gained + ' 点经验！');
      later(animated() ? 900 : 80, function () {
        if (after > B.mine.beforeLv) levelUp(after);
        else end('win', gained);
      });
    });
  }

  // ===== 道馆三连战（v57）：职员 → 小 boss → 馆主，每场开场 HP / 体力回满 =====
  function startGym(gymId, master) {
    var G = APP.gymData;
    if (!G) return { ok: false, msg: '道馆数据未加载' };
    var g = G.get(gymId);
    var needLv = master ? g.u * 2 : g.u;   // 大师重战门槛 = 解锁 ×2，与道馆页文案一致
    // v60：解锁看「所有宝可梦里的最高等级」，不是当前主力（照顾对象会换）。
    var topLv = APP.store.maxPokemonLevel ? APP.store.maxPokemonLevel() : partyInfo().level;
    if (topLv < needLv) {
      return { ok: false, msg: '需要有宝可梦达到 Lv.' + needLv + ' 才能挑战' + g.n + (master ? '大师重战' : '') };
    }
    var gate = APP.store.canGym(gymId, !!master);
    if (!gate.ok) {
      var m = gate.reason === 'weekLimit' ? '本周 3 次道馆挑战已用完，下周一恢复'
        : gate.reason === 'cooldown' ? '挑战失败，还要等 ' + gate.waitDays + ' 天'
        : gate.reason === 'needClear' ? '先首通这间道馆，才能开启大师重战'
        : gate.reason === 'closed' ? '这间道馆今天不开放，周六日 8 馆全开'
        : gate.reason === 'todayUsed' ? '这间道馆今天已经挑战过啦，明天再来'
        : '暂时不能挑战这间道馆';
      return { ok: false, msg: m };
    }
    APP.store.consumeGym(gymId);
    var gy = {
      gymId: gymId, master: !!master, stage: 0, passed: 0,
      roles: G.roles(g, !!master), foes: G.foes(g), reward: null
    };
    try { APP.screens.catch.logic.switchTab('battle'); } catch (e) {}
    start({ gym: gy, foe: gy.foes[0], foeLv: gy.roles[0].lv, npc: gy.roles[0].name });
    return { ok: true };
  }

  function gymStageWin() {
    var gy = B.gym, G = APP.gymData, g = G.get(gy.gymId);
    gy.passed = gy.stage + 1;
    renderInfo();
    sfx('sfxWin');
    if (cfg().celebrateOn && !isInk() && APP.events) APP.events.confetti();
    if (gy.stage < 2) {
      var nx = gy.stage + 1;
      say('第 ' + (gy.stage + 1) + ' 场通过！下一位「' + gy.roles[nx].name +
        '」登场，双方 HP / 体力回满！');
      later(animated() ? 1200 : 150, function () {
        gy.stage = nx;
        // start() 每场重建 B：mine.hp / stamina 天然回到 100/100
        start({ gym: gy, foe: gy.foes[nx], foeLv: gy.roles[nx].lv, npc: gy.roles[nx].name });
      });
      return;
    }
    var grade = B.mine.hp >= 70 ? 'S' : (B.mine.hp >= 40 ? 'A' : 'B');
    var r = APP.store.gymFinish(gy.gymId, gy.master, 3, grade, true);
    gy.reward = r || { exp: 0, shards: 0, stars: 0, badge: '' };
    say('三连战全通！评级 ' + grade + '，' +
      (gy.reward.badge ? '获得「' + g.n + '」徽章！'
        : gy.reward.masterFirst ? '大师首通！额外获得心愿星！' : '大师重战完成！'));
    later(animated() ? 1000 : 100, function () { end('win', gy.reward.exp); });
  }

  function gymAbort() {
    var gy = B.gym;
    var r = APP.store.gymFinish(gy.gymId, gy.master, gy.passed, '—', false);
    gy.reward = r || { exp: 0, shards: 0, stars: 0, badge: '' };
    end('lose', gy.reward.exp);
  }
  function levelUp(lv) {
    var sc = $('scene');
    sc && sc.classList.add('is-levelup');
    sfx('sfxLevel');
    say(B.mine.name + ' 升到了等级 ' + lv + '！ ❤');
    later(animated() ? 1100 : 80, function () {
      sc && sc.classList.remove('is-levelup');
      end('win', B.gained === undefined ? 30 : B.gained);
    });
  }

  // ===== B3 逃跑 / B4 战败 =====
  function doRun() {
    if (!B) return;
    B.phase = 'anim'; seq.busy = true;
    var sc = $('scene');
    sc && sc.classList.add('is-run');
    say('成功逃走了！');
    later(animated() ? 650 : 80, function () { if (B.gym) return gymAbort(); end('run', 0); });
  }
  function lose() {
    B.phase = 'anim'; seq.busy = true;
    var sc = $('scene');
    sc && sc.classList.add('is-lose');
    sfx('sfxFaint');
    say(B.mine.name + ' 失去了战斗能力…回到了乐园');
    later(animated() ? 900 : 80, function () { if (B.gym) return gymAbort(); end('lose', 0); });
  }

  // ===== F13 结算 =====
  function end(kind, exp) {
    if (!B) return;
    B.result = kind;
    B.phase = 'end';
    seq.busy = false;
    clearSeq();
    var gy = B.gym;
    // 写战斗记录（时间 / 对手 / 结果 / 奖励），面板若开着会即时刷新
    try {
      APP.store.addBattleRecord({
        foeName: (gy ? '道馆·' : '') + B.foe.name, foeLv: B.foe.level, dexNo: B.foe.dexNo,
        result: kind,
        shards: gy ? ((gy.reward && gy.reward.shards) || 0) : (kind === 'win' ? 2 : 1),
        exp: kind === 'win' ? (exp || 30) : 0
      });
    } catch (e) {}
    renderBattleLog();
    // 战斗已结束：信息框让位给结算卡，避免压住名字 / HP 条
    var fi = $('ibFoe'), mi = $('ibMine');
    if (fi) fi.classList.add('is-hide');
    if (mi) mi.classList.add('is-hide');
    if (kind !== 'win' && !gy) {
      try { APP.store.addShards(1, kind === 'run' ? '战斗逃跑安慰' : '战斗战败安慰'); } catch (e) {}
    }
    var title, desc, btnText;
    if (gy) {
      var r = gy.reward || { exp: 0, shards: 0, stars: 0, badge: '' };
      if (kind === 'win') {
        title = '🏅 道馆全通！';
        desc = '经验 <b>+' + r.exp + '</b> / 碎片 <b>+' + r.shards + '</b>' +
          (r.stars ? '<br>心愿星 <b>+' + r.stars + ' ⭐</b>（≈ ¥' + (r.stars * 10) + '）' +
            (r.masterFirst ? ' · 大师首通 2 倍' : '') : '') +
          (r.badge ? '<br>🏅 徽章已收入'
            : r.masterFirst ? '' : '<br>大师重战完成');
        say('太棒了，三场都打赢了！');
      } else {
        title = '😢 道馆挑战失败';
        desc = '已通过 <b>' + gy.passed + '</b> 场：经验 <b>+' + r.exp + '</b> / 碎片 <b>+' + r.shards + '</b>' +
          '<br>本馆进入 <b>2 天冷却</b>，换个克制属性再来！';
        say('别灰心，准备好克制属性再来～');
      }
      btnText = '返回道馆';
    } else {
      title = kind === 'win' ? '🎉 打赢啦！' : kind === 'run' ? '🏃 成功逃走' : '😢 这次没赢';
      desc = kind === 'win'
        ? '获得 <b><i class="shard shard--sm"></i>2 碎片</b> / 经验 <b>+' + (exp || 30) + '</b>'
        : '安慰奖 <b><i class="shard shard--sm"></i>1 碎片</b><br>下次再来挑战～';
      say(kind === 'win' ? '这一场打得真棒！' : '辛苦啦，回去休息一下吧。');
      btnText = '退出战斗';
    }
    menuHtml([{ info: '第 ' + B.round + ' 回合<br>本场结束' }], 'is-single');
    // 「收工」和「再战一次」都是回 P0 场景，合并为一个按钮
    center(title, desc, [{ text: btnText, yes: true, act: 'end-exit' }]);
    // 战斗记录 / 经验 / 碎片 / 道馆徽章刚落地：立刻上云，不等 20 秒静默窗口
    if (APP.sync && APP.sync.criticalPush) APP.sync.criticalPush();
  }

  function doExit() {
    if (B && B.gym) {
      // 道馆结算后回第三页签并刷新列表（次数 / 徽章 / 冷却会变）
      try { APP.screens.catch.logic.switchTab('gym'); } catch (e) {}
      try { APP.screens.gym.refresh(); } catch (e) {}
      introBegin();
      return;
    }
    if (B && B.fromCatch) {
      // 把结算结果（win / lose / run）交给捕捉页：打赢才接着投球，战败 = 宝可梦跑掉
      try { APP.screens.catch.logic.backFromBattle(B.result); } catch (e) {}
    }
    introBegin(); // 回 P0 野外对战区（战斗结束的家）
  }

  // ===== 战斗记录：默认折叠面板，最近 5 天；分页保留但标题不再标注「每页 10 条」 =====
  var logPage = 0;
  function battleRecords() {
    try { return APP.store.get().battleLog || []; } catch (e) { return []; }
  }
  function fmtLogTs(ts) {
    var d = new Date(ts);
    return pad2(d.getMonth() + 1) + '-' + pad2(d.getDate()) + ' ' + pad2(d.getHours()) + ':' + pad2(d.getMinutes());
  }
  function toggleLog() {
    var p = document.getElementById('b4-log');
    if (!p) return;
    p.classList.toggle('is-open');
    if (p.classList.contains('is-open')) { logPage = 0; renderBattleLog(); }
  }
  function pageLog(dir) {
    var pages = Math.max(1, Math.ceil(battleRecords().length / 10));
    logPage = Math.min(pages - 1, Math.max(0, logPage + dir));
    renderBattleLog();
  }
  function renderBattleLog() {
    var el = document.getElementById('b4-logRows');
    if (!el) return;
    var recs = battleRecords();
    var per = 10, pages = Math.max(1, Math.ceil(recs.length / per));
    if (logPage >= pages) logPage = pages - 1;
    var rows = recs.slice(logPage * per, logPage * per + per);
    var BD = { win: '胜', lose: '负', run: '逃' };
    var h = '';
    if (!rows.length) {
      h = '<div class="b4-log__empty">还没有战斗记录，去打一场吧～</div>';
    } else {
      for (var i = 0; i < rows.length; i++) {
        var r = rows[i];
        var bd = BD[r.result] || BD.run;
        var bdCls = r.result === 'win' || r.result === 'lose' ? r.result : 'run';
        // 奖励统一「数量列 + 说明列」两列结构，胜负行的碎片与文字各自对齐
        var rw = r.result === 'win'
          ? '<span class="b4-log__rw-sh"><i class="shard shard--sm"></i>' + (r.shards || 0) + '</span>' +
            '<span class="b4-log__rw-ex">经验+' + (r.exp || 0) + '</span>'
          : (r.shards
              ? '<span class="b4-log__rw-sh"><i class="shard shard--sm"></i>' + r.shards + '</span>' +
                '<span class="b4-log__rw-ex">安慰奖</span>'
              : '<span class="b4-log__rw-sh">—</span><span class="b4-log__rw-ex">—</span>');
        h += '<div class="b4-log__row"><span class="b4-log__tm">' + fmtLogTs(r.ts) + '</span>' +
          '<span class="b4-log__foe">' + esc(r.foeName || '未知') + ' <small>Lv.' + (r.foeLv || 1) + '</small></span>' +
          '<span class="b4-log__bd b4-log__bd--' + bdCls + '">' + bd + '</span>' +
          '<span class="b4-log__rw">' + rw + '</span></div>';
      }
    }
    el.innerHTML = h;
    var pg = document.getElementById('b4-logPage');
    if (pg) pg.textContent = '第 ' + (logPage + 1) + ' / ' + pages + ' 页';
    var prev = document.getElementById('b4-logPrev'), next = document.getElementById('b4-logNext');
    if (prev) prev.disabled = logPage <= 0;
    if (next) next.disabled = logPage >= pages - 1;
  }

  // ===== 事件委托（挂在 host 上，用 onclick 属性避免重复 render 叠加监听）=====
  function onClick(e) {
    var t = e.target, node = null;
    if (t && t.getAttribute) {
      var a = t.getAttribute('data-bt');
      if (a) node = t;
      else if (t.closest) node = t.closest('[data-bt]');
    }
    if (!node || !node.getAttribute) return;
    var act = node.getAttribute('data-bt');
    if (!act) return;
    if (seq.busy && B && B.phase !== 'mini') return;   // 演出锁：禁连点
    if (act === 'start') return askStart();
    if (act === 'cancel') return showIdle();
    if (act === 'confirm') return doStartPaid();
    if (act === 'intro-npc') return introShowInvite();
    if (act === 'intro-cancel') return introCloseInvite();
    if (act === 'intro-confirm') return doStartPaid();
    if (act === 'intro-pick') return introOpenPicker(!intro.picker);
    if (act === 'intro-pick-done') return introOpenPicker(false);
    if (act.indexOf('intro-choose-') === 0) return introChoose(Number(act.slice(13)));
    if (act === 'intro-next') { rotShift = (rotShift + 1) % GROUP_COUNT; return introBegin(); }
    if (act === 'end-exit') { rotShift = (rotShift + 1) % GROUP_COUNT; return doExit(); }
    if (act === 'mini-hit') return;                    // 由 btn.onclick / pointer 处理
    if (act === 'log-toggle') return toggleLog();
    if (act === 'log-prev') return pageLog(-1);
    if (act === 'log-next') return pageLog(1);
    if (!B) return;
    if (act === 'menu-fight') return showMoves();
    if (act === 'menu-defend') return doDefend();
    if (act === 'menu-bag') return showBag();
    if (act === 'menu-run') return doRun();
    if (act === 'back') return showMenu();
    if (act === 'bag-potion') return usePotion();
    if (act === 'bag-cheer') return useCheer();
    if (act.indexOf('move-') === 0) {
      var slot = Number(act.slice(5));
      var move = B.mine.moves[slot - 1];
      if (move) { hideMovePanel(); startMini(move); }
    }
  }

  function mount(el) {
    if (!el) return;
    if (seq.busy && el.firstChild) return;   // 演出中不重建 DOM
    teardownIntro();                          // 清掉旧开场（含气泡轮播定时器）
    host = el;
    host.innerHTML = shellHtml();
    host.onclick = onClick;
    showIdle();          // 先铺战场骨架（兜底 / 信息框）
    introBegin();        // V6：切到外出战斗第一眼 = P0 野外对战区
  }

  function abort() {
    clearSeq();
    teardownIntro();
    hideMini(); hideCenter(); fxClear(); hideMovePanel();
    seq.busy = false;
    if (!host) return;
    showIdle();
  }

  // ===== V6 战斗开场：野外 NPC 邀战 → 入场动画 → 切正式战斗 =====
  // 仅做「开场演出」，真正的宝可梦对战仍由 start() 接管（对手 pokémon 取 randomFoe）。
  var NPCS = ['黄衣少年', '草帽女孩', '研究员大叔', '老奶奶', '背带裤小孩',
    '女警', '渔夫', '舞者女孩', '老爷爷', '庞克少年'];
  var GROUP_COUNT = 10, BG_COUNT = 9, SLOT_HOURS = 2;
  var rotShift = 0; // 「下个场景」按钮 / 战斗结束后自动换 NPC 的偏移量
  var MY_CHARS = [
    { name: '红帽少年', base: 'hero-1' },
    { name: '红裙少女', base: 'hero-2' },
    { name: '绿帽少年', base: 'hero-3' },
    { name: '橙帽少女', base: 'hero-4' }
  ];
  function pad2(n) { return ('0' + n).slice(-2); }
  function npcFull(i) { return 'assets/npc-v6/npc-' + pad2(i + 1) + '-full.png'; }
  function npcBust(i) { return 'assets/npc-v6/npc-' + pad2(i + 1) + '-bust.png'; }
  function heroFull(i) { return 'assets/npc-v6/' + MY_CHARS[i].base + '-full.png'; }
  // 选角格只有 64px：用内联 160px 小图，避免一次拉 4 张 1MB 级别的原图
  function heroBust(i) {
    var base = MY_CHARS[i].base;
    return (APP.HERO_BUST_ART && APP.HERO_BUST_ART[base])
      ? APP.HERO_BUST_ART[base] : 'assets/npc-v6/' + base + '-bust.png';
  }
  function bgFor(i) { return 'assets/pic/' + ((((i % BG_COUNT) + BG_COUNT) % BG_COUNT) + 1) + '.webp'; }
  function timeSlot() {
    var d = new Date();
    var slot = Math.floor(d.getHours() / SLOT_HOURS);
    var day = Math.floor((d - new Date(d.getFullYear(), 0, 0)) / 86400000);
    return (((day * 12 + slot) % GROUP_COUNT) + GROUP_COUNT) % GROUP_COUNT;
  }
  function getMyTrainer() {
    var t = 0;
    try { t = APP.store.settings().myTrainer; } catch (e) {}
    t = parseInt(t, 10);
    if (isNaN(t) || t < 0 || t >= MY_CHARS.length) t = 0;
    return t;
  }
  function setMyTrainer(i) {
    try { APP.store.setSetting('myTrainer', i); } catch (e) {}
  }

  var intro = null; // { root, rot, my, picker, bubbleIv, timer }
  var BUBBLES = ['要挑战我吗？', '哟，敢不敢打一场？', '我的宝可梦可强了！',
    '来比比谁的更厉害？', '赢了可是有奖励的哦～', '你都遇到哪些宝可梦了？',
    '今天的运气不错嘛！', '别看我笑嘻嘻，我可不弱！'];
  function stopIntroBubble() {
    if (intro && intro.bubbleIv) { clearInterval(intro.bubbleIv); intro.bubbleIv = null; }
  }
  function startIntroBubble() {
    if (!intro || !intro.root.parentNode) return;
    stopIntroBubble();
    var el = document.getElementById('b4-introBubble');
    if (!el) return;
    var i = Math.floor(Math.random() * BUBBLES.length);
    el.textContent = BUBBLES[i];
    intro.bubbleIv = setInterval(function () {
      if (!intro || !intro.root.parentNode) { stopIntroBubble(); return; }
      i = (i + 1) % BUBBLES.length;
      el.textContent = BUBBLES[i];
    }, 4500);
  }
  function teardownIntro() {
    stopIntroBubble();
    if (intro && intro.timer) clearTimeout(intro.timer);
    if (intro && intro.root && intro.root.parentNode) intro.root.parentNode.removeChild(intro.root);
    intro = null;
  }
  // 左上 HUD：战斗券 + 剩余战斗次数（两个徽章，口径与捕捉页 b3 一致）
  function introGateShort() {
    var g = APP.store.canPlay('battle');
    if (!g.ok) {
      return g.reason === 'cooldown' ? '今日休息，<b>' + g.waitDays + '</b> 天后可进行对战'
        : g.reason === 'holidayLimit' ? '今天次数用完' : '暂时不能出门';
    }
    if (g.demo) return '演示模式 · 不限次数';
    return g.left ? '剩余战斗次数 <b>' + g.left + '</b> 次' : '今日可入场';
  }
  function renderIntroHud() {
    var el = document.getElementById('b4-introHud');
    if (!el || !intro) return;
    var s = APP.store.get();
    var tk = (s.wallet && s.wallet.tickets && s.wallet.tickets.battle) || 0;
    el.innerHTML = '<span>⚔️ 战斗券 <b>' + tk + '</b> 张</span><span>' + introGateShort() + '</span>';
  }
  function introBegin() {
    var scene = $('scene');
    if (!scene) return;
    clearSeq(); hideCenter(); fxClear();
    teardownIntro();
    // P0 是野外场景：直接隐藏战斗舞台骨架，不再靠一张背景图去「盖住」它
    // （start() 重设 className 时会自动移除 is-intro，正式战斗恢复正常战场）
    scene.classList.add('is-intro');
    var rot = (timeSlot() + rotShift) % GROUP_COUNT, my = getMyTrainer();
    var root = document.createElement('div');
    root.className = 'b4-intro is-p0';
    root.id = 'b4-intro';
    root.innerHTML =
      '<div class="b4-intro__bg" style="background-image:url(' + bgFor(rot) + ')"></div>' +
      '<div class="b4-intro__hud" id="b4-introHud"></div>' +
      '<button type="button" class="b4-intro__next" data-bt="intro-next" title="换一个对手和场景">' +
        '<span class="b3-sign__spr">' +
          '<img class="b3-sign__img" src="assets/env/forest/sign_next.png" alt="下个场景">' +
        '</span>' +
        '<span class="b3-stone__label">下个场景</span>' +
      '</button>' +
      '<button type="button" class="b4-intro__npc" id="b4-introNpc" data-bt="intro-npc" title="点我开战">' +
        '<img src="' + npcFull(rot) + '" alt="' + esc(NPCS[rot]) + '"></button>' +
      '<div class="b4-intro__bubble" id="b4-introBubble"></div>' +
      '<div class="b4-intro__dlg" id="b4-introDlg">' +
        '<img class="b4-intro__portrait" src="' + npcBust(rot) + '" alt="">' +
        '<div class="b4-intro__say"><b>' + esc(NPCS[rot]) + '</b>：要来一决高下吗？' +
          '<div class="b4-intro__row">' +
            '<button type="button" class="b4-btn" data-bt="intro-cancel">下次吧</button>' +
            '<button type="button" class="b4-btn b4-btn--yes" data-bt="intro-confirm">开始对战</button>' +
          '</div></div>' +
      '</div>' +
      '<div class="b4-intro__stage" id="b4-introStage">' +
        '<div class="b4-runway">' +
          '<div class="b4-runway__half b4-runway__half--top"></div>' +
          '<div class="b4-runway__half b4-runway__half--bot"></div>' +
          '<div class="b4-runway__rail"></div>' +
          '<div class="b4-entry b4-entry--mine" id="b4-entryMine"></div>' +
          '<div class="b4-entry b4-entry--foe" id="b4-entryFoe"></div>' +
          '<div class="b4-curtain b4-curtain--t"></div><div class="b4-curtain b4-curtain--b"></div>' +
          '<div class="b4-tr b4-tr--foe"><img src="' + npcFull(rot) + '" alt=""></div>' +
          '<div class="b4-tr b4-tr--mine" id="b4-trMine"><img src="' + heroFull(my) + '" alt=""></div>' +
          '<div class="b4-ball b4-ball--a"></div><div class="b4-ball b4-ball--b"></div>' +
          '<img class="b4-pmrez b4-pmrez--foe" id="b4-rezFoe" alt="">' +
          '<img class="b4-pmrez b4-pmrez--mine" id="b4-rezMine" alt="">' +
          '<div class="b4-vs">VS</div>' +
          '<div class="b4-intro__cap" id="b4-introCap">入场动画中…</div>' +
        '</div>' +
      '</div>' +
      '<div class="b4-intro__picker" id="b4-introPicker"></div>' +
      '<div class="b4-intro__flash" id="b4-introFlash"></div>';
    scene.appendChild(root);
    intro = { root: root, rot: rot, my: my, picker: false, bubbleIv: null, timer: null };
    renderIntroHud();
    startIntroBubble();
  }
  // 点 NPC → P1 邀战卡：合并掉旧二级确认，门禁不满足则「开始对战」置灰
  function introShowInvite() {
    if (!intro) return;
    stopIntroBubble();
    renderIntroHud();   // 每次打开邀战卡都刷新券 / 次数，避免显示上一场的旧数字
    intro.root.classList.remove('is-p0'); intro.root.classList.add('is-p1');
    var dlg = document.getElementById('b4-introDlg');
    if (!dlg) return;
    var s = APP.store.get();
    var tk = (s.wallet && s.wallet.tickets && s.wallet.tickets.battle) || 0;
    var gate = APP.store.canPlay('battle');
    var ok = (gate.demo || tk >= 1) && gate.ok;
    var why = gate.demo ? '' : (tk < 1 ? '你目前没有战斗券，请先前往兑换' : (gate.ok ? '' : gateMsg(gate)));
    // 门禁不满足时，提醒由 NPC 直接说出口（卡片上方台词），不再放卡片底部红字；
    // 只有能开战时才显示消耗信息，避免「不能打」却还挂着「消耗 1 张战斗券」。
    var line = why || '要来一决高下吗？';
    dlg.innerHTML =
      '<img class="b4-intro__portrait" src="' + npcBust(intro.rot) + '" alt="">' +
      '<div class="b4-intro__say"><b>' + esc(NPCS[intro.rot]) + '</b>：' + esc(line) +
        (ok ? '<div class="b4-intro__meta">消耗 <b>1 张战斗券 + 1 次入场机会</b></div>' : '') +
        '<div class="b4-intro__row">' +
          '<button type="button" class="b4-btn" data-bt="intro-cancel">下次吧</button>' +
          '<button type="button" class="b4-btn b4-btn--yes" data-bt="intro-confirm"' + (ok ? '' : ' disabled') + '>开始对战</button>' +
        '</div>' +
      '</div>';
  }
  // P1「下次吧」→ 回 P0 场景，气泡继续轮播
  function introCloseInvite() {
    if (!intro) return;
    intro.root.classList.remove('is-p1'); intro.root.classList.add('is-p0');
    renderIntroHud();
    startIntroBubble();
  }
  function introShowEntrance() {
    if (!intro) return;
    intro.root.classList.remove('is-p1'); intro.root.classList.add('is-p2');
    if (intro.timer) clearTimeout(intro.timer);
    intro.timer = setTimeout(function () { if (alive()) introFlash(); }, animated() ? 1850 : 60);
  }
  function introFlash() {
    if (!intro) return;
    intro.root.classList.add('is-flash');
    later(animated() ? 480 : 30, function () {
      var f = intro && intro.foe, lv = intro && intro.foeLv, npcName = intro && NPCS[intro.rot]; // P2 锁定的对手带进正式战斗
      teardownIntro();
      start({ foe: f, foeLv: lv, npc: npcName });
    });
  }
  function introOpenPicker(v) {
    if (!intro) return;
    intro.picker = v;
    intro.root.classList.toggle('is-pick', v);
    var cap = document.getElementById('b4-introCap');
    if (v) {
      if (intro.timer) { clearTimeout(intro.timer); intro.timer = null; }
      if (cap) cap.textContent = '选择主角形象（4 位）· 选完点「完成」继续入场';
      renderIntroPicker();
    } else if (cap) {
      cap.textContent = '入场动画中…';
      if (intro.root.classList.contains('is-p2')) introShowEntranceResume();
    }
  }
  function introShowEntranceResume() {
    if (!intro) return;
    if (intro.timer) clearTimeout(intro.timer);
    intro.timer = setTimeout(function () { if (alive()) introFlash(); }, animated() ? 1850 : 60);
  }
  function renderIntroPicker() {
    if (!intro) return;
    var h = '<div class="b4-intro__pickhero"><img src="' + heroFull(intro.my) + '" alt=""></div>' +
      '<div class="b4-intro__pickpanel"><h4><span>选择主角形象（4 位）</span><button type="button" data-bt="intro-pick-done">完成</button></h4><div class="b4-intro__grid">';
    for (var i = 0; i < MY_CHARS.length; i++) {
      h += '<button type="button" class="b4-intro__it' + (i === intro.my ? ' is-on' : '') + '" data-bt="intro-choose-' + i + '">' +
        '<img src="' + heroBust(i) + '" alt=""><small>' + esc(MY_CHARS[i].name) + '</small></button>';
    }
    h += '</div></div>';
    var p = document.getElementById('b4-introPicker');
    if (p) p.innerHTML = h;
  }
  function introChoose(i) {
    if (!intro || i < 0 || i >= MY_CHARS.length) return;
    intro.my = i; setMyTrainer(i);
    var mine = document.getElementById('b4-trMine');
    if (mine) mine.innerHTML = '<img src="' + heroFull(i) + '" alt="">';
    renderIntroPicker();
  }

  APP.screens.battle = {
    mount: mount,
    start: start,
    startGym: startGym,
    abort: abort,
    isBusy: function () { return !!seq.busy; },
    logic: {
      state: function () { return { battle: B, seq: seq }; },
      cfg: cfg, animated: animated,
      startGym: startGym, gymStageWin: gymStageWin, gymAbort: gymAbort,
      showIdle: showIdle, askStart: askStart, doStartPaid: doStartPaid,
      start: start, showMenu: showMenu, showMoves: showMoves, showBag: showBag,
      startMini: startMini, finishMini: finishMini, playerAttack: playerAttack,
      enemyTurn: enemyTurn, nextRound: nextRound, foeFaint: foeFaint,
      doRun: doRun, lose: lose, end: end, doExit: doExit,
      usePotion: usePotion, useCheer: useCheer,
      renderInfo: renderInfo, partyInfo: partyInfo, gateMsg: gateMsg
    }
  };
})(window.APP);
