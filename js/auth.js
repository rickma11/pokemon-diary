// 账号与会话（纯静态 + GitHub 仓库版）
// 账号记录存 GitHub：accounts/{accountId}.json（含 PBKDF2 哈希的密码）
// 存档存 GitHub：saves/{accountId}.json（由 sync 层读写）
// 强制登录：无会话即要求登录 / 注册，不再有「本机模式」。
window.APP = window.APP || {};

(function (APP) {
  'use strict';

  var K_AUTH = 'pokedex-checkin-auth';
  var K_ACCOUNT = 'pokedex-checkin-account';

  function ls(k) { try { return window.localStorage.getItem(k); } catch (e) { return null; } }
  function lsSet(k, v) { try { window.localStorage.setItem(k, v); return true; } catch (e) { return false; } }
  function lsDel(k) { try { window.localStorage.removeItem(k); } catch (e) {} }

  function session() {
    var raw = ls(K_AUTH);
    if (!raw) return null;
    try {
      var s = JSON.parse(raw);
      if (!s || !s.accountId) return null;
      return s;
    } catch (e) { return null; }
  }
  function store(s) { if (s) lsSet(K_AUTH, JSON.stringify(s)); else lsDel(K_AUTH); }
  function lastAccount() { return ls(K_ACCOUNT) || ''; }

  // —— 密码哈希（PBKDF2-SHA256，浏览器 Web Crypto；需 https 或 localhost 安全上下文）——
  function bufToHex(buf) {
    return Array.prototype.map.call(new Uint8Array(buf), function (b) {
      return ('0' + b.toString(16)).slice(-2);
    }).join('');
  }
  function genSalt() {
    var a = new Uint8Array(8);
    if (window.crypto && window.crypto.getRandomValues) window.crypto.getRandomValues(a);
    else for (var i = 0; i < a.length; i++) a[i] = Math.floor(Math.random() * 256);
    return bufToHex(a);
  }
  function hashPwd(pwd, salt) {
    if (!window.crypto || !window.crypto.subtle) return Promise.reject(new Error('当前环境不支持加密（请用 https 打开）'));
    var enc = new TextEncoder();
    return window.crypto.subtle.importKey('raw', enc.encode(pwd), 'PBKDF2', false, ['deriveBits']).then(function (km) {
      return window.crypto.subtle.deriveBits(
        { name: 'PBKDF2', salt: enc.encode(salt), iterations: 100000, hash: 'SHA-256' }, km, 256);
    }).then(bufToHex);
  }

  function gh() { return APP.gh; }
  function needCfg() {
    var c = gh() && gh().config();
    if (!c) return null;
    return c;
  }

  // 注册：在 GitHub 建账号文件 + 首份存档（把当前本机数据作为这个账号的起点）
  function register(nickname, childPwd, parentPwd) {
    if (!needCfg()) {
      return Promise.resolve({ ok: false, error: '请先在「我的数据 → GitHub 同步」里填写仓库与访问令牌' });
    }
    var slug = String(nickname || '').trim().toLowerCase().replace(/[^a-z0-9\u4e00-\u9fa5]/g, '').slice(0, 8) || 'home';

    function tryCreate(attempt) {
      if (attempt > 8) return Promise.resolve({ ok: false, error: '生成账号码失败，请重试' });
      var id = slug + '-' + Math.random().toString(36).slice(2, 6);
      return gh().getFile('accounts/' + id + '.json').then(function (existing) {
        if (existing) return tryCreate(attempt + 1); // 撞号，换一个
        var salt = genSalt();
        return hashPwd(childPwd, salt).then(function (childHash) {
          return hashPwd(parentPwd, salt).then(function (parentHash) {
            var rec = {
              accountId: id, nickname: nickname, salt: salt,
              childPwdHash: childHash, parentPwdHash: parentHash,
              createdAt: new Date().toISOString()
            };
            return gh().putFile('accounts/' + id + '.json', JSON.stringify(rec), null).then(function () {
              var state = (APP.store && APP.store.get) ? APP.store.get() : null;
              var init = state || (APP.defaultState ? APP.defaultState() : {});
              return gh().putFile('saves/' + id + '.json', JSON.stringify(init), null).then(function () {
                store({ accountId: id, nickname: nickname, role: 'child' });
                lsSet(K_ACCOUNT, id);
                return { ok: true, accountId: id };
              });
            });
          });
        });
      });
    }
    return tryCreate(0);
  }

  // 登录：读 GitHub 账号文件，验证密码；小孩密码 → child，大人密码 → parent
  function login(accountId, pwd) {
    if (!needCfg()) {
      return Promise.resolve({ ok: false, error: '请先在「我的数据 → GitHub 同步」里填写仓库与访问令牌' });
    }
    accountId = String(accountId || '').trim();
    if (!accountId) return Promise.resolve({ ok: false, error: '请输入账号码' });
    return gh().getFile('accounts/' + accountId + '.json').then(function (rec) {
      if (!rec) return { ok: false, error: '账号不存在，请检查账号码' };
      var data;
      try { data = JSON.parse(gh().decode(rec.content)); } catch (e) { return { ok: false, error: '账号文件损坏' }; }
      if (!data || !data.salt || !data.childPwdHash) return { ok: false, error: '账号文件损坏' };
      return hashPwd(pwd, data.salt).then(function (h) {
        var role = (h === data.childPwdHash) ? 'child' : (h === data.parentPwdHash) ? 'parent' : null;
        if (!role) return { ok: false, error: '密码错误' };
        store({ accountId: data.accountId, nickname: data.nickname, role: role });
        lsSet(K_ACCOUNT, data.accountId);
        return { ok: true, role: role };
      });
    });
  }

  // 改昵称：更新 GitHub 账号文件
  function updateProfile(nickname) {
    var s = session();
    if (!s) return Promise.resolve({ ok: false, error: '未登录' });
    if (!needCfg()) return Promise.resolve({ ok: false, error: '未配置 GitHub 同步' });
    return gh().getFile('accounts/' + s.accountId + '.json').then(function (rec) {
      if (!rec) return { ok: false, error: '账号文件不存在' };
      var data;
      try { data = JSON.parse(gh().decode(rec.content)); } catch (e) { return { ok: false, error: '账号文件损坏' }; }
      data.nickname = nickname;
      return gh().putFile('accounts/' + s.accountId + '.json', JSON.stringify(data), rec.sha).then(function () {
        store({ accountId: s.accountId, nickname: nickname, role: s.role });
        return { ok: true };
      });
    });
  }

  // 改大人密码：需旧密码校验
  function changeParentPwd(oldPwd, newPwd) {
    var s = session();
    if (!s) return Promise.resolve({ ok: false, error: '未登录' });
    if (!needCfg()) return Promise.resolve({ ok: false, error: '未配置 GitHub 同步' });
    return gh().getFile('accounts/' + s.accountId + '.json').then(function (rec) {
      if (!rec) return { ok: false, error: '账号文件不存在' };
      var data;
      try { data = JSON.parse(gh().decode(rec.content)); } catch (e) { return { ok: false, error: '账号文件损坏' }; }
      return hashPwd(oldPwd, data.salt).then(function (h) {
        if (h !== data.parentPwdHash) return { ok: false, error: '旧密码不正确' };
        return hashPwd(newPwd, data.salt).then(function (newHash) {
          data.parentPwdHash = newHash;
          return gh().putFile('accounts/' + s.accountId + '.json', JSON.stringify(data), rec.sha).then(function () {
            return { ok: true };
          });
        });
      });
    });
  }

  // 重置小孩密码：不需旧密码
  function resetChildPwd(newPwd) {
    var s = session();
    if (!s) return Promise.resolve({ ok: false, error: '未登录' });
    if (!needCfg()) return Promise.resolve({ ok: false, error: '未配置 GitHub 同步' });
    return gh().getFile('accounts/' + s.accountId + '.json').then(function (rec) {
      if (!rec) return { ok: false, error: '账号文件不存在' };
      var data;
      try { data = JSON.parse(gh().decode(rec.content)); } catch (e) { return { ok: false, error: '账号文件损坏' }; }
      return hashPwd(newPwd, data.salt).then(function (newHash) {
        data.childPwdHash = newHash;
        return gh().putFile('accounts/' + s.accountId + '.json', JSON.stringify(data), rec.sha).then(function () {
          return { ok: true };
        });
      });
    });
  }

  function logout() { store(null); }

  function role() { var s = session(); return s ? s.role : null; }

  // 强制登录：没有会话就必须登录 / 注册（不再有本机模式）
  function needLogin() { return !session(); }

  // 以下桩函数保持旧调用点不报错：纯静态下「始终已接入」、「永不本机模式」
  function hasServer() { return true; }
  function isLocalOnly() { return false; }
  function setLocalOnly() {}
  function baseUrl() { return ''; }

  APP.auth = {
    session: session,
    role: role,
    needLogin: needLogin,
    lastAccount: lastAccount,
    register: register,
    login: login,
    logout: logout,
    updateProfile: updateProfile,
    changeParentPwd: changeParentPwd,
    resetChildPwd: resetChildPwd,
    updateNickname: function (nickname) { var s = session(); if (!s) return false; s.nickname = nickname; store(s); return true; },
    hasServer: hasServer,
    isLocalOnly: isLocalOnly,
    setLocalOnly: setLocalOnly,
    baseUrl: baseUrl
  };
})(window.APP);
