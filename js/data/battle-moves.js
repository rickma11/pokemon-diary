window.APP = window.APP || {};

/* ==========================================================================
   B4 对战数据 · 纯静态 / 纯函数（不依赖 DOM，可直接被 Node 测试加载）
   口径（2026-11-10 定稿 v2，同步套用到外出战斗与道馆战斗）：
   · 4 个全是攻击招，零辅助 / 防守 / 蓄力 / 自伤 / PP / 异常状态
   · HP 双方固定 100、战斗体力双方 100、每回合开始 +10（防守 +15）
   · 四招耗体阶梯 15 / 35 / 55 / 80，各体力段都有能用的最大输出
   · 伤害 = min(60, 威力 × 0.18 × 等级 × 克制 × STAB1.5 × 小游戏 × 会心 × 随机)
   · 克制 = 官方第六世代起 18 属性表（2×/0.5×/0×，双属性相乘，0× 优先）
   · 敌方伤害再 × 0.75（儿童向）；道馆额外 × foeMult（等级差难度）
   ========================================================================== */
(function (APP) {
  'use strict';

  var HP_MAX = 100;
  var STAMINA_MAX = 100;
  var STAMINA_REGEN = 10;
  var POWER = [40, 65, 85, 110];      // ① 撞击 ② 本系主招 ③ 本系强攻 ④ 全力一击
  // 阶梯式耗体：每 20–25 点升一档，保证各体力段都有「当前能用的最大输出」。
  // ① 15 / ② 35 / ③ 55 / ④ 80；最低档不变，保留「体力不足 → 防守」机制。
  var COST = [15, 35, 55, 80];
  var DMG_BASE = 0.18;
  var DMG_CAP = 60;
  var STAB = 1.5;                     // 官方本系加成（原 1.2 已废弃）
  var ENEMY_FACTOR = 0.75;
  var CRIT_RATE = 0.06;
  var CRIT_MULT = 1.5;
  var GRADE = { perfect: 1.2, good: 1, miss: 0 };

  // 18 属性模板：只换 ②③④ 的招名 + 特效色 + 形状，威力 / 耗体力四槽全站统一。
  // fx: bolt 折线 / flame 火苗 / wave 波纹 / leaf 叶片 / star 星形
  var TPL = {
    normal:   { zh: '一般', c: '#F7F0DC', fx: 'star',  m: ['高速星星', '泰山压顶', '极限冲击'] },
    fighting: { zh: '格斗', c: '#C03028', fx: 'flame', m: ['空手劈',   '十字劈',   '真气拳'] },
    flying:   { zh: '飞行', c: '#8B78D8', fx: 'star',  m: ['起风',     '翅膀攻击', '勇鸟猛攻'] },
    poison:   { zh: '毒',   c: '#A040A0', fx: 'wave',  m: ['毒针',     '污泥攻击', '垃圾射击'] },
    ground:   { zh: '地面', c: '#C9A64B', fx: 'star', m: ['掷泥',     '挖洞',     '地震'] },
    rock:     { zh: '岩石', c: '#B8A038', fx: 'star', m: ['落石',     '岩崩',     '尖石攻击'] },
    bug:      { zh: '虫',   c: '#8CA520', fx: 'leaf',  m: ['连斩',     '信号光束', '终极吸取'] },
    ghost:    { zh: '幽灵', c: '#705898', fx: 'wave',  m: ['惊吓',     '暗影拳',   '暗影潜袭'] },
    steel:    { zh: '钢',   c: '#8A96A8', fx: 'star',  m: ['金属爪',   '铁头',     '破坏光线'] },
    fire:     { zh: '火',   c: '#FF7A3C', fx: 'flame', m: ['火花',     '火焰拳',   '爆炎风暴'] },
    water:    { zh: '水',   c: '#5B8DEF', fx: 'wave',  m: ['水枪',     '泡沫光线', '滔天水炮'] },
    grass:    { zh: '草',   c: '#7ED957', fx: 'leaf',  m: ['藤鞭',     '飞叶快刀', '草木爆发'] },
    electric: { zh: '电',   c: '#FFD54A', fx: 'bolt',  m: ['电光一闪', '电弧冲击', '雷霆万钧'] },
    psychic:  { zh: '超能', c: '#E06BA8', fx: 'wave',  m: ['念力',     '精神强念', '精神风暴'] },
    ice:      { zh: '冰',   c: '#4E9EA8', fx: 'wave',  m: ['冰砾',     '冰冻拳',   '暴风雪'] },
    dragon:   { zh: '龙',   c: '#6238D8', fx: 'bolt',  m: ['龙息',     '龙爪',     '龙星群'] },
    dark:     { zh: '恶',   c: '#5F5048', fx: 'flame', m: ['啃咬',     '欺诈',     '恶之波动'] },
    fairy:    { zh: '妖精', c: '#D2648E', fx: 'leaf',  m: ['妖精之风', '嬉闹',     '月亮之力'] }
  };

  // 专属特技：只替换第 ② 槽，全部是攻击向差异（更高威力 / 特定属性 / 略高会心）。
  // 前 15 条覆盖图鉴人气角色，后 5 条覆盖「对战专用 51 只」里常出现的对手。
  var SIGNATURE = {
    25:  { name: '十万伏特', power: 80, type: 'electric', crit: 0.12 },
    6:   { name: '大字爆炎', power: 80, type: 'fire',     crit: 0.12 },
    1:   { name: '日光束',   power: 80, type: 'grass' },
    7:   { name: '水炮',     power: 78, type: 'water' },
    94:  { name: '暗影球',   power: 78, type: 'ghost' },
    149: { name: '破坏光线', power: 80, type: 'normal' },
    143: { name: '泰山压顶', power: 78, type: 'normal' },
    133: { name: '珍藏',     power: 75, type: 'normal' },
    373: { name: '龙爪',     power: 80, type: 'dragon' },
    150: { name: '精神破坏', power: 85, type: 'psychic' }, // 神兽本期不出现，先留数据位
    9:   { name: '加农水炮', power: 82, type: 'water' },
    3:   { name: '疯狂植物', power: 82, type: 'grass' },
    157: { name: '喷火',     power: 80, type: 'fire' },
    160: { name: '水流尾',   power: 80, type: 'water' },
    254: { name: '叶刃',     power: 80, type: 'grass' },
    257: { name: '火焰踢',   power: 80, type: 'fire' },
    142: { name: '岩崩',     power: 80, type: 'rock' },
    208: { name: '铁尾',     power: 80, type: 'steel' },
    324: { name: '喷烟',     power: 78, type: 'fire' },
    362: { name: '冰冻光束', power: 80, type: 'ice' }
  };

  // 官方第六世代起 18 属性相克表：攻击属性 -> [2×, 0.5×, 0×]。
  // 防御方双属性时逐项相乘（可到 4× / 0.25×），任一 0× 直接无效。
  var CH = {
    normal:   [[], ['rock', 'steel'], ['ghost']],
    fighting: [['normal', 'rock', 'steel', 'ice', 'dark'], ['flying', 'poison', 'bug', 'psychic', 'fairy'], ['ghost']],
    flying:   [['fighting', 'bug', 'grass'], ['rock', 'steel', 'electric'], []],
    poison:   [['grass', 'fairy'], ['poison', 'ground', 'rock', 'ghost'], ['steel']],
    ground:   [['poison', 'rock', 'steel', 'fire', 'electric'], ['grass', 'bug'], ['flying']],
    rock:     [['flying', 'bug', 'fire', 'ice'], ['fighting', 'ground', 'steel'], []],
    bug:      [['grass', 'psychic', 'dark'], ['fighting', 'flying', 'poison', 'ghost', 'steel', 'fire', 'fairy'], []],
    ghost:    [['ghost', 'psychic'], ['dark'], ['normal']],
    steel:    [['rock', 'ice', 'fairy'], ['steel', 'fire', 'water', 'electric'], []],
    fire:     [['bug', 'steel', 'grass', 'ice'], ['rock', 'fire', 'water', 'dragon'], []],
    water:    [['ground', 'rock', 'fire'], ['water', 'grass', 'dragon'], []],
    grass:    [['ground', 'rock', 'water'], ['flying', 'poison', 'bug', 'steel', 'fire', 'grass', 'dragon'], []],
    electric: [['flying', 'water'], ['grass', 'electric', 'dragon'], ['ground']],
    psychic:  [['fighting', 'poison'], ['steel', 'psychic'], ['dark']],
    ice:      [['flying', 'ground', 'grass', 'dragon'], ['steel', 'fire', 'water', 'ice'], []],
    dragon:   [['dragon'], ['steel'], ['fairy']],
    dark:     [['ghost', 'psychic'], ['fighting', 'dark', 'fairy'], []],
    fairy:    [['fighting', 'dragon', 'dark'], ['poison', 'steel', 'fire'], []]
  };

  function pad3(n) { return APP.pad3 ? APP.pad3(n) : ('00' + n).slice(-3); }

  // 属性查询：优先调用方给的 hint，其次对战专用 51 只 / 图鉴进化链 / 捕捉池。
  function typesOf(dexNo, hint) {
    if (hint && hint.length) return hint;
    var n = Number(dexNo), i, j, list, p;
    list = (APP.dexData && APP.dexData.BATTLE_ONLY) || [];
    for (i = 0; i < list.length; i++) if (list[i].id === n) return list[i].types;
    list = (APP.dexData && APP.dexData.ENTRIES) || [];
    for (i = 0; i < list.length; i++) {
      p = list[i].path || [];
      for (j = 0; j < p.length; j++) if (p[j].id === n) return p[j].types;
    }
    if (APP.catchData && APP.catchData.POOLS) {
      var pools = APP.catchData.POOLS;
      for (var tier in pools) {
        if (!Object.prototype.hasOwnProperty.call(pools, tier)) continue;
        for (i = 0; i < pools[tier].length; i++) {
          if (pools[tier][i].id === n) return pools[tier][i].types;
        }
      }
    }
    return ['normal'];
  }

  function nameOf(dexNo, hint) {
    if (hint) return hint;
    var n = (APP.dexData && APP.dexData.nameOf && APP.dexData.nameOf(Number(dexNo))) || '';
    if (!n && APP.catchData && APP.catchData.POOLS) {
      var pools = APP.catchData.POOLS;
      for (var tier in pools) {
        if (!Object.prototype.hasOwnProperty.call(pools, tier)) continue;
        for (var i = 0; i < pools[tier].length; i++) {
          if (pools[tier][i].id === Number(dexNo)) return pools[tier][i].zh;
        }
      }
    }
    return n || ('No.' + pad3(dexNo));
  }

  // 主属性：双属性取后一个（喷火龙 → 火、妙蛙种子 → 草、耿鬼 → 幽灵），
  // 更贴合孩子对「这只宝可梦是什么系」的直觉。
  function mainType(types) {
    return (types && types[types.length - 1]) || 'normal';
  }

  function fxOf(type) {
    var t = TPL[type] || TPL.normal;
    return { color: t.c, shape: t.fx };
  }

  // 命中率（%）：正常技能 70–90，威力越大越难命中；小游戏 perfect +15 / good +8（封顶 100）。
  function accByPower(p) {
    if (p >= 100) return 70;
    if (p >= 75) return 78;
    if (p >= 60) return 85;
    return 90;
  }

  // 生成 4 个纯攻击招；有专属特技时只替换 ②，其余三槽不变。
  function movesFor(dexNo, types) {
    var ts = typesOf(dexNo, types);
    var main = mainType(ts);
    var tpl = TPL[main] || TPL.normal;
    var fx = fxOf(main), out = [];
    var names = ['撞击'].concat(tpl.m);
    for (var i = 0; i < 4; i++) {
      out.push({
        slot: i + 1,
        name: names[i],
        power: POWER[i],
        cost: COST[i],
        acc: accByPower(POWER[i]),
        type: i === 0 ? 'normal' : main,
        typeZh: i === 0 ? '一般' : tpl.zh,
        color: i === 0 ? TPL.normal.c : fx.color,
        shape: i === 0 ? 'star' : fx.shape,
        crit: CRIT_RATE,
        signature: false
      });
    }
    var sig = SIGNATURE[Number(dexNo)];
    if (sig) {
      var sf = fxOf(sig.type);
      out[1] = {
        slot: 2, name: sig.name, power: sig.power, cost: COST[1],
        acc: accByPower(sig.power),
        type: sig.type, typeZh: (TPL[sig.type] || TPL.normal).zh,
        color: sf.color, shape: sf.shape,
        crit: sig.crit || CRIT_RATE, signature: true
      };
    }
    return out;
  }

  // 克制倍率：双属性逐项相乘，0× 优先（官方设定）。
  function typeEffect(atkType, defTypes) {
    var c = CH[atkType] || CH.normal, r = 1, i, d;
    for (i = 0; i < (defTypes || []).length; i++) {
      d = defTypes[i];
      if (!d || !CH[d]) continue;
      if (c[2].indexOf(d) >= 0) return 0;
      r *= c[0].indexOf(d) >= 0 ? 2 : (c[1].indexOf(d) >= 0 ? 0.5 : 1);
    }
    return r;
  }

  function levelFactor(level) {
    var lv = Math.max(1, Math.min(100, Number(level) || 1));
    return 0.9 + Math.min(lv, 50) / 250;   // Lv1 0.90 / Lv25 1.00 / Lv50+ 1.10
  }

  // 伤害纯函数：所有随机量由调用方传入，便于测试固定断言。
  // ctx = { level, attackerTypes, defenderTypes, grade, crit, rand, enemy, foeMult }
  function damage(move, ctx) {
    ctx = ctx || {};
    var grade = ctx.grade === undefined ? GRADE.good : ctx.grade;
    if (!grade) return 0;                        // 打空：不出招、不扣体力
    var lvF = levelFactor(ctx.level);
    var eff = typeEffect(move.type, ctx.defenderTypes);
    if (eff === 0) return 0;                    // 0× 完全打不动，不再兜底 1 点
    var stab = (ctx.attackerTypes || []).indexOf(move.type) >= 0 ? STAB : 1;
    var crit = ctx.crit ? CRIT_MULT : 1;
    var rand = ctx.rand === undefined ? 1 : ctx.rand;
    var raw = move.power * DMG_BASE * lvF * eff * stab * grade * crit * rand;
    var d = Math.min(DMG_CAP, Math.max(1, Math.floor(raw)));
    if (ctx.enemy) d = Math.max(1, Math.floor(d * ENEMY_FACTOR));
    if (ctx.foeMult && ctx.foeMult !== 1) d = Math.max(1, Math.floor(d * ctx.foeMult));
    return d;
  }

  function regen(v) { return Math.min(STAMINA_MAX, (v || 0) + STAMINA_REGEN); }
  function canUse(v, move) { return (v || 0) >= move.cost; }
  function spend(v, move) { return Math.max(0, (v || 0) - move.cost); }

  // 敌方 AI：70% ② / 20% ① / 10% ③，不用 ④；体力不够自动降档到用得起的招。
  // 全部招式都用不起时返回 null：双方共用同一套体力规则，敌方体力不足同样不能出招
  // （battle.js 收到 null 会转为「防守」，机制与我方防守一致）。
  function enemyPick(moves, stamina, rand) {
    var r = rand === undefined ? Math.random() : rand;
    var want = r < 0.70 ? 1 : (r < 0.90 ? 0 : 2);
    var order = [want, 1, 0, 2];
    for (var i = 0; i < order.length; i++) {
      var m = moves[order[i]];
      if (m && canUse(stamina, m)) return m;
    }
    return null;
  }

  // 对手池：只用「对战专用 51 只」（Q6 推荐口径），不进图鉴、不可捕捉。
  function foePool() {
    return ((APP.dexData && APP.dexData.BATTLE_ONLY) || []).slice();
  }
  function randomFoe(rand) {
    var list = foePool();
    if (!list.length) return null;
    var r = rand === undefined ? Math.random() : rand;
    var one = list[Math.floor(r * list.length) % list.length];
    return { dexNo: one.id, name: one.zh, types: one.types.slice() };
  }

  APP.battleMoves = {
    HP_MAX: HP_MAX, STAMINA_MAX: STAMINA_MAX, STAMINA_REGEN: STAMINA_REGEN,
    POWER: POWER, COST: COST, DMG_BASE: DMG_BASE, DMG_CAP: DMG_CAP,
    STAB: STAB, ENEMY_FACTOR: ENEMY_FACTOR, CRIT_RATE: CRIT_RATE, GRADE: GRADE,
    TPL: TPL, SIGNATURE: SIGNATURE, CH: CH,
    typesOf: typesOf, nameOf: nameOf, mainType: mainType, fxOf: fxOf,
    movesFor: movesFor, typeEffect: typeEffect, levelFactor: levelFactor,
    damage: damage, regen: regen, canUse: canUse, spend: spend,
    enemyPick: enemyPick, foePool: foePool, randomFoe: randomFoe
  };
})(window.APP);
