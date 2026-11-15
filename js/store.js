window.APP = window.APP || {};

(function (APP) {
  'use strict';

  var KEY = 'pokedex-checkin-v1';
  var state = null;

  // V5 月度连击阶梯：自然月内连续打卡达档位天数，结算时发放对应碎片（每月重置）
  var COMBO_MILESTONES = [
    { d: 3, r: 1 }, { d: 7, r: 3 }, { d: 10, r: 5 },
    { d: 15, r: 7 }, { d: 21, r: 9 }, { d: 30, r: 11 }
  ];
  function grantComboMilestones(s) {
    if (!s.streak.claimed) s.streak.claimed = [];
    for (var i = 0; i < COMBO_MILESTONES.length; i++) {
      var m = COMBO_MILESTONES[i];
      if (s.streak.monthCurrent >= m.d && s.streak.claimed.indexOf(m.d) === -1) {
        addShards(m.r, '连击 ' + m.d + ' 天奖励');
        s.streak.claimed.push(m.d);
        queueEvent({ t: 'combo', d: m.d, r: m.r }); // 首次达档位：走庆祝层（彩带+大字+叫声）
      }
    }
  }

  function load() {
    if (state) return state;
    var raw = null;
    try {
      raw = window.localStorage.getItem(KEY);
    } catch (e) {
      raw = null;
    }
    if (raw) {
      try {
        state = JSON.parse(raw);
      } catch (e) {
        state = null;
      }
    }
    if (!state || typeof state !== 'object' || !Array.isArray(state.tasks)) {
      // 只有「没有存档 / 存档损坏」才重建默认数据。
      // 版本旧一律走下面的 migrate 保留全部数据——旧逻辑在这里做过
      // 「版本不匹配就整体重置」，改一次版本号孩子的任务、经验全部清空。
      state = APP.defaultState();
      save();
    }
    migrate(state);
    return state;
  }

  // 旧数据兼容：needReview → mode；补 expOnCheck 默认值；补进化相关字段
  function migrate(s) {
    if (!s) return;
    var changed = false;
    var list = s.tasks || [];
    for (var i = 0; i < list.length; i++) {
      var t = list[i];
      if (!t.mode) {
        t.mode = t.needReview ? 'photo' : 'check';
        changed = true;
      }
      // A4：任务奖励统一碎片口径——旧任务只有 exp 字段（或 shards 缺失/非法），按 A1 规则补 1 碎片
      if (!t || typeof t.shards !== 'number' || !(t.shards > 0)) {
        t.shards = 1;
        changed = true;
      }
    }
    if (s.family && s.family.settings && typeof s.family.settings.expOnCheck !== 'boolean') {
      s.family.settings.expOnCheck = true;
      changed = true;
    }
    if (!Array.isArray(s.catches)) {
      s.catches = [];
      changed = true;
    }
    if (!Array.isArray(s.events)) {
      s.events = [];
      changed = true;
    }
    // T5：照片元数据（只记 id 与同步状态，照片本体在 IndexedDB / 云端）
    if (!Array.isArray(s.photos)) {
      s.photos = [];
      changed = true;
    }
    var ps = s.pokemon || [];
    for (var k = 0; k < ps.length; k++) {
      var p = ps[k];
      if (!p.flags) {
        p.flags = { lv60: false, final: false };
        changed = true;
      }
      if (typeof p.pendingEvo === 'undefined') {
        p.pendingEvo = null;
        changed = true;
      }
      if (!Array.isArray(p.history)) {
        p.history = [];
        changed = true;
      }
      if (typeof p.maxedNotifiedDate !== 'string') {
        p.maxedNotifiedDate = '';
        changed = true;
      }
      // 7b：元气满满状态标记（饱食/心情/体力均≥90 当天经验 +10%）
      if (typeof p.perfectToday !== 'boolean') {
        p.perfectToday = false;
        changed = true;
      }
      if (typeof p.lastPerfectDate !== 'string') {
        p.lastPerfectDate = '';
        changed = true;
      }
      // 7f：羁绊按天结算标记（喂/玩/练当天计满 1 天；抚摸计数）
      if (typeof p.bondedToday === 'undefined') { p.bondedToday = null; changed = true; }
      if (typeof p.lastPetDate !== 'string') { p.lastPetDate = ''; changed = true; }
      if (typeof p.lastPetAt !== 'number') { p.lastPetAt = 0; changed = true; }
      if (typeof p.petCountToday !== 'number') { p.petCountToday = 0; changed = true; }
      // 初始伙伴补一条来源记录（图鉴以后按 catches 判定已收服）
      if ((p.slot === 'active' || p.slot === 'team') && !s.catches.length) {
        s.catches.push({
          dexNo: p.dexNo,
          name: p.nickname,
          at: (s.meta && s.meta.createdAt) || APP.todayStr(),
          via: 'start'
        });
        changed = true;
      }
    }
    // 牧场养育场（Task 8 / Phase 0）数据迁移：wallet.potions / outings 补全
    if (!s.wallet || typeof s.wallet !== 'object') { s.wallet = { balls: 3, berries: 3, potions: 0 }; changed = true; }
    if (typeof s.wallet.potions !== 'number') { s.wallet.potions = 0; changed = true; }
    // V5.1：每只宝可梦补一个「劳动消耗」个体值 vigor（10~40，随机生成后固定不变）
    //       体力 ≥50 劳动（−vigor），<50 自动休息（+50）；vigor 越小越勤快，均值 25 ≈ 2/3 出勤
    if (!Array.isArray(s.pokemon)) s.pokemon = [];
    for (var vg = 0; vg < s.pokemon.length; vg++) {
      var vp = s.pokemon[vg];
      if (vp && typeof vp.vigor !== 'number') { vp.vigor = 10 + Math.floor(Math.random() * 31); changed = true; }
    }
    if (!s.outings || typeof s.outings !== 'object' || typeof s.outings.left !== 'number') {
      s.outings = { weekKey: '', left: 4, accrued2: 0, sundayGiven: false };
      changed = true;
    }
    // helpers[] 是旧版身份无关的被动产出器，已全部由「随行 5 只（active+ranch）挂机产出」取代；首次加载清空
    if (Array.isArray(s.helpers) && s.helpers.length) { s.helpers = []; changed = true; }
    // V6 训练：当日次数 + 二期自定义题库契约，旧存档自动补空值
    if (!Array.isArray(s.trainingPlays)) { s.trainingPlays = []; changed = true; }
    if (!Array.isArray(s.careLog)) { s.careLog = []; changed = true; }
    if (!s.customBanks || typeof s.customBanks !== 'object') { s.customBanks = { idiom: [], pinyin: [], english: [], enabled: true }; changed = true; }
    ['idiom', 'pinyin', 'english'].forEach(function (k) {
      if (!Array.isArray(s.customBanks[k])) { s.customBanks[k] = []; changed = true; }
    });
    if (typeof s.customBanks.enabled !== 'boolean') { s.customBanks.enabled = true; changed = true; }

    // ===== V5 迁移：碎片/券经济 + 门禁 + 脱钩经验 =====
    // 任务 exp → shards（每条必得 1，旧数值不继承）
    var ts = s.tasks || [];
    for (var ti2 = 0; ti2 < ts.length; ti2++) {
      if (typeof ts[ti2].shards !== 'number') { ts[ti2].shards = 1; changed = true; }
      if (typeof ts[ti2].exp !== 'undefined') { delete ts[ti2].exp; changed = true; }
    }
    // 设置项补齐（V5 新增）
    var st = s.family && s.family.settings;
    if (st) {
      if (typeof st.shardPerTask !== 'number') { st.shardPerTask = 1; changed = true; }
      if (!st.exchangeRate || typeof st.exchangeRate !== 'object') { st.exchangeRate = { battle: 5, capture: 7 }; changed = true; }
      if (!st.playGate || typeof st.playGate !== 'object') { st.playGate = { normalGapDays: 2, holidayPerDay: 3 }; changed = true; }
      if (typeof st.myTrainer !== 'number') { st.myTrainer = 0; changed = true; }
    }
    // 钱包：补全 shards / tickets（旧 balls 折算为初始精灵球），保留 berries/potions
    if (!s.wallet || typeof s.wallet !== 'object') s.wallet = { balls: 0, berries: 3, potions: 0, shards: 0, tickets: { capture: 3, battle: 4 } };
    if (typeof s.wallet.shards !== 'number') { s.wallet.shards = 0; changed = true; }
    if (!s.wallet.tickets || typeof s.wallet.tickets !== 'object') {
      s.wallet.tickets = { capture: (typeof s.wallet.balls === 'number' ? s.wallet.balls : 0), battle: 4 };
      changed = true;
    }
    // 频率门禁状态补全
    if (!s.playCaps || typeof s.playCaps !== 'object') {
      s.playCaps = { capture: { dayKey: '', countToday: 0, lastDate: '' }, battle: { dayKey: '', countToday: 0, lastDate: '' } };
      changed = true;
    } else {
      ['capture', 'battle'].forEach(function (k) {
        if (!s.playCaps[k]) { s.playCaps[k] = { dayKey: '', countToday: 0, lastDate: '' }; changed = true; }
      });
    }
    // 碎片流水补全
    if (!Array.isArray(s.shardLog)) { s.shardLog = []; changed = true; }
    // 道馆 / 心愿礼物字段补全（v57；旧档平滑升级，不丢已有数据）
    if (typeof s.wallet.wishStars !== 'number') { s.wallet.wishStars = 0; changed = true; }
    if (!s.gym || typeof s.gym !== 'object') {
      s.gym = { weekKey: '', used: 0, badges: [], cooldown: {}, lastDate: {} };
      changed = true;
    } else {
      if (!Array.isArray(s.gym.badges)) { s.gym.badges = []; changed = true; }
      if (!s.gym.cooldown || typeof s.gym.cooldown !== 'object') { s.gym.cooldown = {}; changed = true; }
      if (!s.gym.lastDate || typeof s.gym.lastDate !== 'object') { s.gym.lastDate = {}; changed = true; }
      if (typeof s.gym.used !== 'number') { s.gym.used = 0; changed = true; }
    }
    // v61：大师首次通关记录（防重复发星），旧档补空数组
    if (!Array.isArray(s.gym.masterCleared)) { s.gym.masterCleared = []; changed = true; }
    if (!Array.isArray(s.wishOrders)) { s.wishOrders = []; changed = true; }
    // 连击阶梯（月度）字段补全
    if (!s.streak || typeof s.streak !== 'object') s.streak = { current: 0, best: 0, lastDate: '' };
    if (typeof s.streak.monthKey !== 'string') { s.streak.monthKey = ''; changed = true; }
    if (typeof s.streak.monthCurrent !== 'number') { s.streak.monthCurrent = 0; changed = true; }
    if (typeof s.streak.monthBest !== 'number') { s.streak.monthBest = 0; changed = true; }
    if (!Array.isArray(s.streak.claimed)) { s.streak.claimed = []; changed = true; }
    // 历史实例：expGained → shardGained（旧值不转为碎片，避免重复奖励，仅置 0 占位）
    if (s.instances && typeof s.instances === 'object') {
      for (var dk in s.instances) {
        if (!Object.prototype.hasOwnProperty.call(s.instances, dk)) continue;
        var insts = s.instances[dk] || {};
        for (var ik in insts) {
          if (!Object.prototype.hasOwnProperty.call(insts, ik)) continue;
          var inst0 = insts[ik];
          if (typeof inst0.shardGained !== 'number') { inst0.shardGained = 0; changed = true; }
          if (typeof inst0.expGained !== 'undefined') { delete inst0.expGained; changed = true; }
        }
      }
    }

    // V2.0 首登引导 / 功能解锁字段补全（老存档自愈，绝不重置用户数据）
    if (!s.onboarding || typeof s.onboarding !== 'object') { s.onboarding = {}; changed = true; }
    if (typeof s.onboarding.onboarded !== 'boolean') { s.onboarding.onboarded = false; changed = true; }
    if (typeof s.onboarding.firstPokemon !== 'string' && s.onboarding.firstPokemon !== null) { s.onboarding.firstPokemon = null; changed = true; }
    if (typeof s.onboarding.character !== 'string' && s.onboarding.character !== null) { s.onboarding.character = null; changed = true; }
    if (typeof s.onboarding.reselectTime !== 'number') { s.onboarding.reselectTime = 0; changed = true; }
    if (typeof s.onboarding.welcomed !== 'boolean') { s.onboarding.welcomed = false; changed = true; }
    if (!s.unlock || typeof s.unlock !== 'object') { s.unlock = {}; changed = true; }
    if (!s.unlock.seen || typeof s.unlock.seen !== 'object') { s.unlock.seen = {}; changed = true; }

    // 写入时间戳：供 beginWrite 判断「外部存档是否比内存新」（多页面覆盖防护）。
    // 旧存档没有这个字段，补 0——加载时的 migrate 会顺手把它写成当前时间。
    if (typeof s.savedAt !== 'number') {
      s.savedAt = 0;
      changed = true;
    }
    // ===== V5 队伍平等化迁移：active/ranch → team；照顾对象 = 原主力；多余由 normalizeParty 收敛 =====
    var prevActiveId = '';
    var pks = s.pokemon || [];
    for (var pi = 0; pi < pks.length; pi++) {
      var pk = pks[pi];
      if (!pk) continue;
      if (pk.slot === 'active') { prevActiveId = pk.id; pk.slot = 'team'; changed = true; }
      else if (pk.slot === 'ranch') { pk.slot = 'team'; changed = true; }
    }
    if (typeof s.careTargetId !== 'string' || !s.careTargetId) {
      s.careTargetId = prevActiveId;
      changed = true;
    }

    // 牧场（Task 8 / Phase 1）：随行队超编（队伍 >5）自动收敛进仓库
    if (normalizeParty(s)) changed = true;

    // 默认任务模板升级（5 项 → 8 项）：
    // 只有「当前任务与旧版内置模板逐条一致」才自动套用新版，绝不覆盖用户自定义任务。
    // 打一次标记，之后永不重复迁移；打卡记录在 instances 里，替换 tasks 不会丢记录。
    if (s.taskTemplateVersion !== 2) {
      var OLD_DEFAULT = [
        ['t_hw', '完成今日作业', 'photo', '21:00', 'evening'],
        ['t_read', '课外阅读 20 分钟', 'check', '20:30', 'evening'],
        ['t_move', '运动 30 分钟', 'check', '18:00', 'afternoon'],
        ['t_chore', '整理书包 / 做家务', 'check', '07:40', 'morning'],
        ['t_sleep', '21:30 前上床', 'check', '21:30', 'evening']
      ];
      var cur = s.tasks || [];
      var stillOld = cur.length === OLD_DEFAULT.length;
      for (var oi = 0; stillOld && oi < OLD_DEFAULT.length; oi++) {
        var t0 = cur[oi], o = OLD_DEFAULT[oi];
        stillOld = !!t0 && t0.id === o[0] && t0.title === o[1] &&
          t0.mode === o[2] && t0.deadline === o[3] && t0.slot === o[4];
      }
      if (stillOld) s.tasks = JSON.parse(JSON.stringify(APP.DEFAULT_TASKS));
      s.taskTemplateVersion = 2;
      changed = true;
    }

    // 版本升级：保留全部数据，只把 version 抬到当前值。
    // 数据兼容全部由上面的字段迁移负责，绝不因版本号变化丢弃用户数据。
    if (s.version !== APP.VERSION) {
      s.version = APP.VERSION;
      changed = true;
    }
    if (changed) save();
  }

  // 多标签页 / 多窗口防护：另一个页面可能已经保存了更新的存档
  // （含最新经验与当天完成状态）。每次写入前先读一次 localStorage，
  // 若外部存档比自己内存里的新，就整体采用外部存档再继续改，
  // 避免旧快照整体覆盖——症状正是「经验还在、但已完成的任务被重置」。
  // 页面自己的 save() 会把 savedAt 抬到当前时间，所以同一次操作内部
  // 嵌套的写入（如 addExp → queueEvent）不会再触发合并，无递归风险。
  function beginWrite() {
    if (!state) return;
    var raw = null;
    try {
      raw = window.localStorage.getItem(KEY);
    } catch (e) {
      return;
    }
    if (!raw) return;
    var ext = null;
    try {
      ext = JSON.parse(raw);
    } catch (e) {
      return;
    }
    if (!ext || typeof ext !== 'object' || !Array.isArray(ext.tasks)) return;
    var mine = typeof state.savedAt === 'number' ? state.savedAt : 0;
    if ((ext.savedAt || 0) > mine) {
      state = ext;
      migrate(state);
    }
  }

  function save() {
    if (state) {
      // 单调递增：同一毫秒内的连续保存也保证时间戳严格变大。
      // 否则两个页面恰好在同一毫秒各自 save 时，后写的一方 savedAt 与先写方相等，
      // 另一方下次写入就无法通过比较识别「外部有更新」，旧快照又会覆盖过来。
      var now = Date.now();
      var prev = typeof state.savedAt === 'number' ? state.savedAt : 0;
      state.savedAt = now > prev ? now : prev + 1;
    }
    try {
      window.localStorage.setItem(KEY, JSON.stringify(state));
      // 同步层挂钩（T4）：本地每次落盘都通知一次，由同步层决定何时推送
      if (APP.store && typeof APP.store.onSave === 'function') APP.store.onSave();
      return true;
    } catch (e) {
      return false;
    }
  }

  // —— 照片元数据（T5）——
  function addPhotoMeta(photoId) {
    var s = get();
    if (!Array.isArray(s.photos)) s.photos = [];
    for (var i = 0; i < s.photos.length; i++) {
      if (s.photos[i].id === photoId) return; // 已登记（可能是云端带回来的）
    }
    s.photos.push({ id: photoId, synced: false, createdAt: new Date().toISOString() });
    save();
  }

  function markPhotoSynced(photoId) {
    var s = get();
    if (!Array.isArray(s.photos)) return false;
    var hit = false;
    for (var i = 0; i < s.photos.length; i++) {
      if (s.photos[i].id === photoId) {
        s.photos[i].synced = true;
        hit = true;
      }
    }
    if (hit) save();
    return hit;
  }

  function unsyncedPhotos() {
    var s = get();
    if (!Array.isArray(s.photos)) return [];
    var out = [];
    for (var i = 0; i < s.photos.length; i++) {
      if (!s.photos[i].synced) out.push(s.photos[i]);
    }
    return out;
  }

  // 把「存档里有 photoId 但元数据没登记」的历史照片补进 photos（T5 之前拍的照片都属这类）
  function collectPhotoIds() {
    var s = get();
    if (!Array.isArray(s.photos)) s.photos = [];
    var added = 0;
    var days = s.instances || {};
    for (var date in days) {
      if (!Object.prototype.hasOwnProperty.call(days, date)) continue;
      var items = days[date] || {};
      for (var tid in items) {
        if (!Object.prototype.hasOwnProperty.call(items, tid)) continue;
        var inst = items[tid];
        var pid = inst && inst.photoId;
        if (!pid) continue;
        var found = false;
        for (var i = 0; i < s.photos.length; i++) {
          if (s.photos[i].id === pid) { found = true; break; }
        }
        if (!found) {
          s.photos.push({ id: pid, synced: false, createdAt: String(date || '') });
          added++;
        }
      }
    }
    if (added) save();
    return added;
  }

  // 采用外部存档（云端 / 其他页面）：与 beginWrite 同一合并内核，但直接给对象。
  // 只在外部版本更新时才替换；返回是否真的换了数据（调用方可据此决定是否刷新界面）。
  // force=true：本机是全新空档、云端有真实数据时无条件采纳（换设备场景）。
  // 这里刻意不调用 save()：它会把 savedAt 抬成「此刻」，等于本机凭空比其它设备新，
  // 下次同步就会把对方的真实改动挡回去。保留云端原时间戳后静默落盘即可。
  function adoptExternal(ext, force) {
    if (!ext || typeof ext !== 'object' || !Array.isArray(ext.tasks)) return false;
    var mine = state && typeof state.savedAt === 'number' ? state.savedAt : 0;
    var theirs = Number(ext.savedAt) || 0;
    if (!force && theirs <= mine) return false;
    state = ext;
    migrate(state);       // 期间可能 save() 抬时间戳，下面强制还原
    state.savedAt = theirs;
    try { window.localStorage.setItem(KEY, JSON.stringify(state)); } catch (e) {}
    return true;
  }

  // 存档槽位切换：整体替换内存态 + 直接落盘，刻意不走 save()。
  // save() 会刷新 savedAt 并触发同步推送：切换账号的瞬间会把「上一个槽的数据」
  // 误推到新账号，而且新存档 savedAt=now 会压过云端真实数据、让 pull 的 LWW 比较失效。
  // 静默替换保持槽位原有的 savedAt，云端数据才能按原规则胜出。
  function replaceState(obj) {
    state = (obj && typeof obj === 'object' && Array.isArray(obj.tasks))
      ? obj : APP.defaultState();
    migrate(state);
    try { window.localStorage.setItem(KEY, JSON.stringify(state)); } catch (e) {}
    return true;
  }

  function get() {
    return load();
  }

  function settings() {
    return load().family.settings;
  }

  function findTask(taskId) {
    var list = load().tasks;
    for (var i = 0; i < list.length; i++) {
      if (list[i].id === taskId) return list[i];
    }
    return null;
  }

  // 照顾对象：养成页当前照顾的宝可梦（V5 起队伍全员平等，无主力/随从之分）
  function activePokemon() {
    var s = load();
    var list = s.pokemon || [];
    if (s.careTargetId) {
      for (var i = 0; i < list.length; i++) {
        if (list[i] && list[i].id === s.careTargetId && list[i].slot !== 'box') return list[i];
      }
    }
    for (var j = 0; j < list.length; j++) {
      if (list[j] && list[j].slot !== 'box') return list[j];
    }
    return null;
  }

  function tasksFor(date) {
    var wd = APP.weekdayOf(date);
    var all = load().tasks;
    var out = [];
    for (var i = 0; i < all.length; i++) {
      if (all[i].weekdays.indexOf(wd) >= 0) out.push(all[i]);
    }
    return out;
  }

  function ensureInstances(date) {
    var s = load();
    var day = s.instances[date];
    if (!day) {
      day = {};
      s.instances[date] = day;
    }
    var list = tasksFor(date);
    for (var i = 0; i < list.length; i++) {
      if (!day[list[i].id]) {
        day[list[i].id] = {
          taskId: list[i].id,
          status: 'pending',
          photoId: '',
          submittedAt: '',
          isFast: false,
          shardGained: 0,
          reviewNote: ''
        };
      }
    }
    return day;
  }

  function isDoneStatus(status) {
    return status === 'done' || status === 'submitted' || status === 'approved';
  }

  function progressOf(date) {
    var inst = ensureInstances(date);
    var list = tasksFor(date);
    var done = 0;
    for (var i = 0; i < list.length; i++) {
      var it = inst[list[i].id];
      if (it && isDoneStatus(it.status)) done++;
    }
    return { done: done, total: list.length };
  }

  // 仅统计已存在的实例（不创建，供报表使用，避免污染历史日期）
  function progressOfExisting(date) {
    var day = load().instances[date];
    if (!day) return { done: 0, total: 0 };
    var list = tasksFor(date);
    var done = 0;
    for (var i = 0; i < list.length; i++) {
      var it = day[list[i].id];
      if (it && isDoneStatus(it.status)) done++;
    }
    return { done: done, total: list.length };
  }

  // 打卡成功判定：当天「完成数 > 任务总数的一半」即算打卡成功（不要求全部做满）。
  // 例：6 项任务完成 4 项（>3）算当天打卡；完成 3 项（=一半）不算。
  function isCheckInDay(date) {
    var pr = progressOfExisting(date);
    return pr.total > 0 && pr.done > pr.total / 2;
  }

  // 自然月内累计打卡天数：扫描本月已有的日程实例，统计「打卡成功」的天数。
  // 漏掉某天不影响其它天，不会因一天没做满而整月清零；含今天，做满一半以上当天即计入。
  function monthCheckinCount() {
    var s = load();
    var mk = APP.todayStr().slice(0, 7);
    var days = s.instances || {};
    var count = 0;
    for (var d in days) {
      if (!Object.prototype.hasOwnProperty.call(days, d)) continue;
      if (d.slice(0, 7) !== mk) continue;
      if (isCheckInDay(d)) count++;
    }
    return count;
  }

  function addTask(task) {
    beginWrite();
    var s = load();
    if (!task.id) task.id = 't_' + Date.now();
    if (!task.slot) task.slot = 'anytime';
    if (!task.mode) task.mode = 'check';
    if (!task.weekdays || !task.weekdays.length) task.weekdays = APP.ALL_WEEK.slice();
    // A4：碎片口径兜底（后台表单漏传/传 0 时按 1 碎片结算，避免 NaN）
    if (typeof task.shards !== 'number' || !(task.shards > 0)) task.shards = 1;
    s.tasks.push(task);
    save();
    return task;
  }

  function updateTask(task) {
    beginWrite();
    var s = load();
    if (typeof task.shards !== 'number' || !(task.shards > 0)) task.shards = 1;
    for (var i = 0; i < s.tasks.length; i++) {
      if (s.tasks[i].id === task.id) {
        s.tasks[i] = task;
        save();
        return true;
      }
    }
    return false;
  }

  function removeTask(taskId) {
    beginWrite();
    var s = load();
    var idx = -1;
    for (var i = 0; i < s.tasks.length; i++) {
      if (s.tasks[i].id === taskId) { idx = i; break; }
    }
    if (idx >= 0) {
      s.tasks.splice(idx, 1);
      save();
      return true;
    }
    return false;
  }

  function restoreDefaultTasks() {
    beginWrite();
    var s = load();
    s.tasks = JSON.parse(JSON.stringify(APP.DEFAULT_TASKS));
    save();
    return true;
  }

  // 审核队列：所有 待审核 / 已驳回 的实例（按日期倒序）
  function getAuditQueue() {
    var s = load();
    var out = [];
    var dates = Object.keys(s.instances).sort().reverse();
    for (var i = 0; i < dates.length; i++) {
      var day = s.instances[dates[i]];
      var keys = Object.keys(day);
      for (var j = 0; j < keys.length; j++) {
        var inst = day[keys[j]];
        if (inst.status === 'submitted' || inst.status === 'rejected') {
          var task = findTask(inst.taskId);
          if (task) out.push({ date: dates[i], taskId: inst.taskId, inst: inst, task: task });
        }
      }
    }
    return out;
  }

  function approve(date, taskId) {
    beginWrite();
    var inst = ensureInstances(date)[taskId];
    var task = findTask(taskId);
    if (!inst || !task) return false;
    if (inst.status === 'approved') return false;
    // 幂等：碎片已发过（如 expOnCheck 即时发放、或重复点击审核）则跳过，避免与 checkIn 重复发放
    if (inst.shardGained) return false;
    inst.status = 'approved';
    inst.reviewNote = '';
    inst.shardGained = addShards(task.shards, task.title + '（审核通过）');
    save();
    return true;
  }

  function reject(date, taskId, note) {
    beginWrite();
    var inst = ensureInstances(date)[taskId];
    var task = findTask(taskId);
    if (!inst || !task) return false;
    // 若此前已通过并发过碎片，先退回
    if (inst.shardGained) {
      addShards(-inst.shardGained, '驳回退回：' + task.title);
      inst.shardGained = 0;
    }
    inst.status = 'rejected';
    inst.reviewNote = note || '';
    save();
    return true;
  }

  function setPin(pin) {
    beginWrite();
    var s = load();
    s.family.pin = String(pin);
    save();
    return true;
  }

  // 显示模式：'auto' 自动检测墨水屏 / 'color' 强制彩色 / 'ink' 强制墨水屏（灰阶）
  function setInkMode(mode) {
    if (mode !== 'auto' && mode !== 'color' && mode !== 'ink') return false;
    beginWrite();
    var s = load();
    s.family.settings.inkMode = mode;
    save();
    return true;
  }

  // 通用设置写入：care.js 设置弹窗里的开关（soundOn / celebrateOn 等）走这里
  function setSetting(key, val) {
    beginWrite();
    var s = load();
    if (!s.family) s.family = {};
    if (!s.family.settings) s.family.settings = {};
    s.family.settings[key] = val;
    save();
    return true;
  }

  function resetAll() {
    beginWrite();
    state = APP.defaultState();
    save();
    return true;
  }

  // ===== 宝可梦调试（家长后台 → 宝可梦调试，仅用于测试）=====
  // 这些接口会直接改数据，不做"能不能这么做"的业务拦截，只做基本合法性校验。
  // 统一返回 { ok, msg, ... }，让页面能给出确定性提示，不靠 alert 猜结果。

  function listPokemon() {
    return load().pokemon.slice();
  }

  function findPokemonByDex(dexNo) {
    var list = load().pokemon;
    for (var i = 0; i < list.length; i++) {
      if (list[i].dexNo === dexNo) return list[i];
    }
    return null;
  }

  function parseDex(raw) {
    var n = parseInt(String(raw === undefined || raw === null ? '' : raw).replace(/[^0-9]/g, ''), 10);
    if (!n) return 0;
    // 清单驱动：只接受本期图鉴名单里的编号（61 家族的全部形态 + 54 只对战专用，均在 001–386 内）
    var valid = APP.dexData && APP.dexData.validIds && APP.dexData.validIds();
    if (valid) return valid[n] ? n : 0;
    if (n < 1 || n > 151) return 0; // dexData 未加载时退回原关都口径，避免白屏
    return n;
  }

  function addPokemonByDex(raw, opts) {
    beginWrite();
    var n = parseDex(raw);
    if (!n) return { ok: false, msg: '编号不在本期图鉴清单内（001–386 中已选定的宝可梦）' };
    var info = APP.evo.get(n);
    if (!info) return { ok: false, msg: '没有 ' + n + ' 号宝可梦' };
    var s = load();
    if (findPokemonByDex(n)) {
      return { ok: false, msg: '已经有 ' + info.name + ' 了，不能重复收录' };
    }

    var teamCount = 0;
    for (var tc = 0; tc < s.pokemon.length; tc++) {
      if (s.pokemon[tc] && s.pokemon[tc].slot !== 'box') teamCount++;
    }
    var toTeam = teamCount < 5;
    var p = {
      id: 'p_' + Date.now() + '_' + Math.floor(Math.random() * 1000),
      dexNo: n,
      nickname: info.name,
      level: 1,
      exp: 0,
      stage: info.stage,
      slot: toTeam ? 'team' : 'box',
      stats: { food: 80, mood: 80, energy: 80 },
      vigor: 10 + Math.floor(Math.random() * 31), // V5.1：劳动消耗个体值（10~40），生成后固定
      bond: { stars: 0, daysCared: 0, wins: 0, perfectDays: 0 },
      flags: { lv60: false, final: false },
      pendingEvo: null,
      maxedNotifiedDate: '',
      perfectToday: false,
      lastPerfectDate: '',
      // 7f：羁绊按天结算标记
      bondedToday: null,
      lastPetDate: '',
      lastPetAt: 0,
      petCountToday: 0,
      history: []
    };
    s.pokemon.push(p);
    if (!s.careTargetId && toTeam) s.careTargetId = p.id;
    // B3 野外捕捉写 via:'wild'；家长后台调试沿用默认 'debug'
    s.catches.push({ dexNo: n, name: info.name, at: APP.todayStr(), via: (opts && opts.via) || 'debug' });
    save();
    return {
      ok: true,
      msg: info.name + (toTeam ? ' 已加入队伍' : ' 已收录（队伍已满，先住仓库）'),
      pokemon: p
    };
  }

  // V2.0 首登：把默认那只皮卡丘就地替换为玩家选中的初始宝可梦。
  // 就地改而非「再加一只」，保证队伍始终只有 1 只初始伙伴、careTargetId 不失效。
  function setFirstPokemon(raw) {
    beginWrite();
    var n = parseDex(raw);
    var info = n ? APP.evo.get(n) : null;
    if (!info) return { ok: false, msg: '编号无效' };
    var s = load();
    var p = s.pokemon && s.pokemon[0];
    if (!p) return { ok: false, msg: '没有初始宝可梦' };
    p.dexNo = n;
    p.nickname = info.name;
    p.stage = info.stage;
    p.level = 1;
    p.exp = 0;
    p.pendingEvo = null;
    p.flags = p.flags || {};
    p.flags.lv60 = false;
    p.flags.final = false;
    p.bond = { stars: 0, daysCared: 0, wins: 0, perfectDays: 0 };
    p.history = [];
    s.catches = [{ dexNo: n, name: info.name, at: APP.todayStr(), via: 'onboard' }];
    save();
    return { ok: true, pokemon: p };
  }

  function setActiveByDex(raw) {
    beginWrite();
    var n = parseDex(raw);
    if (!n) return { ok: false, msg: '编号不在本期图鉴清单内（001–386 中已选定的宝可梦）' };
    var info = APP.evo.get(n);
    var target = findPokemonByDex(n);
    if (!target) {
      return { ok: false, msg: '还没有 ' + (info ? info.name : n + ' 号') + '，请先用「添加宝可梦」加入' };
    }
    if (s_careIs(target)) return { ok: false, msg: target.nickname + ' 已经是主力了' };

    if (target.slot === 'box') {
      var g0 = partyOf(load());
      if (g0.team.length >= 5) return { ok: false, msg: '队伍已满 5 只，先移出一只再加入' };
      target.slot = 'team';
    }
    var s1 = load();
    s1.careTargetId = target.id;
    save();
    return {
      ok: true,
      msg: '主力已换成 ' + target.nickname,
      pokemon: target
    };
  }

  // 该宝可梦是否为当前照顾对象
  function s_careIs(p) {
    var s = load();
    return !!s.careTargetId && s.careTargetId === p.id && p.slot !== 'box';
  }

  // 给照顾对象直接加经验（调试用，全程静默）：
  // 升级提示、60 级提醒、进化演出、满级提醒都不排队不播放；
  // 跨过进化等级时直接连续变形到当前等级允许的形态（一次加很多会连跳多段），
  // 不残留 pendingEvo，退出后台不会补播幽灵演出。
  function debugAddExp(raw) {
    beginWrite();
    var n = parseInt(String(raw === undefined || raw === null ? '' : raw).replace(/[^0-9]/g, ''), 10);
    if (!n || n <= 0) return { ok: false, msg: '请输入大于 0 的整数经验' };
    var p = activePokemon();
    if (!p) return { ok: false, msg: '当前没有照顾的宝可梦' };

    var need = settings().expPerLevel;
    var before = { level: p.level, inLevel: p.exp % need, total: p.exp, dexNo: p.dexNo, name: p.nickname };
    var gained = addExp(n, '调试加经验', { silent: true });
    var p2 = activePokemon();
    return {
      ok: true,
      requested: n,
      gained: gained,
      capped: gained < n,
      from: before,
      to: { level: p2.level, inLevel: p2.exp % need, total: p2.exp, dexNo: p2.dexNo, name: p2.nickname },
      evolved: p2.dexNo !== before.dexNo,
      evolvedTo: p2.dexNo !== before.dexNo ? p2.nickname : ''
    };
  }

  // 重置照顾对象：经验清空 + 还原基础形态 + 彻底清掉这只宝可梦的进化痕迹（历史 / 羁绊 / 三维状态）。
  // 图鉴按「当前仍实际拥有的形态」重建，避免出现"场上站着杰尼龟、图鉴说没抓过"。
  function resetActivePokemon() {
    beginWrite();
    var s = load();
    var p = activePokemon();
    if (!p) return { ok: false, msg: '当前没有照顾的宝可梦' };

    var from = { dexNo: p.dexNo, name: p.nickname, level: p.level };
    var root = APP.evo.rootOf(p.dexNo) || { dexNo: p.dexNo, name: p.nickname, stage: p.stage };
    var path = APP.evo.chainOf(p.dexNo);

    p.dexNo = root.dexNo;
    p.nickname = root.name;
    p.stage = root.stage || 0;
    p.exp = 0;
    p.level = 1;
    p.pendingEvo = null;
    p.maxedNotifiedDate = '';
    p.flags = { lv60: false, final: false };
    p.history = [];
    p.bond = { stars: 0, daysCared: 0, wins: 0, perfectDays: 0 };
    p.stats = { food: 80, mood: 80, energy: 80 };
    p.perfectToday = false;
    p.lastPerfectDate = '';
    // 7f：羁绊相关标记清空
    p.bondedToday = null;
    p.lastPetDate = '';
    p.lastPetAt = 0;
    p.petCountToday = 0;

    // 图鉴：先删掉整条链路的记录，再按当前实际拥有的形态补回
    for (var i = s.catches.length - 1; i >= 0; i--) {
      if (path.indexOf(s.catches[i].dexNo) >= 0) s.catches.splice(i, 1);
    }
    for (var j = 0; j < s.pokemon.length; j++) {
      if (path.indexOf(s.pokemon[j].dexNo) >= 0) {
        s.catches.push({
          dexNo: s.pokemon[j].dexNo,
          name: s.pokemon[j].nickname,
          at: APP.todayStr(),
          via: 'debug'
        });
      }
    }
    save();
    return {
      ok: true,
      from: from,
      to: { dexNo: p.dexNo, name: p.nickname, level: 1 },
      reverted: from.dexNo !== p.dexNo,
      msg: from.dexNo === p.dexNo
        ? from.name + ' 已重置为 Lv.1（经验清零）'
        : from.name + ' 已还原为 ' + p.nickname + ' Lv.1'
    };
  }

  function weeklyStats() {
    var days = [];
    for (var i = 6; i >= 0; i--) {
      var date = APP.dateOffset(-i);
      var pr = progressOfExisting(date);
      days.push({
        date: date,
        dow: ['日', '一', '二', '三', '四', '五', '六'][new Date(date + 'T00:00:00').getDay()],
        done: pr.done,
        total: pr.total,
        rate: pr.total ? Math.round(pr.done / pr.total * 100) : 0
      });
    }
    var s = load();
    var perTask = [];
    for (var t = 0; t < s.tasks.length; t++) {
      var tk = s.tasks[t];
      var tt = 0, doneC = 0;
      for (var d = 0; d < 7; d++) {
        var dt = APP.dateOffset(-d);
        if (tk.weekdays.indexOf(APP.weekdayOf(dt)) < 0) continue;
        tt++;
        var inst = s.instances[dt] && s.instances[dt][tk.id];
        if (inst && isDoneStatus(inst.status)) doneC++;
      }
      if (tt > 0) perTask.push({ task: tk, done: doneC, total: tt, rate: Math.round(doneC / tt * 100) });
    }

    // 按分类（任务类型）汇总近 7 天完成情况：
    // 一行 = 一个分类，新增分类自动多一行，与具体任务数量无关（任务增删不会撑长列表）
    var typeMap = {};
    for (var ti = 0; ti < APP.TYPES.length; ti++) {
      typeMap[APP.TYPES[ti]] = { type: APP.TYPES[ti], done: 0, total: 0 };
    }
    for (var t2 = 0; t2 < s.tasks.length; t2++) {
      var tk2 = s.tasks[t2];
      var key = tk2.type || '其他';
      if (!typeMap[key]) typeMap[key] = { type: key, done: 0, total: 0 }; // 兜底：未知分类也收纳
      for (var d2 = 0; d2 < 7; d2++) {
        var dt2 = APP.dateOffset(-d2);
        if (tk2.weekdays.indexOf(APP.weekdayOf(dt2)) < 0) continue;
        typeMap[key].total++;
        var ins2 = s.instances[dt2] && s.instances[dt2][tk2.id];
        if (ins2 && isDoneStatus(ins2.status)) typeMap[key].done++;
      }
    }
    var typeOrder = APP.TYPES.slice();
    var extraKeys = Object.keys(typeMap);
    for (var e = 0; e < extraKeys.length; e++) {
      if (typeOrder.indexOf(extraKeys[e]) < 0) typeOrder.push(extraKeys[e]);
    }
    var perType = [];
    for (var o = 0; o < typeOrder.length; o++) {
      var b = typeMap[typeOrder[o]];
      if (b && b.total > 0) {
        perType.push({ type: b.type, done: b.done, total: b.total, rate: Math.round(b.done / b.total * 100) });
      }
    }

    var sum = 0, cnt = 0;
    for (var k = 0; k < days.length; k++) {
      if (days[k].total > 0) { sum += days[k].rate; cnt++; }
    }
    var avg = cnt ? Math.round(sum / cnt) : 0;
    return { days: days, perTask: perTask, perType: perType, avg: avg, xpLog: s.xpLog.slice(-40).reverse() };
  }

  // 全部经验流水（最新在前）；store 侧已限制最多保留 500 条
  function xpLog() {
    var s = load();
    return s.xpLog.slice().reverse();
  }

  function isBeforeDeadline(date, deadline) {
    if (!deadline) return false;
    var parts = String(deadline).split(':');
    var limit = parseInt(parts[0], 10) * 60 + parseInt(parts[1], 10);
    var now = date.getHours() * 60 + date.getMinutes();
    return now < limit;
  }

  // 养成页对话框的信息源：训练/玩耍结算、经验、升级、进化。只留最近 40 条，随存档同步。
  // 调用方负责 save()；silent（家长后台调试）路径不写，避免调试污染展示。
  function pushCare(ev) {
    var s = load();
    if (!Array.isArray(s.careLog)) s.careLog = [];
    ev.at = Date.now();
    ev.d = APP.todayStr();
    s.careLog.unshift(ev);
    if (s.careLog.length > 40) s.careLog.length = 40;
    return ev;
  }

  // ===== 事件队列：升级 / 60 级 / 满级 / 最终形态 / 进化 =====
  // 事件写入 state.events 持久化，由 UI 层（js/events.js）在每次刷新后消费并清空。
  // 这样无论孩子打钩还是家长审核，都不会漏掉升级反馈；关掉页面再打开也能补播进化。
  function queueEvent(ev) {
    var s = load();
    if (!s.events) s.events = [];
    ev.at = Date.now();
    s.events.push(ev);
    if (s.events.length > 20) s.events.splice(0, s.events.length - 20);
    save();
  }

  function takeEvents() {
    beginWrite();
    var s = load();
    var list = (s.events || []).slice();
    s.events = [];
    save();
    return list;
  }

  // 满级所需累计经验（100 级 = 99 × 每级经验）
  function maxExpOf() {
    return (APP.LEVEL_MAX - 1) * settings().expPerLevel;
  }

  // 加经验：满级（Lv.100）后不再增加，返回实际到账经验。
  // 负数（撤销 / 驳回退回）永远放行，避免满级后无法纠错。
  // 经验只给「照顾对象」（V5 起队伍全员平等，养成页照顾谁就给谁）。
  // opts.silent = true（仅家长后台调试路径）：升级 / 60 级 / 进化 / 满级全部静默——
  // 不入事件队列、不播演出，跨过进化等级时直接连续变形到当前等级允许的形态。
  function addExp(amount, source, opts) {
    var p = activePokemon();
    if (!p) return 0;
    return addExpTo(p, amount, source, opts);
  }

  // 执行进化：把照顾对象换成新形态，记进化历史与图鉴来源。
  // 只能由升级触发（pendingEvo），不提供任何直接调用入口给捕捉模块。
  // silent = true（调试路径）：不留 pendingEvo、不弹「最终形态」提醒，
  // 连跳由调用方循环处理，保证退出后台时不会补播幽灵演出。
  function evolveTo(toDex, silent) {
    beginWrite();
    var s = load();
    var p = activePokemon();
    if (!p) return false;
    var target = APP.evo.get(toDex);
    if (!target || target.dexNo === p.dexNo) return false;

    var fromDex = p.dexNo;
    var fromName = p.nickname;
    p.dexNo = target.dexNo;
    p.nickname = target.name;
    p.stage = target.stage;
    p.pendingEvo = null;
    if (!p.flags) p.flags = { lv60: false, final: false };
    p.history = p.history || [];
    p.history.push({
      from: fromDex, fromName: fromName,
      to: target.dexNo, toName: target.name,
      date: APP.todayStr()
    });
    if (!silent) pushCare({ t: 'evo', name: target.name, fromName: fromName, dexNo: target.dexNo });
    if (!s.catches) s.catches = [];
    s.catches.push({
      dexNo: target.dexNo, name: target.name,
      at: APP.todayStr(), via: 'evolve', from: fromDex
    });

    // 连跳进化：一次跨多级（调试加大量经验时常见）时，下一阶段可能已经达标。
    if (silent) {
      // 静默：交给 addExp 的循环继续变形，这里什么都不留
    } else {
      var chain = APP.evo.levelNext(target.dexNo, p.level);
      if (chain) {
        // 正常路径：先记待播，等这段演出播完由 events 接着播下一段；此时先不提示「最终形态」
        p.pendingEvo = { toDex: chain.dexNo, toName: chain.name, at: APP.todayStr() };
      } else if (APP.evo.isFinalForm(target.dexNo) && !p.flags.final) {
        // 进化到最终形态：提醒可以换一只照顾培养（每只宝可梦一次）
        p.flags.final = true;
        queueEvent({ t: 'final', dexNo: target.dexNo, name: target.name });
      }
    }

    save();
    return true;
  }


  function settle() {
    beginWrite();
    var s = load();
    var today = APP.todayStr();
    if (s.meta.lastSettledDate === today) {
      normalizeBondDays(); // 老存档里的浮点尾巴（1.2000000000000002）在这里自愈
      ensureInstances(today);
      return;
    }

    var mk = today.slice(0, 7);
    // 跨月：重置本月累计与阶梯奖励领取记录；历史最佳（monthBest）跨月保留，记录最好成绩
    if (s.streak.monthKey !== mk) {
      s.streak.monthKey = mk;
      s.streak.monthCurrent = 0;
      s.streak.claimed = [];
    }
    // 本月累计打卡天数：直接按「自然月内打卡成功天数」重新统计，漏打卡不再整月清零
    var cnt = monthCheckinCount();
    s.streak.monthCurrent = cnt;
    if (cnt > (s.streak.monthBest || 0)) s.streak.monthBest = cnt;
    grantComboMilestones(s);

    // 7b：0 点衰减（V5.1 起只结算主力）：过一夜饱食 -20、心情 -15。
    //     体力不再统一 +25，改由乐园「劳动/休息」按天结算（见 produceRanchIdle）。
    //     非主力成员的饱食/心情冻结不衰减（劳动只看体力，这两项已无意义）。
    var careP = activePokemon();
    if (careP) {
      if (!careP.stats) careP.stats = { food: 80, mood: 80, energy: 80 };
      careP.stats.food = APP.clamp(careP.stats.food - 20, 0, 100);
      careP.stats.mood = APP.clamp(careP.stats.mood - 15, 0, 100);
      // 新的一天：昨天的「元气满满」加成失效，需当天重新把三维养到 ≥90
      careP.perfectToday = false;
      // 7f：羁绊按天结算（喂/玩/练计满 1 天；抚摸计数跨天清空）——只针对主力
      settleBond(careP);
    }

    // 乐园劳动结算（V5.1）：外出次数代币按周重算；按天逐只模拟劳动/休息与产出
    // 离线补算：距上次结算隔了几天就补算几天（封顶 5 天防刷）；首次结算/时钟回拨按 1 天算
    var missedDays = s.meta.lastSettledDate ? dayDiff(s.meta.lastSettledDate, today) : 1;
    if (!(missedDays >= 1)) missedDays = 1; // 时钟回拨等异常按 1 天兜底
    if (missedDays > 5) missedDays = 5;     // 封顶：长时间不打开也不无限累积
    recomputeOutings(s);
    produceRanchIdle(s, missedDays);

    ensureInstances(today);
    s.meta.lastSettledDate = today;
    save();
  }

  // ===== 牧场养育场（Task 8 / Phase 0）=====

  // 本周一日期，作为外出次数代币的周键
  function weekKeyOf() {
    var d = new Date();
    var day = d.getDay();                       // 0=周日 .. 6=周六
    var diff = (day === 0 ? 6 : day - 1);
    var mon = new Date(d.getFullYear(), d.getMonth(), d.getDate() - diff);
    return APP.dateStr(mon);
  }

  // V5.1 劳动消耗个体值：生成后固定；缺失时（旧档/异常）现场补一个并写回
  function vigorOf(p) {
    var v = p && p.vigor;
    if (typeof v !== 'number' || v < 5 || v > 45) {
      v = 10 + Math.floor(Math.random() * 31);
      if (p) p.vigor = v;
    }
    return v;
  }

  // 乐园劳动结算（V5.1，在 settle() 内按天数调用，本函数不 save）：
  //   每天对每只在队成员：体力 ≥50 → 劳动（体力 −vigor，个体值 10~40，越勤快消耗越小）
  //                      体力 <50 → 自动休息（体力 +50，含「睡觉恢复」）
  //   出勤率 = 50/(50+vigor)：vigor 均值 25 → 平均 2/3 时间在劳动（1/3 休息），且每只错峰。
  //   产出（当天有成员劳动时）：
  //     果实：90% 概率 +1，再独立 20% 概率额外 +1（期望 1.1 颗/天 ≈ 主力日常所需的 110%）
  //     碎片：每只劳动成员 30% 概率 +1（满编劳动日期望 ~1.5，不易刷）
  //     津贴：每天固定 +1 颗果实（主力伙食底线，不依赖劳动）
  //     伤药：每 3 个日历天 +1
  function produceRanchIdle(s, days) {
    if (!s || !s.wallet || !Array.isArray(s.pokemon)) return;
    days = days || 1;
    var berryCap = 99, potionCap = 30, shardCap = 999;
    s.wallet.berries = APP.clamp(s.wallet.berries, 0, berryCap);
    s.wallet.potions = APP.clamp(s.wallet.potions || 0, 0, potionCap);
    if (typeof s.wallet.shards !== 'number') s.wallet.shards = 0;

    var team = s.pokemon.filter(function (p) { return p && p.slot !== 'box'; });
    for (var d = 0; d < days; d++) {
      var labored = 0;
      for (var i = 0; i < team.length; i++) {
        var p = team[i];
        if (!p.stats) p.stats = { food: 80, mood: 80, energy: 80 };
        if (p.stats.energy >= 50) {
          p.stats.energy = APP.clamp(p.stats.energy - vigorOf(p), 0, 100);
          labored++;
          if (Math.random() < 0.30) s.wallet.shards = APP.clamp(s.wallet.shards + 1, 0, shardCap);
        } else {
          p.stats.energy = APP.clamp(p.stats.energy + 50, 0, 100);
        }
      }
      // 每日津贴：保底 +1（防饿死）
      s.wallet.berries = APP.clamp(s.wallet.berries + 1, 0, berryCap);
      // 劳动产出：当天有人在干活才掷骰（方案 A：双掷骰，日均 ≈1.1 颗）
      if (labored > 0) {
        if (Math.random() < 0.9) s.wallet.berries = APP.clamp(s.wallet.berries + 1, 0, berryCap);
        if (Math.random() < 0.2) s.wallet.berries = APP.clamp(s.wallet.berries + 1, 0, berryCap);
      }
    }
    // 伤药：每 3 个日历天 +1（离线多天一次性补）
    s.wallet.potions = APP.clamp((s.wallet.potions || 0) + Math.floor(days / 3), 0, potionCap);
  }

  // 外出次数代币（战斗/训练共用）：每周初 4 次、每 2 天 +1、周日额外 +1、上限 10（捕获走周末门禁不占代币）
  function recomputeOutings(s) {
    if (!s.outings) s.outings = { weekKey: '', left: 4, accrued2: 0, sundayGiven: false };
    var wd = APP.weekdayOf(APP.todayStr());     // 1=周一 .. 7=周日
    var wk = weekKeyOf();
    if (s.outings.weekKey !== wk) {
      s.outings.weekKey = wk;
      s.outings.left = 4;
      s.outings.accrued2 = 0;
      s.outings.sundayGiven = false;
    }
    var due = Math.floor((wd - 1) / 2);          // 周三/周五/周日 各 +1
    if (due > s.outings.accrued2) {
      s.outings.left += (due - s.outings.accrued2);
      s.outings.accrued2 = due;
    }
    if (wd === 7 && !s.outings.sundayGiven) {     // 周日额外 +1
      s.outings.left += 1;
      s.outings.sundayGiven = true;
    }
    s.outings.left = Math.min(s.outings.left, 10);
  }

  // 对外：读取剩余外出次数（先按周重算）
  function getOutings() {
    beginWrite();
    var s = load();
    recomputeOutings(s);
    save();
    return s.outings.left;
  }

  // 对外：消耗 1 次外出次数（战斗/训练入口调用），成功返回 true
  function consumeOuting() {
    beginWrite();
    var s = load();
    recomputeOutings(s);
    if (s.outings.left > 0) {
      s.outings.left -= 1;
      save();
      return true;
    }
    save();
    return false;
  }

  // ===== V5：碎片 / 券 经济（脱钩日程经验）=====
  // 碎片是全场景通用货币：日程(每条必得)/乐园(挂机高概率)/养成(元气满满必得+锻炼翻牌中概率)产出，
  // 在「兑换中心」换成精灵球(7:1)/战斗券(5:1)，券 + 频率门禁共同控制捕捉/战斗的入场。

  // 两日期相差天数（基于本地零点，忽略时区偏移）
  function dayDiff(a, b) {
    var da = new Date(a + 'T00:00:00'), db = new Date(b + 'T00:00:00');
    return Math.round((db - da) / 86400000);
  }

  // 加碎片：负数（撤销/驳回）永远放行；返回实际到账数。写入 shardLog 流水。
  function addShards(amount, source) {
    var s = load();
    if (!s.wallet) s.wallet = {};
    if (typeof s.wallet.shards !== 'number') s.wallet.shards = 0;
    var before = s.wallet.shards;
    s.wallet.shards = Math.max(0, s.wallet.shards + amount);
    var gained = s.wallet.shards - before;
    if (amount !== 0) {
      if (!Array.isArray(s.shardLog)) s.shardLog = [];
      s.shardLog.push({ date: APP.todayStr(), time: APP.nowHM(), source: source || '', amount: amount });
      if (s.shardLog.length > 500) s.shardLog.splice(0, s.shardLog.length - 500);
    }
    save();
    return gained;
  }

  // 战斗记录：写入一条，且只保留最近 5 天（上限 300 条兜底）
  function addBattleRecord(rec) {
    var s = load();
    if (!Array.isArray(s.battleLog)) s.battleLog = [];
    rec = rec || {};
    s.battleLog.unshift({
      ts: Date.now(),
      foeName: rec.foeName || '',
      foeLv: rec.foeLv || 1,
      dexNo: rec.dexNo || 0,
      result: rec.result === 'win' || rec.result === 'lose' ? rec.result : 'run',
      shards: rec.shards || 0,
      exp: rec.exp || 0
    });
    if (s.battleLog.length > 300) s.battleLog.length = 300;
    var cutoff = Date.now() - 5 * 86400000;
    s.battleLog = s.battleLog.filter(function (r) { return r && typeof r.ts === 'number' && r.ts >= cutoff; });
    save();
  }

  // 兑换：碎片 → 精灵球 / 战斗券。kind ∈ {capture, battle}；qty 为兑换数量。
  function exchangeShards(kind, qty) {
    beginWrite();
    var s = load();
    if (kind !== 'capture' && kind !== 'battle') return { ok: false, msg: '未知的券类型' };
    qty = parseInt(qty, 10);
    if (!qty || qty <= 0) return { ok: false, msg: '兑换数量需大于 0' };
    var rate = (settings().exchangeRate && settings().exchangeRate[kind]) || (kind === 'battle' ? 5 : 7);
    var cost = rate * qty;
    if (!s.wallet) s.wallet = {};
    if ((s.wallet.shards || 0) < cost) return { ok: false, msg: '碎片不够（需 ' + cost + '）' };
    s.wallet.shards -= cost;
    if (!s.wallet.tickets) s.wallet.tickets = { capture: 0, battle: 0 };
    s.wallet.tickets[kind] = (s.wallet.tickets[kind] || 0) + qty;
    save();
    return {
      ok: true,
      msg: kind === 'capture' ? '已兑换 ' + qty + ' 个精灵球' : '已兑换 ' + qty + ' 张战斗券',
      shards: s.wallet.shards,
      tickets: s.wallet.tickets
    };
  }

  // 入场门禁：捕捉/战斗各自独立计次。
  // 非节假日：每 normalGapDays 天 1 次（按 lastDate 冷却）；
  // 节假日：每天最多 holidayPerDay 次（按 countToday 计）。
  // 返回 { ok, reason?, left?, waitDays? }
  function canPlay(kind) {
    beginWrite();
    var s = load();
    var cap = s.playCaps && s.playCaps[kind];
    if (!cap) return { ok: false, reason: 'noCap' };
    var today = APP.todayStr();
    if (cap.dayKey !== today) { cap.dayKey = today; cap.countToday = 0; }
    var g = settings().playGate || { normalGapDays: 2, holidayPerDay: 3 };
    if (APP.isHoliday(today)) {
      var left = g.holidayPerDay - cap.countToday;
      if (left <= 0) return { ok: false, reason: 'holidayLimit', left: 0 };
      return { ok: true, left: left };
    }
    if (cap.lastDate) {
      var gap = dayDiff(cap.lastDate, today);
      if (gap < g.normalGapDays) {
        return { ok: false, reason: 'cooldown', waitDays: g.normalGapDays - gap };
      }
    }
    return { ok: true };
  }

  // 消耗 1 次入场额度（捕捉/战斗入口调用），成功返回 true；同时写 lastDate。
  function consumePlayCap(kind) {
    beginWrite();
    var s = load();
    var cap = s.playCaps && s.playCaps[kind];
    if (!cap) return false;
    var today = APP.todayStr();
    if (cap.dayKey !== today) { cap.dayKey = today; cap.countToday = 0; }
    cap.countToday += 1;
    cap.lastDate = today;
    save();
    return true;
  }

  // B3 捕捉 / B4 战斗入口：一次原子操作扣 1 个精灵球（或 1 张战斗券）+ 1 次入场额度。
  // 门禁不通过时一个都不扣，避免「券扣了却没进场」的半状态。
  function spendTicket(kind) {
    var t = kind === 'battle' ? 'battle' : 'capture';
    var gate = canPlay(t);
    if (!gate.ok) {
      var msg = gate.reason === 'cooldown' ? '还要等 ' + gate.waitDays + ' 天才能再出门'
        : gate.reason === 'holidayLimit' ? '今天的入场次数用完啦'
        : '暂时不能出门';
      return { ok: false, msg: msg };
    }
    beginWrite();
    var s = load();
    if (!s.wallet) s.wallet = {};
    if (!s.wallet.tickets) s.wallet.tickets = { capture: 0, battle: 0 };
    if ((s.wallet.tickets[t] || 0) < 1) {
      return { ok: false, msg: (t === 'battle' ? '战斗券' : '精灵球') + '不够，先去兑换中心' };
    }
    s.wallet.tickets[t] -= 1;
    consumePlayCap(t); // 内部会 save()，券与次数一并落盘
    return { ok: true, tickets: s.wallet.tickets[t], left: gate.left };
  }

  // ===== 道馆挑战（v57 定稿 v2）=====
  // 与捕捉/战斗门禁完全隔离：独立每周 3 次、不消耗战斗券、失败 2 天冷却。
  function gymRules() {
    return (APP.gymData && APP.gymData.RULES) ||
      { weekLimit: 3, cooldownDays: 2, starYuan: 10, maxYuan: 100 };
  }

  // 读/规范化道馆状态；周键变化时自动重置本周已用次数。
  function gymState() {
    beginWrite();
    var s = load();
    if (!s.gym || typeof s.gym !== 'object') {
      s.gym = { weekKey: '', used: 0, badges: [], masterCleared: [], cooldown: {}, lastDate: {} };
    }
    var g = s.gym;
    if (!Array.isArray(g.badges)) g.badges = [];
    if (!Array.isArray(g.masterCleared)) g.masterCleared = [];
    if (!g.cooldown || typeof g.cooldown !== 'object') g.cooldown = {};
    if (!g.lastDate || typeof g.lastDate !== 'object') g.lastDate = {};
    if (typeof g.used !== 'number') g.used = 0;
    var wk = weekKeyOf();
    if (g.weekKey !== wk) { g.weekKey = wk; g.used = 0; }
    save();
    return g;
  }

  // 入场校验。返回 { ok, left, cleared?, reason?, waitDays?, nextDate? }
  // · 每周总量 3 次；· 失败冷却 2 天；· 大师重战需已首通该馆；
  // · v59 A2：今日必须是该馆开放日（前 4 常开 / 后 4 每周轮转 2 馆 / 周末全开）；
  // · v59 B1：「当天 1 次」只约束未通关馆的首通挑战，已通关馆重打与大师重战不再限当天；
  // · 解锁等级由页面按 gymData.GYMS 判定。
  function canGym(gymId, master) {
    var R = gymRules(), g = gymState(), today = APP.todayStr();
    var left = Math.max(0, R.weekLimit - g.used);
    if (left <= 0) return { ok: false, reason: 'weekLimit', left: 0 };
    var cd = g.cooldown[gymId];
    if (cd) {
      var gap = dayDiff(cd, today);
      if (gap < R.cooldownDays) {
        return { ok: false, reason: 'cooldown', waitDays: R.cooldownDays - gap, left: left };
      }
    }
    var cleared = g.badges.indexOf(gymId) >= 0;
    if (master && !cleared) return { ok: false, reason: 'needClear', left: left };
    var GD = APP.gymData;
    if (GD && GD.isGymOpen && !GD.isGymOpen(gymId, today)) {
      return {
        ok: false, reason: 'closed', left: left,
        nextDate: GD.nextOpenDate ? GD.nextOpenDate(gymId, today) : ''
      };
    }
    if (!cleared && g.lastDate[gymId] === today) {
      return { ok: false, reason: 'todayUsed', left: left };
    }
    return { ok: true, left: left, cleared: cleared };
  }

  function consumeGym(gymId) {
    var g = gymState();
    g.used += 1;
    g.lastDate[gymId] = APP.todayStr();
    save();
    return g.used;
  }

  function addWishStars(n, source) {
    var s = load();
    if (!s.wallet) s.wallet = {};
    if (typeof s.wallet.wishStars !== 'number') s.wallet.wishStars = 0;
    s.wallet.wishStars = Math.max(0, s.wallet.wishStars + n);
    if (n !== 0 && Array.isArray(s.shardLog)) {
      s.shardLog.push({ date: APP.todayStr(), time: APP.nowHM(),
        source: source || '道馆奖励', amount: 0, stars: n });
      if (s.shardLog.length > 500) s.shardLog.splice(0, s.shardLog.length - 500);
    }
    save();
    return s.wallet.wishStars;
  }

  // 三连战结束统一结算：经验/碎片逐场累计；心愿星与徽章严格只发一次；失败写 2 天冷却。
  // v61 防刷：reward 先看徽章册 / 大师通关册，已拿过就不会再发星（普通重打不刷星）。
  // v61 大师首通：解锁 ×2 通关且该馆大师未通关过 → 额外给 2 倍心愿星，写入 masterCleared。
  function gymFinish(gymId, master, passed, grade, win) {
    var g = gymState();
    if (!APP.gymData) return null;
    var gd = APP.gymData.get(gymId);
    var cleared = g.badges.indexOf(gymId) >= 0;
    var masterDone = g.masterCleared.indexOf(gymId) >= 0;
    var r = APP.gymData.reward(gd, passed, grade, master, win, cleared, masterDone);
    try { addExp(r.exp, '道馆·' + gd.n + (win ? '全通' : '挑战')); } catch (e) {}
    try { addShards(r.shards, '道馆·' + gd.n); } catch (e) {}
    if (r.stars) addWishStars(r.stars, '道馆·' + gd.n + (r.masterFirst ? '大师首通' : '首通'));
    // 发星与登记用同一份判定，且再查一次重，杜绝并发 / 重复调用刷星
    if (r.first && r.badge && g.badges.indexOf(r.badge) < 0) g.badges.push(r.badge);
    if (r.masterFirst && g.masterCleared.indexOf(gymId) < 0) g.masterCleared.push(gymId);
    if (!win) g.cooldown[gymId] = APP.todayStr();
    else delete g.cooldown[gymId];
    save();
    return r;
  }

  // v61：查询某馆大师是否已首通（页面用来显示「已领 2 倍星」状态）
  function gymMasterDone(gymId) {
    return gymState().masterCleared.indexOf(gymId) >= 0;
  }

  // ===== 心愿礼物：1⭐ = 10 元，单笔 ≤100 元，家长确认后生效 =====
  function wishOrders() {
    var s = load();
    return Array.isArray(s.wishOrders) ? s.wishOrders : [];
  }
  function submitWish(yuan, note) {
    beginWrite();
    var R = gymRules(), s = load();
    yuan = parseInt(yuan, 10);
    if (!yuan || yuan <= 0 || yuan > R.maxYuan || yuan % R.starYuan !== 0) {
      return { ok: false, msg: '金额需为 ' + R.starYuan + ' 的倍数，且不超过 ' + R.maxYuan + ' 元' };
    }
    var need = yuan / R.starYuan;
    if (!s.wallet) s.wallet = {};
    if ((s.wallet.wishStars || 0) < need) {
      return { ok: false, msg: '心愿星不够（需 ' + need + ' ⭐）' };
    }
    if (!Array.isArray(s.wishOrders)) s.wishOrders = [];
    for (var i = 0; i < s.wishOrders.length; i++) {
      if (s.wishOrders[i].status === 'pending') {
        return { ok: false, msg: '已有一单待家长确认，等这单完成再提交' };
      }
    }
    s.wallet.wishStars -= need;
    s.wishOrders.unshift({
      id: 'w' + Date.now(), date: APP.todayStr(), yuan: yuan, stars: need,
      note: String(note || '').slice(0, 60), status: 'pending'
    });
    save();
    return { ok: true, msg: '已提交心愿礼物（' + yuan + ' 元 / ' + need + '⭐），等家长确认' };
  }
  function finishWish(id, ok) {
    beginWrite();
    var s = load();
    if (!Array.isArray(s.wishOrders)) return { ok: false, msg: '没有这单' };
    var order = null;
    for (var i = 0; i < s.wishOrders.length; i++) {
      if (s.wishOrders[i].id === id && s.wishOrders[i].status === 'pending') { order = s.wishOrders[i]; break; }
    }
    if (!order) return { ok: false, msg: '没有这单' };
    order.status = ok ? 'done' : 'rejected';
    order.doneDate = APP.todayStr();
    if (!ok) {   // 驳回退星
      if (!s.wallet) s.wallet = {};
      s.wallet.wishStars = (s.wallet.wishStars || 0) + order.stars;
    }
    save();
    return { ok: true, msg: ok ? '已确认兑换' : '已退回，' + order.stars + '⭐ 已返还' };
  }

  // 野外遇到就写进 seen：图鉴「已遇到」三态的数据来源（B4 战斗也会调用）
  function markSeen(dex) {
    beginWrite();
    var s = load();
    if (!Array.isArray(s.seen)) s.seen = [];
    var no = APP.pad3(dex);
    if (s.seen.indexOf(no) >= 0) return false;
    s.seen.push(no);
    save();
    return true;
  }

  // ===== 队伍与仓库（Task 8 / Phase 1；V5 平等化改版）=====
  // 队伍最多 5 只、全员平等（无主力/随从之分）；其余进仓库（slot:'box'）。
  // 照顾对象（careTargetId）只是「养成页当前照顾谁」，不带来任何特权。
  var TEAM_MAX = 5;

  function findPokemonById(id) {
    var list = load().pokemon || [];
    for (var i = 0; i < list.length; i++) {
      if (list[i] && list[i].id === id) return list[i];
    }
    return null;
  }

  // 分桶：队伍 / 仓库（兼容旧档 active/ranch，一律视为队伍）
  function partyOf(s) {
    var list = (s && s.pokemon) || [];
    var team = [], box = [];
    for (var i = 0; i < list.length; i++) {
      var p = list[i];
      if (!p) continue;
      if (p.slot === 'box') box.push(p);
      else team.push(p);
    }
    return { team: team, box: box };
  }

  // 超编自愈：队伍超过 5 只 → 多出来的进仓库；照顾对象失效时自动落到队里第一只
  function normalizeParty(s) {
    var changed = false;
    var g = partyOf(s);
    while (g.team.length > TEAM_MAX) {
      g.team.pop().slot = 'box';
      changed = true;
    }
    var ids = {};
    for (var i = 0; i < g.team.length; i++) ids[g.team[i].id] = true;
    if (s.careTargetId && !ids[s.careTargetId]) { s.careTargetId = ''; changed = true; }
    if (!s.careTargetId && g.team.length) { s.careTargetId = g.team[0].id; changed = true; }
    return changed;
  }

  function listParty() {
    var s = load();
    var g = partyOf(s);
    var team = g.team.slice();
    if (s.careTargetId) {
      team.sort(function (a, b) {
        return ((b.id === s.careTargetId) ? 1 : 0) - ((a.id === s.careTargetId) ? 1 : 0);
      });
    }
    return team;
  }
  function listBox() { return partyOf(load()).box.slice(); }

  // 道馆解锁门槛：全部宝可梦（队伍 + 仓库）里的最高等级。
  // 不用主力等级，避免换一次照顾对象就把已经解锁的道馆重新锁回去。
  function maxPokemonLevel() {
    var list = (load().pokemon) || [], mx = 0;
    for (var i = 0; i < list.length; i++) {
      var p = list[i];
      if (p && typeof p.level === 'number' && p.level > mx) mx = p.level;
    }
    return Math.max(1, mx);
  }

  // 设为照顾对象：必须是队伍成员（仓库里的先用「加入队伍」）
  function setCareTarget(id) {
    beginWrite();
    var s = load();
    var target = findPokemonById(id);
    if (!target) return { ok: false, msg: '找不到这只宝可梦' };
    if (target.slot === 'box') return { ok: false, msg: target.nickname + ' 还在仓库里，先加入队伍吧' };
    if (s.careTargetId === target.id) return { ok: false, msg: target.nickname + ' 已经是主力了' };
    s.careTargetId = target.id;
    save();
    return { ok: true, msg: target.nickname + ' 成为新的主力宝可梦啦', pokemon: target };
  }

  // 队伍 → 仓库
  function sendToBox(id) {
    beginWrite();
    var s = load();
    var p = findPokemonById(id);
    if (!p) return { ok: false, msg: '找不到这只宝可梦' };
    if (p.slot === 'box') return { ok: false, msg: p.nickname + ' 已经在仓库了' };
    p.slot = 'box';
    if (s.careTargetId === id) { s.careTargetId = ''; normalizeParty(s); }
    save();
    return { ok: true, msg: p.nickname + ' 回仓库休息啦', pokemon: p };
  }

  // 批量设置队伍：ids 最多 5 只（至少 1 只），其余全部回仓库
  function setTeam(ids) {
    beginWrite();
    var s = load();
    if (!Array.isArray(ids)) ids = [];
    if (!ids.length) return { ok: false, msg: '至少要留一只宝可梦在队伍里' };
    if (ids.length > TEAM_MAX) ids = ids.slice(0, TEAM_MAX);
    var set = {};
    for (var i = 0; i < ids.length; i++) set[ids[i]] = true;
    for (var k = 0; k < s.pokemon.length; k++) {
      var p = s.pokemon[k];
      if (set[p.id]) {
        p.slot = 'team';
        if (!p.stats) p.stats = { food: 80, mood: 80, energy: 80 };
      } else {
        p.slot = 'box';
      }
    }
    normalizeParty(s);
    save();
    return { ok: true, msg: '队伍已更新（' + ids.length + ' 只）' };
  }

  // 仓库 → 队伍（队伍满 5 只时提示先移出一只）
  function addToParty(id) {
    beginWrite();
    var s = load();
    var p = findPokemonById(id);
    if (!p) return { ok: false, msg: '找不到这只宝可梦' };
    if (p.slot !== 'box') return { ok: false, msg: p.nickname + ' 已经在队伍里了' };
    if (partyOf(s).team.length >= TEAM_MAX) {
      return { ok: false, msg: '队伍已经满 5 只啦，先把一只送回仓库' };
    }
    p.slot = 'team';
    if (!p.stats) p.stats = { food: 80, mood: 80, energy: 80 };
    if (!s.careTargetId) s.careTargetId = p.id;
    save();
    return { ok: true, msg: p.nickname + ' 加入队伍啦', pokemon: p };
  }

  // 仓库某只 与 队伍某只 对调（队伍满员时用它换人）
  function swapParty(boxId, teamId) {
    beginWrite();
    var s = load();
    var a = findPokemonById(boxId), b = findPokemonById(teamId);
    if (!a || !b) return { ok: false, msg: '找不到这只宝可梦' };
    if (a.slot !== 'box') return { ok: false, msg: '请先在仓库里选一只' };
    if (b.slot === 'box') return { ok: false, msg: '请先在队伍里选一只' };
    a.slot = 'team';
    b.slot = 'box';
    if (!a.stats) a.stats = { food: 80, mood: 80, energy: 80 };
    if (s.careTargetId === b.id) s.careTargetId = a.id;
    save();
    return { ok: true, msg: a.nickname + ' 换进队伍，' + b.nickname + ' 回到仓库', pokemon: a };
  }

  // ===== V5.1 清理：乐园劳动只消耗体力，喂随从/一键喂养/自动喂养已无意义，整体移除 =====

  // 给指定宝可梦加经验（训练/战斗复用；取代 addExp 只给主力的限制）。行为与原 addExp 完全一致。
  function addExpTo(p, amount, source, opts) {
    if (!p) return 0;
    var silent = !!(opts && opts.silent);
    var s = load();
    // 7b 规则：饱食度<30 → 当天经验减半（仅真实得失；家长后台调试加经验不受影响）
    if (!silent && p.stats && p.stats.food < 30 && amount > 0) amount = Math.floor(amount / 2);
    // 7b 规则：元气满满（三维均≥90）→ 当天经验 +10%
    if (p.perfectToday && amount > 0) amount = Math.round(amount * 1.1);
    var need = settings().expPerLevel;
    var cap = (APP.LEVEL_MAX - 1) * need;
    var today = APP.todayStr();

    if (amount > 0 && p.exp >= cap) {
      if (!silent && p.maxedNotifiedDate !== today) {
        p.maxedNotifiedDate = today;
        queueEvent({ t: 'maxed', dexNo: p.dexNo, nickname: p.nickname, level: p.level });
      }
      save();
      return 0;
    }

    var beforeExp = p.exp;
    var beforeLv = p.level;
    p.exp = APP.clamp(p.exp + amount, 0, cap);
    p.level = Math.min(APP.LEVEL_MAX, Math.floor(p.exp / need) + 1);
    var gained = p.exp - beforeExp;
    if (!silent && gained !== 0) pushCare({ t: 'exp', exp: gained, source: source || '' });

    s.xpLog.push({ date: today, time: APP.nowHM(), source: source, amount: amount });
    if (s.xpLog.length > 500) s.xpLog.splice(0, s.xpLog.length - 500);

    if (p.level > beforeLv) {
      if (!silent) {
        queueEvent({ t: 'levelup', from: beforeLv, to: p.level });
        pushCare({ t: 'level', from: beforeLv, level: p.level });
      }

      // 60 级：提醒可以换一只主力培养（每只宝可梦一次）
      if (beforeLv < APP.EVO_NOTICE_LEVEL && p.level >= APP.EVO_NOTICE_LEVEL && !p.flags.lv60) {
        p.flags.lv60 = true;
        if (!silent) queueEvent({ t: 'lv60', level: p.level, nickname: p.nickname });
      }

      // 等级型进化
      var nx = APP.evo.levelNext(p.dexNo, p.level);
      if (nx && !p.pendingEvo) {
        if (silent) {
          var guard = 0;
          while (guard++ < 10) {
            var step = APP.evo.levelNext(p.dexNo, p.level);
            if (!step) break;
            evolveTo(step.dexNo, true);
          }
        } else {
          p.pendingEvo = { toDex: nx.dexNo, toName: nx.name, at: today };
          queueEvent({
            t: 'evolve',
            fromDex: p.dexNo, fromName: p.nickname,
            toDex: nx.dexNo, toName: nx.name
          });
        }
      }

      if (!silent && p.level >= APP.LEVEL_MAX && p.maxedNotifiedDate !== today) {
        p.maxedNotifiedDate = today;
        queueEvent({ t: 'maxed', dexNo: p.dexNo, nickname: p.nickname, level: p.level, justNow: true });
      }
    }

    save();
    return gained;
  }

  // 7b：判断并标记「元气满满」（饱食/心情/体力均≥90）。
  // 当天首次达成时给 bond.perfectDays +1（同一天重复达成不重复计数），
  // 并置 perfectToday=true 让当天经验享 +10%。返回是否处于元气满满。
  function checkPerfect(p) {
    if (!p || !p.stats) return false;
    var today = APP.todayStr();
    if (p.stats.food >= 90 && p.stats.mood >= 90 && p.stats.energy >= 90) {
      p.perfectToday = true;
      if (p.lastPerfectDate !== today) {
        p.lastPerfectDate = today;
        if (!p.bond) p.bond = { stars: 0, daysCared: 0, wins: 0, perfectDays: 0 };
        p.bond.perfectDays = (p.bond.perfectDays || 0) + 1;
        addShards(5, '元气满满');   // V5：元气满满当天首次达成必得 +5 碎片
      }
      save();
      return true;
    }
    return false;
  }

  // ===== 7f：羁绊（培养感情）=====
  // 星级公式（V4 完整版第二阶段，一次写全）：
  // ★(7/3/-) ★★(14/7/3) ★★★(21/14/6) ★★★★(28/20/12) ★★★★★(30/30/20)
  // 战斗未完成时 wins 恒为 0，最高卡 ★★；对战开放后 wins 累计自然解锁后续星级。
  var BOND_TABLE = [
    { stars: 1, daysCared: 7, perfectDays: 3, wins: 0 },
    { stars: 2, daysCared: 14, perfectDays: 7, wins: 3 },
    { stars: 3, daysCared: 21, perfectDays: 14, wins: 6 },
    { stars: 4, daysCared: 28, perfectDays: 20, wins: 12 },
    { stars: 5, daysCared: 30, perfectDays: 30, wins: 20 }
  ];

  // 计算星级：从高到低找第一个三项全达标的
  function calcStars(p) {
    if (!p || !p.bond) return 0;
    var dc = p.bond.daysCared || 0;
    var pd = p.bond.perfectDays || 0;
    var w = p.bond.wins || 0;
    for (var i = BOND_TABLE.length - 1; i >= 0; i--) {
      var t = BOND_TABLE[i];
      if (dc >= t.daysCared && pd >= t.perfectDays && w >= t.wins) return t.stars;
    }
    return 0;
  }

  // 羁绊总进度（三个维度归一化后的均值，%），供卡片进度条使用
  function bondProgress(p) {
    if (!p || !p.bond) return { percent: 0, daysCared: 0, perfectDays: 0, wins: 0, stars: 0 };
    var dc = Math.min(30, p.bond.daysCared || 0);
    var pd = Math.min(30, p.bond.perfectDays || 0);
    var w = Math.min(20, p.bond.wins || 0);
    var percent = Math.round((dc / 30 + pd / 30 + w / 20) / 3 * 100);
    return { percent: percent, daysCared: p.bond.daysCared || 0, perfectDays: p.bond.perfectDays || 0, wins: p.bond.wins || 0, stars: calcStars(p) };
  }

  // 喂/玩/练标记当天已计满 1 天（重复操作不重复计）
  function markBonded(source) {
    var p = activePokemon();
    if (!p) return;
    if (!p.bond) p.bond = { stars: 0, daysCared: 0, wins: 0, perfectDays: 0 };
    p.bondedToday = source;
    save();
  }

  // 跨天结算：bondedToday 存在 → daysCared +1 并清空标记；抚摸计数跨天清空
  function settleBond(p) {
    if (!p) return;
    if (!Array.isArray(p.history)) p.history = [];
    if (!p.bond) p.bond = { stars: 0, daysCared: 0, wins: 0, perfectDays: 0 };
    if (p.bondedToday) {
      p.bond.daysCared = (p.bond.daysCared || 0) + 1;
      p.bondedToday = null;
    }
    // 归一化到 1 位小数：清掉老存档里 0.1 累加留下的 1.2000000000000002 这类浮点尾巴
    p.bond.daysCared = round1(p.bond.daysCared || 0);
    // 跨天：抚摸计数清零（lastPetDate 与今天不同即视为新一天）
    var today = APP.todayStr();
    if (p.lastPetDate !== today) {
      p.lastPetDate = '';
      p.lastPetAt = 0;
      p.petCountToday = 0;
    }
  }

  // 羁绊天数一律只保留 1 位小数：0.1 累加会产生 1.2000000000000002 这类浮点误差
  function round1(n) { return Math.round(n * 10) / 10; }

  // 全量归一：把所有宝可梦的 daysCared 收回到 1 位小数（老存档自愈，不需要手动改数据）
  function normalizeBondDays() {
    var s = load();
    var list = s.pokemon || [];
    var changed = false;
    for (var i = 0; i < list.length; i++) {
      var b = list[i] && list[i].bond;
      if (!b) continue;
      var v = round1(b.daysCared || 0);
      if (v !== b.daysCared) { b.daysCared = v; changed = true; }
    }
    if (changed) save();
  }

  // 抚摸计入羁绊：每次 +0.1 天，每日最多 5 次（合计最多 +0.5 天），
  // 间隔 ≥5 分钟才再计一次；当天已通过喂/玩/练计满 1 天时不叠加（1 天封顶）。
  // 返回 { ok, msg, daysCared }。
  function petBond() {
    beginWrite();
    var p = activePokemon();
    if (!p) return { ok: false, msg: '没有主力宝可梦' };
    if (!p.bond) p.bond = { stars: 0, daysCared: 0, wins: 0, perfectDays: 0 };
    if (!Array.isArray(p.history)) p.history = [];
    var today = APP.todayStr();
    var now = Date.now();
    var petCount = p.petCountToday || 0;
    var lastAt = p.lastPetAt || 0;

    if (p.lastPetDate !== today) {
      // 新的一天：重置抚摸计数（settle 也兜底做，这里双保险）
      petCount = 0;
      p.lastPetDate = today;
      p.lastPetAt = 0;
      p.petCountToday = 0;
    }

    if (petCount >= 5) return { ok: false, msg: '今天抚摸计满 5 次啦，明天再来～' };
    if (now - lastAt < 5 * 60 * 1000) {
      var left = Math.ceil((5 * 60 * 1000 - (now - lastAt)) / 60000);
      return { ok: false, msg: '抚摸太快啦，约 ' + left + ' 分钟后再摸摸它～' };
    }
    if (p.bondedToday) return { ok: true, counted: false, msg: '今天已经陪过我啦，不过还是喜欢被摸摸~' };

    p.petCountToday = petCount + 1;
    p.lastPetAt = now;
    // +0.1 天：小数保留，settle 结算时并入 daysCared（顺手归一到 1 位小数）
    p.bond.daysCared = round1((p.bond.daysCared || 0) + 0.1);
    save();
    return { ok: true, msg: '+0.1 天羁绊', daysCared: p.bond.daysCared };
  }

  // 家长后台调试：直接修改主力的羁绊三项数据并刷新星级
  function debugSetBond(days, perfect, wins) {
    beginWrite();
    var p = activePokemon();
    if (!p) return { ok: false, msg: '当前没有主力宝可梦' };
    var d = parseInt(days, 10);
    var pd = parseInt(perfect, 10);
    var w = parseInt(wins, 10);
    if (isNaN(d) || d < 0 || d > 999) return { ok: false, msg: '照顾天数需为 0-999 的整数' };
    if (isNaN(pd) || pd < 0 || pd > 999) return { ok: false, msg: '元气满满天数需为 0-999 的整数' };
    if (isNaN(w) || w < 0 || w > 999) return { ok: false, msg: '对战胜场需为 0-999 的整数' };
    if (!p.bond) p.bond = { stars: 0, daysCared: 0, wins: 0, perfectDays: 0 };
    p.bond.daysCared = d;
    p.bond.perfectDays = pd;
    p.bond.wins = w;
    var stars = calcStars(p);
    p.bond.stars = stars;
    save();
    return { ok: true, msg: '已保存：' + d + ' 天 / ' + pd + ' 元气 / ' + w + ' 胜 → ' + stars + ' 星', stars: stars };
  }

  // 家长后台调试：直接设置捕捉/战斗/训练三种次数（精灵球、战斗券、外出次数）
  // 调试用：直接设置捕捉/战斗的道具与剩余次数。
  // 概念区分（catch.js / battle.js 的口径）：
  //   道具 = wallet.tickets.capture（精灵球）/ .battle（战斗券），入场各扣 1 个；
  //   剩余次数 = 入场门禁 canPlay().left —— 节假日 = holidayPerDay - countToday，工作日无次数限制（只有冷却）；
  //   冷却 = playCaps[kind].lastDate，工作日玩过后需隔 normalGapDays 天，到期自动解除。
  // 设「剩余次数」= 把 countToday 反推为 holidayPerDay - 目标值（可为负 = 调试加量，不受每日上限约束）；
  // 同时清 lastDate 解除冷却。次日 dayKey 变化 → countToday 自动清零，恢复正常规则（「调试次数次日刷新」）。
  // 剩余次数传 '' / null = 该项不修改（playCaps 原样保留，冷却也不动）——避免「打开卡就被回填值覆盖」。
  function debugSetCounts(balls, battleTickets, outings, catchLeft, battleLeft) {
    beginWrite();
    var s = load();
    var c = parseInt(balls, 10);
    var b = parseInt(battleTickets, 10);
    var o = parseInt(outings, 10);
    var clRaw = (catchLeft === undefined || catchLeft === null) ? '' : String(catchLeft).trim();
    var blRaw = (battleLeft === undefined || battleLeft === null) ? '' : String(battleLeft).trim();
    var cl = clRaw === '' ? -1 : parseInt(clRaw, 10);
    var bl = blRaw === '' ? -1 : parseInt(blRaw, 10);
    if (isNaN(c) || c < 0 || c > 999) return { ok: false, msg: '精灵球需为 0-999 的整数' };
    if (isNaN(b) || b < 0 || b > 999) return { ok: false, msg: '战斗券需为 0-999 的整数' };
    if (isNaN(o) || o < 0 || o > 10) return { ok: false, msg: '训练次数（外出次数）需为 0-10 的整数（系统每周自动重算，上限 10）' };
    if (clRaw !== '' && (isNaN(cl) || cl < 0 || cl > 999)) return { ok: false, msg: '捕捉剩余次数需为 0-999 的整数（或留空不修改）' };
    if (blRaw !== '' && (isNaN(bl) || bl < 0 || bl > 999)) return { ok: false, msg: '战斗剩余次数需为 0-999 的整数（或留空不修改）' };
    if (!s.wallet || typeof s.wallet !== 'object') s.wallet = { balls: 0, berries: 3, potions: 0, shards: 0, tickets: { capture: 0, battle: 0 } };
    if (!s.wallet.tickets || typeof s.wallet.tickets !== 'object') s.wallet.tickets = { capture: 0, battle: 0 };
    s.wallet.tickets.capture = c; // 精灵球（捕捉道具）
    s.wallet.tickets.battle = b;  // 战斗券（战斗道具）
    if (!s.outings || typeof s.outings !== 'object') s.outings = { weekKey: '', left: 4, accrued2: 0, sundayGiven: false };
    // 对齐本周累积标记，避免 getOutings() 重算时把设置值再往上叠
    var wdNow = APP.weekdayOf(APP.todayStr());
    s.outings.weekKey = weekKeyOf();
    s.outings.accrued2 = Math.floor((wdNow - 1) / 2);
    if (wdNow === 7) s.outings.sundayGiven = true;
    s.outings.left = o;
    var capNote = '';
    if (clRaw !== '' || blRaw !== '') {
      var g = settings().playGate || { normalGapDays: 2, holidayPerDay: 3 };
      var hpd = g.holidayPerDay || 3;
      if (!s.playCaps || typeof s.playCaps !== 'object') {
        s.playCaps = { capture: { dayKey: '', countToday: 0, lastDate: '' }, battle: { dayKey: '', countToday: 0, lastDate: '' } };
      }
      var kinds = ['capture', 'battle'];
      var raws = [clRaw, blRaw];
      var lefts = [cl, bl];
      for (var ki = 0; ki < kinds.length; ki++) {
        if (raws[ki] === '') continue; // 留空 = 该项不修改
        if (!s.playCaps[kinds[ki]] || typeof s.playCaps[kinds[ki]] !== 'object') s.playCaps[kinds[ki]] = { dayKey: '', countToday: 0, lastDate: '' };
        s.playCaps[kinds[ki]].dayKey = APP.todayStr();
        s.playCaps[kinds[ki]].countToday = hpd - lefts[ki]; // 反推今日已用，使剩余次数 = 目标值；可为负（调试加量不受上限约束），次日 dayKey 变化自动清零
        s.playCaps[kinds[ki]].lastDate = '';                // 清冷却，立即能玩
      }
      capNote = '（';
      if (clRaw !== '') capNote += '捕捉剩余 ' + cl;
      if (blRaw !== '') capNote += (clRaw !== '' ? '、' : '') + '战斗剩余 ' + bl;
      capNote += '，冷却已清除；调试次数次日刷新为正常规则）';
    } else {
      capNote = '（剩余次数未填，保持不变）';
    }
    save();
    return { ok: true, msg: '已保存：精灵球 ' + c + ' / 战斗券 ' + b + ' / 外出 ' + o + capNote };
  }

  // 任务完成方式：photo=拍照提交（一律等家长审核发经验）
  function isPhotoTask(task) {
    return !!task && task.mode === 'photo';
  }

  // 打钩是否立即得经验：全局开关关闭时，打钩类任务也进入待审核、家长通过后才到账
  function expOnCheck() {
    var st = settings();
    return st && typeof st.expOnCheck === 'boolean' ? st.expOnCheck : true;
  }

  // 孩子打钩：开关开 → 立即 done 并发经验；开关关 → 进待审核队列，等家长通过
  function checkIn(taskId) {
    beginWrite();
    var inst = ensureInstances(APP.todayStr())[taskId];
    var task = findTask(taskId);
    if (!inst || !task) return false;
    if (isPhotoTask(task)) return false;               // 拍照类任务必须走 submitHomework
    if (isDoneStatus(inst.status)) return false;
    inst.submittedAt = APP.nowHM();
    if (expOnCheck()) {
      inst.status = 'done';
      // 发碎片（满级时 addShards 仍正常累加，不受经验上限影响）
      inst.shardGained = addShards(task.shards, task.title);
    } else {
      inst.status = 'submitted';
      inst.shardGained = 0;
    }
    save();
    return true;
  }

  // 撤销：退还已发经验，回到待完成
  function undo(taskId) {
    beginWrite();
    var inst = ensureInstances(APP.todayStr())[taskId];
    if (!inst || !isDoneStatus(inst.status)) return false;
    if (inst.shardGained) addShards(-inst.shardGained, '撤销：' + (findTask(taskId) ? findTask(taskId).title : ''));
    inst.status = 'pending';
    inst.shardGained = 0;
    inst.submittedAt = '';
    inst.reviewNote = '';
    save();
    return true;
  }

  // 7e / V5.1：锻炼（跳绳）手动计数 → 固定消耗 10 体力、心情 +5，次数只记录运动量并写锻炼日志
  // bonusFromStamina：对战加成公式占位（null = 未启用），待 Task 10 对战实现后填充。
  // 拍照提交：一律待审核，家长通过后才发经验
  function submitHomework(taskId, photoId) {
    beginWrite();
    var inst = ensureInstances(APP.todayStr())[taskId];
    var task = findTask(taskId);
    if (!inst || !task || !isPhotoTask(task)) return false;
    if (isDoneStatus(inst.status)) return false;
    var now = new Date();
    inst.status = 'submitted';
    inst.photoId = photoId;
    inst.submittedAt = APP.nowHM();
    inst.isFast = isBeforeDeadline(now, settings().fastDeadline);
    inst.shardGained = 0;
    save();
    return true;
  }

  // 「打钩立即获得经验」开关：开=打钩即得；关=打钩后需家长审核才到账
  function setExpOnCheck(on) {
    beginWrite();
    var s = load();
    s.family.settings.expOnCheck = !!on;
    save();
    return true;
  }

  function levelProgress() {
    var p = activePokemon();
    var need = settings().expPerLevel;
    if (!p) return { percent: 0, inLevel: 0, need: need, maxed: false };
    if (p.level >= APP.LEVEL_MAX) {
      // 满级：条走满，不再显示循环上涨的假进度
      return { percent: 100, inLevel: need, need: need, maxed: true };
    }
    var inLevel = p.exp % need;
    return { percent: Math.round(inLevel / need * 100), inLevel: inLevel, need: need, maxed: false };
  }

  function exportData() {
    var s = load();
    return JSON.stringify({
      app: 'pokedex-checkin',
      version: APP.VERSION,
      exportedAt: new Date().toISOString(),
      state: s
    });
  }

  function importData(text) {
    var obj = JSON.parse(text);
    if (!obj || !obj.state || typeof obj.state !== 'object') throw new Error('文件格式不正确');
    // 备份可能是旧格式 / 旧版本号：一律导入后走 migrate 迁移，不再因版本号拒绝
    state = obj.state;
    migrate(state);
    save();
    return true;
  }

  function download(filename, text) {
    var blob = new Blob([text], { type: 'application/json' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(function () {
      URL.revokeObjectURL(url);
    }, 1000);
  }

  APP.store = {
    get: get,
    save: save,
    settings: settings,
    setSetting: setSetting,
    findTask: findTask,
    activePokemon: activePokemon,
    onboarding: function () { var s = load(); return s.onboarding || { onboarded: false, firstPokemon: null, character: null, reselectTime: 0, welcomed: false }; },
    setOnboarding: function (obj) { beginWrite(); var s = load(); var cur = s.onboarding || {}; var k; for (k in obj) { if (Object.prototype.hasOwnProperty.call(obj, k)) cur[k] = obj[k]; } s.onboarding = cur; save(); },
    unlock: function () { var s = load(); return s.unlock || {}; },
    setUnlock: function (obj) { beginWrite(); var s = load(); var cur = s.unlock || {}; var k; for (k in obj) { if (Object.prototype.hasOwnProperty.call(obj, k)) cur[k] = obj[k]; } s.unlock = cur; save(); },
    tasksFor: tasksFor,
    ensureInstances: ensureInstances,
    isDoneStatus: isDoneStatus,
    progressOf: progressOf,
    progressOfExisting: progressOfExisting,
    isCheckInDay: isCheckInDay,
    monthCheckinCount: monthCheckinCount,
    settle: settle,
    checkIn: checkIn,
    undo: undo,
    submitHomework: submitHomework,
    isPhotoTask: isPhotoTask,
    expOnCheck: expOnCheck,
    setExpOnCheck: setExpOnCheck,
    addTask: addTask,
    updateTask: updateTask,
    removeTask: removeTask,
    restoreDefaultTasks: restoreDefaultTasks,
    getAuditQueue: getAuditQueue,
    approve: approve,
    reject: reject,
    setPin: setPin,
    setInkMode: setInkMode,
    resetAll: resetAll,
    listPokemon: listPokemon,
    addPokemonByDex: addPokemonByDex,
    setFirstPokemon: setFirstPokemon,
    setActiveByDex: setActiveByDex,
    debugAddExp: debugAddExp,
    resetActivePokemon: resetActivePokemon,
    weeklyStats: weeklyStats,
    xpLog: xpLog,
    addExp: addExp,
    addExpTo: addExpTo,
    pushCare: pushCare,
    addShards: addShards,
    addBattleRecord: addBattleRecord,
    exchangeShards: exchangeShards,
    canPlay: canPlay,
    consumePlayCap: consumePlayCap,
    spendTicket: spendTicket,
    gymState: gymState,
    canGym: canGym,
    consumeGym: consumeGym,
    gymFinish: gymFinish,
    gymMasterDone: gymMasterDone,
    addWishStars: addWishStars,
    wishOrders: wishOrders,
    submitWish: submitWish,
    finishWish: finishWish,
    markSeen: markSeen,
    isHoliday: APP.isHoliday,
    listParty: listParty,
    listBox: listBox,
    maxPokemonLevel: maxPokemonLevel,
    setCareTarget: setCareTarget,
    setTeam: setTeam,
    sendToBox: sendToBox,
    addToParty: addToParty,
    swapParty: swapParty,
    produceRanchIdle: produceRanchIdle,
    comboMilestones: function () { return COMBO_MILESTONES; },
    getOutings: getOutings,
    consumeOuting: consumeOuting,
    checkPerfect: checkPerfect,
    // 7f：羁绊
    calcStars: calcStars,
    bondProgress: bondProgress,
    markBonded: markBonded,
    petBond: petBond,
    debugSetBond: debugSetBond,
    debugSetCounts: debugSetCounts,
    evolveTo: evolveTo,
    takeEvents: takeEvents,
    maxExpOf: maxExpOf,
    levelProgress: levelProgress,
    exportData: exportData,
    importData: importData,
    adoptExternal: adoptExternal,
    replaceState: replaceState,
    addPhotoMeta: addPhotoMeta,
    markPhotoSynced: markPhotoSynced,
    unsyncedPhotos: unsyncedPhotos,
    collectPhotoIds: collectPhotoIds,
    download: download
  };
})(window.APP);
