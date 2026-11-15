window.APP = window.APP || {};

(function (APP) {
  'use strict';

  APP.VERSION = 1;

  // 等级上限：满了就不再获得经验（由 addExp 拦截并提醒）
  APP.LEVEL_MAX = 100;
  // 到这一级提醒「可以换一只宝可梦培养」——此时成长曲线开始变慢
  APP.EVO_NOTICE_LEVEL = 60;

  // 屏幕注册表：各 screens/*.js 通过 APP.screens[id] = {...} 注册
  APP.screens = APP.screens || {};

  var ALL_WEEK = [1, 2, 3, 4, 5, 6, 7];
  APP.ALL_WEEK = ALL_WEEK;

  // 法定假日表（V5 频率门禁用）：默认空，由 B9「内置法定假日表」填充；周末自动算节假日
  APP.HOLIDAYS = [];
  APP.isHoliday = function (dateStr) {
    var w = APP.weekdayOf(dateStr);
    if (w === 6 || w === 7) return true;                       // 周六 / 周日
    if (Array.isArray(APP.HOLIDAYS) && APP.HOLIDAYS.indexOf(dateStr) >= 0) return true;
    return false;
  };

  APP.TYPES = ['作业', '阅读', '运动', '家务', '睡眠', '吃饭', '上学', '其他'];

  // 任务完成方式：check=直接打钩，photo=拍照提交（家长看照片审核）
  APP.MODES = ['check', 'photo'];
  APP.MODE_LABEL = { check: '直接打钩', photo: '拍照提交' };

  // 时段分组（仅作展示分组，不影响排程）
  APP.SLOTS = ['morning', 'afternoon', 'evening', 'anytime'];
  APP.SLOT_LABEL = { morning: '早晨', afternoon: '下午', evening: '晚上', anytime: '随时' };

  // 任务没填截止时间时，按时段兜底的默认截止点（仅前台展示与排序用，不写回数据）
  APP.SLOT_DEADLINE = { morning: '12:00', afternoon: '18:00', evening: '22:00' };

  APP.DEFAULT_TASKS = [
    { id: 't_hw',        title: '完成今日作业', type: '作业', shards: 1, mode: 'check', deadline: '21:00', slot: 'evening', weekdays: ALL_WEEK },
    { id: 't_read',      title: '课外阅读 20 分钟', type: '阅读', shards: 1, mode: 'check', deadline: '20:30', slot: 'evening', weekdays: ALL_WEEK },
    { id: 't_move',      title: '运动 30 分钟', type: '运动', shards: 1, mode: 'check', deadline: '21:00', slot: 'evening', weekdays: ALL_WEEK },
    { id: 't_chore',     title: '整理书包',    type: '家务', shards: 1, mode: 'check', deadline: '07:40', slot: 'morning', weekdays: ALL_WEEK },
    { id: 't_sleep',     title: '上床睡觉',    type: '睡眠', shards: 1, mode: 'check', deadline: '22:00', slot: 'evening', weekdays: ALL_WEEK },
    { id: 't_lunch',     title: '吃午饭',      type: '吃饭', shards: 1, mode: 'check', deadline: '12:00', slot: 'afternoon', weekdays: [6, 7] },
    { id: 't_dinner',    title: '吃晚饭',      type: '吃饭', shards: 1, mode: 'check', deadline: '19:00', slot: 'evening', weekdays: ALL_WEEK },
    { id: 't_housework', title: '做家务',      type: '家务', shards: 1, mode: 'check', deadline: '', slot: 'anytime', weekdays: [6, 7] }
  ];

  function pad(n) {
    return n < 10 ? '0' + n : '' + n;
  }

  APP.pad = pad;

  APP.pad3 = function (n) {
    var s = '' + n;
    while (s.length < 3) s = '0' + s;
    return s;
  };

  APP.dateStr = function (d) {
    return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
  };

  APP.todayStr = function () {
    return APP.dateStr(new Date());
  };

  APP.dateOffset = function (days) {
    var d = new Date();
    d.setDate(d.getDate() + days);
    return APP.dateStr(d);
  };

  APP.weekdayOf = function (dateStr) {
    var d = new Date(dateStr + 'T00:00:00');
    var w = d.getDay();
    return w === 0 ? 7 : w;
  };

  APP.clamp = function (v, min, max) {
    if (v < min) return min;
    if (v > max) return max;
    return v;
  };

  APP.nowHM = function () {
    var d = new Date();
    return pad(d.getHours()) + ':' + pad(d.getMinutes());
  };

  // 秒级时间（顶栏实时时钟用，本地时区即北京时间）
  APP.nowHMS = function () {
    var d = new Date();
    return pad(d.getHours()) + ':' + pad(d.getMinutes()) + ':' + pad(d.getSeconds());
  };

  APP.defaultState = function () {
    var starterId = 'p_' + Date.now();
    return {
      version: APP.VERSION,
      taskTemplateVersion: 2, // 内置任务模板版本；旧档缺此字段时由 migrate 判断是否自动升级
      family: {
        pin: '1234',
        createdAt: APP.todayStr(),
        settings: {
          shardPerTask: 1,                 // 每条日程完成必得碎片数（V5 脱钩：经验改碎片）
          expPerLevel: 100,                // 升级所需经验（仅训练/战斗产出，养成/乐园不再产经验）
          exchangeRate: { battle: 5, capture: 7 }, // 碎片→道具汇率：战斗券 5 碎片/张，精灵球 7 碎片/个
          playGate: { normalGapDays: 2, holidayPerDay: 3 }, // 频率门禁：非节假日每 2 天 1 次 / 节假日每天 3 次
          fastDeadline: '21:00',
          streakTarget: 7,
          dailyCatchLimit: 3,
          inkMode: 'auto',
          soundOn: true,                   // 声音开关：升级/进化/连击的叫声与音效（墨水屏下始终静音）
          celebrateOn: true,               // 庆祝动画开关：升级/进化/连击的彩带庆祝层（墨水屏下始终关闭）
          catchAnimOn: true,               // B3 捕捉动画开关：关掉后跳过抛球/开盖/摆动，直接出结果（墨水屏恒关）
          catchGameMode: 'timing',         // B3 收服小游戏：off / timing / tap / hold（用户可在设置里四选一）
          expOnCheck: true                // 语义已转为「打钩立即发碎片」；A1/A4 再把界面文案改回碎片（key 暂不重命名，以免牵动多文件）
        }
      },
      tasks: JSON.parse(JSON.stringify(APP.DEFAULT_TASKS)),
      instances: {},
      pokemon: [
        {
          id: starterId,
          dexNo: 25,
          nickname: '皮卡丘',
          level: 1,
          exp: 0,
          stage: 0,
          slot: 'team',
          stats: { food: 80, mood: 80, energy: 80 },
          vigor: 10 + Math.floor(Math.random() * 31), // V5.1：劳动消耗个体值（10~40），乐园劳动用
          bond: { stars: 0, daysCared: 0, wins: 0, perfectDays: 0 },
          // 提醒去重标记：lv60=已提示可换着培养，final=已提示到最终形态
          flags: { lv60: false, final: false },
          // 待播放的进化（升级达标时写入，动画播完由 evolveTo 消费）
          pendingEvo: null,
          perfectToday: false,
          lastPerfectDate: '',
          history: [],
          bondedToday: null,
          lastPetDate: '',
          lastPetAt: 0,
          petCountToday: 0
        }
      ],
      helpers: [],
      // careTargetId = 主力宝可梦 id（养成页只照顾主力；乐园全员劳动，无主随之分）
      careTargetId: starterId,
      wallet: { balls: 0, berries: 3, potions: 0, shards: 0, wishStars: 0, tickets: { capture: 3, battle: 4 } },
      outings: { weekKey: '', left: 4, accrued2: 0, sundayGiven: false },
      playCaps: {
        capture: { dayKey: '', countToday: 0, lastDate: '' },
        battle: { dayKey: '', countToday: 0, lastDate: '' }
      },
      // 道馆挑战 v2：独立每周 3 次、失败 2 天冷却、首通徽章；心愿星在兑换页换心愿礼物
      gym: { weekKey: '', used: 0, badges: [], masterCleared: [], cooldown: {}, lastDate: {} },
      wishOrders: [],
      catches: [],
      seen: [],
      battles: [],
      memoryPlays: [],
      // 训练（V6）：每玩法每天 1 次，仅保留最近 30 天
      trainingPlays: [],
      // 养成页对话框信息源：训练/玩耍结算、经验、升级、进化（最近 40 条）
      careLog: [],
      // 二期家长后台自定义题库的数据契约；一期恒为空，翻牌/成语填空不受影响
      customBanks: { idiom: [], pinyin: [], english: [], enabled: true },
      xpLog: [],
      shardLog: [],
      events: [],
      streak: { current: 0, best: 0, lastDate: '', monthKey: '', monthCurrent: 0, monthBest: 0, claimed: [] },
      meta: { lastSettledDate: '', createdAt: APP.todayStr() },
      onboarding: { onboarded: false, firstPokemon: null, character: null, reselectTime: 0, welcomed: false },
      unlock: {}
    };
  };
})(window.APP);
