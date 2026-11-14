window.APP = window.APP || {};

/* ==========================================================================
   道馆挑战页（探险 tab 第三页签）· v60
   · A2 轮转开放：前 4 馆常开 / 后 4 馆每周轮转 2 馆 / 周六日 8 馆全开
   · B1 限次放宽：当天 1 次只约束未通关馆的首通挑战
   · 8 馆恒定两列紧凑卡片；顶部右侧「徽章」入口 → 2×4 徽章收集册
   · 弹窗改为 document 事件委托 + APP.ui.sheet 缺失兜底（修旧缓存下点击无反应）
   数据与轮转算法见 js/data/gym-data.js；结算走 APP.store.gymFinish()
   ========================================================================== */
(function (APP) {
  'use strict';

  var root = null;

  // v1.9《宝可梦作业激励》素材：馆主名 / 属性色 / 属性 emoji。
  // 原版岩石是 🪨，Windows 上缺字形会渲染成空心方框，改用 🗿 兜底。
  var TY = {
    rock:     ['小刚',   '#8d6e63', '🗿'],
    water:    ['小霞',   '#1e88e5', '💧'],
    electric: ['马志士', '#f9a825', '⚡'],
    grass:    ['莉佳',   '#43a047', '🌿'],
    fire:     ['夏伯',   '#ef6c00', '🔥'],
    psychic:  ['娜姿',   '#8e24aa', '🔮'],
    ground:   ['坂木',   '#a1887f', '🏜️'],
    dragon:   ['渡',     '#5c6bc0', '🐉']
  };

  // assets/hzicon 素材（8 枚关都徽章，透明 PNG，尺寸不一 → CSS object-fit:contain）
  // 注意目录里 fire / grass 都编成 04，按属性名映射，不用编号。
  var BADGE = {
    rock: '01-rock-badge.png', water: '02-water-badge.png',
    electric: '03-electric-badge.png', grass: '04-grass-badge.png',
    fire: '04-fire-badge.png', psychic: '05-psychic-badge.png',
    ground: '06-ground-badge.png', dragon: '07-dragon-badge.png'
  };

  var WD = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];

  function esc(t) {
    return String(t === undefined || t === null ? '' : t)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  function toast(text, bad) {
    var el = document.createElement('div');
    el.className = 'toast' + (bad ? ' is-bad' : ' is-ok');
    el.textContent = text;
    document.body.appendChild(el);
    setTimeout(function () {
      el.classList.add('is-out');
      setTimeout(function () { if (el.parentNode) el.parentNode.removeChild(el); }, 320);
    }, 2000);
  }

  // v60：解锁门槛按「所有宝可梦（含仓库）里的最高等级」，
  // 照顾对象 / 主力换人不会把已经解锁的道馆重新锁回去。
  function maxLevel() {
    try {
      if (APP.store.maxPokemonLevel) return APP.store.maxPokemonLevel();
      var list = APP.store.listParty() || [];
      return Math.max.apply(null, [1].concat(list.map(function (p) { return p.level || 1; })));
    } catch (e) { return 1; }
  }

  function daysUntil(a, b) {
    if (!b) return 0;
    var x = a.split('-'), y = b.split('-');
    return Math.round((Date.UTC(+y[0], +y[1] - 1, +y[2]) -
      Date.UTC(+x[0], +x[1] - 1, +x[2])) / 86400000);
  }

  /* 说明弹层：优先复用 APP.ui.sheet；旧缓存的 ui.js 没有 sheet 时自建最小弹层，
     避免「点了规则 / 说明完全没反应」（v58 静默失败的真实问题）。 */
  function sheet(title, body) {
    // APP.ui.sheet 可能就是下面补齐进去的自己，避免自递归
    if (APP.ui && APP.ui.sheet && APP.ui.sheet !== sheet) {
      APP.ui.sheet(title, body); return;
    }
    var el = document.getElementById('uiOverlay');
    if (!el) {
      el = document.createElement('div');
      el.id = 'uiOverlay';
      el.className = 'ui-overlay';
      document.body.appendChild(el);
    }
    el.style.display = '';
    el.innerHTML =
      '<div class="ui-overlay__bg" data-gym-close="1"></div>' +
      '<div class="ui-modal ui-modal--sheet" role="dialog">' +
        '<button type="button" class="ui-modal__x" data-gym-close="1" aria-label="关闭">×</button>' +
        '<h3 class="ui-modal__title">' + esc(title) + '</h3>' + body +
        '<button type="button" class="btn btn--primary btn--block" data-gym-close="1" ' +
          'style="margin-top:12px">知道啦</button>' +
      '</div>';
    el.onclick = function (e) {
      if (e.target.getAttribute && e.target.getAttribute('data-gym-close')) {
        el.style.display = 'none'; el.innerHTML = ''; el.onclick = null;
      }
    };
  }

  // ===== 顶部「ⓘ 规则」弹窗 =====
  function rulesHtml() {
    return '<ul class="gym-rulelist">' +
      '<li>连打 3 场：<b>普通职员 → 小 boss → 馆主</b></li>' +
      '<li>每场开场 HP / 体力回满 100 / 100</li>' +
      '<li>独立每周 3 次，<b>不消耗战斗券</b></li>' +
      '<li><b>前 4 馆天天开放</b>；后 4 馆每周轮转 2 馆，<b>周六日 8 馆全开</b></li>' +
      '<li><b>未通关</b>道馆在开放日当天限 1 次；已通关馆 / 大师挑战不限当天</li>' +
      '<li>挑战失败本馆冷却 2 天；失败保留已通过场次的经验 / 碎片</li>' +
      '<li>带对克制属性、用对战术才能首通</li>' +
      '<li>宝可梦达到解锁等级即可挑战（按<b>最高等级</b>算，换主力不影响）</li>' +
      '<li>首通且有宝可梦达到「解锁等级 ×2」后开启大师挑战</li>' +
      '<li>心愿星每馆只发一次：首通给星+徽章；大师首次通关额外给 <b>2 倍星</b>，重打不再给星</li>' +
      '<li>心愿星 1⭐ = 10 元，在兑换中心找家长换真实礼物</li>' +
      '</ul>';
  }

  function fmtDate(s) {
    if (!s) return '';
    var p = s.split('-');
    return (+p[1]) + ' 月 ' + (+p[2]) + ' 日';
  }

  // 奖励下面的「本馆开放规则 + 开放时间」。
  // 前 4 馆长期开放一句话带过；后 4 馆写清本周是否轮到、下次开放日、下次主场周。
  function openRuleHtml(g, today) {
    var G = APP.gymData;
    if (G.ALWAYS.indexOf(g.id) >= 0) {
      return '<div class="gym-note">宝可梦达到 LV' + g.u + ' 就会解锁，长期开放。</div>';
    }
    var pair = G.weekPair(today);
    var featured = pair.indexOf(g.id) >= 0;
    var names = pair.map(function (id) { return G.get(id).n; }).join('、');
    var when = G.isWeekend(today)
      ? '今天是周末，8 馆全开，可以挑战。'
      : (featured
        ? '本周是特殊开放道馆，周一至周日均可挑战。'
        : '本周未轮到，仅周六、周日可挑战；下次开放 ' + fmtDate(G.nextOpenDate(g.id, today)) + '（周六）。');
    var week = G.nextFeaturedWeek(g.id, today);
    return '<div class="gym-note">' +
      '<b>开放规则</b>：后 4 馆每周特殊开放 2 馆，周六日 8 馆全开。' +
      '<br><b>本周特殊开放</b>：' + esc(names) + '。' +
      '<br><b>本馆开放时间</b>：' + when +
      (week ? '<br>下次轮到本馆主场：' + fmtDate(week) + ' 那一周。' : '') +
      '</div>';
  }

  // ===== 单馆「说明」弹窗：奖励表格 + 状态说明 + 本馆开放规则 =====
  // 奖励合计行已去掉；表格随「首次 / 已首通重战 / 大师首通 / 大师已领」变化。
  function detailHtml(g, today, mode) {
    var G = APP.gymData, R = G.RULES, t = TY[g.t] || ['馆主', '#8d8d8d', '❓'];
    var master = mode === 'master' || mode === 'masterDone';
    var rs = G.roles(g, master);
    var names = ['普通职员', '小 boss', '馆主 ' + t[0]];
    var rows = '';
    for (var i = 0; i < 3; i++) {
      rows += '<tr><td>第 ' + (i + 1) + ' 场</td><td>' + esc(names[i]) +
        '</td><td>Lv.' + rs[i].lv + '</td><td>经验 ' + rs[i].exp +
        '</td><td>碎片 ' + rs[i].shards + '</td></tr>';
    }
    var star = master ? g.s * R.masterStarMult : g.s;
    var stateTxt = mode === 'first' ? '首次挑战'
      : mode === 'replay' ? '已首通 · 重战'
      : mode === 'master' ? '大师挑战 · 首次可领星'
      : '大师挑战 · 已领过星';
    var note = mode === 'first'
      ? '首次全通额外获得 <b>' + star + ' ⭐ 心愿星 + 🏅 徽章</b>（每馆仅一次）。'
      : mode === 'replay'
        ? '本馆已首通：重战照常获得经验与碎片，<b>不再给心愿星与徽章</b>。'
        : mode === 'master'
          ? '大师首次通关额外获得 <b>' + star + ' ⭐ 心愿星</b>（首通的 2 倍），不给徽章；重打不再给星。'
          : '本馆大师奖励已领过：照常获得经验与碎片，<b>不再给心愿星</b>。';
    return '<span class="gym-state">' + stateTxt + '</span>' +
      '<table class="gym-tbl"><thead><tr><th>场次</th><th>对手</th><th>等级</th>' +
      '<th>获胜可得</th><th>碎片</th></tr></thead><tbody>' + rows + '</tbody></table>' +
      '<div class="gym-note">' + note + '</div>' +
      openRuleHtml(g, today);
  }

  // ===== 🏅 徽章收集册：2 行 4 列，首通点亮 / 未解锁灰色 =====
  function badgesHtml(st) {
    var G = APP.gymData, got = 0, html = '';
    for (var i = 0; i < G.GYMS.length; i++) {
      var g = G.GYMS[i], t = TY[g.t] || ['馆主', '#8d8d8d', '❓'];
      var lit = st.badges.indexOf(g.id) >= 0;
      if (lit) got++;
      html += '<div class="gym-badge' + (lit ? ' is-lit' : ' is-locked') + '">' +
        '<div class="gym-badge__pic"><img src="assets/hzicon/' + BADGE[g.t] +
          '" alt="' + esc(g.n) + '徽章"></div>' +
        '<div class="gym-badge__name">' + esc(g.n.replace('道馆', '')) + '</div>' +
        '<div class="gym-badge__leader">' + (lit ? '🏅 ' + esc(t[0]) : '🔒 未首通') + '</div>' +
      '</div>';
    }
    return '<div class="gym-badge-case">' +
        '<div class="gym-badge-grid">' + html + '</div>' +
      '</div>' +
      '<div class="gym-note">首通任意道馆即可点亮对应徽章，已点亮 <b>' + got +
        ' / 8</b> 枚徽章。</div>';
  }

  // ===== 顶部开放信息条（A2）=====
  // 前 4 馆长期开放无需说明，只展示「本周特殊开放」的轮转馆，句式统一。
  function openBarHtml(rot, today) {
    var G = APP.gymData;
    var names = rot.weekend ? '全部 8 馆'
      : rot.pair.map(function (id) { return G.get(id).n; }).join('、');
    return '<div class="gym-openbar"><span>本周特殊开放 <b>' + esc(names) +
      '</b></span></div>';
  }

  // 主按钮承载全部不可用原因
  function mainBtn(g, lv, gate, today) {
    if (lv < g.u) return { text: 'LV' + g.u + '解锁挑战', off: true };
    if (!gate.ok) {
      if (gate.reason === 'cooldown') return { text: '冷却 ' + gate.waitDays + ' 天', off: true };
      if (gate.reason === 'closed') {
        return { text: daysUntil(today, gate.nextDate) === 1 ? '明天开放' : '周末开放', off: true };
      }
      return {
        text: gate.reason === 'todayUsed' ? '明天再来'
          : gate.reason === 'weekLimit' ? '本周已用完' : '暂不可挑战',
        off: true
      };
    }
    return { text: '挑战', off: false };
  }

  function render() {
    if (!root || !APP.gymData || !APP.store) return;
    var G = APP.gymData, R = G.RULES;
    var st = APP.store.gymState(), s = APP.store.get();
    var lv = maxLevel();
    var stars = (s.wallet && s.wallet.wishStars) || 0;
    var left = Math.max(0, R.weekLimit - st.used);
    var today = APP.todayStr();
    var rot = G.rotationInfo ? G.rotationInfo(today)
      : { weekend: false, pair: [], open: G.GYMS.map(function (g) { return g.id; }) };

    var html = '<section class="card gym-top">' +
      '<div class="gym-top__row"><h2>🏅 道馆挑战</h2>' +
        '<button type="button" class="gym-info" data-gym="rules">ⓘ 规则</button></div>' +
      '<div class="gym-stat">' +
        '<span>本周剩余 <b>' + left + ' / ' + R.weekLimit + '</b> 次</span>' +
        '<span>最高 <b>Lv.' + lv + '</b></span>' +
        '<span>心愿星 <b>' + stars + ' ⭐</b></span>' +
        '<button type="button" class="gym-badge-entry" data-gym="badges">🏅 徽章 <b>' +
          st.badges.length + ' / 8</b></button>' +
      '</div>' + openBarHtml(rot, today) + '</section>';

    html += '<div class="gym-list">';
    for (var i = 0; i < G.GYMS.length; i++) {
      var g = G.GYMS[i], t = TY[g.t] || ['馆主', '#8d8d8d', '❓'];
      var cleared = st.badges.indexOf(g.id) >= 0;
      var gate = APP.store.canGym(g.id, false);
      var open = rot.open.indexOf(g.id) >= 0;
      var main = mainBtn(g, lv, gate, today);
      var showMaster = cleared && lv >= g.u * 2;
      var mGate = showMaster ? APP.store.canGym(g.id, true) : null;
      var mOff = !mGate || !mGate.ok;
      var btnHtml = '<button type="button" class="gym-btn' + (main.off ? ' is-off' : '') +
          '" data-gym="go" data-id="' + g.id + '" data-master="0"' +
          (main.off ? ' disabled' : '') + '>' + main.text + '</button>' +
        (showMaster
          ? '<button type="button" class="gym-btn is-master' + (mOff ? ' is-off' : '') +
            '" data-gym="go" data-id="' + g.id + '" data-master="1"' +
            (mOff ? ' disabled' : '') + '>大师挑战</button>'
          : '');
      html += '<section class="card gym-card' + (cleared ? ' is-clear' : '') +
        (open ? '' : ' is-closed') + '">' +
        '<div class="gym-card__row">' +
          '<span class="gym-ico" style="background:linear-gradient(135deg,' +
            t[1] + ',' + t[1] + 'cc)">' + t[2] + '</span>' +
          '<div class="gym-card__main">' +
            '<div class="gym-card__name"><h3>' + esc(g.n) + '</h3>' +
              '<span class="gym-leader">👑 ' + esc(t[0]) + '</span>' +
              (cleared ? '<span class="gym-clear">🏅</span>' : '') + '</div>' +
            '<div class="gym-card__sub">' +
              '<button type="button" class="gym-detail" data-gym="detail" data-id="' +
                g.id + '" aria-label="查看奖励说明">说明</button>' +
              btnHtml +
            '</div>' +
          '</div>' +
        '</div>' +
        (open ? '' : '<div class="gym-board"><b>今日休息</b><i>CLOSED · 明日再来</i></div>') +
        '</section>';
    }
    html += '</div>';
    root.innerHTML = html;
  }

  function onClick(e) {
    var b = e.target && e.target.closest ? e.target.closest('[data-gym]') : null;
    if (!b) return;
    var act = b.getAttribute('data-gym');
    if (act === 'rules') { sheet('道馆挑战规则', rulesHtml()); return; }
    if (act === 'badges') { sheet('🏅 道馆徽章收集册', badgesHtml(APP.store.gymState())); return; }
    if (act === 'detail') {
      var id = b.getAttribute('data-id');
      var gd = APP.gymData.get(id);
      var st = APP.store.gymState();
      var cleared = st.badges.indexOf(id) >= 0;
      var masterDone = APP.store.gymMasterDone && APP.store.gymMasterDone(id);
      var mode = !cleared ? 'first'
        : (masterDone ? 'masterDone' : 'replay');
      // 若该馆大师已解锁且未领过奖，说明弹窗同时展示大师首通档（表格按 ×2 等级）。
      if (cleared && !masterDone && maxLevel() >= gd.u * 2) mode = 'master';
      sheet(gd.n + ' · 挑战说明', detailHtml(gd, APP.todayStr(), mode));
      return;
    }
    if (act === 'go') {
      if (b.disabled) return;
      var master = b.getAttribute('data-master') === '1';
      var fn = APP.screens && APP.screens.battle && APP.screens.battle.startGym;
      var r = fn ? fn(b.getAttribute('data-id'), master) : { ok: false, msg: '战斗模块未加载' };
      if (!r.ok) toast(r.msg, true);
    }
  }

  // 一次性委托到 document：#b3-gym-root 每次 APP.refresh() 都会重建，
  // 绑在 root 上的监听容易丢失，这正是 v58「规则 / 说明点击没反应」的隐患之一。
  document.addEventListener('click', onClick);

  function mount(el) {
    if (!el) return;
    root = el;
    render();
  }

  // 旧缓存的 ui.js 没有 sheet：补齐到 APP.ui，让兑换页等其它页面也不再静默失败。
  APP.ui = APP.ui || {};
  if (!APP.ui.sheet) APP.ui.sheet = sheet;

  APP.screens = APP.screens || {};
  APP.screens.gym = { mount: mount, refresh: render };
})(window.APP);
