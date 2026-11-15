// 登录页：登录 / 注册同框分页签（默认登录，参考国内站做法）；强制登录 + 首次 GitHub 连接配置。
// 交互原则：孩子端只有一个密码框，输小孩密码进前端、输大人密码进后台，不给「选角色」这一步。
// 首次顺序：① 本页填 GitHub 连接（保存即验证）→ ② 注册 / 登录账号（注册成功直接进应用）
//           → ③ 云端首次拉取完成后才进入新手引导（门禁在 onboarding.js）。
window.APP = window.APP || {};

(function (APP) {
  'use strict';

  var view = 'login'; // login | register
  var msg = null;     // { ok: bool, text: string }
  var busy = false;
  var bound = false;
  var lastEl = null;
  var showSetup = false;   // 已配置时是否展开完整设置卡（默认折叠，缩短首屏）
  var wasConfigured = null;// 上一帧配置状态：用于「刚保存好连接」时滚到第二步
  var vals = { account: '', pwd: '', nickname: '', childPwd: '', parentPwd: '' };

  function esc(t) {
    return String(t === undefined || t === null ? '' : t)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  function field(label, id, type, value, placeholder, extra) {
    return '<label class="field"><span>' + esc(label) + '</span>' +
      '<input id="' + id + '" type="' + type + '" value="' + esc(value) + '"' +
      (placeholder ? ' placeholder="' + esc(placeholder) + '"' : '') +
      ' autocomplete="off" ' + (extra || '') + '></label>';
  }

  function msgHtml() {
    if (!msg) return '';
    return '<p class="hint"' + (msg.ok ? '' : ' style="color:#c0392b"') + '>' + esc(msg.text) + '</p>';
  }

  // 登录 / 注册同框：一张卡 + 两个下划线页签，默认高亮「登录账号」
  function tabsHtml() {
    return '<div class="auth-tabs">' +
      '<button type="button" class="auth-tab' + (view === 'login' ? ' is-on' : '') +
        '" data-act="tab-login">登录账号</button>' +
      '<button type="button" class="auth-tab' + (view === 'register' ? ' is-on' : '') +
        '" data-act="tab-register">账号注册</button>' +
      '</div>';
  }

  function loginFormHtml() {
    return '<p>家长和小孩共用账号：用<b>家长密码</b>进入管理后台，用<b>小孩密码</b>进入日程打卡，不用选角色。</p>' +
      '<p class="field__hint">账号可填 <b>昵称</b>（如 马一一）、<b>短码</b>（如 wd52it）或 <b>完整账号码</b>（马一一-wd52it），三种都能登录。</p>' +
      field('账号', 'lg_account', 'text', vals.account, '昵称 / 短码 / 完整账号码') +
      field('密码', 'lg_pwd', 'password', vals.pwd, '', 'inputmode="numeric"') +
      '<div class="row"><button type="button" class="btn btn--primary btn--block" data-act="login"' +
        (busy ? ' disabled' : '') + '>' + (busy ? '正在进入…' : '进入') + '</button></div>' +
      msgHtml() +
      '<p class="field__hint">忘记小孩密码：家长进管理后台重置即可。<b>家长密码请务必记牢</b>——记录是加密保存的，家长密码也丢失时无法找回数据。</p>';
  }

  function registerFormHtml() {
    return '<p>一个家一个账号：<b>孩子密码</b>用来看日程、打卡、照顾宝可梦；<b>家长密码</b>用来审核作业、设置任务。</p>' +
      '<p class="field__hint">记录以加密形式存进 GitHub 仓库（公开仓库也读不到内容）。<b>注册成功后直接进入应用</b>，请先抄下弹窗里的账号码。</p>' +
      field('孩子昵称（也能直接当账号登录）', 'rg_nickname', 'text', vals.nickname, '如：马一一') +
      field('小孩密码（4–16 位，建议纯数字）', 'rg_child', 'text', vals.childPwd, '如：2468', 'inputmode="numeric"') +
      field('家长密码（8–64 位）', 'rg_parent', 'password', vals.parentPwd, '数字+英文组合') +
      '<div class="row"><button type="button" class="btn btn--primary btn--block" data-act="register"' +
        (busy ? ' disabled' : '') + '>' + (busy ? '正在创建…' : '创建账号') + '</button></div>' +
      msgHtml();
  }

  function authCardHtml() {
    return '<section class="card" id="authCard">' +
      tabsHtml() +
      (view === 'register' ? registerFormHtml() : loginFormHtml()) +
      '</section>';
  }

  function html() {
    // 强制登录页是首次使用的唯一入口：未登录时进不去「我的数据」页，连接信息必须能在这里填。
    var configured = !!(APP.gh && APP.gh.hasConfig && APP.gh.hasConfig());
    var full = (APP.ghui && APP.ghui.fullCardHtml) ? APP.ghui.fullCardHtml() : '';
    var compact = (APP.ghui && APP.ghui.compactCardHtml)
      ? APP.ghui.compactCardHtml({ expandButton: true }) : '';
    if (!configured) {
      var lead = '<section class="card"><h2>第一步：连接已建好的数据仓库</h2>' +
        '<p>记录会加密存放在<b>部署者已创建好的</b> GitHub 仓库里。这里只是填地址，<b>不需要新建仓库</b>；' +
        '填完 4 项点「保存设置」会自动验证连接。</p>' +
        '<p class="field__hint">还没有仓库和令牌？按仓库里 README 的「复制这个仓库，自己部署一份」做一遍即可。</p>' +
        '</section>';
      return lead + full + authCardHtml();
    }
    // 已配置：账号卡置顶（第二步），连接设置收在底部（折叠态仍可一键同步）
    var step2 = '<section class="card" id="step2"><h2>第二步：登录或创建家庭账号</h2>' +
      '<p>仓库已连接。已有账号直接登录；第一次使用点右上角「账号注册」。注册成功后会直接进入应用，' +
      '云端数据拉取完成后再进入新手引导。</p></section>';
    var setup = showSetup
      ? full + '<section class="card"><div class="row">' +
          '<button type="button" class="btn btn--sm" data-act="gh-collapse">收起连接设置</button>' +
        '</div></section>'
      : compact;
    return step2 + authCardHtml() + setup;
  }

  function repaint() {
    if (lastEl) render(lastEl);
  }

  function render(container) {
    lastEl = container;
    if (!vals.account && APP.auth) vals.account = APP.auth.lastAccount();
    var configured = !!(APP.gh && APP.gh.hasConfig && APP.gh.hasConfig());
    container.innerHTML = html();

    if (!bound) {
      container.addEventListener('click', onClick);
      container.addEventListener('input', onInput);
      bound = true;
    }
    // 刚保存好连接的那一拍，把「第二步 / 账号表单」滚到可视区
    if (wasConfigured === false && configured && typeof document !== 'undefined') {
      var el = document.getElementById('step2');
      if (el && el.scrollIntoView) {
        try { el.scrollIntoView({ behavior: 'smooth', block: 'start' }); }
        catch (e) { el.scrollIntoView(); }
      }
    }
    wasConfigured = configured;
  }

  function onInput(e) {
    var id = e.target && e.target.id;
    if (!id) return;
    if (id === 'lg_account') vals.account = e.target.value;
    else if (id === 'lg_pwd') vals.pwd = e.target.value;
    else if (id === 'rg_nickname') vals.nickname = e.target.value;
    else if (id === 'rg_child') vals.childPwd = e.target.value;
    else if (id === 'rg_parent') vals.parentPwd = e.target.value;
  }

  function onClick(e) {
    var btn = e.target;
    while (btn && btn.getAttribute && !btn.getAttribute('data-act')) btn = btn.parentNode;
    if (!btn || !btn.getAttribute) return;
    var act = btn.getAttribute('data-act');

    if (act === 'gh-expand') { showSetup = true; return repaint(); }
    if (act === 'gh-collapse') { showSetup = false; return repaint(); }

    // 首次使用的 GitHub 连接设置卡（gh-save / gh-test / gh-sync）与登录页共用事件委托。
    // 刷新由 ghui 内部按需触发：保存成功才刷新，失败保持展开让用户就地修改。
    if (APP.ghui && APP.ghui.handle && APP.ghui.handle(act)) return;

    if (act === 'tab-login' || act === 'to-login') { view = 'login'; msg = null; return repaint(); }
    if (act === 'tab-register' || act === 'to-register') { view = 'register'; msg = null; return repaint(); }
    if (act === 'login') {
      if (!vals.account || !vals.pwd) { msg = { ok: false, text: '请输入账号和密码' }; return repaint(); }
      busy = true;
      msg = null;
      repaint();
      return APP.auth.login(vals.account, vals.pwd).then(function (res) {
        busy = false;
        if (res.ok) {
          vals.pwd = '';
          if (APP.auth.role() === 'parent') window.location.hash = '#/parent';
          APP.refresh();
          return;
        }
        msg = { ok: false, text: res.error || '登录失败' };
        repaint();
      });
    }
    if (act === 'register') {
      if (!vals.nickname) { msg = { ok: false, text: '请填孩子昵称' }; return repaint(); }
      if (vals.childPwd.length < 4 || vals.childPwd.length > 16) { msg = { ok: false, text: '小孩密码需 4–16 位' }; return repaint(); }
      if (vals.parentPwd.length < 8 || vals.parentPwd.length > 64) { msg = { ok: false, text: '大人密码需 8–64 位' }; return repaint(); }
      busy = true;
      msg = null;
      repaint();
      return APP.auth.register(vals.nickname, vals.childPwd, vals.parentPwd).then(function (res) {
        busy = false;
        if (!res.ok) { msg = { ok: false, text: res.error || '注册失败' }; return repaint(); }
        vals.account = res.accountId;
        vals.pwd = '';
        vals.childPwd = '';
        vals.parentPwd = '';
        var names = '<div style="text-align:left;line-height:1.9">' +
          '账号创建成功！下面三种都能登录，<b>请抄下来</b>：<br>' +
          '· 昵称：<b>' + esc(res.nickname || '') + '</b><br>' +
          '· 短码：<b>' + esc(res.short || '') + '</b><br>' +
          '· 完整账号码：<b>' + esc(res.accountId) + '</b><br>' +
          '<span style="font-size:12px;color:#666d80">登录时输对应的小孩 / 家长密码。家长密码和账号码都丢失时无法恢复数据。</span></div>';
        function enterApp() {
          view = 'login';
          // 注册已写入会话：直接进应用，不再要求二次登录（新手引导由云端拉取门禁决定）
          if (APP.refresh) APP.refresh();
        }
        if (APP.ui && APP.ui.noticeCard) {
          return APP.ui.noticeCard({ title: '账号已创建', msg: names, ok: '记下了，开始使用' }).then(enterApp);
        }
        return enterApp();
      });
    }
  }

  APP.screens.login = { render: render };
})(window.APP);
