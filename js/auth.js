// 账号与会话（纯静态 + GitHub 仓库 + 客户端加密版）
// 账号元数据存 GitHub：accounts/{accountId}.json（仅含随机文件名 + 两个角色密码包裹的存档主密钥，公开仓库不可读）
// 存档存 GitHub：saves/{accountId}.json（AES-GCM 加密，密钥由登录密码派生）
// 强制登录：无会话即要求登录 / 注册，不再有「本机模式」。
// 登录名支持三种：完整账号码（马一一-wd52it）、昵称（马一一）、短码（wd52it）；靠列目录 + 密码消歧，存量账号无需迁移。
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

  function gh() { return APP.gh; }
  function needCfg() {
    var c = gh() && gh().config();
    if (!c) return null;
    return c;
  }

  // 注册：生成随机账号码；随机存档主密钥，分别用小孩/大人密码包裹后写入账号文件；
  // 首份存档用当前本机数据（或默认）加密写入 saves/{id}.json。
  function register(nickname, childPwd, parentPwd) {
    if (!needCfg()) {
      return Promise.resolve({ ok: false, error: '请先在页面上方的「GitHub 同步」里填写仓库与访问令牌' });
    }
    if (!APP.cipher || !APP.cipher.available()) {
      return Promise.resolve({ ok: false, error: '当前环境不支持加密（请用 https 或 localhost 打开）' });
    }
    var slug = String(nickname || '').trim().toLowerCase().replace(/[^a-z0-9\u4e00-\u9fa5]/g, '').slice(0, 8) || 'home';

    // 账号码后缀用密码学安全随机数（6 位 base36 ≈ 21 亿空间），避免 Math.random 弱随机
    // 在公开仓库 / 多人 fork 场景下被猜到或撞号；配合下面的「读不到才写」兜底重试。
    function randomSuffix() {
      var a = APP.cipher.randomBytes(6);
      var chars = '0123456789abcdefghijklmnopqrstuvwxyz';
      var s = '';
      for (var i = 0; i < a.length; i++) s += chars[a[i] % 36];
      return s;
    }

    function tryCreate(attempt) {
      if (attempt > 8) return Promise.resolve({ ok: false, error: '生成账号码失败，请重试' });
      var short = randomSuffix();
      var id = slug + '-' + short;
      return gh().getFile('accounts/' + id + '.json').then(function (existing) {
        if (existing) return tryCreate(attempt + 1); // 撞号，换一个
        return APP.cipher.newVaultKey().then(function (vaultKey) {
          return APP.cipher.exportRaw(vaultKey).then(function (vaultRaw) {
            var pSalt = APP.cipher.randomBytes(16);
            var cSalt = APP.cipher.randomBytes(16);
            return APP.cipher.deriveKey(parentPwd, pSalt).then(function (pKey) {
              return APP.cipher.deriveKey(childPwd, cSalt).then(function (cKey) {
                return APP.cipher.sealBytes(vaultRaw, pKey).then(function (pWrap) {
                  return APP.cipher.sealBytes(vaultRaw, cKey).then(function (cWrap) {
                    var meta = {
                      accountId: id, nickname: nickname, createdAt: new Date().toISOString(),
                      wrap: {
                        parent: { salt: APP.cipher.b64FromBytes(pSalt), iv: pWrap.iv, ct: pWrap.ct },
                        child: { salt: APP.cipher.b64FromBytes(cSalt), iv: cWrap.iv, ct: cWrap.ct }
                      }
                    };
                    var state = (APP.store && APP.store.get) ? APP.store.get() : null;
                    var init = state || (APP.defaultState ? APP.defaultState() : {});
                    return APP.cipher.seal(init, vaultKey).then(function (saveEnv) {
                      return gh().putFile('accounts/' + id + '.json', JSON.stringify(meta), null).then(function () {
                        return gh().putFile('saves/' + id + '.json', JSON.stringify(saveEnv), null).then(function () {
                          var vaultKeyB64 = APP.cipher.b64FromBytes(new Uint8Array(vaultRaw));
                          store({ accountId: id, nickname: nickname, role: 'child', vaultKeyB64: vaultKeyB64 });
                          lsSet(K_ACCOUNT, id);
                          // 三种登录名都交给 UI 展示：昵称 / 短码 / 完整账号码
                          return { ok: true, accountId: id, nickname: nickname, short: short };
                        });
                      });
                    });
                  });
                });
              });
            });
          });
        });
      });
    }
    return tryCreate(0);
  }

  // —— 登录名解析：三种都能登 ——
  //   ① 完整账号码（马一一-wd52it）：直接读 accounts/{name}.json，最快
  //   ② 昵称（马一一）：匹配 id 去掉 6 位随机后缀后的 slug 前缀
  //   ③ 短码（wd52it）：匹配 id 的 6 位后缀
  // 用「列 accounts/ 目录 + 逐个验密码」实现，不写别名索引文件：
  // 旧版注册的存量账号（如已存在的 马一一-wd52it）同样能命中，零数据迁移。
  function normName(s) { return String(s || '').trim().toLowerCase(); }
  function slugOf(s) {
    return normName(s).replace(/[^a-z0-9\u4e00-\u9fa5]/g, '').slice(0, 8);
  }
  function matchId(id, name) {
    var n = normName(name);
    if (!n) return false;
    if (id === n) return true;                                // 完整账号码
    if (id.slice(-(n.length + 1)) === '-' + n) return true;   // 短码
    var prefix = id.replace(/-[a-z0-9]{6}$/, '');             // 昵称 slug 前缀
    var ns = slugOf(n);
    return !!ns && prefix === ns;
  }
  function resolveCandidates(name) {
    return gh().getFile('accounts/' + name + '.json').then(function (direct) {
      if (direct) return [name]; // 完整账号码直接命中，不必列目录
      return gh().listAccounts().then(function (ids) {
        var out = [];
        for (var i = 0; i < ids.length; i++) {
          if (matchId(ids[i], name)) out.push(ids[i]);
        }
        return out;
      });
    });
  }

  // 读一个账号文件并用输入密码试着解开 parent / child 包裹；解开即返回角色 + 存档主密钥
  function tryOpen(id, pwd) {
    return gh().getFile('accounts/' + id + '.json').then(function (rec) {
      if (!rec) return { ok: false };
      var data;
      try { data = JSON.parse(gh().decode(rec.content)); } catch (e) { return { ok: false }; }
      if (!data || !data.wrap || !data.wrap.parent || !data.wrap.child) return { ok: false };
      function tryRole(role) {
        var w = data.wrap[role];
        return APP.cipher.deriveKey(pwd, APP.cipher.bytesFromB64(w.salt)).then(function (k) {
          return APP.cipher.openBytes(w, k);
        }).then(function (vaultRaw) {
          return APP.cipher.importRaw(vaultRaw).then(function () {
            return { role: role, vaultRaw: vaultRaw };
          });
        });
      }
      function ok(r) { return { ok: true, role: r.role, vaultRaw: r.vaultRaw, data: data }; }
      // 用 then 第二参数只捕获「解包失败」，finish（写会话）出错不会被误报成密码错误
      return tryRole('parent').then(ok, function () {
        return tryRole('child').then(ok, function () { return { ok: false }; });
      });
    });
  }

  // 登录：账号码 / 昵称 / 短码 → 候选账号 → 逐个验密码（同名账号靠密码消歧）
  function login(accountId, pwd) {
    if (!needCfg()) {
      return Promise.resolve({ ok: false, error: '请先在页面上方的「GitHub 同步」里填写仓库与访问令牌' });
    }
    if (!APP.cipher || !APP.cipher.available()) {
      return Promise.resolve({ ok: false, error: '当前环境不支持加密（请用 https 或 localhost 打开）' });
    }
    var name = String(accountId || '').trim();
    if (!name) return Promise.resolve({ ok: false, error: '请输入账号码、昵称或短码' });
    if (/[\/\\\r\n]/.test(name)) return Promise.resolve({ ok: false, error: '账号名不能包含斜杠或换行' });
    return resolveCandidates(name).then(function (ids) {
      if (!ids.length) return { ok: false, error: '账号不存在，请检查账号码 / 昵称 / 短码' };
      function attempt(i) {
        if (i >= ids.length) return { ok: false, error: '密码错误' };
        return tryOpen(ids[i], pwd).then(function (r) {
          if (r.ok) {
            var vaultKeyB64 = APP.cipher.b64FromBytes(new Uint8Array(r.vaultRaw));
            store({ accountId: ids[i], nickname: r.data.nickname, role: r.role, vaultKeyB64: vaultKeyB64 });
            lsSet(K_ACCOUNT, ids[i]);
            return { ok: true, role: r.role, accountId: ids[i] };
          }
          return attempt(i + 1);
        });
      }
      return attempt(0);
    });
  }

  // 改昵称：更新 GitHub 账号文件（明文元数据里的昵称）
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
        store({ accountId: s.accountId, nickname: nickname, role: s.role, vaultKeyB64: s.vaultKeyB64 });
        return { ok: true };
      });
    });
  }

  // 改大人密码：校验旧密码（解开 parent 包裹），用新密码重新包裹同一存档主密钥
  function changeParentPwd(oldPwd, newPwd) {
    var s = session();
    if (!s) return Promise.resolve({ ok: false, error: '未登录' });
    if (!needCfg()) return Promise.resolve({ ok: false, error: '未配置 GitHub 同步' });
    return gh().getFile('accounts/' + s.accountId + '.json').then(function (rec) {
      if (!rec) return { ok: false, error: '账号文件不存在' };
      var data;
      try { data = JSON.parse(gh().decode(rec.content)); } catch (e) { return { ok: false, error: '账号文件损坏' }; }
      var w = data.wrap.parent;
      function rewrap(vaultRaw) {
        var newSalt = APP.cipher.randomBytes(16);
        return APP.cipher.deriveKey(newPwd, newSalt).then(function (newKey) {
          return APP.cipher.sealBytes(vaultRaw, newKey).then(function (newWrap) {
            data.wrap.parent = { salt: APP.cipher.b64FromBytes(newSalt), iv: newWrap.iv, ct: newWrap.ct };
            return gh().putFile('accounts/' + s.accountId + '.json', JSON.stringify(data), rec.sha).then(function () {
              return { ok: true };
            });
          });
        });
      }
      // 同样只把「解开 parent 包裹失败」判为旧密码不正确；写入失败原样抛出，避免误报
      return APP.cipher.deriveKey(oldPwd, APP.cipher.bytesFromB64(w.salt)).then(function (oldKey) {
        return APP.cipher.openBytes(w, oldKey).then(rewrap, function () {
          return { ok: false, error: '旧密码不正确' };
        });
      });
    });
  }

  // 重置小孩密码：用会话里的存档主密钥，重新以新密码包裹 child 入口（不需旧密码）
  function resetChildPwd(newPwd) {
    var s = session();
    if (!s || !s.vaultKeyB64) return Promise.resolve({ ok: false, error: '未登录' });
    if (!needCfg()) return Promise.resolve({ ok: false, error: '未配置 GitHub 同步' });
    return APP.cipher.importRaw(APP.cipher.bytesFromB64(s.vaultKeyB64)).then(function (vk) {
      return APP.cipher.exportRaw(vk);
    }).then(function (vaultRaw) {
      return gh().getFile('accounts/' + s.accountId + '.json').then(function (rec) {
        if (!rec) return { ok: false, error: '账号文件不存在' };
        var data;
        try { data = JSON.parse(gh().decode(rec.content)); } catch (e) { return { ok: false, error: '账号文件损坏' }; }
        var newSalt = APP.cipher.randomBytes(16);
        return APP.cipher.deriveKey(newPwd, newSalt).then(function (newKey) {
          return APP.cipher.sealBytes(vaultRaw, newKey).then(function (newWrap) {
            data.wrap.child = { salt: APP.cipher.b64FromBytes(newSalt), iv: newWrap.iv, ct: newWrap.ct };
            return gh().putFile('accounts/' + s.accountId + '.json', JSON.stringify(data), rec.sha).then(function () {
              return { ok: true };
            });
          });
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
