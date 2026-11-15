window.APP = window.APP || {};

/* ==========================================================================
   道馆数据 · 纯静态（不依赖 DOM，可被 Node 测试直接加载）
   2026-11-10 定稿 v2：
   · 城都 GSC 8 馆解锁等级 9/16/20/25/30/33/36/40（第 6/7 馆按用户调整）
   · 三角色：普通职员 = 解锁，小 boss = +3，馆主 = +6
   · 大师重战：解锁 ×2（龙馆馆主最高 Lv.86），经验 ×0.6，首次通关给 2 倍心愿星、不给徽章
   · 每场开场 HP / 体力回满；敌方伤害倍率 1.85（等级差难度）
   · 奖励：经验三场 20/30/50%，碎片 1/1/2；心愿星/徽章严格只发一次（查徽章册 + 大师通关册）
   · 失败保留已过场次经验/碎片，本馆冷却 2 天；独立每周 3 次，不消耗战斗券
   ========================================================================== */
(function (APP) {
  'use strict';

  var GYMS = [
    { id: 'rock',     n: '岩石道馆',   t: 'rock',     u: 9,  s: 2, e: [26, 40, 66] },
    { id: 'water',    n: '水系道馆',   t: 'water',    u: 16, s: 2, e: [38, 56, 94] },
    { id: 'electric', n: '电系道馆',   t: 'electric', u: 20, s: 3, e: [44, 66, 110] },
    { id: 'grass',    n: '草系道馆',   t: 'grass',    u: 25, s: 3, e: [52, 78, 130] },
    { id: 'fire',     n: '火系道馆',   t: 'fire',     u: 30, s: 4, e: [60, 90, 150] },
    { id: 'psychic',  n: '超能力道馆', t: 'psychic',  u: 33, s: 4, e: [65, 97, 162] },
    { id: 'ground',   n: '地面道馆',   t: 'ground',   u: 36, s: 5, e: [70, 104, 174] },
    { id: 'dragon',   n: '龙系道馆',   t: 'dragon',   u: 40, s: 6, e: [76, 114, 190] }
  ];

  var RULES = {
    weekLimit: 3,            // 独立每周 3 次，不消耗战斗券
    cooldownDays: 2,         // 失败冷却 2 天
    starYuan: 10,            // 1⭐ = 10 元
    maxYuan: 100,            // 单笔心愿礼物上限 100 元
    foeMult: 1.85,           // 道馆敌方伤害倍率（等级差难度，用户定稿）
    masterExpMult: 0.6,      // 大师重战经验系数
    masterStarMult: 2,       // v61：大师首次通关给「首通星数 ×2」，重打不再给
    gradeMult: { S: 1, A: 0.8, B: 0.6 }
  };

  var ROLE_NAME = ['普通职员', '小 boss', '馆主'];
  var ROLE_HP = [100, 115, 130];
  var ROLE_MULT = [1, 1.08, 1.20];
  var SHARDS = [1, 1, 2];

  function get(id) {
    for (var i = 0; i < GYMS.length; i++) if (GYMS[i].id === id) return GYMS[i];
    return GYMS[0];
  }
  function indexOf(id) {
    for (var i = 0; i < GYMS.length; i++) if (GYMS[i].id === id) return i;
    return 0;
  }

  // 三场等级：普通职员 u / 小 boss u+3 / 馆主 u+6（大师重战 u 先 ×2）
  function levels(g, master) {
    var u = master ? g.u * 2 : g.u;
    return [u, u + 3, u + 6];
  }

  // 每场对手：从「对战专用 51 只」里挑带该馆属性的宝可梦，不足 3 只时循环复用。
  // 只用真实存在的编号，保证 GIF / 名字 / 属性都能查到。
  function foes(g) {
    var all = (APP.dexData && APP.dexData.BATTLE_ONLY) || [];
    var list = all.filter(function (b) { return b.types.indexOf(g.t) >= 0; });
    if (!list.length) list = [{ id: 132, zh: '百变怪', types: ['normal'] }];
    return [0, 1, 2].map(function (i) {
      var b = list[i % list.length];
      return { dexNo: b.id, name: b.zh, types: b.types.slice() };
    });
  }

  // 三场角色（等级 / HP / 伤害倍率 / 逐场碎片与经验）
  function roles(g, master) {
    var lv = levels(g, master);
    return [0, 1, 2].map(function (i) {
      return {
        name: ROLE_NAME[i], lv: lv[i], hp: ROLE_HP[i],
        mult: ROLE_MULT[i], shards: SHARDS[i],
        exp: Math.round(g.e[i] * (master ? RULES.masterExpMult : 1))
      };
    });
  }

  // 结算：passed = 已通过场次（0~3），grade = S/A/B（仅全通时有效）
  // 失败保留已通过场次奖励；心愿星 / 徽章严格只发一次：
  //   · 普通首通全通（win && !master && !cleared）→ 星 g.s + 徽章
  //   · 大师首次全通（win && master && !masterDone）→ 星 g.s ×2，不给徽章
  //   · 重打（cleared / masterDone）→ 只给经验 + 碎片
  // cleared / masterDone 由 store 按徽章册 / 大师通关册传入；省略时按"未拿过"处理（兼容旧调用）。
  function reward(g, passed, grade, master, win, cleared, masterDone) {
    var rs = roles(g, master);
    var mult = win ? (RULES.gradeMult[grade] || 1) : 1;
    var exp = 0, shards = 0;
    for (var i = 0; i < passed; i++) {
      exp += Math.round(rs[i].exp * mult);
      shards += rs[i].shards;
    }
    var firstClear = win && !master && !cleared;
    var masterFirst = win && master && !masterDone;
    var stars = firstClear ? g.s : (masterFirst ? g.s * RULES.masterStarMult : 0);
    return {
      exp: exp, shards: shards,
      stars: stars,
      badge: firstClear ? g.id : '',
      first: firstClear, masterFirst: masterFirst,
      grade: win ? grade : '—'
    };
  }

  /* ===== v59 · 轮转开放（A2）=====
     前 4 馆天天开放（主成长期不卡日期）；后 4 馆每周轮转 2 馆；周六日 8 馆全开。
     纯日期计算、不落盘：同一天在任何设备结果一致，gym 存档零新增字段 → 旧档零迁移。
     4 选 2 = 6 种组合，按「本周一锚点的周序号 % 6」轮换，6 周一个完整循环。 */
  var ALWAYS = ['rock', 'water', 'electric', 'grass'];
  var ROTATE = ['fire', 'psychic', 'ground', 'dragon'];
  var PAIRS = [
    ['fire', 'psychic'], ['fire', 'ground'], ['fire', 'dragon'],
    ['psychic', 'ground'], ['psychic', 'dragon'], ['ground', 'dragon']
  ];

  function dayNumber(s) {
    var p = String(s).split('-');
    return Math.floor(Date.UTC(+p[0], +p[1] - 1, +p[2]) / 86400000);
  }
  function weekIndexOf(s) {
    var d = new Date(s + 'T00:00:00Z');
    var back = (d.getUTCDay() + 6) % 7;        // 距本周一的天数
    return Math.floor((dayNumber(s) - back) / 7);
  }
  function isWeekend(s) {
    var w = new Date(s + 'T00:00:00Z').getUTCDay();
    return w === 0 || w === 6;
  }
  function weekPair(s) {
    var i = ((weekIndexOf(s) % PAIRS.length) + PAIRS.length) % PAIRS.length;
    return PAIRS[i];
  }
  function openGyms(s) {
    return isWeekend(s)
      ? GYMS.map(function (g) { return g.id; })
      : ALWAYS.concat(weekPair(s));
  }
  function isGymOpen(id, s) { return openGyms(s).indexOf(id) >= 0; }
  function nextOpenDate(id, s) {
    for (var i = 1; i <= 8; i++) {
      var d = new Date(s + 'T00:00:00Z');
      d.setUTCDate(d.getUTCDate() + i);
      var t = d.toISOString().slice(0, 10);
      if (isGymOpen(id, t)) return t;
    }
    return '';
  }
  // 下一次「本周特殊开放」轮到该馆的周一日期（从下周一开始扫 8 周）
  function nextFeaturedWeek(id, s) {
    var d = new Date(s + 'T00:00:00Z');
    var back = (d.getUTCDay() + 6) % 7;
    d.setUTCDate(d.getUTCDate() - back + 7);
    for (var w = 0; w < 8; w++) {
      var mon = new Date(d);
      mon.setUTCDate(mon.getUTCDate() + w * 7);
      var t = mon.toISOString().slice(0, 10);
      if (weekPair(t).indexOf(id) >= 0) return t;
    }
    return '';
  }
  function rotationInfo(s) {
    return {
      weekend: isWeekend(s), pair: weekPair(s), open: openGyms(s),
      weekIndex: weekIndexOf(s), cycle: weekIndexOf(s) % PAIRS.length
    };
  }

  APP.gymData = {
    GYMS: GYMS, RULES: RULES,
    ROLE_NAME: ROLE_NAME, ROLE_HP: ROLE_HP, ROLE_MULT: ROLE_MULT, SHARDS: SHARDS,
    ALWAYS: ALWAYS, ROTATE: ROTATE, PAIRS: PAIRS,
    get: get, indexOf: indexOf, levels: levels, foes: foes, roles: roles, reward: reward,
    openGyms: openGyms, isGymOpen: isGymOpen, nextOpenDate: nextOpenDate,
    nextFeaturedWeek: nextFeaturedWeek,
    isWeekend: isWeekend, weekPair: weekPair, rotationInfo: rotationInfo
  };
})(window.APP);
