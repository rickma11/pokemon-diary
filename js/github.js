// GitHub 仓库接入层（纯静态版）
// 职责：把账号 / 存档读写到 GitHub 仓库的 Contents API。
//   账号：accounts/{accountId}.json
//   存档：saves/{accountId}.json
// 连接信息（owner / repo / branch / token）存在本机 localStorage，绝不进仓库、不进源码。
// 首次使用在「我的数据 → GitHub 同步」里填一次即可（每台设备一次）。
window.APP = window.APP || {};

(function (APP) {
  'use strict';

  var K_GH = 'pokedex-checkin-gh';
  var API = 'https://api.github.com/repos';

  function ls(k) { try { return window.localStorage.getItem(k); } catch (e) { return null; } }
  function lsSet(k, v) { try { window.localStorage.setItem(k, v); return true; } catch (e) { return false; } }

  // —— UTF-8 ↔ Base64（GitHub Contents API 用 base64 存文本）——
  function encode(text) {
    var bytes = new TextEncoder().encode(text);
    var bin = '';
    for (var i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
    return window.btoa(bin);
  }
  function decode(b64) {
    var bin = window.atob(String(b64 || '').replace(/\s+/g, ''));
    var bytes = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return new TextDecoder().decode(bytes);
  }

  // owner/repo/branch/token；缺任一项视为未配置
  function config() {
    try {
      var raw = ls(K_GH);
      if (!raw) return null;
      var c = JSON.parse(raw);
      if (!c || !c.owner || !c.repo || !c.token) return null;
      if (!c.branch) c.branch = 'main';
      return c;
    } catch (e) { return null; }
  }
  function hasConfig() { return !!config(); }
  function saveConfig(c) {
    if (!c || !c.owner || !c.repo || !c.token) return false;
    if (!c.branch) c.branch = 'main';
    return lsSet(K_GH, JSON.stringify(c));
  }

  function api(path, opts) {
    var cfg = config();
    if (!cfg) return Promise.reject(new Error('未配置 GitHub 同步'));
    opts = opts || {};
    var url = API + '/' + encodeURIComponent(cfg.owner) + '/' + encodeURIComponent(cfg.repo) +
      '/contents/' + path + (opts.branchRef ? ('?ref=' + encodeURIComponent(opts.branchRef)) : '');
    var headers = {
      'Authorization': 'Bearer ' + cfg.token,
      'Accept': 'application/vnd.github+json'
    };
    if (opts.body) headers['Content-Type'] = 'application/json';
    return window.fetch(url, {
      method: opts.method || 'GET',
      headers: headers,
      body: opts.body ? JSON.stringify(opts.body) : undefined
    });
  }

  // 读取文件：返回 { content(base64), sha }；不存在返回 null；其它错误 reject
  function getFile(path) {
    return api(path).then(function (r) {
      if (r.status === 404) return null;
      if (!r.ok) return r.json()['catch'](function () { return null; }).then(function (j) {
        throw new Error('读取失败 ' + r.status + (j && j.message ? '：' + j.message : ''));
      });
      return r.json();
    }).then(function (j) {
      if (!j) return null;
      return { content: j.content, sha: j.sha };
    });
  }

  // 写入文件：sha 为 null 表示新建。返回新 sha
  function putFile(path, text, sha) {
    var cfg = config();
    if (!cfg) return Promise.reject(new Error('未配置 GitHub 同步'));
    var body = {
      message: 'sync: ' + path + ' @ ' + new Date().toISOString().slice(0, 19),
      content: encode(text),
      branch: cfg.branch
    };
    if (sha) body.sha = sha;
    return api(path, { method: 'PUT', body: body }).then(function (r) {
      if (!r.ok) {
        return r.json()['catch'](function () { return null; }).then(function (j) {
          throw new Error('写入失败 ' + r.status + (j && j.message ? '：' + j.message : ''));
        });
      }
      return r.json();
    }).then(function (j) {
      return j && j.content && j.content.sha;
    });
  }

  // 测试连接：GET 仓库元信息，返回 { ok, status, message }
  function ping() {
    var cfg = config();
    if (!cfg) return Promise.resolve({ ok: false, status: 0, message: '未配置 GitHub 同步' });
    return window.fetch(API + '/' + encodeURIComponent(cfg.owner) + '/' + encodeURIComponent(cfg.repo), {
      method: 'GET',
      headers: { 'Authorization': 'Bearer ' + cfg.token, 'Accept': 'application/vnd.github+json' }
    }).then(function (r) {
      if (r.ok) return { ok: true, status: r.status };
      return r.json()['catch'](function () { return null; }).then(function (j) {
        return { ok: false, status: r.status, message: j && j.message ? j.message : r.statusText };
      });
    })['catch'](function (e) {
      return { ok: false, status: 0, message: (e && e.message) || '网络错误' };
    });
  }

  // —— 客户端加密（AES-GCM，密钥由密码经 PBKDF2 派生）——
  // 公开仓库只存密文信封：保证存档隐私 + 唯一性（文件名用随机 id）。
  // 需 https 或 localhost 安全上下文（crypto.subtle 才可用）。
  function b64FromBytes(bytes) {
    var s = '';
    for (var i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
    return window.btoa(s);
  }
  function bytesFromB64(b64) {
    var bin = window.atob(String(b64 || '').replace(/\s+/g, ''));
    var a = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) a[i] = bin.charCodeAt(i);
    return a;
  }
  function randomBytes(n) {
    var a = new Uint8Array(n);
    if (window.crypto && window.crypto.getRandomValues) window.crypto.getRandomValues(a);
    else for (var i = 0; i < n; i++) a[i] = Math.floor(Math.random() * 256);
    return a;
  }
  function cipherAvailable() { return !!(window.crypto && window.crypto.subtle); }
  // 由密码派生 AES-GCM 256 密钥（不可导出，仅用于加解密 wrap）
  function deriveKey(password, salt) {
    var enc = new TextEncoder();
    return window.crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveKey']).then(function (km) {
      return window.crypto.subtle.deriveKey(
        { name: 'PBKDF2', salt: salt, iterations: 100000, hash: 'SHA-256' },
        km, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
    });
  }
  // 加密原始字节 → { iv, ct }（base64）；用于包裹存档主密钥
  function sealBytes(bytes, key) {
    var iv = randomBytes(12);
    return window.crypto.subtle.encrypt({ name: 'AES-GCM', iv: iv }, key, bytes).then(function (ct) {
      return { iv: b64FromBytes(iv), ct: b64FromBytes(new Uint8Array(ct)) };
    });
  }
  function openBytes(env, key) {
    return window.crypto.subtle.decrypt({ name: 'AES-GCM', iv: bytesFromB64(env.iv) }, key, bytesFromB64(env.ct));
  }
  // 加密对象（JSON） → 信封；登录/同步存档用
  function seal(obj, key) { return sealBytes(new TextEncoder().encode(JSON.stringify(obj)), key); }
  function open(env, key) {
    return openBytes(env, key).then(function (pt) { return JSON.parse(new TextDecoder().decode(pt)); });
  }
  // 存档主密钥：随机生成、可导出；分别用两个角色密码再包一层（wrap）
  function newVaultKey() {
    return window.crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, true, ['encrypt', 'decrypt']);
  }
  function exportRaw(key) { return window.crypto.subtle.exportKey('raw', key); }
  function importRaw(bytes) {
    return window.crypto.subtle.importKey('raw', bytes, { name: 'AES-GCM', length: 256 }, true, ['encrypt', 'decrypt']);
  }

  APP.cipher = {
    available: cipherAvailable,
    deriveKey: deriveKey,
    seal: seal,
    open: open,
    sealBytes: sealBytes,
    openBytes: openBytes,
    newVaultKey: newVaultKey,
    exportRaw: exportRaw,
    importRaw: importRaw,
    randomBytes: randomBytes,
    b64FromBytes: b64FromBytes,
    bytesFromB64: bytesFromB64
  };

  APP.gh = {
    config: config,
    hasConfig: hasConfig,
    saveConfig: saveConfig,
    encode: encode,
    decode: decode,
    api: api,
    getFile: getFile,
    putFile: putFile,
    ping: ping
  };

  // —— 共享的「GitHub 同步」设置卡：我的数据页与家长后台设置页都用它 ——
  function escHtml(t) {
    return String(t === undefined || t === null ? '' : t)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
  // 提示存模块状态、由 cardHtml 渲染：APP.refresh() 重建 DOM 后提示不会丢；
  // 同时直接更新现存节点，让异步回调（ping）也能即时显示，不必等重绘。
  var ghMsgState = null; // { ok, text }
  function setGhMsg(ok, text) {
    ghMsgState = text ? { ok: ok, text: text } : null;
    var el = (typeof document !== 'undefined') ? document.getElementById('ghMsg') : null;
    if (el) { el.textContent = text || ''; el.style.color = ok ? '' : '#c0392b'; }
  }
  function ghMsgHtml() {
    if (!ghMsgState) return '<p class="hint" id="ghMsg"></p>';
    return '<p class="hint" id="ghMsg"' + (ghMsgState.ok ? '' : ' style="color:#c0392b"') + '>' +
      escHtml(ghMsgState.text) + '</p>';
  }

  APP.ghui = {
    // 返回设置卡 HTML（含一个 id=ghMsg 的提示占位）
    cardHtml: function () {
      if (!APP.gh) return '';
      var cfg = APP.gh.config() || {};
      var ok = APP.gh.hasConfig();
      return '<section class="card" id="ghCard"><h2>GitHub 同步<span class="card__side">' +
        (ok ? '已配置' : '未配置') + '</span></h2>' +
        '<p>数据存到你的 GitHub 仓库：换设备、在手机上登录同一账号码即可看到同一份数据。每台设备填一次。</p>' +
        '<p class="field__hint">存档与账号密码均以 <b>AES-GCM 加密</b>后存入仓库，文件名是随机账号码；' +
          '即使仓库公开，别人也只能看到密文，无法读取或冒充你的记录。连接信息只存这台设备。</p>' +
        '<label class="field"><span>仓库所有者 (owner)</span>' +
          '<input id="gh_owner" type="text" value="' + escHtml(cfg.owner || '') + '" autocomplete="off" placeholder="如：your-github-id"></label>' +
        '<label class="field"><span>仓库名 (repo)</span>' +
          '<input id="gh_repo" type="text" value="' + escHtml(cfg.repo || '') + '" autocomplete="off" placeholder="如：pokemon-checkin-data"></label>' +
        '<label class="field"><span>分支 (branch)</span>' +
          '<input id="gh_branch" type="text" value="' + escHtml(cfg.branch || 'main') + '" autocomplete="off" placeholder="main"></label>' +
        '<label class="field"><span>访问令牌 (PAT)</span>' +
          '<input id="gh_token" type="password" value="' + escHtml(cfg.token || '') + '" autocomplete="off" placeholder="ghp_… 需 repo 权限"></label>' +
        '<p class="field__hint">PAT 只存在这台设备，不会上传。在 GitHub → Settings → Developer settings → Personal access tokens 里生成一个有 <b>repo</b> 权限的令牌。</p>' +
        '<div class="row" style="flex-wrap:wrap">' +
          '<button type="button" class="btn btn--primary" data-act="gh-save">保存设置</button>' +
          '<button type="button" class="btn" data-act="gh-test">测试连接</button>' +
          '<button type="button" class="btn" data-act="gh-sync">立即同步</button>' +
        '</div>' +
        ghMsgHtml() +
        '</section>';
    },
    // 在各自 screen 的 onClick 里调用：处理 gh-save / gh-test / gh-sync；返回 true 表示已处理
    handle: function (act) {
      if (act !== 'gh-save' && act !== 'gh-test' && act !== 'gh-sync') return false;
      if (act === 'gh-save') {
        var owner = (document.getElementById('gh_owner') || {}).value || '';
        var repo = (document.getElementById('gh_repo') || {}).value || '';
        var branch = (document.getElementById('gh_branch') || {}).value || 'main';
        var token = (document.getElementById('gh_token') || {}).value || '';
        if (!owner || !repo || !token) { setGhMsg(false, 'owner、repo、token 都要填'); return true; }
        if (!APP.gh.saveConfig({ owner: owner, repo: repo, branch: branch, token: token })) {
          setGhMsg(false, '保存失败'); return true;
        }
        setGhMsg(true, '已保存，正在连接同步…');
        if (APP.refresh) APP.refresh(); // 统一由本模块刷新，避免调用方各自 refresh 冲掉未保存的输入
        if (APP.sync && APP.sync.start) APP.sync.start();
        return true;
      }
      if (act === 'gh-test') {
        if (!APP.gh.hasConfig()) { setGhMsg(false, '请先填好并保存设置'); return true; }
        setGhMsg(true, '正在连接…');
        APP.gh.ping().then(function (r) {
          if (r.ok) setGhMsg(true, '连接成功：仓库可访问');
          else setGhMsg(false, '连接失败：' + (r.message || ('HTTP ' + r.status)));
        });
        return true;
      }
      if (act === 'gh-sync') {
        if (!APP.gh.hasConfig()) { setGhMsg(false, '请先填写 GitHub 同步设置'); return true; }
        if (!APP.auth.session()) { setGhMsg(false, '请先登录账号'); return true; }
        if (APP.sync && APP.sync.flushPush) APP.sync.flushPush();
        if (APP.sync && APP.sync.pull) APP.sync.pull();
        setGhMsg(true, '已触发同步');
        return true;
      }
      return true;
    }
  };
})(window.APP);
