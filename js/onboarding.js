window.APP = window.APP || {};
(function (APP) {
  'use strict';

  var RUNNING = false;
  var JUST_FINISHED = false;  // 首登刚结束：本次渲染不叠加「要不要注册账号」提醒

  // ===== 样式（首登引导 + 选宠/选角卡片）=====
  var OB_CSS =
    '.ob-modal{max-width:340px}' +
    '.ob-art{text-align:center;margin:-6px 0 2px}' +
    '.ob-art img{width:120px;height:120px;object-fit:contain;filter:drop-shadow(0 8px 12px rgba(0,0,0,.35))}' +
    '.ob-sub{font-size:12px;color:#8d8371;text-align:center;margin:-4px 0 10px}' +
    '.ob-petgrid{display:grid;grid-template-columns:1fr 1fr;gap:12px;margin:6px 0 4px}' +
    '.ob-pet{background:#fbf4e6;border:3px solid transparent;border-radius:14px;padding:10px 6px;text-align:center;cursor:pointer;box-shadow:0 3px 0 #d8c9ad;display:flex;flex-direction:column;align-items:center;gap:4px}' +
    '.ob-pet.is-sel{border-color:#e0542f}' +
    '.ob-pet img{width:74px;height:74px;object-fit:contain}' +
    '.ob-pet b{font-size:13px;color:#5a4632}' +
    '.ob-badge{font-size:10px;font-weight:700;color:#fff;padding:1px 8px;border-radius:10px}' +
    '.b-grass{background:#7ec850}.b-fire{background:#e07a3c}.b-water{background:#4a9fd6}.b-elec{background:#e8b53a}' +
    '.ob-chargrid{display:grid;grid-template-columns:1fr 1fr;gap:12px;margin:6px 0 4px}' +
    '.ob-char{background:#fbf4e6;border:3px solid transparent;border-radius:14px;padding:8px;cursor:pointer;box-shadow:0 3px 0 #d8c9ad;display:flex;flex-direction:column;align-items:center;gap:4px}' +
    '.ob-char.is-sel{border-color:#e0542f}' +
    '.ob-char img{width:64px;height:64px;object-fit:contain}' +
    '.ob-char small{font-size:12px;color:#5a4632;font-weight:700}';

  // 御三家随机池（仅 001–386 范围：关都/城都/丰缘）
  var STARTERS = [
    { list: [{ d: 1, t: '草' }, { d: 4, t: '火' }, { d: 7, t: '水' }] },
    { list: [{ d: 152, t: '草' }, { d: 155, t: '火' }, { d: 158, t: '水' }] },
    { list: [{ d: 252, t: '草' }, { d: 255, t: '火' }, { d: 258, t: '水' }] }
  ];
  // 4 位可选主角（与 battle.js MY_CHARS 一致）
  var CHARS = [
    { name: '红帽少年', base: 'hero-1' },
    { name: '红裙少女', base: 'hero-2' },
    { name: '绿帽少年', base: 'hero-3' },
    { name: '橙帽少女', base: 'hero-4' }
  ];

  function pad(n) { n = String(n); while (n.length < 3) n = '0' + n; return n; }
  function esc(t) { return String(t == null ? '' : t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
  // 事件委托：卡片里包着 <img>/<b>/<span>，直接读 e.target 会取不到 data-*，
  // 表现为「点形象没反应、只有点卡片边缘才选中」。统一向上找带属性的祖先。
  function findAttr(node, attr) {
    while (node && node.getAttribute) {
      var v = node.getAttribute(attr);
      if (v !== null && v !== undefined) return { el: node, val: v };
      node = node.parentNode;
    }
    return null;
  }

  var PIKA_CHANCE = 0.8;  // 每批 4 只里，皮卡丘出现的概率（不再固定出现）
  var REROLL_MAX = 3;     // 除首次外，还能「换一批」的次数

  function shuffle(arr) {
    for (var i = arr.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1));
      var t = arr[i]; arr[i] = arr[j]; arr[j] = t;
    }
    return arr;
  }

  // 名字优先用内置小表：不依赖别的脚本是否加载完（离线缓存曾把 JS 换成 HTML 壳，导致这里只显示 #编号）
  function starterInfo(s) {
    var name = (APP.STARTER_NAMES && APP.STARTER_NAMES[s.d]) ||
      (APP.evo && APP.evo.get ? (APP.evo.get(s.d) || {}).name : '') ||
      ('#' + s.d);
    return { d: s.d, t: s.t, name: name };
  }
  // 首登专用 128px 内联小图；常量表缺失时回退到图鉴原图，不至于开天窗
  function starterArt(d) {
    if (APP.STARTER_ART && APP.STARTER_ART[d]) return APP.STARTER_ART[d];
    return 'assets/pokemon/' + pad(d) + '.png';
  }

  // 三个世代各抽 1 只御三家保证多样性；第 4 只有 80% 概率是皮卡丘，
  // 剩下 20% 从其余御三里补 1 只。最后打乱位置，皮卡丘不再固定在第一格。
  function pickFour() {
    var gens = STARTERS.slice();
    shuffle(gens);
    var chosen = [];
    var rest = [];
    for (var k = 0; k < gens.length; k++) {
      var arr = gens[k].list.slice();
      shuffle(arr);
      chosen.push(starterInfo(arr[0]));
      rest.push(arr[1], arr[2]);
    }
    if (Math.random() < PIKA_CHANCE) {
      chosen.push({ d: 25, t: '电', name: '皮卡丘' });
    } else {
      shuffle(rest);
      chosen.push(starterInfo(rest[0]));
    }
    return shuffle(chosen);
  }

  function overlayEl() {
    var el = document.getElementById('uiOverlay');
    if (!el) { el = document.createElement('div'); el.id = 'uiOverlay'; el.className = 'ui-overlay'; document.body.appendChild(el); }
    el.style.display = ''; return el;
  }
  function closeOb() { var el = document.getElementById('uiOverlay'); if (el) { el.innerHTML = ''; el.onclick = null; el.style.display = 'none'; } }
  function injectStyle() {
    if (document.getElementById('ob-style')) return;
    var s = document.createElement('style'); s.id = 'ob-style'; s.textContent = OB_CSS; document.head.appendChild(s);
  }
  function OB_MODAL(o) {
    return '<div class="ui-overlay__bg" data-close="1"></div>' +
      '<div class="ui-modal ob-modal">' +
      (o.art ? '<div class="ob-art"><img src="' + o.art + '" alt=""></div>' : '') +
      (o.title ? '<h3 class="ui-modal__title">' + o.title + '</h3>' : '') +
      (o.sub ? '<p class="ob-sub">' + o.sub + '</p>' : '') +
      (o.msg ? '<p class="ui-modal__msg">' + o.msg + '</p>' : '') +
      (o.body ? o.body : '') +
      (o.ok ? '<button type="button" class="btn btn--primary btn--block" data-ob-ok="1">' + o.ok + '</button>' : '') +
      '</div>';
  }

  // 老存档（已有进度）绝不能被首登流程重置：直接视为已引导，并把当前已达成档位记为「已播报」，
  // 避免升级后一次性补弹出一堆博士引导。
  function isLegacySave() {
    var s = APP.store.get ? APP.store.get() : null;
    if (!s) return false;
    var pks = s.pokemon || [];
    if (pks.length > 1) return true;
    if (pks[0] && ((pks[0].level || 1) > 1 || (pks[0].exp || 0) > 0)) return true;
    if (Array.isArray(s.xpLog) && s.xpLog.length) return true;
    // 只认真实进度：catches / 碎片等有「新账号初始赠送」，不能当老存档判据。
    // 打开日程页也会生成当天的 pending 空实例，同样不算。与 sync.hasRealData() 同口径。
    var days = s.instances || {};
    for (var d in days) {
      if (!Object.prototype.hasOwnProperty.call(days, d)) continue;
      var items = days[d] || {};
      for (var tid in items) {
        if (!Object.prototype.hasOwnProperty.call(items, tid)) continue;
        var it = items[tid];
        if (it && it.status && it.status !== 'pending') return true;
      }
    }
    return false;
  }

  // ===== 流程 =====
  function run() {
    if (RUNNING) return;
    if (!APP.store || !APP.store.onboarding) return;
    if (APP.store.onboarding().onboarded) return;
    // 纯静态强制登录版：引导必须晚于「GitHub 配置 → 注册/登录 → 首次云端拉取」。
    // 否则未登录时选的宝可梦会写进本地并把 savedAt 抬新，挡住云端真实存档（串档 / 丢档），
    // 浮层还会盖住登录页的 GitHub 连接卡片。四道闸缺一不可。
    if (!APP.auth || !APP.auth.session) return;
    var sess = APP.auth.session();
    if (!sess || !sess.vaultKeyB64) return;
    if (!APP.gh || !APP.gh.hasConfig || !APP.gh.hasConfig()) return;
    if (APP.sync && APP.sync.forkPending && APP.sync.forkPending()) return;
    if (APP.sync && APP.sync.ready && !APP.sync.ready()) return;
    if (isLegacySave()) {
      var seen = {}, claimed = {};
      if (APP.unlock && APP.unlock.evalState) {
        var res = APP.unlock.evalState();
        for (var k in res.st) if (res.st[k]) { seen[k] = true; claimed[k] = true; }
      }
      // 后加的「玩耍 / 训练」两档对老存档一律算「早就用过」：既不回收，也不补播补发。
      // 注意此刻 legacy 还没写入，evalState() 算出来的 st.train 可能为 false，必须显式补标记。
      seen.play = true; claimed.play = true;
      seen.train = true; claimed.train = true;
      claimed.start = true;   // T0「启程」也不补发
      APP.store.setOnboarding({ onboarded: true });
      // 老存档全量标记 seen / claimed：升级后不补播旧引导，也不补发历史解锁奖励。
      // fixT1 跳过 T1 误判自愈，避免升级后多播一次乐园引导。
      // legacy:true → unlock.evalState() 对后加的「玩耍 / 训练」门禁放行，不回收老用户本来就在用的功能。
      APP.store.setUnlock({ seen: seen, claimed: claimed, fixT1: true, legacy: true });
      return;
    }
    RUNNING = true;
    injectStyle();
    var tabbar = document.getElementById('tabbar'); if (tabbar) tabbar.style.display = 'none';
    welcome();
  }

  function welcome() {
    var el = overlayEl();
    el.innerHTML = OB_MODAL({
      art: starterArt(25),
      title: '欢迎来到宝可梦世界！',
      msg: '每天认真完成任务，你的宝可梦伙伴就会升级、学新招式、进化！先从选择你的第一只宝可梦开始吧～',
      ok: '开始旅程 →'
    });
    el.onclick = function (e) {
      if (findAttr(e.target, 'data-ob-ok')) { closeOb(); pickPet(); }
    };
  }

  function pickPet() {
    var four = pickFour();
    var rerolls = REROLL_MAX;
    var sel = 0;
    var el = null;

    function paint() {
      var cards = four.map(function (p, i) {
        var cls = p.t === '草' ? 'b-grass' : p.t === '火' ? 'b-fire' : p.t === '水' ? 'b-water' : 'b-elec';
        return '<button type="button" class="ob-pet' + (i === sel ? ' is-sel' : '') + '" data-ob-pet="' + i + '">' +
          '<img src="' + starterArt(p.d) + '" alt="">' +
          '<b>' + esc(p.name) + '</b>' +
          '<span class="ob-badge ' + cls + '">' + esc(p.t) + '</span>' +
          '</button>';
      }).join('');
      var reroll = '<button type="button" class="btn btn--sm btn--block" data-ob-reroll="1" ' +
        'style="margin:12px 0 2px"' + (rerolls <= 0 ? ' disabled' : '') + '>🎲 换一批' +
        (rerolls > 0 ? '（还能换 ' + rerolls + ' 次）' : '（次数已用完）') + '</button>';
      el = overlayEl();
      el.innerHTML = OB_MODAL({
        title: '选择你的第一支宝可梦！',
        body: '<div class="ob-petgrid">' + cards + '</div>' + reroll,
        ok: '下一步 →'
      });
      el.onclick = onClick;
    }

    function onClick(e) {
      // 换一批：重新抽 4 只（皮卡丘仍按 80% 概率出现），次数用完按钮自动禁用
      if (findAttr(e.target, 'data-ob-reroll')) {
        if (rerolls <= 0) return;
        rerolls--;
        four = pickFour();
        sel = 0;
        paint();
        return;
      }
      var cp = findAttr(e.target, 'data-ob-pet');
      if (cp) {
        sel = parseInt(cp.val, 10);
        var all = el.querySelectorAll('.ob-pet');
        for (var i = 0; i < all.length; i++) all[i].classList.remove('is-sel');
        cp.el.classList.add('is-sel'); return;
      }
      if (findAttr(e.target, 'data-ob-ok')) {
        var p = four[sel];
        // 初始宝可梦「就地替换」默认的皮卡丘，而不是再加一只：选定后即为唯一初始伙伴，且不可重选
        if (p.d !== 25 && APP.store.setFirstPokemon) {
          var r = APP.store.setFirstPokemon(p.d);
          if (!r || !r.ok) {
            if (APP.unlock && APP.unlock.toast) APP.unlock.toast('这只暂时不能选，换一只试试～');
            return;
          }
        }
        APP.store.setOnboarding({ firstPokemon: p.name, onboarded: false, character: null, welcomed: false });
        closeOb(); pickChar();
      }
    }

    paint();
  }

  function pickChar() {
    var items = CHARS.map(function (c, i) {
      return '<button type="button" class="ob-char' + (i === 0 ? ' is-sel' : '') + '" data-ob-char="' + i + '">' +
        '<img src="assets/npc-v6/' + c.base + '-bust.png" alt="">' +
        '<small>' + esc(c.name) + '</small></button>';
    }).join('');
    var el = overlayEl();
    el.innerHTML = OB_MODAL({
      title: '选择你的主角形象',
      sub: '战斗主角半身立绘 · 每月可重选 1 次',
      body: '<div class="ob-chargrid">' + items + '</div>',
      ok: '完成'
    });
    var sel = 0;
    el.onclick = function (e) {
      var cc = findAttr(e.target, 'data-ob-char');
      if (cc) {
        sel = parseInt(cc.val, 10);
        var all = el.querySelectorAll('.ob-char');
        for (var i = 0; i < all.length; i++) all[i].classList.remove('is-sel');
        cc.el.classList.add('is-sel'); return;
      }
      if (findAttr(e.target, 'data-ob-ok')) {
        APP.store.setSetting('myTrainer', sel);
        APP.store.setOnboarding({ character: CHARS[sel].name, onboarded: true, reselectTime: 0, welcomed: true });
        closeOb();
        finale();   // 「完成」→ 欢迎结语 → 进入日程页；博士只在真正解锁时出现
      }
    };
  }

  // 首登收尾：点「完成」后才出现的一句话世界观 + 欢迎说明，再进日程页
  function finale() {
    var el = overlayEl();
    el.innerHTML = OB_MODAL({
      art: starterArt(25),
      title: '欢迎来到 宝可梦训练师成长日记',
      msg: '从今天起，每一次认真打卡都会变成伙伴成长的经验。先去「日程」完成今天的任务，照顾好你的宝可梦，新的冒险会一个接一个解锁～',
      ok: '进入日程 →'
    });
    el.onclick = function (e) {
      if (!findAttr(e.target, 'data-ob-ok')) return;
      closeOb();
      RUNNING = false;   // 必须先解除，否则下面的渲染会被「引导进行中」拦住，页面空白
      JUST_FINISHED = true;
      // 只触发一次 render：hash 变化交给 hashchange，hash 已相同时手动刷新。
      // 若两者都做，会渲染两次、把 JUST_FINISHED 提前消费掉，反而弹出注册提醒打断引导。
      if (window.location.hash !== '#/schedule') window.location.hash = '#/schedule';
      else if (APP.refresh) APP.refresh();
    };
  }

  // ===== 角色月重选（我的数据 → 账号，复用选角 UI）=====
  function reselect() {
    if (!APP.store || !APP.store.onboarding) return;
    var ob = APP.store.onboarding();
    var now = Date.now(); var gap = 30 * 24 * 3600 * 1000;
    if (ob.reselectTime && now - ob.reselectTime < gap) {
      var d = Math.ceil((gap - (now - ob.reselectTime)) / 86400000);
      if (APP.unlock && APP.unlock.toast) APP.unlock.toast('⏳ 本月已重选，剩余 ' + d + ' 天');
      return;
    }
    injectStyle();
    var cur = (APP.store.settings() && APP.store.settings().myTrainer) || 0;
    var items = CHARS.map(function (c, i) {
      return '<button type="button" class="ob-char' + (i === cur ? ' is-sel' : '') + '" data-ob-char="' + i + '">' +
        '<img src="assets/npc-v6/' + c.base + '-bust.png" alt="">' +
        '<small>' + esc(c.name) + '</small></button>';
    }).join('');
    var el = overlayEl();
    el.innerHTML = OB_MODAL({
      title: '重选主角形象',
      sub: '每月仅可重选 1 次',
      body: '<div class="ob-chargrid">' + items + '</div>',
      ok: '确认重选'
    });
    var sel = cur;
    el.onclick = function (e) {
      var cc = findAttr(e.target, 'data-ob-char');
      if (cc) {
        sel = parseInt(cc.val, 10);
        var all = el.querySelectorAll('.ob-char');
        for (var i = 0; i < all.length; i++) all[i].classList.remove('is-sel');
        cc.el.classList.add('is-sel'); return;
      }
      if (findAttr(e.target, 'data-ob-ok')) {
        APP.store.setSetting('myTrainer', sel);
        APP.store.setOnboarding({ character: CHARS[sel].name, reselectTime: Date.now() });
        closeOb();
        if (APP.unlock && APP.unlock.toast) APP.unlock.toast('✅ 已重选为 ' + CHARS[sel].name + '（30 天内不可再选）');
        if (APP.refresh) APP.refresh();
      }
    };
  }

  APP.onboarding = {
    run: run,
    maybeRun: run,
    reselect: reselect,
    active: function () { return RUNNING; },
    consumeJustFinished: function () { var v = JUST_FINISHED; JUST_FINISHED = false; return v; }
  };
})(window.APP);
