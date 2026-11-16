(function () {
  'use strict';

  var APP = window.APP;
  APP.screens = APP.screens || {};

  // B3 野外探险（捕捉玩法）：场景主题 + 躲藏点 + 59 只共享池 + 8 阶段抛球动画 + 收服小游戏。
  // 静态名单 / 属性色 / 大小归一 / 场景主题与躲藏点都在 js/data/catch-pools.js。
  // 数据层只走 store：扣券+入场计次、收录、碎片补偿、设置、图鉴「已遇到」。
  var D = APP.catchData;
  var GAME_NAMES = {
    off: '不做小游戏',
    timing: '① 球上蓄力',
    tap: '② 连点挣脱',
    hold: '③ 滑条蓄力'
  };
  // 第 12 轮：小游戏开始前的 3-2-1 倒计时（每步毫秒 / 「开始！」停留）
  var COUNT_STEP = 600, COUNT_GO = 480, GAME_WINDOW = 3000;

  var rootEl = null;
  var cur = null;
  var slotPick = null;
  var pendingCatch = null;   // 战斗中的捕捉上下文：打赢后要接着投球
  var sceneThemeKey = null;   // 本轮随机抽到的场景主题 key（供测试只读读取）
  var activeTab = 'catch';   // 当前出门页签：catch / battle / train
  var seq = { busy: false, timers: [], bonus: 0, clicked: false, tTarget: 0, decay: null, iv: null, holding: false };

  function $(id) { return document.getElementById('b3-' + id); }
  function pad3(n) { return APP.pad3(n); }
  function isInk() { return document.body.classList.contains('ink'); }

  function cfg() {
    var s = {};
    try { s = APP.store.settings() || {}; } catch (e) {}
    var mode = s.catchGameMode || 'timing';
    if (!GAME_NAMES[mode]) mode = 'timing';
    return {
      soundOn: s.soundOn !== false,
      celebrateOn: s.celebrateOn !== false,
      animOn: s.catchAnimOn !== false,
      gameMode: mode
    };
  }

  function alive() { return !!(rootEl && rootEl.parentNode && $('scene')); }
  function later(ms, fn) {
    seq.timers.push(setTimeout(function () { if (alive()) fn(); }, ms));
  }
  function esc(t) {
    return String(t === undefined || t === null ? '' : t)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  function ownedSet() {
    var s = APP.store.get(), o = {};
    (s.pokemon || []).forEach(function (p) { if (p && p.dexNo) o[pad3(p.dexNo)] = 1; });
    // 初始皮卡丘在 pokemon 里、不在 catches 里，两个来源都要算「已拥有」
    (s.catches || []).forEach(function (c) { if (c && c.dexNo) o[pad3(c.dexNo)] = 1; });
    return o;
  }

  function badges(types) {
    var h = '';
    for (var i = 0; i < types.length; i++) {
      var t = D.TYPES[types[i]] || { zh: types[i], color: '#999' };
      h += '<span class="b3-tp" style="background:' + t.color + '">' + t.zh + '</span>';
    }
    return h;
  }

  // ===== 页面骨架：GBA 掌机外壳内拼像素场景（与乐园页同一套素材） =====
  function propsHtml() {
    var p = [
      [1, -23, 77, 89, 706], [27, -20, 33, 68, 47], [63, -19, 55, 66, 157],
      [87, -21, 43, 61, 0], [48, -14, 26, 65, 216],
      [0, 56, 34, 35, 355], [88, 8, 29, 38, 673], [3, 84, 30, 21, 439],
      [79, 82, 37, 28, 473], [22, 88, 35, 24, 594], [64, 90, 36, 25, 633],
      [91, 73, 35, 32, 555], [8, 73, 37, 30, 514]
    ];
    var h = '';
    for (var i = 0; i < p.length; i++) {
      var o = p[i];
      h += '<div class="b3-prop" style="left:' + o[0] + '%;top:' + o[1] + '%;width:' + o[2] +
        'px;height:' + o[3] + 'px;background-position:-' + o[4] + 'px 0"></div>';
    }
    return h;
  }

  function hideHtml() {
    // [中心点%, 距顶 px]：CSS 用 translateX(-50%) 让 left 指中心，场景任意宽度都整体居中
    // 第 9 轮：三点统一下移到 top:150px（场景固定 420px 高），用 px 不用百分比，
    // 这样任何屏宽下三个躲藏点都落在同一条水平线上，编号框自然齐平。
    var pos = [[16, 150], [50, 150], [82, 150]], h = '';
    for (var i = 0; i < 3; i++) {
      h += '<div class="b3-hide" id="b3-hide-' + (i + 1) + '" data-slot="' + (i + 1) +
        '" style="left:' + pos[i][0] + '%;top:' + pos[i][1] + 'px">' +
        '<div class="b3-hide__halo"></div>' +
        '<i class="b3-hide__spark b3-hide__spark--1"></i>' +
        '<i class="b3-hide__spark b3-hide__spark--2"></i>' +
        '<i class="b3-hide__spark b3-hide__spark--3"></i>' +
        '<div class="b3-hide__inner"><img class="b3-hide__img" alt=""></div>' +
        '<div class="b3-hide__label"></div></div>';
    }
    return h;
  }

  // ===== 页面骨架：顶部置顶三页签 + 三个专属场景 =====
  var TABS = [
    ['catch', '🔍', '外出捕捉', '去探险找宝可梦'],
    ['battle', '⚔️', '外出战斗', '去赢一场'],
    ['gym', '🏅', '道馆挑战', '三连战赢心愿星']
  ];

  // 分阶段解锁：外出战斗 Lv.7 / 道馆挑战 Lv.10（外出捕捉随「探险」页在 Lv.5 一起开放）
  var SUBTAB_REQ = {
    battle: { level: 7, name: '外出战斗', req: '主力宝可梦达到 7 级' },
    gym: { level: 10, name: '道馆挑战', req: '主力宝可梦达到 10 级' }
  };
  function subTabLocked(name) {
    var r = SUBTAB_REQ[name];
    if (!r || !APP.unlock || !APP.unlock.gate) return false;
    return !APP.unlock.gate(name);
  }
  function lockTip(name) {
    var r = SUBTAB_REQ[name];
    return r ? 'Lv.' + r.level + ' 解锁' : '';
  }

  function tabsHtml() {
    var h = '';
    for (var i = 0; i < TABS.length; i++) {
      var o = TABS[i];
      var locked = subTabLocked(o[0]);
      h += '<button type="button" class="b3-tab' + (o[0] === activeTab ? ' is-on' : '') + (locked ? ' is-locked' : '') +
        '" data-b3-tab="' + o[0] + '"' + (locked ? ' aria-disabled="true"' : '') + '>' +
        '<span class="b3-tab__i">' + (locked ? '🔒' : o[1]) + '</span>' +
        '<span class="b3-tab__t">' + o[2] + '</span>' +
        '<span class="b3-tab__s">' + (locked ? lockTip(o[0]) : o[3]) + '</span></button>';
    }
    return '<div class="b3-tabs" id="b3-tabs">' + h + '</div>';
  }

  function partyDex() {
    try {
      var list = (APP.store.listParty && APP.store.listParty()) || [];
      if (list.length && list[0] && list[0].dexNo) return pad3(list[0].dexNo);
    } catch (e) {}
    return '025';
  }

  // 道馆挑战：整页交给 js/screens/gym.js 渲染，这里只留一个挂载点
  function gymPaneHtml() {
    return '<div class="b3-gym" id="b3-gym-root"></div>';
  }

  function battleBusy() {
    return !!(APP.screens.battle && APP.screens.battle.isBusy && APP.screens.battle.isBusy());
  }

  function pageHtml() {
    return '<section class="b3-page" id="b3-page">' +
      tabsHtml() +
      '<div class="b3-pane' + (activeTab === 'catch' ? ' is-on' : '') + '" id="b3-pane-catch">' +
        '<div class="b3-shell">' +
          '<div class="b3-shell__top"><span class="b3-shell__led"></span><span>POWER</span></div>' +
          '<div class="b3-scene" id="b3-scene">' +
            '<div class="b3-scbg" id="b3-scbg"></div>' +
            '<div class="b3-scloc" id="b3-scloc"></div>' +
            hideHtml() +
            '<div class="b3-corner">' +
              '<span class="b3-hud__i"><i class="pkball"></i> 精灵球 <b id="b3-tk">0</b> 个</span>' +
              '<span class="b3-hud__i" id="b3-left"></span>' +
            '</div>' +
            '<div class="b3-signrow">' +
              '<div class="b3-sign b3-stone" id="b3-stone" title="随机选择">' +
                '<div class="b3-stone__spr" style="width:42px;height:35px;background-position:-393px 0"></div>' +
                '<div class="b3-stone__label">投石问路</div>' +
              '</div>' +
              '<div class="b3-sign b3-sign--next" id="b3-shuffle" data-b3="shuffle" title="换场景">' +
                '<div class="b3-sign__spr">' +
                  '<img class="b3-sign__img" src="assets/env/forest/sign_next.png" alt="下个路口">' +
                '</div>' +
                '<div class="b3-stone__label">下个路口</div>' +
              '</div>' +
            '</div>' +
            '<button type="button" class="b3-setgear" id="b3-setBtn" aria-label="设置" title="设置">' +
              '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M19.14 12.94a7.07 7.07 0 0 0 .05-.94 7.07 7.07 0 0 0-.05-.94l2.03-1.58a.5.5 0 0 0 .12-.62l-1.92-3.32a.5.5 0 0 0-.6-.22l-2.39.96a7.3 7.3 0 0 0-1.62-.94L14.4 2.8a.5.5 0 0 0-.5-.4h-3.84a.5.5 0 0 0-.5.4l-.36 2.54a7.3 7.3 0 0 0-1.62.94l-2.39-.96a.5.5 0 0 0-.6.22L2.67 8.86a.5.5 0 0 0 .12.62l2.03 1.58a7.07 7.07 0 0 0 0 1.88l-2.03 1.58a.5.5 0 0 0-.12.62l1.92 3.32c.13.22.39.3.6.22l2.39-.96c.5.4 1.04.71 1.62.94l.36 2.54c.04.23.24.4.5.4h3.84c.26 0 .46-.17.5-.4l.36-2.54c.58-.23 1.12-.54 1.62-.94l2.39.96c.22.08.47 0 .6-.22l1.92-3.32a.5.5 0 0 0-.12-.62l-2.03-1.58ZM12 15.6A3.6 3.6 0 1 1 12 8.4a3.6 3.6 0 0 1 0 7.2Z"/></svg>' +
            '</button>' +
            '<div class="b3-wild" id="b3-wild"><div class="b3-wild__pop"><div class="b3-wild__frame"><img alt=""></div><div class="b3-wild__tag"></div></div></div>' +
            '<div class="b3-stage__veil" id="b3-stageVeil"></div>' +
            '<div class="b3-count" id="b3-count"></div>' +
            '<div class="b3-ball" id="b3-ball">' +
              '<div class="b3-ball__glow"></div><div class="b3-ball__beam"></div><div class="b3-ball__ding"></div>' +
              '<div class="b3-ball__fx"><i class="b3-ball__fx--a"></i><i class="b3-ball__fx--b"></i><i class="b3-ball__fx--c"></i></div>' +
              '<div class="b3-ball__shadow"></div><div class="b3-ball__shine"></div>' +
              '<div class="b3-ball__top"></div><div class="b3-ball__bot"></div>' +
              '<div class="b3-ball__btn"></div><div class="b3-ball__ring"></div>' +
              '<div class="b3-ball__charge"></div><div class="b3-ball__zone"></div>' +
              '<i class="b3-ball__spark b3-ball__spark--1"></i><i class="b3-ball__spark b3-ball__spark--2"></i>' +
              '<i class="b3-ball__spark b3-ball__spark--3"></i><i class="b3-ball__spark b3-ball__spark--4"></i>' +
            '</div>' +
            // 第 13 轮：全屏操作层。准备期铺冷灰蒙版只显示「先别按」，蓄力期透明并接管整屏按住/连点。
            '<div class="b3-pad" id="b3-pad">' +
              '<div class="b3-pad__hand">👈</div>' +
              '<div class="b3-pad__go">按住屏幕任意位置！</div>' +
            '</div>' +
            '<div class="b3-game" id="b3-game"></div>' +
            '<div class="b3-dialog" id="b3-dialog"><h3 id="b3-dlgTitle"></h3><p id="b3-dlgBody"></p>' +
              '<div class="b3-dialog__row" id="b3-dlgRow"></div></div>' +
            '<div class="b3-resthint" id="b3-restHint" aria-live="polite"></div>' +
          '</div>' +
        '</div>' +
      '</div>' +
      '<div class="b3-pane' + (activeTab === 'battle' ? ' is-on' : '') + '" id="b3-pane-battle"><div id="b3-battle-root"></div></div>' +
      '<div class="b3-pane' + (activeTab === 'gym' ? ' is-on' : '') + '" id="b3-pane-gym">' + gymPaneHtml() + '</div>' +
      '<div class="b3-setmask" id="b3-setmask"><div class="b3-setdlg" id="b3-setdlg"></div></div>' +
      '<div class="b3-drawer" id="b3-drawer"><h2><span id="b3-drawerTitle"></span>' +
        '<button type="button" class="b3-drawer__close" data-b3="drawer-close">关闭</button></h2>' +
        '<div id="b3-drawerBody"></div></div>' +
    '</section>';
  }

  // 页签切换：三个场景常驻 DOM，只切显示，不重建（捕捉动画状态不受影响）
  function switchTab(name) {
    if (name !== 'catch' && name !== 'battle' && name !== 'gym') return;
    if (seq.busy || battleBusy()) { toast('动画播放中，稍等一下'); return; }
    if (name === activeTab) return;
    activeTab = name;
    if (!alive()) return;
    var tabs = rootEl.querySelectorAll('.b3-tab');
    for (var i = 0; i < tabs.length; i++) {
      tabs[i].classList.toggle('is-on', tabs[i].getAttribute('data-b3-tab') === name);
    }
    ['catch', 'battle', 'gym'].forEach(function (k) {
      $('pane-' + k).classList.toggle('is-on', k === name);
    });
    abort(); // 切场景时收干净残留弹层 / 定时器
  }

  // 与图鉴页同款：动态量顶栏高度，保证页签 sticky 的位置准确
  function syncStickyTop() {
    try {
      var bar = document.querySelector ? document.querySelector('.appbar') : null;
      var h = bar && bar.offsetHeight ? bar.offsetHeight : 64;
      if (document.documentElement && document.documentElement.style &&
          document.documentElement.style.setProperty) {
        document.documentElement.style.setProperty('--appbar-h', h + 'px');
      }
    } catch (err) {}
  }

  // ===== HUD / 入场门禁 =====
  function gateText(g) {
    if (!g.ok) {
      if (g.reason === 'cooldown') return '今日休息，' + g.waitDays + ' 天后可进行捕捉';
      if (g.reason === 'holidayLimit') return '今天次数用完';
      return '暂时不能出门';
    }
    if (g.demo) return '演示模式 · 不限次数';
    return g.left ? '剩余捕捉次数 ' + g.left + ' 次' : '今日可入场';
  }

  // 系统 toast 用简短口径，与战斗页 gateToast 对齐（NPC 台词另走 restHintLine）
  function gateToast(g) {
    if (g.reason === 'cooldown') return '今日休息，' + g.waitDays + ' 天后可进行捕捉';
    if (g.reason === 'holidayLimit') return '今天的入场次数用完啦';
    return '暂时不能出门';
  }

  // HUD 用 HTML：所有数字（N 次 / N 天）统一包 <b>，样式与战斗页 HUD 数字一致
  function gateHtml(g) {
    return esc(gateText(g)).replace(/(\d+)(?=\s*(?:次|天))/g, '<b>$1</b>');
  }

  // 场景中央「无法捕捉」提示：固定「向导」+ 黄衣少年半身像，三态各一句台词。
  // 返回台词 HTML；可捕捉时返回空串（隐藏）。
  function restHintLine(g, tk) {
    if (g.demo) return '';
    if (tk < 1) return '<b>向导</b>：你目前没有精灵球，请先前往兑换';
    if (!g.ok) {
      if (g.reason === 'cooldown') {
        return '<b>向导</b>：今天休息，无法捕捉，等 <em>' + Number(g.waitDays) +
          '</em> 天后再来找我吧！';
      }
      if (g.reason === 'holidayLimit') {
        return '<b>向导</b>：你今天已经没有捕捉次数，请明天再来探索吧！';
      }
      return '<b>向导</b>：暂时不能出门，请稍后再来找我吧！';
    }
    return '';
  }

  function renderRestHint(g, tk) {
    var box = $('restHint');
    if (!box) return;
    var line = restHintLine(g, tk);
    if (box.getAttribute('data-line') === line) return; // 状态不变时不重建，淡入只播一次
    box.setAttribute('data-line', line);
    if (!line) { box.className = 'b3-resthint'; box.innerHTML = ''; return; }
    box.innerHTML = '<img class="b3-resthint__face" src="assets/npc-v6/npc-01-bust.png" alt="">' +
      '<div class="b3-resthint__say">' + line + '</div>';
    box.className = 'b3-resthint is-a is-on';
  }

  function sync() {
    if (!alive()) return;
    var s = APP.store.get();
    var tk = (s.wallet && s.wallet.tickets && s.wallet.tickets.capture) || 0;
    var g = APP.store.canPlay('capture');
    $('tk').textContent = tk;
    $('left').innerHTML = gateHtml(g);
    renderRestHint(g, tk);
    var off = tk < 1 || !g.ok;
    $('stone').classList.toggle('is-off', off);
    for (var j = 1; j <= 3; j++) $('hide-' + j).classList.toggle('is-off', off);
  }

  // 每轮随机抽一个场景主题，把该主题的 3 个躲藏点随机摆进 3 个固定槽位；演出中不换。
  function applyScene() {
    if (!alive()) return;
    var t = D.THEMES[Math.floor(Math.random() * D.THEMES.length)];
    sceneThemeKey = t.key;
    $('scbg').style.backgroundImage = 'url(' + t.scene + ')';
    $('scloc').textContent = t.name;
    // 3 个躲藏点随机排序后落到 3 个槽位（每次都不重样）
    var order = [0, 1, 2], i, k;
    for (i = order.length - 1; i > 0; i--) {
      k = Math.floor(Math.random() * (i + 1)); var tmp = order[i]; order[i] = order[k]; order[k] = tmp;
    }
    for (var s = 0; s < 3; s++) {
      var g = $('hide-' + (s + 1));
      g.querySelector('.b3-hide__img').src = t.hides[order[s]];
      g.querySelector('.b3-hide__label').innerHTML = '<span class="b3-hide__num">' + D.SLOT_MARK[s] + '</span>';
      g.title = t.name + '的躲藏点';
      g.classList.remove('is-still', 'is-rustle', 'is-active');
    }
  }

  // ===== 轻提示 / 像素对话框 =====
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

  function dialog(title, body, buttons) {
    $('dlgTitle').textContent = title;
    $('dlgBody').innerHTML = body;
    var h = '';
    for (var i = 0; i < buttons.length; i++) {
      h += '<button type="button" class="b3-dbtn' + (buttons[i].yes ? ' b3-dbtn--yes' : '') +
        '" data-i="' + i + '">' + buttons[i].text + '</button>';
    }
    $('dlgRow').innerHTML = h;
    $('dlgRow').onclick = function (e) {
      var i = e.target.getAttribute && e.target.getAttribute('data-i');
      if (i === null || i === undefined) return;
      hideDialog();
      buttons[Number(i)].fn();
    };
    $('dialog').classList.add('is-on');
  }
  function hideDialog() { if ($('dialog')) $('dialog').classList.remove('is-on'); }

  function resetStage() {
    for (var t = 0; t < seq.timers.length; t++) clearTimeout(seq.timers[t]);
    seq.timers = [];
    endGame();
    if (rootEl) rootEl.classList.remove('is-busy');
    if (!alive()) return;
    var gs = rootEl.querySelectorAll('.b3-hide');
    for (var i = 0; i < gs.length; i++) {
      gs[i].classList.remove('is-still', 'is-rustle', 'is-active');
    }
    $('wild').className = 'b3-wild';
    $('ball').className = 'b3-ball';
    $('game').className = 'b3-game';
    var c = $('count');
    if (c) { c.classList.remove('is-on', 'is-pop'); c.innerHTML = ''; }
    if ($('scene')) $('scene').classList.remove('is-prep', 'is-live');
    if ($('pad')) $('pad').className = 'b3-pad';
    exitStage();
  }

  // 一轮探索结束：收干净演出、换一个场景主题（不自动选点、不自动弹确认框）
  function closeRound() {
    resetStage();
    applyScene();
    seq.busy = false;
    sync();
  }

  // 捕捉结果弹窗的两个出口：「关闭」回乐园 tab；「继续探索」只换场景，等用户自己点躲藏点
  function resultBtns() {
    return [
      { text: '关闭', fn: function () { closeRound(); gotoRanch(); } },
      { text: '继续探索', yes: true, fn: function () { closeRound(); } }
    ];
  }
  function gotoRanch() {
    try { window.location.hash = '#/ranch'; } catch (e) {}
  }

  // 切走页面时把所有定时器 / 小游戏收干净，避免回调打到已被替换的 DOM
  function abort() {
    resetStage();
    hideDialog();
    if ($('drawer')) $('drawer').classList.remove('is-on');
    if ($('setmask')) $('setmask').classList.remove('is-on');
    seq.busy = false;
  }

  // ===== 捕捉流程 =====
  function canAsk() {
    return alive() && activeTab === 'catch' && !seq.busy && !$('dialog').classList.contains('is-on') &&
      !$('setmask').classList.contains('is-on') && !$('drawer').classList.contains('is-on');
  }

  function askConsume(slot) {
    if (!canAsk()) return;
    var s = APP.store.get();
    var tk = (s.wallet && s.wallet.tickets && s.wallet.tickets.capture) || 0;
    var g = APP.store.canPlay('capture');
    if (!g.demo && tk < 1) { toast('精灵球不够啦，先去兑换中心', true); return; }
    if (!g.ok) { toast(gateToast(g), true); return; }
    slotPick = slot || null;
    // 第 10 轮：弹窗只留「消耗 1 次探索机会」这一句；稀有度 / 先打一场等规则统一放到设置里的「规则」
    dialog('探索宝可梦躲藏点？',
      '探索这个宝可梦躲藏点，将消耗 1 次探索机会。',
      [{ text: '再想想', fn: function () {} },
       { text: '立即探索', yes: true, fn: function () {
         var r = APP.store.spendTicket('capture');
         if (!r.ok) { toast(r.msg, true); return; }
         startCatch();
       } }]);
  }

  function pickTier(r) {
    if (r < D.TIER_ODDS.common) return 'common';
    if (r < D.TIER_ODDS.common + D.TIER_ODDS.uncommon) return 'uncommon';
    return 'rare';
  }

  // 第 9 轮：稀有度决定「会不会先打一场」——常见 0% / 少见 50% / 稀有 100%。
  // 已捕捉过的宝可梦不看稀有度，必定直接开战（保持原规则）。
  function battleOdds(tier) {
    var o = D.TIER_BATTLE_ODDS && D.TIER_BATTLE_ODDS[tier];
    return typeof o === 'number' ? o : 0;
  }
  function needBattle(tier, dup) {
    if (dup) return true;
    var o = battleOdds(tier);
    return o > 0 && Math.random() < o;
  }

  function startCatch() {
    resetStage();
    hideDialog();
    var tier = pickTier(Math.random());
    var pool = D.POOLS[tier];
    var one = pool[Math.floor(Math.random() * pool.length)];
    var slot = slotPick || (1 + Math.floor(Math.random() * 3));
    var no = pad3(one.id);
    cur = { tier: tier, slot: slot, id: one.id, no: no, name: one.zh,
            types: one.types, dup: !!ownedSet()[no] };
    cur.battle = needBattle(cur.tier, cur.dup); // 少见 50% / 稀有 100%：先打一场才能投球
    APP.store.markSeen(one.id); // 图鉴「已遇到」点亮
    sync();

    seq.busy = true;
    rootEl.classList.add('is-busy');
    var gs = rootEl.querySelectorAll('.b3-hide');
    var g = $('hide-' + slot);
    for (var i = 0; i < gs.length; i++) {
      if (Number(gs[i].getAttribute('data-slot')) !== slot) gs[i].classList.add('is-still');
    }
    g.classList.add('is-rustle', 'is-active'); // 只有被选中的那片会动
    later(700, function () {
      g.classList.remove('is-rustle');
      var w = showWild(slot);
      later(700, function () {
        if (cur.battle) battleChallenge(no, g, w);
        else throwBall(no, g, w);
      });
    });
  }

  // 把野生宝可梦摆到指定躲藏点上（战斗打回来后要重摆一次）
  function showWild(slot) {
    var g = $('hide-' + slot);
    g.classList.remove('is-still', 'is-rustle');
    g.classList.add('is-active');   // 战斗回来后，被选中的那片仍是高亮的那片
    var w = $('wild'), sc = $('scene'), cx = g.offsetLeft, half = 95; // left 已是中心点（translateX(-50%)），不再加半宽
    // 宝可梦（球会跟随 w.style.left）正对选中的躲藏点；宽名字条单独夹到安全区，避免被场景裁掉
    var safe = Math.max(half + 4, Math.min(sc.clientWidth - half - 4, cx));
    w.style.left = cx + 'px';
    // 第 12 轮：统一显示大小 + 不再被裁。
    // 旧算法按整幅画布缩放到 120x82 框内：留白多的宝可梦显小、内容大的显大（实测差 2 倍以上），
    // 而且用的是静态图 bbox（PM_FIT），比动画单帧小 4~7px，动画播到边缘就被裁掉。
    // 新算法：k 由「单帧可见内容的最长边」决定（PM_FRAME，离线逐帧实测），
    // 所有宝可梦单帧显示大小一致；整幅画布按 k 缩放后完整落在 120x92 框内 → 任何一帧都不裁。
    var fit = D.PM_FIT[cur.no] || [40, 40, 0, 0, 40, 40];
    var fr = D.PM_FRAME[cur.no] || Math.max(fit[4], fit[5]);
    var k = Math.min(54 / fr, (120 - 6) / fit[0], (92 - 6) / fit[1]);
    var im = w.querySelector('img');
    im.style.width = (fit[0] * k) + 'px';
    im.style.height = (fit[1] * k) + 'px';
    im.style.left = ((120 - fit[0] * k) / 2) + 'px';
    im.style.top = ((92 - fit[1] * k) / 2) + 'px';
    im.src = D.GIF_BASE + cur.no + '.gif';
    var tag = w.querySelector('.b3-wild__tag');
    tag.innerHTML = 'No.' + cur.no + ' ' + esc(cur.name) + ' ' + badges(cur.types);
    tag.style.position = 'relative';
    tag.style.left = (safe - cx) + 'px';
    w.className = 'b3-wild is-on';
    return w;
  }

  // 战斗入口：已拥有（必定开战）或稀有度触发（少见 50% / 稀有 100%）。
  // 战斗逻辑与「外出战斗 / 道馆挑战」同一套 B4 对战模块。
  function battleChallenge(no, g, w) {
    APP.audio.playCry(cur.id);
    var foe = { dexNo: cur.id, name: cur.name, types: cur.types };
    var isDup = cur.dup;
    dialog(isDup ? '它发起挑战！' : '触发战斗',
      isDup
        ? 'No.' + no + ' <b>' + esc(cur.name) + '</b> 已经捕捉，无法重复捕捉。<br>它向我们发起了战斗，请做好战斗准备。'
        : 'No.' + no + ' <b>' + esc(cur.name) + '</b> 向你发起战斗，<br>必须打赢它，才能进行捕捉！',
      [{ text: '逃跑', fn: function () {
          if (isDup) { closeRound(); return; }
          pendingCatch = null;
          escapeDialog('run');
        } },
       { text: '立即迎战', yes: true, fn: function () {
          if (isDup) closeRound();                       // 老流程：进战斗前先收干净本轮捕捉演出
          else pendingCatch = { no: no, slot: cur.slot, g: g }; // 打赢后接着投球
          switchTab('battle');
          if (APP.screens.battle) APP.screens.battle.start({ foe: foe, fromCatch: true });
        } }]);
    sync();
    seq.busy = false;
    rootEl.classList.remove('is-busy');
    g.classList.remove('is-rustle');
    w.className = 'b3-wild is-on';
  }

  // 战斗结算后回到捕捉页：打赢才能继续投球；战败 / 逃跑 = 宝可梦跑掉
  function backFromBattle(result) {
    if (!alive()) return;
    switchTab('catch');
    var p = pendingCatch;
    pendingCatch = null;
    if (!p) { closeRound(); return; }        // 已拥有的老流程：打完就收工
    if (result === 'win') {
      var w = showWild(p.slot);
      throwBall(p.no, p.g, w);
      return;
    }
    escapeDialog(result === 'run' ? 'run' : 'lose');
  }

  // 战斗没赢：宝可梦跑掉
  function escapeDialog(kind) {
    var w = $('wild');
    if (w) w.className = 'b3-wild';
    dialog(kind === 'run' ? '你逃走了…' : '跑掉了…',
      esc(cur.name) + (kind === 'run' ? ' 趁你不注意跑掉了。' : ' 战败后钻回躲藏点里了。'),
      resultBtns());
    sync();
    seq.busy = false;
    rootEl.classList.remove('is-busy');
    if (APP.sync && APP.sync.criticalPush) APP.sync.criticalPush();
  }

  // ===== 聚光舞台（第 11 轮）：球闭合后进入「浅灰底 + 中间大球 + 缩放光环」舞台 =====
  // 两套配色随机出：A 暖金 / B 冷白蓝（写进场景的 data-fx）。
  // 墨水屏不铺浅灰底（那边也没动画），维持原来的小球老样子。
  function enterStage(b) {
    var sc = $('scene');
    if (!sc || isInk()) return;
    sc.setAttribute('data-fx', Math.random() < .5 ? 'a' : 'b');
    sc.classList.add('is-stage');
    b.classList.add('is-big');
    b.style.left = '50%';
  }
  function exitStage() {
    var sc = $('scene');
    if (!sc) return;
    sc.classList.remove('is-stage');
    sc.removeAttribute('data-fx');
  }

  // ===== 第 12 轮：3-2-1 倒计时 =====
  // 无论选哪种捕捉方案，小游戏开始前都先数三下并给出玩法提示，
  // 让小朋友知道「马上要做什么、按哪里」，再开放操作。
  function gameTip(mode) {
    return mode === 'tap' ? '先别按 · 倒数后连点屏幕'
      : (mode === 'hold' || mode === 'timing') ? '先别按 · 倒数后按住屏幕' : '';
  }
  function countdown(tip, done) {
    var c = $('count'), sc = $('scene');
    if (c) sc.classList.add('is-prep');   // 准备期：画面压冷灰，明确「还不能按」
    if (!c) { done(); return; }
    var steps = ['3', '2', '1', '开始！'], i = 0;
    c.classList.add('is-on');
    function step() {
      if (!alive()) return;
      if (i >= steps.length) {
        c.classList.remove('is-on'); c.innerHTML = '';
        sc.classList.remove('is-prep');
        done();
        return;
      }
      var isGo = i === steps.length - 1;
      c.innerHTML = '<b>' + steps[i] + '</b>' + (tip ? '<span>' + tip + '</span>' : '');
      c.classList.remove('is-pop');
      void c.offsetWidth;           // 重新触发 pop 动画
      c.classList.add('is-pop');
      i++;
      later(isGo ? COUNT_GO : COUNT_STEP, step);
    }
    step();
  }

  // ===== V5 完整捕捉动画：8 阶段时序（摆动固定 3 秒，小游戏在摆动窗口内） =====
  function throwBall(no, g, w) {
    var base = D.CATCH_RATE[cur.tier];
    seq.bonus = 0; seq.clicked = false;
    var animated = cfg().animOn && !isInk();
    var b = $('ball');
    if (!animated) { // 关动画 / 墨水屏：瞬时判定，不播球、不出小游戏
      finish(decide(base, 0), no, g, w, false);
      return;
    }
    b.style.left = w.style.left;
    b.className = 'b3-ball is-on';
    later(0, function () { b.classList.add('is-fly'); APP.audio.sfxBall('fly'); });                                    // P1 抛球
    later(620, function () { b.classList.remove('is-fly'); w.classList.add('is-hit'); APP.audio.sfxBall('hit'); });  // P2 砸中
    later(820, function () { w.classList.remove('is-hit'); b.classList.add('is-open'); APP.audio.sfxBall('open'); });// P3 开盖
    later(1020, function () { w.classList.add('is-suck'); });                                                          // P4 缩小吸入
    later(1640, function () {                                                                                          // P5 闭合
      w.classList.remove('is-suck'); w.classList.remove('is-on');
      b.classList.remove('is-open'); b.classList.add('is-flash'); APP.audio.sfxBall('close');
      enterStage(b);                                                                                                   // 聚光舞台：浅灰底 + 中间大球 + 缩放光环
    });
    later(1860, function () {                                                                                          // P6 摆动
      b.classList.remove('is-flash'); b.classList.add('is-wobble');
    });
    var gameMode = isInk() ? 'off' : cfg().gameMode;                                                                   // 第 12 轮：小游戏前先 3-2-1
    var hasGame = gameMode !== 'off';
    if (hasGame) {
      later(1860, function () { countdown(gameTip(gameMode), function () { startGame(b); }); });
    }
    later(1860 + (hasGame ? COUNT_STEP * 3 + COUNT_GO + GAME_WINDOW : GAME_WINDOW), function () {                        // P7 成败
      b.classList.remove('is-wobble');
      endGame();
      var win = decide(base, seq.bonus);
      if (win) {
        b.classList.add('is-win'); APP.audio.sfxDing();
        if (cfg().celebrateOn && !isInk() && APP.events) APP.events.confetti();
      } else {
        b.classList.add('is-open');
        w.className = 'b3-wild is-on';
        w.classList.add('is-escape'); // 宝可梦层级必须高于球，否则被挡住
        g.classList.add('is-rustle');
      }
      finish(win, no, g, w, true);
    });
  }

  function decide(base, bonus) {
    return Math.random() < Math.min(.95, base + bonus);
  }

  function finish(win, no, g, w, animated) {
    function show() {
      $('ball').className = 'b3-ball';
      exitStage();   // 结果弹窗出现时把聚光底收掉，画面回到原场景
      w.className = 'b3-wild';
      g.classList.remove('is-rustle');
      var btns = resultBtns();
      if (win) {
        var r = APP.store.addPokemonByDex(cur.id, { via: 'wild' });
        APP.audio.playCry(cur.id);
        if (!animated && cfg().celebrateOn && !isInk() && APP.events) APP.events.confetti();
        // 第 10 轮：不管队伍满不满，都统一说「传送到宝可梦中心」（满员时它进仓库，不是进队伍）
        var to = (r && r.ok) ? '传送到宝可梦中心' : esc(r && r.msg ? r.msg : '已收录');
        dialog('成功捕捉到 ' + cur.name + '！', 'No.' + no + ' <b>' + esc(cur.name) + '</b> ' + to, btns);
      } else {
        dialog('跑掉了…', esc(cur.name) + ' 钻回躲藏点里了。', btns);
      }
      sync();
      // 捕捉结果 / 门票消耗 / 图鉴已遇到刚落地：立刻上云，关页面也不丢
      if (APP.sync && APP.sync.criticalPush) APP.sync.criticalPush();
      seq.busy = false;
      rootEl.classList.remove('is-busy');
    }
    if (animated) later(win ? 700 : 760, show); // 成功留 700ms 给「叮 + 金光」，失败等逃跑播完
    else show();
  }

  // ===== 收服小游戏：三种方案全部保留，设置里四选一；只加成不惩罚 =====
  function gmTip(txt) { $('game').innerHTML = '<div class="b3-game__tip">' + txt + '</div>'; }
  function endGame() {
    if (!alive()) return;
    var b = $('ball'), pad = $('pad');
    b.onclick = null;
    b.onpointerdown = null; b.onpointerup = null; b.onpointerleave = null; b.onpointercancel = null;
    if (pad) { // 第 13 轮：全屏层的事件也要一起解绑，避免结算后误触
      pad.onclick = null;
      pad.onpointerdown = null; pad.onpointerup = null; pad.onpointerleave = null; pad.onpointercancel = null;
    }
    b.classList.remove('is-ring');
    b.classList.remove('is-charge');
    b.classList.remove('is-holding');
    b.style.setProperty('--cp', '0');
    if ($('scene')) $('scene').classList.remove('is-live');
    if (pad) pad.className = 'b3-pad';
    $('game').className = 'b3-game';
    if (seq.decay) { clearInterval(seq.decay); seq.decay = null; }
    if (seq.iv) { clearInterval(seq.iv); seq.iv = null; }
    seq.holding = false;
  }

  function startGame(b) {
    var mode = isInk() ? 'off' : cfg().gameMode;
    if (mode === 'off') return;
    var gm = $('game'), pad = $('pad');
    gm.className = 'b3-game is-on';
    // 第 13 轮：倒数结束 → 进入「可按住」态。整屏透明层接管操作，画面转绿呼吸 + 👈引导。
    if ($('scene')) { $('scene').classList.remove('is-prep'); $('scene').classList.add('is-live'); }
    if (pad) pad.className = 'b3-pad is-live';
    var hit = pad || b;   // 全屏层接管；万一缺失退回球本身
    if (mode === 'timing') {
      // ① 球上蓄力：按住屏幕任意位置，球上的进度环涨到绿区（62%~85%）松手。
      // 第 13 轮：不再要求点中精灵球，整屏任意处按住即可；准备/蓄力两态用颜色和 👈 明确区分。
      gmTip('按住屏幕任意位置！光环到绿区松手！');
      b.classList.add('is-charge');
      var cp = 0, cdir = 1;
      function drawCharge() { b.style.setProperty('--cp', cp.toFixed(1)); }
      function chargeUp(e) {
        if (e && e.preventDefault) e.preventDefault();
        if (!seq.holding) return;
        seq.holding = false;
        b.classList.remove('is-holding');
        if (pad) pad.classList.remove('is-pressing');
        if (seq.iv) { clearInterval(seq.iv); seq.iv = null; }
        if (cp >= 62 && cp <= 85) seq.bonus = .20;
        else if (Math.min(Math.abs(cp - 62), Math.abs(cp - 85)) <= 12) seq.bonus = .10;
        drawCharge();
        b.classList.remove('is-charge');
        gmTip(seq.bonus === .20 ? '正中绿区！成功率 +20%'
          : seq.bonus === .10 ? '差一点，成功率 +10%' : '没停稳，按原概率');
      }
      hit.onpointerdown = function (e) {
        if (e && e.preventDefault) e.preventDefault();
        if (seq.holding || seq.clicked) return;
        seq.holding = true;
        b.classList.add('is-holding');
        if (pad) pad.classList.add('is-pressing');
        seq.iv = setInterval(function () {
          cp += cdir * 4.5;
          if (cp >= 100) { cp = 100; cdir = -1; }
          if (cp <= 0) { cp = 0; cdir = 1; }
          drawCharge();
        }, 30);
      };
      hit.onpointerup = chargeUp; hit.onpointerleave = chargeUp; hit.onpointercancel = chargeUp;
      later(GAME_WINDOW, function () { if (!seq.clicked) { seq.clicked = true; chargeUp(); } });
    } else if (mode === 'tap') {
      // ② 连点挣脱：收服条每 120ms 回落，3 秒内压满即加成
      var need = cur.tier === 'common' ? 5 : cur.tier === 'uncommon' ? 7 : 10, val = 0;
      gm.innerHTML = '<div class="b3-game__tip" id="b3-gmTip">快速连点屏幕任意位置！ 0 / ' + need + '</div>' +
        '<div class="b3-game__track"><div class="b3-game__fill" id="b3-gmFill"></div></div>';
      function draw() {
        var f = $('gmFill'), t = $('gmTip');
        if (!f || !t) return;
        f.style.width = Math.min(100, val / need * 100) + '%';
        t.textContent = '快速连点屏幕任意位置！ ' + Math.floor(val) + ' / ' + need;
      }
      seq.decay = setInterval(function () { val = Math.max(0, val - .45); draw(); }, 120);
      hit.onpointerdown = function (e) {
        if (e && e.preventDefault) e.preventDefault();
        if (seq.bonus) return;
        val += 1; draw();
        if (val >= need) {
          seq.bonus = .20;
          if (seq.decay) { clearInterval(seq.decay); seq.decay = null; }
          gmTip('压住了！成功率 +20%');
        }
      };
      later(3000, function () {
        if (seq.decay) { clearInterval(seq.decay); seq.decay = null; }
        if (!seq.bonus) gmTip('没压住，按原概率');
      });
    } else if (mode === 'hold') {
      // ③ 滑条蓄力：光标来回扫，按住屏幕任意位置蓄力，松手停在 62–85 绿区
      var p = 0, dir = 1;
      gm.innerHTML = '<div class="b3-game__tip" id="b3-gmTip">按住屏幕任意位置！松手停在绿区！</div>' +
        '<div class="b3-game__zone"><i></i><span class="b3-game__knob" id="b3-gmKnob"></span></div>';
      function draw() {
        var k = $('gmKnob');
        if (k) k.style.left = Math.max(0, Math.min(97, p)) + '%';
      }
      function up(e) {
        if (e && e.preventDefault) e.preventDefault();
        if (!seq.holding) return;
        seq.holding = false; seq.bonus = 0;
        if (pad) pad.classList.remove('is-pressing');
        if (seq.iv) { clearInterval(seq.iv); seq.iv = null; }
        if (p >= 62 && p <= 85) seq.bonus = .20;
        else if (Math.min(Math.abs(p - 62), Math.abs(p - 85)) <= 12) seq.bonus = .10;
        gmTip(seq.bonus === .20 ? '正中绿区！成功率 +20%'
          : seq.bonus === .10 ? '差一点，成功率 +10%' : '没停稳，按原概率');
      }
      hit.onpointerdown = function (e) {
        if (e && e.preventDefault) e.preventDefault();
        if (seq.holding) return;
        seq.holding = true;
        if (pad) pad.classList.add('is-pressing');
        seq.iv = setInterval(function () {
          p += dir * 3.2;
          if (p >= 100) { p = 100; dir = -1; }
          if (p <= 0) { p = 0; dir = 1; }
          draw();
        }, 30);
      };
      hit.onpointerup = up; hit.onpointerleave = up; hit.onpointercancel = up;
      later(3000, up);
    }
  }

  // ===== 右上角设置窗口（与养成页同款 toggle，全站共用 key） =====
  function openSettings() {
    var c = cfg();
    var rows = [
      ['soundOn', '🔊', '声音', '叫声、抛球与成功的「叮」', c.soundOn],
      ['catchAnimOn', '🎬', '捕捉动画', '抛球 / 开盖 / 吸入 / 摆动 3 秒', c.animOn],
      ['celebrateOn', '🎉', '庆祝动画', '成功捕捉时的彩带', c.celebrateOn]
    ], h = '<h3>⚙ 设置</h3>';
    for (var i = 0; i < rows.length; i++) {
      var r = rows[i];
      h += '<div class="set-row"><div class="set-row__txt"><div class="set-row__label">' + r[1] + ' ' + r[2] +
        '</div><div class="set-row__desc">' + r[3] + '</div></div>' +
        '<button type="button" class="toggle' + (r[4] ? ' is-on' : '') + '" data-toggle="' + r[0] +
        '" role="switch" aria-checked="' + r[4] + '"><span class="toggle__knob"></span></button></div>';
    }
    h += '<div class="b3-gm-title">🎮 捕捉 / 出招小游戏</div><div class="b3-gm-pick">';
    Object.keys(GAME_NAMES).forEach(function (k) {
      h += '<button type="button" data-gm="' + k + '" class="' + (c.gameMode === k ? 'is-on' : '') +
        '">' + GAME_NAMES[k] + '</button>';
    });
    h += '</div><div class="b3-setdlg__links">' +
      '<button type="button" data-b3="list">名单</button>' +
      '<button type="button" data-b3="rule">规则</button></div>' +
      '<div class="b3-setdlg__hint">三种玩法都保留，随时换；<b>捕捉和战斗出招共用这一套</b>。' +
      '每次小游戏开始前都有 <b>3-2-1 倒计时</b>和玩法提示，' +
      '捕捉时只给成功率加成（+10% / +20%，上限 95%），战斗时决定「完美 / 良好 / 打空」；' +
      '点不中也不扣分。关掉动画或墨水屏时自动跳过。59 只名单与捕捉规则也收在这里。</div>' +
      '<button type="button" class="b3-setdlg__done" data-b3="set-close">完成</button>';
    $('setdlg').innerHTML = h;
    $('setmask').classList.add('is-on');
  }

  // ===== 名单 / 规则抽屉 =====
  function renderList(tier) {
    var list = D.POOLS[tier], h = '<div class="b3-dtabs" id="b3-dtabs">' +
      '<button type="button" class="b3-dtab' + (tier === 'common' ? ' is-on' : '') + '" data-z="common">常见 ' + D.COUNTS.common + '</button>' +
      '<button type="button" class="b3-dtab' + (tier === 'uncommon' ? ' is-on' : '') + '" data-z="uncommon">少见 ' + D.COUNTS.uncommon + '</button>' +
      '<button type="button" class="b3-dtab' + (tier === 'rare' ? ' is-on' : '') + '" data-z="rare">稀有 ' + D.COUNTS.rare + '</button></div><div class="b3-dgrid">';
    for (var i = 0; i < list.length; i++) {
      var p = list[i], no = pad3(p.id);
      h += '<div class="b3-li"><img src="' + D.GIF_BASE + no + '.gif" alt=""><div class="b3-li__t">' +
        '<b>No.' + no + ' ' + esc(p.zh) + '</b><span>' + badges(p.types) + '<i>' + p.gen + '</i></span></div></div>';
    }
    h += '</div><div class="b3-dtext"><b>三个躲藏点共用这 59 只</b>，任何一处都可能遇到任何稀有度。' +
      '稀有度决定出现占比（70% / 22% / 8%）、先触发战斗的概率（0% / 50% / 100%）与投球成功率（80% / 55% / 35%），不绑定场景主题。' +
      '名单来自定稿图鉴 64 格的初始形态去重；对战专用 51 只不会出现。</div>';
    $('drawerBody').innerHTML = h;
    $('dtabs').onclick = function (e) {
      var z = e.target.getAttribute && e.target.getAttribute('data-z');
      if (z) renderList(z);
    };
  }

  function openDrawer(kind) {
    var rate = 7;
    try { rate = (APP.store.settings().exchangeRate || {}).capture || 7; } catch (e) {}
    $('drawerTitle').textContent = kind === 'list' ? '59 只 · 按稀有度' : '捕捉规则';
    if (kind === 'list') renderList('common');
    else $('drawerBody').innerHTML = '<div class="b3-dtext">' +
      '· 入场门禁：<b>平日每 2 天 1 次；周末 / 节假日每天 3 次</b>（捕捉与战斗各自独立计次）<br>' +
      '· 每次探索消耗 <b>1 次探索机会</b>（即精灵球；在兑换中心用 <b><i class="shard shard--sm"></i>' + rate + ' 碎片</b>兑换）；遇到已拥有的宝可梦<b>必定开战</b><br>' +
      '· <b>稀有度决定会不会先打一场</b>：<b>常见直接捕捉</b> / <b>少见 50%</b> / <b>稀有 100%</b>；触发战斗的必须<b>打赢才能投球</b>，战败（或你逃跑）它就跑掉；战斗与「外出战斗 / 道馆挑战」同一套打法<br>' +
      '· <b>点左下「投石问路」石头＝随机挑一处躲藏点；点任意一处躲藏点＝指定那处</b>，都只是「从哪处跳出来」的演出；遇到谁一律从 59 只共享池按稀有度抽：常见 70% / 少见 22% / 稀有 8%<br>' +
      '· 场景主题共 <b>7 种</b>（湿地 / 火山 / 竹林 / 沙漠 / 海滩 / 洞窟 / 雪山），每轮随机一个，<b>3 个躲藏点随机摆放</b>，纯视觉、不绑定稀有度；右下「<b>换场景</b>」路标只换主题，不消耗精灵球、不算入场<br>' +
      '· 稀有度越高越难抓：投球成功率 <b>80% / 55% / 35%</b>；只抓 59 个初始形态（前三世代，≤386）<br>' +
      '· 捕捉结果弹窗：「<b>关闭</b>」回乐园页签；「<b>继续探索</b>」只换一个场景，<b>不会自动选点</b>，要自己点躲藏点才开始下一次探索<br>' +
      '· 两个入口都先弹消耗确认，选「立即探索」才扣；「再想想」不扣任何东西<br>' +
      '· <b>已拥有也会从躲藏点出现</b>：不能重复捕捉，会发起<b>对战</b>；打赢得经验 +30 与 <b><i class="shard shard--sm"></i>2 碎片</b>，战败有 <b><i class="shard shard--sm"></i>1 碎片</b>安慰，不再另发 3 碎片补偿；「逃跑」直接结束探索、不进战斗<br>' +
      '· 队伍满 5 只自动进仓库；投球失败不退精灵球与次数<br>' +
      '· <b>完整捕捉动画</b>：抛球 → 砸中 → 开盖 → 缩小吸入 → 闭合 → 摆动 3 秒 → 成功「叮」/ 失败开盖逃跑。右上角设置按钮可关掉（关闭后直接出结果）<br>' +
      '· <b>捕捉 / 出招小游戏</b>：设置里可选「① 球上蓄力 / ② 连点挣脱 / ③ 滑条蓄力 / 不做」，捕捉时只给 +10% / +20% 成功率加成（上限 95%），战斗出招时决定完成度，点不中不扣分也不扣体力<br>' +
      '· <b>外出战斗</b>：消耗 1 张战斗券 + 1 次入场（与捕捉独立计次）；双方 HP 100 / 体力 100，每回合回 25 体力；4 个纯攻击招耗体力 15/30/45/70，单击最多扣 45 点，通常 4 回合分胜负<br>' +
      '· 墨水屏下不撒彩带、不播叫声、跳过动画与小游戏</div>';
    $('drawer').classList.add('is-on');
  }

  // ===== 事件（委托到容器，重复 render 不会叠加监听） =====
  function onClick(e) {
    var t = e.target;
    var tg = t.closest ? t.closest('.toggle') : null;
    if (tg && $('setmask').classList.contains('is-on')) {
      var key = tg.getAttribute('data-toggle');
      APP.store.setSetting(key, !(APP.store.settings()[key] !== false));
      openSettings();
      return;
    }
    var gm = t.getAttribute && t.getAttribute('data-gm');
    if (gm) {
      APP.store.setSetting('catchGameMode', gm);
      openSettings();
      return;
    }
    if (t.id === 'b3-setmask' || (t.getAttribute && t.getAttribute('data-b3') === 'set-close')) {
      $('setmask').classList.remove('is-on');
      return;
    }
    if (t.closest && t.closest('#b3-setBtn')) {
      if (seq.busy) { toast('动画播放中，稍等一下'); return; }
      openSettings();
      return;
    }
    var tabBtn = t.closest ? t.closest('[data-b3-tab]') : null;
    if (tabBtn) {
      var nm = tabBtn.getAttribute('data-b3-tab');
      // 页签门禁：只拦用户点击，捕捉遭遇战内部的 switchTab('battle') 不受影响
      if (subTabLocked(nm)) {
        var gap = (APP.unlock && APP.unlock.gapText) ? APP.unlock.gapText(nm) : '';
        toast('🔒 ' + SUBTAB_REQ[nm].name + '还没开放，' + (gap || '再等等') + '就能解锁了。');
        return;
      }
      switchTab(nm);
      return;
    }
    var act = t.getAttribute && t.getAttribute('data-b3');
    if (act === 'drawer-close') { $('drawer').classList.remove('is-on'); return; }
    if (act === 'list' || act === 'rule') {
      $('setmask').classList.remove('is-on'); // 从设置里打开抽屉，先关掉设置层免得吃掉点击
      openDrawer(act === 'list' ? 'list' : 'rule');
      return;
    }
    // 路标里有 SVG / 文字子节点，用 closest 保证点哪里都能换
    if (t.closest && t.closest('[data-b3="shuffle"]')) {
      if (seq.busy) { toast('动画播放中，稍等一下'); return; }
      applyScene();
      return;
    }
    var z = t.getAttribute && t.getAttribute('data-z');
    if (z) { renderList(z); return; }
    if (!canAsk()) return;
    if (t.closest && t.closest('#b3-stone')) { askConsume(null); return; }
    var grass = t.closest ? t.closest('.b3-hide') : null;
    if (grass) askConsume(Number(grass.getAttribute('data-slot')));
  }

  function render(container) {
    if ((seq.busy || battleBusy()) && alive()) return; // 捕捉 / 战斗演出中不被 APP.refresh() 打断
    if (subTabLocked(activeTab)) activeTab = 'catch'; // 等级回退 / 存档异常时回到捕捉页签
    rootEl = container;
    container.innerHTML = pageHtml();
    container.addEventListener('click', onClick);
    syncStickyTop();
    applyScene();
    sync();
    // B4：战斗 pane 交给独立模块挂载（三个 pane 常驻 DOM，只切 is-on）
    if (APP.screens.battle && APP.screens.battle.mount) {
      APP.screens.battle.mount(document.getElementById('b3-battle-root'));
    }
    // 第三页签：道馆列表由 gym.js 渲染
    if (APP.screens.gym && APP.screens.gym.mount) {
      APP.screens.gym.mount(document.getElementById('b3-gym-root'));
    }
  }

  window.addEventListener('hashchange', function () {
    if (window.location.hash !== '#/catch') {
      abort();
      if (APP.screens.battle) APP.screens.battle.abort();
    }
  });

  // 供冒烟测试用的只读钩子（不参与页面逻辑）
  APP.screens.catch = {
    render: render,
    logic: {
      state: function () { return { cur: cur, seq: seq, slotPick: slotPick, sceneTheme: sceneThemeKey }; },
      pickTier: pickTier,
      battleOdds: battleOdds,
      needBattle: needBattle,
      showWild: showWild,
      resultBtns: resultBtns,
      escapeDialog: escapeDialog,
      decide: decide,
      gateText: gateText,
      gateHtml: gateHtml,
      gateToast: gateToast,
      restHintLine: restHintLine,
      renderRestHint: renderRestHint,
      badges: badges,
      ownedSet: ownedSet,
      askConsume: askConsume,
      startCatch: startCatch,
      throwBall: throwBall,
      startGame: startGame,
      openSettings: openSettings,
      switchTab: switchTab,
      backFromBattle: backFromBattle,
      battleBusy: battleBusy,
      openDrawer: openDrawer,
      applyScene: applyScene,
      themes: function () { return D.THEMES; },
      sceneTheme: function () { return sceneThemeKey; },
      sync: sync,
      abort: abort,
      cfg: cfg
    }
  };
})(window.APP);
