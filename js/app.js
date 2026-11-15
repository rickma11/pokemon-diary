(function () {
  'use strict';

  var APP = window.APP;

  var ICON = {
    check: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 12.5l5 5L20 6.5"/></svg>',
    heart: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20.5S4.5 16 4.5 10.8A4.3 4.3 0 0112 8.1a4.3 4.3 0 017.5 2.7C19.5 16 12 20.5 12 20.5z"/></svg>',
    park: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3.5 20.5h17"/><path d="M6 20.5V10l6-4 6 4v10.5"/></svg>',
    exchange: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 7h13"/><path d="M14 4l3 3-3 3"/><path d="M20 17H7"/><path d="M10 14l-3 3 3 3"/></svg>',
    book: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 4.5A1.5 1.5 0 016.5 3H19v15H6.5A1.5 1.5 0 005 19.5V4.5z"/><path d="M5 19.5A1.5 1.5 0 006.5 21H19"/><path d="M8.5 7.5h7M8.5 11h7"/></svg>',
    explore: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="8.5"/><path d="M12 3.5v17M3.5 12h17"/><path d="M7 7l10 10"/></svg>',
    mine: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 20v-7"/><path d="M10 20V4"/><path d="M16 20v-11"/><path d="M3 20h18"/></svg>'
  };

  // sb：该页底部状态栏的显示档位（full 完整 / mini 极简 / none 隐藏）
  // B1：兑换 tab 放「乐园之后、图鉴之前」（用户拍板）；B4 后对战回归为探险页内「外出战斗」页签
  var TABS = [
    { id: 'schedule', label: '日程', icon: ICON.check, sb: 'none' },
    { id: 'care', label: '养成', icon: ICON.heart, sb: 'full' },
    { id: 'ranch', label: '乐园', icon: ICON.park, sb: 'none' },
    { id: 'catch', label: '探险', icon: ICON.explore, sb: 'full' },
    { id: 'exchange', label: '兑换', icon: ICON.exchange, sb: 'none' },
    { id: 'dex', label: '图鉴', icon: ICON.book, sb: 'mini' },
    { id: 'mine', label: '我的数据', icon: ICON.mine, sb: 'none' }
  ];

  // 功能解锁：需解锁的 tab（与 APP.unlock 配合）
  var GATED_TABS = ['ranch', 'catch', 'exchange', 'dex'];
  function tabLocked(id) {
    if (GATED_TABS.indexOf(id) < 0) return false;
    if (APP.unlock && APP.unlock.gate) return !APP.unlock.gate(id);
    return false;
  }
  function tabLabel(id) {
    for (var i = 0; i < TABS.length; i++) if (TABS[i].id === id) return TABS[i].label;
    return id;
  }
  function renderLocked(tab) {
    var info = APP.unlock && APP.unlock.tierInfo ? APP.unlock.tierInfo(tab) : null;
    var req = info && info.req ? info.req : '继续完成任务、提升主力宝可梦等级即可解锁';
    screenEl.innerHTML =
      '<section class="card lock-card">' +
        '<div class="lock-card__icon">🔒</div>' +
        '<h2>' + tabLabel(tab) + ' · 未解锁</h2>' +
        '<p>解锁条件：' + req + '</p>' +
        '<div class="row"><button type="button" class="btn btn--primary" data-goback="1">返回日程</button></div>' +
      '</section>';
    var b = screenEl.querySelector('[data-goback]');
    if (b) b.addEventListener('click', function () { window.location.hash = '#/schedule'; });
  }

  function sbModeOf(tab) {
    for (var i = 0; i < TABS.length; i++) {
      if (TABS[i].id === tab) return TABS[i].sb || 'full';
    }
    return 'full';
  }

  var SCREENS = {
    schedule: { title: '今日日程', note: '五类任务列表、一键打钩、作业拍照提交 — Task 3 实现' },
    care: { title: '宝可梦养成', note: '饱食度 / 心情 / 体力三维状态、喂食、玩耍入口 — Task 7 实现' },
    ranch: { title: '宝可梦乐园', note: '帮手槽位、切换养成主角、羁绊按天结算 — Task 8 实现' },
    catch: { title: '野外探险', note: '草丛遇敌、抛球捕捉、收服小游戏、外出战斗 — B3 / B4 实现' },
    exchange: { title: '兑换中心', note: '碎片换精灵球 / 战斗券 — B1 实现' },
    dex: { title: '宝可梦图鉴', note: '前三世代 61 个进化家族、属性筛选、进化链详情 — 已实现' }
  };

  var DEFAULT_TAB = 'schedule';

  var screenEl = document.getElementById('screen');
  var tabbarEl = document.getElementById('tabbar');
  var statusbarEl = document.getElementById('statusbar');
  var logoEl = document.getElementById('appLogo');
  var parentEntryEl = document.getElementById('parentEntry');
  var pressHintEl = document.getElementById('pressHint');
  var pressBarEl = document.getElementById('pressBar');
  var todayLabelEl = document.getElementById('todayLabel');

  function currentTab() {
    var hash = String(window.location.hash || '').replace('#/', '').replace('#', '');
    if (hash === 'parent') return 'parent';
    if (!hash) return DEFAULT_TAB;
    for (var i = 0; i < TABS.length; i++) {
      if (TABS[i].id === hash) return hash;
    }
    return DEFAULT_TAB;
  }

  function isStandalone() {
    if (window.navigator.standalone) return true;
    if (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches) return true;
    return false;
  }

  function renderTabs(active) {
    var html = '';
    for (var i = 0; i < TABS.length; i++) {
      var t = TABS[i];
      var locked = tabLocked(t.id);
      var cls = t.id === active ? 'tab is-active' : 'tab';
      if (locked) cls += ' is-locked';
      html += '<button type="button" class="' + cls + '" role="tab" aria-selected="' +
        (t.id === active ? 'true' : 'false') + '" data-tab="' + t.id + '"' + (locked ? ' aria-disabled="true"' : '') + '>' +
        t.icon + '<span>' + t.label + '</span>' +
        (locked ? '<i class="tab-lock" title="未解锁">🔒</i>' : '') +
        '</button>';
    }
    tabbarEl.innerHTML = html;
  }

  function renderPlaceholder(id) {
    var s = SCREENS[id] || { title: '页面加载中', note: '该页面暂未实现，请返回日程页。' };
    var html = '<section class="card"><h2>' + s.title + '</h2><p>' + s.note + '</p></section>';
    if (id !== 'parent') {
      html += '<section class="card"><h2>界面预览位</h2><div class="placeholder">内容区域，后续任务逐个填充</div></section>';
    }
    screenEl.innerHTML = html;
  }

  function renderScreen(id) {
    var mod = APP.screens && APP.screens[id];
    if (mod && typeof mod.render === 'function') {
      mod.render(screenEl);
    } else {
      renderPlaceholder(id);
    }
  }

  function updateSwStatus() {
    var el = document.getElementById('swStatus');
    if (!el) return;
    if (!('serviceWorker' in navigator)) {
      el.textContent = '当前浏览器不支持';
      return;
    }
    if (window.location.protocol !== 'http:' && window.location.protocol !== 'https:') {
      el.textContent = '需通过 http 访问才生效';
      return;
    }
    navigator.serviceWorker.getRegistration().then(function (reg) {
      el.textContent = reg ? '已启用（可离线打开）' : '注册中';
    })['catch'](function () {
      el.textContent = '注册中';
    });
  }

  function renderDate() {
    var d = new Date();
    var week = ['日', '一', '二', '三', '四', '五', '六'][d.getDay()];
    todayLabelEl.textContent = d.getFullYear() + '年' + (d.getMonth() + 1) + '月' + d.getDate() + '日 星期' + week;
  }

  // 顶栏实时时钟（北京时间 = 设备本地时区），每秒走字
  var clockEl = document.getElementById('topClock');
  var clockTimer = null;
  function renderClock() {
    if (clockEl) clockEl.textContent = APP.nowHMS();
  }
  function startClock() {
    if (clockTimer) return;
    renderClock();
    clockTimer = setTimeout(function () {
      clockTimer = null;
      renderClock();
      startClock();
    }, 1000);
  }

  // 跨天看守：页面开着跨过 0 点时，自动刷新成新一天的任务（无需手动刷新页面）
  var dateGuardTimer = null;
  var guardDate = APP.todayStr();
  function startDateGuard() {
    if (dateGuardTimer) return;
    dateGuardTimer = setTimeout(function () {
      dateGuardTimer = null;
      var now = APP.todayStr();
      if (now !== guardDate) {
        guardDate = now;
        renderDate();
        render();
      }
      startDateGuard();
    }, 30000);
  }

  var lastTab = null;

  // 没登录就用着（记录只在这台设备）时，每隔几天问一次要不要注册账号。
  // 写了日期就当天不再打扰，选哪个都算「已提醒过」，7 天后再来。
  var ASK_KEY = 'pokedex-checkin-askdate';
  var ASK_DAYS = 7;
  var askShown = false;
  function dayGap(from, to) {
    var t1 = new Date(from + 'T00:00:00').getTime();
    var t2 = new Date(to + 'T00:00:00').getTime();
    if (isNaN(t1) || isNaN(t2)) return ASK_DAYS;
    return Math.floor((t2 - t1) / 86400000);
  }
  // 纯静态强制登录：无会话时直接显示登录页，不再询问「是否本机使用」，此提示已不再需要
  function maybeAskRegister() {
    // 账号体系已改为强制登录（无本机模式），登录页会主动引导注册 / 登录，无需弹窗催促
  }

  // 墨水屏自动检测：命中单色/强制颜色媒体查询，或已知墨水屏设备 UA 时启用灰阶
  function detectInkDevice() {
    try {
      if (window.matchMedia) {
        if (window.matchMedia('(monochrome)').matches) return true;
        if (window.matchMedia('(forced-colors: active)').matches) return true;
      }
      var ua = String(navigator.userAgent || '');
      if (/E-?ink|BOOX|Hisense|reMarkable|PocketBook|Kindle|Bigme|Meebook|Nova ?Air|Silk/i.test(ua)) return true;
    } catch (e) {}
    return false;
  }

  // 显示模式：settings.inkMode = auto（默认，自动检测）/ color / ink
  function applyInkMode() {
    var mode = 'auto';
    try { mode = (APP.store.settings() && APP.store.settings().inkMode) || 'auto'; } catch (e) {}
    var on = mode === 'ink' || (mode === 'auto' && detectInkDevice());
    document.body.classList.toggle('ink', !!on);
  }

  // 账号门禁（T3）：已接入服务器且未登录 → 显示登录页；本机模式 / 未接入服务器时保持原有免登录体验
  function needLogin() {
    try { return !!(APP.auth && APP.auth.needLogin && APP.auth.needLogin()); } catch (e) { return false; }
  }

  // 能否进家长后台：大人身份可以；小孩身份一律不可以；未登录（无会话）不允许
  function canParent() {
    if (!APP.auth) return true;
    var role = APP.auth.role();
    if (role === 'parent') return true;
    if (role === 'child') return false;
    return false;
  }

  function render() {
    // 账号归属先对齐：登录了新账号就把本地旧记录收进独立槽、载入该账号自己的数据。
    // 必须在 applyInkMode / sync.start / onboarding 之前，否则首登会按旧存档误判。
    if (APP.sync && APP.sync.ensureSlot) APP.sync.ensureSlot();
    applyInkMode();
    // 数据来源分叉待用户二选一：冻结首登 / 注册提醒 / 解锁引导，避免两层浮层打架
    var fork = !!(APP.sync && APP.sync.forkPending && APP.sync.forkPending());
    if (needLogin()) {
      document.body.classList.remove('in-parent');
      tabbarEl.style.display = 'none';
      if (APP.statusbar) APP.statusbar.render('none');
      else statusbarEl.style.display = 'none';
      if (parentEntryEl) parentEntryEl.style.display = 'none';
      renderScreen('login');
      // 未登录时不跑新手引导：门禁在 onboarding.run() 统一判定。
      // 否则浮层会盖住 GitHub 配置卡，且选择结果写进本地后会挡住云端真实存档。
      return;
    }
    // 已登录 → 启动同步（内部防重）；首次拉取结束后由 sync 触发一次 refresh 重判引导门禁
    if (APP.sync && APP.sync.start) APP.sync.start();
    // 首登引导：未引导过则弹出选择流程（内部防重）
    if (!fork && APP.onboarding && APP.onboarding.maybeRun) APP.onboarding.maybeRun();
    var tab = currentTab();
    // 从后台切走（含浏览器返回键）时清登录态，下次进入必须重新输密码
    if (lastTab === 'parent' && tab !== 'parent') {
      if (APP.screens && APP.screens.parent && APP.screens.parent.reset) {
        APP.screens.parent.reset();
      }
    }
    lastTab = tab;
    if (tab === 'parent' && (!APP.screens || !APP.screens.parent)) {
      // 家长屏未注册（加载失败）时回到日程页，避免空白
      window.location.hash = '#/schedule';
      return;
    }
    if (tab === 'parent' && !canParent()) {
      // 小孩 token 直接访问后台 → 回日程页
      window.location.hash = '#/schedule';
      return;
    }
    if (tab === 'parent') {
      document.body.classList.add('in-parent');
      renderScreen('parent');
      tabbarEl.style.display = 'none';
      if (APP.statusbar) APP.statusbar.render('none');
      else statusbarEl.style.display = 'none';
      return;
    }
    // 首登引导进行中：只保留覆盖层，不渲染底部导航与页面
    if (APP.onboarding && APP.onboarding.active && APP.onboarding.active()) {
      tabbarEl.style.display = 'none';
      if (APP.statusbar) APP.statusbar.render('none');
      startDateGuard();
      return;
    }
    document.body.classList.remove('in-parent');
    if (parentEntryEl) parentEntryEl.style.display = '';
    renderTabs(tab);
    if (tabLocked(tab)) renderLocked(tab); else renderScreen(tab);
    tabbarEl.style.display = '';
    if (APP.statusbar) APP.statusbar.render(sbModeOf(tab));
    // 播放升级 / 进化等反馈（家长后台不播，事件留到孩子端再看）
    if (APP.events) APP.events.flush();
    // 没登录时定期问一次要不要注册账号（首登刚结束的这一拍不打断引导）
    var skipAsk = !fork && APP.onboarding && APP.onboarding.consumeJustFinished && APP.onboarding.consumeJustFinished();
    // 解锁检查先跑：本次若有新解锁讲解，「要不要注册账号」就延到下次再问，
    // 否则两个弹窗会同屏叠在一起，把博士讲解挤得看不见。
    var unlockRes = (!fork && APP.unlock && APP.unlock.check) ? APP.unlock.check() : null;
    var docPlaying = !!(unlockRes && unlockRes.played);
    if (!fork && !skipAsk && !docPlaying) maybeAskRegister();
    else if (skipAsk) { try { window.localStorage.setItem(ASK_KEY, APP.todayStr()); } catch (e) {} } // 当天不再打扰
    // 手机首次打开日程页问一次要不要放到桌面：首登刚结束这一拍优先，
    // 已完成首登的老用户升级后第一次打开也会问；pwaInstall 内部保证只问一次。
    if (tab === 'schedule' && APP.pwaInstall && APP.pwaInstall.maybePrompt) {
      APP.pwaInstall.maybePrompt();
    }
    // 保证跨天看守在跑（内部防重）
    startDateGuard();
  }

  APP.refresh = function () {
    render();
  };

  tabbarEl.addEventListener('click', function (e) {
    var btn = e.target;
    while (btn && btn !== tabbarEl && !btn.getAttribute('data-tab')) {
      btn = btn.parentNode;
    }
    if (!btn || btn === tabbarEl) return;
    var id = btn.getAttribute('data-tab');
    if (id === currentTab()) return;
    if (tabLocked(id)) {
      var info = APP.unlock && APP.unlock.tierInfo ? APP.unlock.tierInfo(id) : null;
      var msg = '🔒 ' + tabLabel(id) + ' 尚未解锁';
      if (info && info.req) msg += '：' + info.req;
      if (APP.unlock && APP.unlock.toast) APP.unlock.toast(msg);
      return;
    }
    window.location.hash = '#/' + id;
  });

  window.addEventListener('hashchange', render);

  // 家长后台入口：顶部「家长」按钮（可见）/ 长按顶部图标 3 秒（隐蔽）
  function goParent() {
    if (!canParent()) return;
    if (currentTab() !== 'parent') window.location.hash = '#/parent';
  }

  // 顶部「家长」按钮被点击：家长身份直接进；小孩身份需再输一次家长密码（不让小孩绕过密码进后台）
  function onParentEntry() {
    if (canParent()) { goParent(); return; }
    promptParentPassword();
  }

  // 小孩身份进入家长后台：弹窗输入家长密码，验证通过才切换为家长会话并跳转；连续输错会触发 30 秒锁定提示
  function promptParentPassword() {
    var s = APP.auth && APP.auth.session();
    if (!s) { window.location.hash = '#/login'; return; }
    var el = document.getElementById('uiOverlay');
    if (!el) { el = document.createElement('div'); el.id = 'uiOverlay'; el.className = 'ui-overlay'; document.body.appendChild(el); }
    el.style.display = '';
    el.innerHTML =
      '<div class="ui-overlay__bg" data-close="1"></div>' +
      '<div class="ui-modal" role="dialog" aria-label="进入家长后台">' +
        '<h3 class="ui-modal__title">' + '请输入家长密码' + '</h3>' +
        '<p class="ui-modal__msg" style="font-size:13px;opacity:.8">用家长密码进入管理后台，孩子的密码进不去。</p>' +
        '<label class="field"><span>家长密码</span>' +
          '<input id="ppPwd" type="password" autocomplete="off" inputmode="text" placeholder="可输入数字和字母"></label>' +
        '<p class="hint" id="ppErr" style="color:#c0392b;display:none"></p>' +
        '<div class="row">' +
          '<button type="button" class="btn" data-c="0">取消</button>' +
          '<button type="button" class="btn btn--primary" data-c="1">进入后台</button>' +
        '</div>' +
      '</div>';
    var input = document.getElementById('ppPwd');
    if (input && input.focus) input.focus();
    function closeM() { el.innerHTML = ''; el.onclick = null; el.style.display = 'none'; }
    el.onclick = function (e) {
      var t = e.target;
      var c = t.getAttribute && t.getAttribute('data-c');
      if (c === '1') {
        var pwd = (document.getElementById('ppPwd') || {}).value || '';
        var er = document.getElementById('ppErr');
        if (!pwd) { if (er) { er.style.display = ''; er.textContent = '请输入家长密码'; } return; }
        APP.auth.login(s.accountId, pwd).then(function (res) {
          if (res && res.ok && res.role === 'parent') { closeM(); window.location.hash = '#/parent'; APP.refresh(); return; }
          if (er) { er.style.display = ''; er.textContent = (res && res.error) || '密码不正确'; }
        });
        return;
      }
      if (c === '0' || (t.getAttribute && t.getAttribute('data-close'))) closeM();
    };
  }

  // 长按顶部图标 3 秒进入（含实时进度反馈）
  var pressTimer = null;
  var pressStartTime = 0;
  function startPress() {
    if (!canParent()) return;
    if (pressTimer || currentTab() === 'parent') return;
    if (pressHintEl) { pressHintEl.classList.add('is-on'); }
    if (pressBarEl) {
      pressBarEl.style.transition = 'none';
      pressBarEl.style.width = '0%';
      // 强制重排后再加过渡，保证每次都从 0 开始
      void pressBarEl.offsetWidth;
      pressBarEl.style.transition = 'width 3s linear';
      pressBarEl.style.width = '100%';
    }
    pressStartTime = Date.now();
    pressTimer = setTimeout(function () {
      pressTimer = null;
      stopPress();
      window.location.hash = '#/parent';
    }, 3000);
  }
  function stopPress() {
    if (pressHintEl) pressHintEl.classList.remove('is-on');
    if (pressBarEl) { pressBarEl.style.transition = 'none'; pressBarEl.style.width = '0%'; }
  }
  function cancelPress() {
    if (pressTimer) { clearTimeout(pressTimer); pressTimer = null; }
    stopPress();
  }
  if (logoEl) {
    logoEl.addEventListener('touchstart', startPress, { passive: true });
    logoEl.addEventListener('touchend', cancelPress);
    logoEl.addEventListener('touchcancel', cancelPress);
    logoEl.addEventListener('mousedown', startPress);
    logoEl.addEventListener('mouseup', cancelPress);
    logoEl.addEventListener('mouseleave', cancelPress);
  }
  if (parentEntryEl) {
    parentEntryEl.addEventListener('click', onParentEntry);
  }

  APP.store.get();
  APP.store.settle();

  // 纯静态强制登录：无会话即显示登录页（登录页会引导注册 / 登录），不再有启动探测 / 本机模式

  renderDate();
  render();
  startClock();

  if ('serviceWorker' in navigator &&
      (window.location.protocol === 'http:' || window.location.protocol === 'https:')) {
    // 发版后自动切到新版：SW 在后台发现首页 ETag 变了会通知这里，页面自动刷新一次。
    // sessionStorage 按版本号记账，同一版本只刷一次，不会来回抖。
    (function () {
      var KEY = 'pokedex-shell-reload';
      function reloadOnce(ver) {
        var v = String(ver || 'new');
        try {
          if (window.sessionStorage.getItem(KEY) === v) return;
          window.sessionStorage.setItem(KEY, v);
        } catch (e) {}
        window.location.reload();
      }
      navigator.serviceWorker.addEventListener('message', function (e) {
        if (e.data && e.data.type === 'SHELL_UPDATED') reloadOnce(e.data.ver);
      });
    })();
    window.addEventListener('load', function () {
      var sw = navigator.serviceWorker;
      // 旧版 SW 注册在 js/ 子目录：作用域只覆盖 js/，既缓存不到首页，
      // 又会把没缓存的 JS 换成 HTML 壳。先注销它，再注册根目录版本。
      sw.getRegistrations().then(function (regs) {
        var jobs = [];
        for (var i = 0; i < regs.length; i++) {
          var a = regs[i].active || regs[i].waiting || regs[i].installing;
          if (a && a.scriptURL.indexOf('/js/sw.js') >= 0) jobs.push(regs[i].unregister());
        }
        return Promise.all(jobs);
      })['catch'](function () {}).then(function () {
        // updateViaCache: none —— 每次打开都检查 sw.js 是否更新，不被 HTTP 缓存挡住
        return sw.register('sw.js', { scope: './', updateViaCache: 'none' });
      })['catch'](function () {});
    });
  }
})();
