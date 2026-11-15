// 同步层（T4）
// 职责：本地落盘 → 防抖 2 秒上传；启动/每 5 分钟/网络恢复 → 拉取云端；savedAt 三方比对；
//       顶部「未同步 N 项」角标；服务器不可达时进本地模式（离线优先，孩子照常打卡）。
// 设计原则：与现有 beginWrite「写入前合并外部最新存档」同一套合并内核，云端同步只是它的延伸。
window.APP = window.APP || {};

(function (APP) {
  'use strict';

  var PUSH_DEBOUNCE = 2000;
  var PULL_INTERVAL = 5 * 60 * 1000;

  var pushTimer = null;
  var pullTimer = null;
  var started = false;
  var firstPullDone = false; // 首次云端拉取是否结束（成功/失败都算）：新手引导的就绪门禁
  var adopting = false; // 云端数据落地期间不回推，避免「拉下来又推回去」的空转
  var status = { offline: false, pending: 0, lastSyncAt: 0, syncing: false, notice: '' };

  // —— 存档槽位：按账号隔离，旧数据永不删除 ——
  // 活跃存档仍是 pokedex-checkin-v1（所有既有读写不动），但会按「归属」收进独立槽：
  //   未登录 / 本机模式 → slot:local；登录 VALNVL → slot:VALNVL。
  // 登录一个新账号时，本地旧记录完整存进 slot:local，新账号从自己的槽载入（没有就全新存档），
  // 于是「不上传」= 旧记录留一旁可切回 + 当前账号用空数据，而不是原来的「什么都不做」。
  var SAVE_KEY = 'pokedex-checkin-v1';
  var SLOT_PREFIX = 'pokedex-checkin-slot:';
  var OWNER_KEY = 'pokedex-checkin-owner';

  function lsGet(k) { try { return window.localStorage.getItem(k); } catch (e) { return null; } }
  function lsSet(k, v) { try { window.localStorage.setItem(k, v); } catch (e) {} }
  function parseRaw(raw) {
    if (!raw) return null;
    try { var o = JSON.parse(raw); return (o && typeof o === 'object') ? o : null; } catch (e) { return null; }
  }
  function slotOwner() {
    var s = APP.auth && APP.auth.session ? APP.auth.session() : null;
    return (s && s.accountId) ? String(s.accountId) : 'local';
  }
  function savedOwner() { return lsGet(OWNER_KEY); }
  function slotRaw(id) { return lsGet(SLOT_PREFIX + id); }
  function slotLabel(id) {
    if (id === 'local') return '本机旧记录';
    if (/\.forkorig$/.test(id)) return '账号 ' + id.replace(/\.forkorig$/, '') + '（选择前备份）';
    return '账号 ' + id;
  }
  function slotIds() {
    var out = [];
    try {
      for (var i = 0; i < window.localStorage.length; i++) {
        var k = window.localStorage.key(i);
        if (k && k.indexOf(SLOT_PREFIX) === 0) out.push(k.slice(SLOT_PREFIX.length));
      }
    } catch (e) {}
    return out;
  }

  // —— 分叉二选一：登录到另一个账号、本机还有一份旧记录时，由用户自己选用哪份 ——
  // 决策前冻结 adopt / push / 首登，任何一边都不会被悄悄覆盖；两边数据都完整保留。
  var FORK_ASK_PREFIX = 'pokedex-checkin-fork-asked:';
  var FORK_PENDING_KEY = 'pokedex-checkin-fork-pending';
  var fork = null;                // { target, from, oldState, accountState, cloud, shown, offline }
  var localWinsUntilPush = false; // 选了「本机旧记录」但还没成功推上云端：期间不采信云端

  function lsRemove(k) { try { window.localStorage.removeItem(k); } catch (e) {} }
  function forkPending() { return !!fork; }
  function forkAsked(id) { return lsGet(FORK_ASK_PREFIX + id) === '1'; }
  function markForkAsked(id) { lsSet(FORK_ASK_PREFIX + id, '1'); }

  // 待选状态落盘：弹窗出现时刷新页面，回来仍要让用户选，不能悄悄替他决定
  function saveForkState() {
    if (!fork) { lsRemove(FORK_PENDING_KEY); return; }
    lsSet(FORK_PENDING_KEY, JSON.stringify({ target: fork.target, from: fork.from }));
  }
  function restoreForkState() {
    if (fork) return;
    var raw = parseRaw(lsGet(FORK_PENDING_KEY));
    if (!raw || !raw.target || forkAsked(raw.target)) { lsRemove(FORK_PENDING_KEY); return; }
    var old = parseRaw(slotRaw(raw.from || 'local'));
    if (!old) { lsRemove(FORK_PENDING_KEY); return; }
    fork = {
      target: raw.target, from: raw.from || 'local', oldState: old,
      accountState: parseRaw(slotRaw(raw.target)),
      cloud: null, shown: false, offline: false
    };
  }

  function escHtml(t) {
    return String(t === undefined || t === null ? '' : t)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  // 只认真实记录：默认的空存档（任务模板、皮卡丘 Lv.1）不算，避免新设备把空档误判成「旧记录」
  function stateRealData(obj) {
    if (!obj || typeof obj !== 'object') return false;
    var days = obj.instances || {}, d, items, tid, it;
    for (d in days) {
      if (!Object.prototype.hasOwnProperty.call(days, d)) continue;
      items = days[d] || {};
      for (tid in items) {
        if (!Object.prototype.hasOwnProperty.call(items, tid)) continue;
        it = items[tid];
        if (it && it.status && it.status !== 'pending') return true;
      }
    }
    if (Array.isArray(obj.xpLog) && obj.xpLog.length) return true;
    var ps = obj.pokemon || [];
    for (var i = 0; i < ps.length; i++) {
      if ((ps[i].exp || 0) > 0 || (ps[i].level || 1) > 1) return true;
      if (ps[i].bond && (ps[i].bond.stars || ps[i].bond.daysCared)) return true;
    }
    return false;
  }

  // 给用户看的「这份记录长什么样」，帮他在二选一里认出自己要的那份
  function stateSummary(obj) {
    if (!obj || typeof obj !== 'object') return null;
    var done = 0, dates = {}, d, tid, items, it;
    var days = obj.instances || {};
    for (d in days) {
      if (!Object.prototype.hasOwnProperty.call(days, d)) continue;
      items = days[d] || {};
      for (tid in items) {
        if (!Object.prototype.hasOwnProperty.call(items, tid)) continue;
        it = items[tid];
        if (it && it.status && it.status !== 'pending') { done++; dates[d] = 1; }
      }
    }
    var ps = obj.pokemon || [], main = null, n = 0;
    for (var i = 0; i < ps.length; i++) {
      if (ps[i] && ps[i].slot === 'team') { main = ps[i]; break; }
    }
    if (!main) main = ps[0];
    for (var k in dates) { if (Object.prototype.hasOwnProperty.call(dates, k)) n++; }
    return {
      done: done,
      days: n,
      level: (main && main.level) || 1,
      name: (main && main.nickname) || '宝可梦',
      real: stateRealData(obj)
    };
  }

  function summaryText(s) {
    if (!s || !s.real) return '还是全新的，没有打卡记录';
    return '完成过 ' + s.done + ' 条任务 · 打卡 ' + s.days + ' 天 · 主力 ' +
      escHtml(s.name) + ' Lv.' + s.level;
  }

  var FORK_CSS =
    '#forkOverlay{position:fixed;inset:0;z-index:200;display:none;font-family:inherit}' +
    '#forkOverlay .fk-bg{position:absolute;inset:0;background:rgba(20,16,12,.55)}' +
    '#forkOverlay .fk-modal{position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);width:calc(100% - 28px);max-width:430px;max-height:88vh;overflow:auto;background:var(--card,#fff);border-radius:18px;padding:18px 16px 14px;box-shadow:0 14px 40px rgba(0,0,0,.3)}' +
    '#forkOverlay .fk-title{font-size:17px;font-weight:800;color:var(--text,#242733);margin-bottom:8px}' +
    '#forkOverlay .fk-lead{font-size:13px;line-height:1.65;color:var(--muted,#666d80);margin-bottom:12px}' +
    '#forkOverlay .fk-opt{display:block;width:100%;text-align:left;border:1.5px solid var(--line-soft,#e6eaf3);background:var(--surface,#f7f9ff);border-radius:14px;padding:12px 13px;margin-bottom:10px;cursor:pointer;font:inherit;color:var(--text,#242733)}' +
    '#forkOverlay .fk-opt:active{transform:scale(.99)}' +
    '#forkOverlay .fk-opt__t{font-size:14px;font-weight:800;display:flex;align-items:center;gap:8px}' +
    '#forkOverlay .fk-opt__t i{font-style:normal;flex:none;width:22px;height:22px;border-radius:50%;background:var(--ink,#3b4cca);color:#fff;font-size:12px;display:flex;align-items:center;justify-content:center}' +
    '#forkOverlay .fk-opt__s{font-size:12px;font-weight:700;color:var(--ink,#3b4cca);margin:7px 0 0 30px;line-height:1.5}' +
    '#forkOverlay .fk-opt__n{font-size:11px;line-height:1.55;color:var(--muted,#666d80);margin:4px 0 0 30px}' +
    '#forkOverlay .fk-foot{font-size:11px;line-height:1.6;color:var(--muted,#666d80);text-align:center;margin-top:4px}';

  function injectForkCss() {
    if (typeof document === 'undefined' || document.getElementById('fork-style')) return;
    var s = document.createElement('style');
    s.id = 'fork-style';
    s.textContent = FORK_CSS;
    document.head.appendChild(s);
  }

  function closeFork() {
    var el = (typeof document !== 'undefined') ? document.getElementById('forkOverlay') : null;
    if (el) { el.innerHTML = ''; el.onclick = null; el.style.display = 'none'; }
  }

  function showFork() {
    if (!fork || fork.shown || typeof document === 'undefined') return;
    fork.shown = true;
    injectForkCss();
    var el = document.getElementById('forkOverlay');
    if (!el) { el = document.createElement('div'); el.id = 'forkOverlay'; document.body.appendChild(el); }
    var acc = stateSummary(fork.cloud || fork.accountState);
    var loc = stateSummary(fork.oldState);
    var accReal = !!(acc && acc.real);
    var offlineTip = fork.offline
      ? '<br>暂时连不上账号云端，下面显示的是这台设备上保存的账号记录。'
      : '';
    var lead = accReal
      ? '这台设备上有一份之前的记录，账号 ' + escHtml(fork.target) + ' 里也有一份，两边内容不一样。'
      : '这台设备上有一份之前的记录，而账号 ' + escHtml(fork.target) + ' 还是全新的（还没有打卡记录）。';
    var accNote = accReal
      ? '换设备、在手机上查看，用的都是这份。本机旧记录留在这台设备里，不删除。'
      : '这个账号从零开始，会先走一遍「选择第一支宝可梦」的新手流程。本机旧记录留在这台设备里，不删除。';
    el.style.display = 'block';
    el.innerHTML =
      '<div class="fk-bg"></div>' +
      '<div class="fk-modal" role="dialog" aria-label="选择用哪份记录">' +
        '<div class="fk-title">用哪一份记录继续？</div>' +
        '<div class="fk-lead">' + lead +
          '请自己选一份继续用：没选中的那份会完整留着，在「我的数据 → 数据存档」里随时能换回来。' +
          offlineTip + '</div>' +
        '<button type="button" class="fk-opt" data-fork="account">' +
          '<div class="fk-opt__t"><i>1</i>用这个账号的记录</div>' +
          '<div class="fk-opt__s">' + summaryText(acc) + '</div>' +
          '<div class="fk-opt__n">' + accNote + '</div>' +
        '</button>' +
        '<button type="button" class="fk-opt" data-fork="local">' +
          '<div class="fk-opt__t"><i>2</i>用这台设备上的旧记录</div>' +
          '<div class="fk-opt__s">' + summaryText(loc) + '</div>' +
          '<div class="fk-opt__n">把以前的打卡记录搬到这个账号，会覆盖账号里原来的记录；覆盖前会先留一份备份。</div>' +
        '</button>' +
        '<div class="fk-foot">两份记录不会自动合并，只能二选一。之后仍可随时重新选择。</div>' +
      '</div>';
    // 点背景不关闭：必须明确选一个，避免「手一滑」等于默认选了某一份
    el.onclick = function (e) {
      var t = e.target;
      while (t && t !== el && !(t.getAttribute && t.getAttribute('data-fork'))) t = t.parentNode;
      if (!t || t === el) return;
      chooseFork(t.getAttribute('data-fork'));
    };
  }

  function chooseFork(which) {
    if (!fork) return;
    var f = fork;
    closeFork();
    markForkAsked(f.target);
    if (which === 'local') {
      // 覆盖前把账号原有那份留成独立槽，用户反悔可一键导回
      var acc = f.cloud || f.accountState || (APP.store && APP.store.get && APP.store.get());
      if (acc && stateRealData(acc)) {
        lsSet(SLOT_PREFIX + f.target + '.forkorig', JSON.stringify(acc));
      }
      adopting = true;
      APP.store.replaceState(f.oldState);
      adopting = false;
      fork = null;
      saveForkState();
      localWinsUntilPush = true;
      APP.store.save();   // 刷新 savedAt，保证能盖过云端
      flushPush();        // 立刻把选择推上云端（离线则等联网自动重试）
      if (APP.refresh) APP.refresh();
      return;
    }
    // 用账号那份：云端数据优先；没有则保持该账号在这台设备上的存档 / 全新空档
    if (f.cloud) {
      adopting = true;
      APP.store.replaceState(f.cloud);
      adopting = false;
    }
    fork = null;
    saveForkState();
    if (APP.refresh) APP.refresh();
  }

  // 「我的数据 → 数据存档」里手动重开这次选择（改主意 / 验证流程都用它）
  function reopenFork(slotId) {
    var id = slotId || 'local';
    var other = parseRaw(slotRaw(id));
    if (!other) return false;
    var now = (APP.store && APP.store.get) ? APP.store.get() : null;
    fork = {
      target: slotOwner(), from: id, oldState: other,
      accountState: now, cloud: now, shown: false, offline: false
    };
    saveForkState();
    showFork();
    return true;
  }

  // 把当前活跃存档收进它自己的槽（只增不删），再载入目标槽；全程静默，不触发 push。
  function applySlot(target) {
    // 上一次还没选就又换账号 / 退出登录：收掉旧弹窗并解除冻结，否则界面会卡住
    if (fork) { closeFork(); fork = null; saveForkState(); }
    var from = savedOwner() || 'local';
    var raw = lsGet(SAVE_KEY);
    var before = parseRaw(raw);
    if (raw) lsSet(SLOT_PREFIX + from, raw);
    var next = parseRaw(slotRaw(target));
    adopting = true; // 切槽期间 migrate 可能触发 save()，绝不能让旧槽数据回推
    if (APP.store && APP.store.replaceState) APP.store.replaceState(next);
    adopting = false;
    lsSet(OWNER_KEY, target);
    // 登录到另一个账号、且切换前那份是真实记录 → 进入「等用户二选一」状态。
    // 登出回本机（target === 'local'）或该账号已经选过，都不再打扰。
    if (target !== 'local' && target !== from && !forkAsked(target) && stateRealData(before)) {
      fork = {
        target: target, from: from, oldState: before,
        accountState: next, cloud: null, shown: false, offline: false
      };
      saveForkState();
    }
    stop(); // 让 render() 里的 start() 按新归属重新拉一次云端
    return true;
  }

  // 每次 render 开头跑：归属没变时零开销
  function ensureSlot() {
    var target = slotOwner();
    if (savedOwner() === target) return false;
    return applySlot(target);
  }

  // 切回本机旧记录：必须断开会话，否则周期 pull 会把账号云端数据盖回本机记录
  function switchToLocal() {
    // 纯静态版无「本机模式」：切回本机旧记录不再支持，保持界面稳定返回 false
    return false;
  }

  function canSync() {
    return !!(APP.auth && APP.auth.session() && APP.gh && APP.gh.config());
  }

  function set(patch) {
    for (var k in patch) {
      if (Object.prototype.hasOwnProperty.call(patch, k)) status[k] = patch[k];
    }
    renderBadge();
  }

  // 临时文案（如「上传照片 2/5…」）：非阻塞，只顶掉角标文字
  function setNotice(text) {
    status.notice = text || '';
    renderBadge();
  }

  function badgeEl() {
    if (typeof document === 'undefined' || !document.getElementById) return null;
    return document.getElementById('syncBadge');
  }

  function renderBadge() {
    var el = badgeEl();
    if (!el) return;
    if (!canSync()) { el.style.display = 'none'; el.textContent = ''; return; }
    var cls = 'sync-badge';
    var txt;
    if (status.notice) { txt = status.notice; cls += ' is-syncing'; }
    else if (status.syncing) { txt = '同步中…'; cls += ' is-syncing'; }
    else if (status.offline) { txt = '离线 · 未同步 ' + status.pending + ' 项'; cls += ' is-offline'; }
    else if (status.pending > 0) { txt = '未同步 ' + status.pending + ' 项'; cls += ' is-pending'; }
    else { txt = '已同步'; cls += ' is-ok'; }
    el.textContent = txt;
    el.className = cls;
    el.style.display = '';
  }

  // 旧的服务器请求出口已废弃：纯静态版不再有后端，所有读写走 APP.gh（GitHub 仓库）
  function request() { return Promise.reject(new Error('no server')); }

  // —— 照片同步（T5，v1 简化）——
  // 纯静态 v1：照片仅存本机 IndexedDB，不进 GitHub 仓库（避免单文件 >1MB 限制）。
  // 跨设备审核时照片不跟随存档，已知限制，v2 再做仓库内照片同步。
  function uploadPhotos() {
    return Promise.resolve(0);
  }

  // —— 旧数据绑定（T6）——
  // 云端为空 + 本机有真实打卡数据 → 家长确认后把本机存档与照片搬上去。
  // 关键防线：只认「真实数据」（有打卡记录/经验/宝可梦经验），避免新装的空设备把默认空存档传上去，
  // 回头把平板上真正的数据覆盖掉（LWW 下新存档 savedAt 更大，会导致真丢数据）。
  function hasRealData() { return stateRealData(APP.store.get()); }

  // 「上传」的等价能力：把某个槽里的旧记录导入到当前账号（手动触发）。
  // 旧记录快照始终保留，导入只是把内容复制成当前账号的数据；不弹窗是为了不打断首登流程。
  function importSlot(id) {
    var obj = parseRaw(slotRaw(id));
    if (!obj) return Promise.resolve({ ok: false, error: '没有找到这份存档' });
    if (!canSync()) return Promise.resolve({ ok: false, error: '请先登录账号' });
    var msg = '把「' + escHtml(slotLabel(id)) + '」导入到账号 ' + escHtml(slotOwner()) +
      '？会覆盖这个账号当前的数据，这份存档本身仍会保留，随时可以再导入。';
    var ask = (APP.ui && APP.ui.confirm)
      ? APP.ui.confirm(msg, '导入并覆盖', '取消', '导入存档')
      : Promise.resolve(false);
    return ask.then(function (ok) {
      if (!ok) return { ok: false };
      adopting = true;
      APP.store.replaceState(obj);
      adopting = false;
      APP.store.save(); // 刷新 savedAt，保证能盖掉云端已有存档
      return flushPush().then(function (pushed) {
        if (APP.refresh) APP.refresh();
        return { ok: !!pushed };
      });
    });
  }

  function importLocalToAccount() { return importSlot('local'); }

  // 照片展示源：v1 照片仅存本机 IndexedDB（换设备不跟随存档；后续版本再做仓库同步）。
  // 因此这里只取本地；服务端照片通道已随纯静态化移除。
  function photoSrc(photoId) {
    if (!photoId) return Promise.resolve(null);
    if (APP.photos && APP.photos.get) return APP.photos.get(photoId);
    return Promise.resolve(null);
  }

  function pull() {
    if (!canSync()) return Promise.resolve(false);
    if (localWinsUntilPush) return push();
    var id = slotOwner();
    if (id === 'local') return Promise.resolve(false);
    var s = APP.auth.session();
    if (!s || !s.vaultKeyB64) return Promise.resolve(false);
    set({ syncing: true });
    var vaultKeyPromise = APP.cipher.importRaw(APP.cipher.bytesFromB64(s.vaultKeyB64));
    return vaultKeyPromise.then(function (vaultKey) {
      return APP.gh.getFile('saves/' + id + '.json').then(function (existing) {
        if (!existing) {
          // 云端为空 = 这个账号的全新起点；本机旧记录已由 ensureSlot 完整留在独立槽里。
          set({ syncing: false, offline: false, lastSyncAt: Date.now() });
          return true;
        }
        var env = null;
        try { env = JSON.parse(APP.gh.decode(existing.content)); } catch (e) { env = null; }
        if (!env || !env.iv || !env.ct) { set({ syncing: false, offline: false }); return true; }
        return APP.cipher.open(env, vaultKey).then(function (data) {
          if (fork) {
            // 分叉待决策：云端数据先收着，不 adopt、不 push，等用户自己选
            fork.cloud = data;
            fork.offline = false;
            set({ syncing: false, offline: false, lastSyncAt: Date.now() });
            showFork();
            return true;
          }
          adopting = true;
          var changed = false;
          try { changed = APP.store.adoptExternal(data); } catch (e) { changed = false; }
          adopting = false;
          if (changed && APP.refresh) APP.refresh();
          set({ syncing: false, offline: false, lastSyncAt: Date.now() });
          return true;
        })['catch'](function () { set({ syncing: false, offline: false }); return true; });
      });
    })['catch'](function () {
      set({ syncing: false, offline: true });
      if (fork) { fork.offline = true; showFork(); }
      return false;
    });
  }

  function push() {
    if (!canSync() || fork) return Promise.resolve(false);
    var id = slotOwner();
    if (id === 'local') return Promise.resolve(false);
    var s = APP.auth.session();
    if (!s || !s.vaultKeyB64) return Promise.resolve(false);
    set({ syncing: true });
    var sData = APP.store.get();
    return APP.cipher.importRaw(APP.cipher.bytesFromB64(s.vaultKeyB64)).then(function (vaultKey) {
      return APP.cipher.seal(sData, vaultKey);
    }).then(function (env) {
      return APP.gh.getFile('saves/' + id + '.json').then(function (existing) {
        var sha = existing ? existing.sha : null;
        return APP.gh.putFile('saves/' + id + '.json', JSON.stringify(env), sha).then(function () {
          localWinsUntilPush = false;
          set({ syncing: false, offline: false, pending: 0, lastSyncAt: Date.now() });
          return uploadPhotos()['then'](function () { return true; });
        });
      });
    })['catch'](function () {
      set({ syncing: false, offline: true });
      return false;
    });
  }

  function schedulePush() {
    if (!canSync()) return;
    if (pushTimer) clearTimeout(pushTimer);
    pushTimer = setTimeout(function () {
      pushTimer = null;
      push();
    }, PUSH_DEBOUNCE);
  }

  // 本地每次落盘（store.save）都会回调这里
  function onLocalSave() {
    if (adopting || fork) return; // 二选一没定之前，任何写入都不许往账号云端推
    if (!canSync()) return;
    status.pending++;
    renderBadge();
    schedulePush();
  }

  // 首次拉取结束后打开新手引导门禁，并重渲染一次让 render() 重新判定。
  // 失败也置位：离线时不能把用户永远卡在「等同步」而没有引导。
  function markFirstPullDone() {
    if (firstPullDone) return;
    firstPullDone = true;
    if (APP.refresh) APP.refresh();
  }
  function ready() { return firstPullDone; }

  function start() {
    if (fork && !canSync()) { fork.offline = true; showFork(); return; } // 离线也要让用户能选
    if (started || !canSync()) return;
    started = true;
    APP.store.onSave = onLocalSave;
    pull()['then'](function () { uploadPhotos(); markFirstPullDone(); });
    if (typeof setInterval === 'function') {
      if (pullTimer) clearInterval(pullTimer);
      pullTimer = setInterval(function () {
        pull()['then'](function () { uploadPhotos(); });
      }, PULL_INTERVAL);
    }
    if (typeof window !== 'undefined' && window.addEventListener) {
      window.addEventListener('online', function () {
        pull()['then'](function () { push(); });
      });
    }
    renderBadge();
  }

  function stop() {
    started = false;
    firstPullDone = false; // 换账号 / 重新登录后，等新账号自己的首次拉取完成再放行引导
    if (pullTimer) { clearInterval(pullTimer); pullTimer = null; }
    if (pushTimer) { clearTimeout(pushTimer); pushTimer = null; }
  }

  // 立即推送（跳过防抖等待），供测试与「退出登录前先同步」使用
  function flushPush() {
    if (pushTimer) { clearTimeout(pushTimer); pushTimer = null; }
    return push();
  }

  APP.sync = {
    start: start,
    stop: stop,
    ready: ready,
    pull: pull,
    push: push,
    flushPush: flushPush,
    uploadPhotos: uploadPhotos,
    photoSrc: photoSrc,
    importLocalToAccount: importLocalToAccount,
    importSlot: importSlot,
    ensureSlot: ensureSlot,
    switchToLocal: switchToLocal,
    forkPending: forkPending,
    reopenFork: reopenFork,
    slotOwner: slotOwner,
    slotLabel: slotLabel,
    slotIds: slotIds,
    hasLocalSlot: function () { return !!slotRaw('local'); },
    hasRealData: hasRealData,
    status: function () { return status; },
    refreshBadge: renderBadge
  };

  restoreForkState(); // 弹窗期间刷新了页面：回来继续让用户选，不跳过这一步
})(window.APP);
