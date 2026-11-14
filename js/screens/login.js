// 登录页（T3）：账号 + 单密码框分流登录；支持创建新账号
// 交互原则：孩子端只有一个密码框，输小孩密码进前端、输大人密码进后台，不给「选角色」这一步。
// 纯静态版强制登录（无账号即注册 / 登录），不再有「本机模式」；GitHub 仓库地址在「我的数据 → GitHub 同步」里填。
window.APP = window.APP || {};

(function (APP) {
  'use strict';

  var view = 'login'; // login | register | server
  var msg = null;     // { ok: bool, text: string }
  var busy = false;
  var bound = false;
  var lastEl = null;
  var vals = { account: '', pwd: '', nickname: '', childPwd: '', parentPwd: '' };

  function esc(t) {
    return String(t === undefined || t === null ? '' : t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
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

  function loginHtml() {
    return '<section class="card">' +
      '<h2><b>登录账号</b></h2>' +
      '<p>家长和小孩共用账号，使用家长密码进入管理后台，使用小孩密码进入日程打卡。</p>' +
      '<p>忘记小孩密码：家长进管理后台重置即可。<b>家长密码请务必记牢</b>——记录是加密保存的，家长密码也丢失时无法找回数据。</p>' +'<h2></h2>' +
      field('账号', 'lg_account', 'text', vals.account, '') +'<h2></h2>' +
      field('密码', 'lg_pwd', 'password', vals.pwd, '', 'inputmode="numeric"') +
      '<div class="row"><button type="button" class="btn btn--primary btn--block" data-act="login"' +
        (busy ? ' disabled' : '') + '>' + (busy ? '正在进入…' : '进入') + '</button></div>' +
      msgHtml() +
      '</section>' +
      '<section class="card">' +
      '<h2><b>第一次使用？</b></h2>' +
      '<p>一个家一个账号，记录存在账号里，共有两个密码，<b>孩子一个</b>用来看日程、打卡、照顾宝可梦；<b>家长一个</b>用来审核作业、设置任务。</p>' +
      '<div class="row" style="flex-wrap:wrap">' +
        '<button type="button" class="btn btn--sm" data-act="to-register">创建家庭账号</button>' +
      '</div>' +'<h2></h2>' +
      '<p>记录存在账号里，任何设备登录都能看到同一份数据；家长也能在自己手机上审核作业。</p>' +
      '</section>';
  }

  function registerHtml() {
    return '<section class="card">' +
      '<h2>创建家庭账号</h2>' +
      '<p>一个家一个账号，记录存在账号里，共有两个密码，<b>孩子一个</b>用来看日程、打卡、照顾宝可梦；<b>家长一个</b>用来审核作业、设置任务。</p>' +'<h2></h2>' +
      '<p class="field__hint">记录会以加密形式存进 GitHub 仓库（公开仓库也读不到内容）。<b>请牢记家长密码并记下账号码</b>：两样都丢了就无法恢复数据。</p>' +'<h2></h2>' +
      field('孩子昵称', 'rg_nickname', 'text', vals.nickname, '如：小明的日程') +'<h2></h2>' +
      field('小孩密码（4–16 位，建议纯数字）', 'rg_child', 'text', vals.childPwd, '如：2468', 'inputmode="numeric"') +'<h2></h2>' +
      field('家长密码（8–64 位）', 'rg_parent', 'password', vals.parentPwd, '数字+英文组合') +
      '<div class="row"><button type="button" class="btn btn--primary btn--block" data-act="register"' +
        (busy ? ' disabled' : '') + '>' + (busy ? '正在创建…' : '创建账号') + '</button></div>' +
      msgHtml() +
      '</section>' +
      '<section class="card"><div class="row">' +
      '<button type="button" class="btn btn--sm" data-act="to-login">返回登录页面</button>' +
      '</div></section>';
  }

  function html() {
    // 强制登录页是首次使用的唯一入口：GitHub 连接信息必须能在这里填，
    // 否则「进我的数据页配置」在未登录状态下不可达，注册 / 登录会死锁。
    var setup = (APP.ghui && APP.ghui.cardHtml) ? APP.ghui.cardHtml() : '';
    var configured = !!(APP.gh && APP.gh.hasConfig && APP.gh.hasConfig());
    if (!configured) {
      // 未配置：置顶 + 明确引导，避免用户先点注册再撞「请先配置」的提示
      var lead = '<section class="card"><h2>第一步：连接你的 GitHub 仓库</h2>' +
        '<p>记录会加密存放在你自己的 GitHub 仓库里。第一次使用请先完成下面 4 项，' +
        '保存成功后再创建账号或登录。</p>' +
        '<p class="field__hint">还没有仓库和令牌？按仓库里的 README「复制这个仓库，自己部署一份」做一遍即可。</p>' +
        '</section>';
      return lead + setup + (view === 'register' ? registerHtml() : loginHtml());
    }
    if (view === 'register') return setup + registerHtml();
    return loginHtml() + setup;
  }

  function repaint() {
    if (lastEl) render(lastEl);
  }

  function render(container) {
    lastEl = container;
    if (!vals.account && APP.auth) vals.account = APP.auth.lastAccount();
    container.innerHTML = html();

    if (!bound) {
      container.addEventListener('click', onClick);
      container.addEventListener('input', onInput);
      bound = true;
    }
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

    // 首次使用的 GitHub 连接设置卡（gh-save / gh-test / gh-sync）与登录页共用事件委托。
    // 刷新由 ghui 内部按需触发：gh-test/gh-sync 不刷新，避免冲掉用户尚未保存的输入。
    if (APP.ghui && APP.ghui.handle && APP.ghui.handle(act)) return;

    if (act === 'to-register') { view = 'register'; msg = null; return repaint(); }
    if (act === 'to-login') { view = 'login'; msg = null; return repaint(); }
    if (act === 'login') {
      if (!vals.account || !vals.pwd) { msg = { ok: false, text: '请输入账号码和密码' }; return repaint(); }
      busy = true;
      msg = null;
      repaint();
      return APP.auth.login(vals.account, vals.pwd).then(function (res) {
        busy = false;
        if (res.ok) {
          vals.pwd = '';
          if (APP.auth.role() === 'parent') {
            // 家长密码登录 → 直接进入家长后台（路由由 #/parent 驱动，隐藏子功能 tab）
            window.location.hash = '#/parent';
          }
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
        if (res.ok) {
          vals.account = res.accountId;
          vals.pwd = '';
          vals.childPwd = '';
          vals.parentPwd = '';
          view = 'login';
          msg = { ok: true, text: '账号已创建，账号码：' + res.accountId + '（请记下来）' };
          return repaint();
        }
        msg = { ok: false, text: res.error || '注册失败' };
        repaint();
      });
    }
  }

  APP.screens.login = { render: render };
})(window.APP);
