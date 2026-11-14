window.APP = window.APP || {};

(function (APP) {
  'use strict';

  // Task 7d：玩耍 → 记忆翻牌（复用 V4 Task 9）
  // 拼音包 4×3（汉字↔拼音）、英语包 4×4（单词↔中文），每天各玩 1 次。
  // V8：英语包进局前选简单/中等/困难，三档棋盘与次数完全一致，只按词库星级 1~5 占比换词。
  // v65 组合方案：翻一张扣 1 次（翻错也扣），次数 = 卡数 × 2（拼音 24 / 英语 32）；
  // 每成功配对 2 对返还 1 次机会（拼音最多 +3、英语最多 +4），结算时全配对不再多扣。
  // 次数用完立即结束本轮并按已配对档位结算：
  //   全部配对   +5 经验 +1 果实 +45% 碎片
  //   ≥75% 配对  +3 经验 +1 果实
  //   ≥37.5%配对 +1 经验
  //   其余        鼓励语，无奖励

  function esc(t) {
    return String(t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }
  // 二期家长后台自定义题库合并入口：一期 customBanks 恒为空，行为与内置词库一致。
  // 自定义条目需沿用内置结构（拼音 {h,p} / 英语 {e,cn}），配对数仍固定 6 / 8 对。
  function customWords(pack) {
    var s = APP.store.get(), c = s && s.customBanks;
    if (!c || c.enabled === false) return [];
    var b = c[pack];
    return Array.isArray(b) ? b : [];
  }
  // 英语难度档（V8）：棋盘恒 8 对 / 16 张 / 32 次，难度只由词库星级占比决定。
  // 同一组 60/30/10 权重沿星级轴平移一档；8 对取整 5 / 2 / 1。
  var EN_LEVELS = [
    { key: 'easy', name: '简单', stars: [1, 2, 3], quota: [5, 2, 1], hint: true,
      exp: 3, good: 2, ok: 1, berry: 1, goodBerry: 1, shard: 0.25,
      desc: '★1 60% · ★2 30% · ★3 10%', reward: '+3 经验 · +1 果实 · 25% 碎片' },
    { key: 'normal', name: '中等', stars: [2, 3, 4], quota: [5, 2, 1], hint: false, def: true,
      exp: 5, good: 3, ok: 1, berry: 1, goodBerry: 1, shard: 0.45,
      desc: '★2 60% · ★3 30% · ★4 10%', reward: '+5 经验 · +1 果实 · 45% 碎片' },
    { key: 'hard', name: '困难', stars: [3, 4, 5], quota: [5, 2, 1], hint: false,
      exp: 8, good: 5, ok: 2, berry: 2, goodBerry: 1, shard: 0.65,
      desc: '★3 60% · ★4 30% · ★5 10%', reward: '+8 经验 · +2 果实 · 65% 碎片' }
  ];
  // 拼音包沿用原奖励表（与中等档同数值）
  var PY_TIER = { exp: 5, good: 3, ok: 1, berry: 1, goodBerry: 1, shard: 0.45, hint: false };

  function levelCfg(key) {
    for (var i = 0; i < EN_LEVELS.length; i++) if (EN_LEVELS[i].key === key) return EN_LEVELS[i];
    return EN_LEVELS[1];
  }
  function wordLevel(w) {
    var n = parseInt(w.level != null ? w.level : w.lv, 10);
    return (n >= 1 && n <= 5) ? n : 2;
  }
  function shuffle(a) {
    for (var i = a.length - 1; i > 0; i--) {
      var r = Math.floor(Math.random() * (i + 1));
      var t = a[i]; a[i] = a[r]; a[r] = t;
    }
    return a;
  }
  // 按 cfg.stars / cfg.quota 抽满 pairs 个词；某星级词不够时先补本档剩余，再从低到高补相邻星级。
  function pickByLevel(words, cfg, pairs) {
    var buckets = { 1: [], 2: [], 3: [], 4: [], 5: [] }, i, w;
    for (i = 0; i < words.length; i++) {
      w = words[i];
      if (!w || !(w.e || w.h)) continue;
      buckets[wordLevel(w)].push(w);
    }
    for (var k = 1; k <= 5; k++) shuffle(buckets[k]);
    var picked = [], used = {};
    function take(bucket, n) {
      var got = 0;
      while (got < n && bucket.length) {
        var x = bucket.shift(), id = String(x.e || x.h);
        if (used[id]) continue;
        used[id] = 1; picked.push(x); got++;
      }
      return got;
    }
    for (i = 0; i < cfg.stars.length; i++) take(buckets[cfg.stars[i]], cfg.quota[i]);
    for (i = 0; i < cfg.stars.length && picked.length < pairs; i++) take(buckets[cfg.stars[i]], pairs - picked.length);
    for (k = 1; k <= 5 && picked.length < pairs; k++) take(buckets[k], pairs - picked.length);
    return picked.slice(0, pairs);
  }
  function packDef(pack, levelKey) {
    if (pack === 'english') {
      var cfg = levelCfg(levelKey);
      return { words: APP.WORDS_ENGLISH.concat(customWords('english')), pairs: 8, cols: 4,
        label: '记忆翻牌-英语', title: '英语翻牌', sub: '单词 ↔ 中文', cfg: cfg, levelKey: cfg.key };
    }
    return { words: APP.WORDS_PINYIN.concat(customWords('pinyin')), pairs: 6, cols: 4,
      label: '记忆翻牌-拼音', title: '拼音翻牌', sub: '汉字 ↔ 拼音', cfg: PY_TIER, levelKey: '' };
  }
  // v65：次数 = 卡数 × 2（卡数 = pairs*2，所以 pairs*4）
  function turnsFor(pairs) { return pairs * 4; }
  // 每成功配对 2 对返还 1 次机会
  function bonusFor(done) { return Math.floor(done / 2); }

  // 当日记忆游玩记录（state.memoryPlays）：[{date, packs:{pinyin:true,...}}]
  function todayEntry() {
    var s = APP.store.get();
    if (!Array.isArray(s.memoryPlays)) s.memoryPlays = [];
    var today = APP.todayStr();
    for (var i = 0; i < s.memoryPlays.length; i++) {
      if (s.memoryPlays[i].date === today) return s.memoryPlays[i];
    }
    var entry = { date: today, packs: {} };
    s.memoryPlays.push(entry);
    return entry;
  }
  function playedToday(pack) {
    return todayEntry().packs[pack] === true;
  }
  function markPlayed(pack, levelKey) {
    var e = todayEntry();
    e.packs[pack] = true;
    if (levelKey) { if (!e.levels) e.levels = {}; e.levels[pack] = levelKey; }
    APP.store.save();
  }

  // 结算档位：按已完成配对比例；奖励数值由所选难度 cfg 决定（拼音走 PY_TIER）。
  function tierFor(done, pairs, cfg) {
    var c = cfg || PY_TIER;
    var r = pairs ? done / pairs : 0;
    if (done >= pairs) return { key: 'full', exp: c.exp, berry: c.berry, shard: true, emoji: '🎉', title: '全部配对成功！' };
    if (r >= 0.75) return { key: 'good', exp: c.good, berry: c.goodBerry, shard: false, emoji: '👍', title: '配对得很棒！' };
    if (r >= 0.375) return { key: 'ok', exp: c.ok, berry: 0, shard: false, emoji: '🙂', title: '有进步哦！' };
    return { key: 'none', exp: 0, berry: 0, shard: false, emoji: '💪', title: '再试一次吧！' };
  }

  // 随机抽 pairs 个词，生成打乱的卡片对：
  // 一对两张卡各显示一面——拼音包「汉字卡 + 拼音卡」，英语包「单词卡 + 中文卡」。
  // 翻到同一个词的两面才算配对成功。
  function buildBoard(pack, levelKey) {
    var def = packDef(pack, levelKey);
    var pool = (pack === 'english') ? pickByLevel(def.words, def.cfg, def.pairs) : def.words.slice();
    var picked = [];
    for (var i = 0; i < def.pairs; i++) {
      if (!pool.length) break;
      var idx = Math.floor(Math.random() * pool.length);
      picked.push(pool.splice(idx, 1)[0]);
    }
    var cards = [];
    for (var j = 0; j < picked.length; j++) {
      var w = picked[j];
      var faceA, kindA, faceB, kindB;
      if (pack === 'english') {
        faceA = w.e; kindA = 'en'; faceB = w.cn; kindB = 'cn';
      } else {
        faceA = w.h; kindA = 'zh'; faceB = w.p; kindB = 'py';
      }
      var hint = (def.cfg.hint && w.i) ? String(w.i) : '';
      cards.push({ id: j * 2, w: w, face: faceA, kind: kindA, hint: '', matched: false });
      cards.push({ id: j * 2 + 1, w: w, face: faceB, kind: kindB, hint: (kindB === 'cn' ? hint : ''), matched: false });
    }
    // Fisher–Yates 洗牌
    for (var k = cards.length - 1; k > 0; k--) {
      var r = Math.floor(Math.random() * (k + 1));
      var t = cards[k]; cards[k] = cards[r]; cards[r] = t;
    }
    return { def: def, cards: cards };
  }

  var session = null; // 当前局
  var rootEl = null;

  // 卡背：小精灵球图案（替代问号，更贴宝可梦主题）
  var POKEBALL_SVG =
    '<svg viewBox="0 0 20 20" aria-hidden="true">' +
      '<circle cx="10" cy="10" r="8" fill="#fff" stroke="#4A3728" stroke-width="1.6"/>' +
      '<path d="M2 10a8 8 0 0 1 16 0Z" fill="#E24B4A"/>' +
      '<path d="M2 10h16" stroke="#4A3728" stroke-width="1.6"/>' +
      '<circle cx="10" cy="10" r="2.4" fill="#fff" stroke="#4A3728" stroke-width="1.6"/>' +
    '</svg>';

  function cardHtml(c, i) {
    return '<div class="mem-card" data-i="' + i + '">' +
      '<div class="mem-card__inner">' +
        '<div class="mem-card__face mem-card__back">' + POKEBALL_SVG + '</div>' +
        '<div class="mem-card__face mem-card__front mem-front--' + c.kind + '">' + esc(c.face) +
          (c.hint ? '<span class="mem-card__hint">' + esc(c.hint) + '</span>' : '') + '</div>' +
      '</div>' +
    '</div>';
  }

  function updateTurnsHud() {
    if (!session) return;
    var n = document.getElementById('memLeft');
    if (n) n.textContent = session.turnsLeft + ' / ' + session.totalTurns;
    var bar = document.getElementById('memBar');
    if (bar) bar.style.width = Math.max(0, session.turnsLeft / session.totalTurns * 100) + '%';
  }

  // v65：每配成 2 对返还 1 次。返还后若此前已耗尽，也要把局面从结算边缘拉回来。
  function grantBonusIfAny() {
    if (!session) return 0;
    var should = bonusFor(session.done);
    var gain = should - session.bonusGiven;
    if (gain <= 0) return 0;
    session.bonusGiven = should;
    session.turnsLeft += gain;
    updateTurnsHud();
    var hint = document.getElementById('memBonus');
    if (hint) {
      hint.textContent = '配成 ' + (should * 2) + ' 对 · 返还 ' + gain + ' 次';
      hint.classList.add('is-on');
      setTimeout(function () { hint.classList.remove('is-on'); }, 1600);
    }
    return gain;
  }

  function startGame(container, pack, levelKey) {
    session = buildBoard(pack, levelKey);
    session.pack = pack;
    session.levelKey = levelKey || '';
    session.shown = [];
    session.busy = false;
    session.flipped = 0;
    session.done = 0;
    session.settled = false;
    session.totalTurns = turnsFor(session.def.pairs);
    session.turnsLeft = session.totalTurns;
    session.bonusGiven = 0; // v65：已发放的返还次数，防止同一档重复返还
    // 每天各玩 1 次：进入时已由选择页拦截，本局必然是当天第一局

    var def = session.def;
    var html =
      '<section class="card mem-top">' +
        '<button type="button" class="mem-back" data-back="1">← 返回</button>' +
        '<div class="mem-top__t">' + def.title + (def.cfg && def.cfg.name ? ' · ' + def.cfg.name : '') +
          ' <span class="mem-top__sub">' + def.sub + '</span></div>' +
        '<div class="mem-steps">已配对 <b id="memDone">0</b> / ' + def.pairs + '</div>' +
      '</section>' +
      '<section class="card mem-turns">' +
        '<div class="mem-turns__row"><span>剩余翻牌次数 <em id="memBonus" class="mem-bonus"></em></span><b id="memLeft">' +
          session.turnsLeft + ' / ' + session.totalTurns + '</b></div>' +
        '<div class="mem-bar"><i id="memBar" style="width:100%"></i></div>' +
      '</section>' +
      '<section class="card mem-board" id="memBoard" style="--cols:' + def.cols + '">' +
        (function () { var s = ''; for (var i = 0; i < session.cards.length; i++) s += cardHtml(session.cards[i], i); return s; })() +
      '</section>';

    container.innerHTML = html;
    rootEl = container;

    var board = document.getElementById('memBoard');
    var cards = board.querySelectorAll('.mem-card');
    for (var j = 0; j < cards.length; j++) {
      cards[j].addEventListener('click', onCardClick);
    }
    var back = container.querySelector('[data-back]');
    if (back) back.addEventListener('click', function () { renderChooser(rootEl); });
  }

  function onCardClick(e) {
    if (!session || session.busy || session.settled || session.turnsLeft <= 0) return;
    var cardEl = e.currentTarget;
    var i = parseInt(cardEl.getAttribute('data-i'), 10);
    var c = session.cards[i];
    if (c.matched || cardEl.classList.contains('is-flipped')) return;

    // 翻一张扣 1 次（翻错也扣）
    cardEl.classList.add('is-flipped');
    session.flipped++;
    session.turnsLeft--;
    updateTurnsHud();

    if (session.flipped === 2) {
      session.busy = true;
      var a = session.shown[0], b = i;
      var ca = session.cards[a], cb = session.cards[b];
      if (ca.w === cb.w) {
        // 配对成功
        ca.matched = cb.matched = true;
        session.done++;
        setTimeout(function () {
          markMatchedPair(a, b);
          var d = document.getElementById('memDone');
          if (d) d.textContent = session.done;
          session.busy = false;
          session.flipped = 0; session.shown = [];
          // v65：先返还次数，再判断是否结算——最后一张恰好配成时也要吃到返还
          grantBonusIfAny();
          if (session.done >= session.def.pairs) settle();
          else if (session.turnsLeft <= 0) settle();
        }, 380);
      } else {
        // 翻错，稍后翻回；次数已经扣掉
        setTimeout(function () {
          session.shown.forEach(function (idx) {
            var el = cardElOf(idx);
            if (el) el.classList.remove('is-flipped');
          });
          cardEl.classList.remove('is-flipped');
          session.busy = false;
          session.flipped = 0; session.shown = [];
          if (session.turnsLeft <= 0) settle();
        }, 900);
      }
    } else {
      session.shown.push(i);
      // 最后 1 次只够翻一张：让玩家看到这张牌，再结算
      if (session.turnsLeft <= 0) {
        session.busy = true;
        setTimeout(function () { settle(); }, 600);
      }
    }
  }

  function cardElOf(i) {
    var board = document.getElementById('memBoard');
    if (!board) return null;
    return board.querySelector('.mem-card[data-i="' + i + '"]');
  }
  function markMatchedPair(a, b) {
    var ea = cardElOf(a), eb = cardElOf(b);
    if (ea) ea.classList.add('is-matched');
    if (eb) eb.classList.add('is-matched');
  }

  // 结算：按所选难度的奖励表发放；每天各玩 1 次，打完只回选择页。
  function settle() {
    if (!session || session.settled) return;
    session.settled = true;
    session.busy = true;
    var cfg = session.def.cfg;
    var tier = tierFor(session.done, session.def.pairs, cfg);
    var shardHit = false;

    if (tier.exp) APP.store.addExp(tier.exp,
      '记忆翻牌·' + session.def.title + (cfg.name ? '·' + cfg.name : ''));
    if (tier.berry) {
      var s = APP.store.get();
      if (s.wallet) s.wallet.berries = APP.clamp(s.wallet.berries + tier.berry, 0, 30);
    }
    if (tier.shard) {
      shardHit = Math.random() < cfg.shard;
      if (shardHit) APP.store.addShards(1, '翻牌');
    }
    APP.store.pushCare({
      t: 'play', title: session.def.title + (cfg.name ? '·' + cfg.name : ''),
      exp: tier.exp, berry: tier.berry, shard: shardHit ? 1 : 0,
      done: session.done, pairs: session.def.pairs
    });
    markPlayed(session.pack, session.levelKey);
    APP.store.save();

    var reward = tier.exp
      ? '+' + tier.exp + ' 经验' + (tier.berry ? ' · +' + tier.berry + ' 果实' : '') +
        (shardHit ? ' · +1 碎片' : '')
      : '没有奖励，明天继续加油～';

    var el = document.getElementById('memBoard');
    if (el) {
      // 第 7 轮：棋盘是 4 列 grid，结算块必须整块跨列，否则会被挤成左侧竖条
      el.classList.add('is-win');
      el.innerHTML =
        '<div class="mem-win">' +
          '<div class="mem-win__emoji">' + tier.emoji + '</div>' +
          '<h3>' + tier.title + '</h3>' +
          '<p>已配对 ' + session.done + ' / ' + session.def.pairs + ' 对' +
            (cfg.name ? ' · ' + cfg.name : '') + '</p>' +
          '<p>' + reward + '</p>' +
          '<div class="mem-win__row">' +
            '<button type="button" class="btn btn--primary" data-back="1">返回选择</button>' +
          '</div>' +
        '</div>';
      el.querySelector('[data-back]').addEventListener('click', function () { renderChooser(rootEl); });
    }
  }

  // v64：红框里的 4 条说明整理成「玩法规则」，从 chips 挪到玩耍标题旁的规则弹窗。
  // 次数由 turnsFor() 现算，后续调整次数方案时规则文案自动同步。
  function rulesHtml() {
    return '' +
      '<div class="mem-rules__li"><b>每天各玩 1 次</b>：拼音包、英语包各自独立，次日刷新；选难度不消耗次数，中途退出不算玩过。</div>' +
      '<div class="mem-rules__li"><b>翻牌次数</b>：次数 = 卡数 × 2 · 翻一张扣 1 次。' +
        '拼音 ' + (6 * 2) + ' 张 / ' + turnsFor(6) + ' 次，英语 ' + (8 * 2) + ' 张 / ' + turnsFor(8) + ' 次。<br>' +
        '<b>配对返还</b>：每成功配对 2 对，额外返还 1 次翻牌机会（拼音最多 +3，英语最多 +4）。</div>' +
      '<div class="mem-rules__li"><b>配对方式</b>：翻开两张同一个词的两面（汉字↔拼音 / 单词↔中文）即可配对，翻错会扣次数但牌会翻回去。</div>' +
      '<div class="mem-rules__li"><b>英语难度</b>：进局前选简单 / 中等 / 困难，三档都是 8 对 16 张 / 32 次，只按词库星级 1~5 的占比换词。' +
        '<div class="mem-rules__tier">简单：★1 60% · ★2 30% · ★3 10%（中文卡带图提示）→ 全配对 +3 经验 · +1 果实 · 25% 碎片</div>' +
        '<div class="mem-rules__tier">中等：★2 60% · ★3 30% · ★4 10% → +5 经验 · +1 果实 · 45% 碎片</div>' +
        '<div class="mem-rules__tier">困难：★3 60% · ★4 30% · ★5 10% → +8 经验 · +2 果实 · 65% 碎片</div>' +
        '<div class="mem-rules__tier">某星级词不够时自动从相邻星级补齐；想加难词可在家长后台上传自定义题库（难度 4~5）。</div>' +
      '</div>' +
      '<div class="mem-rules__li"><b>按进度给奖</b>：全部配对发满额；≥75% 发中等档；≥37.5% 发少量经验；未达标只有鼓励语。' +
        '英语各档数值见上，拼音按中等档发放。</div>' +
      '<div class="mem-rules__li">当天奖励只发一次，打完返回选择页，明天再来。</div>';
  }

  function renderChooser(container) {
    var html =
      '<section class="card mem-hero">' +
        '<div class="mem-hero__t"><span class="mem-hero__ico">🎮</span>玩耍' +
          '<button type="button" class="mem-rules-btn" data-rules="1">ⓘ 规则</button></div>' +
        '<div class="mem-hero__chips">' +
          '<span>每天各玩 1 次</span>' +
          '<span>次数用完按进度给奖</span>' +
        '</div>' +
      '</section>' +
      '<section class="card mem-choose-wrap">' +
        chooserBtn('pinyin') +
        chooserBtn('english') +
      '</section>';
    container.innerHTML = html;
    rootEl = container;
    container.querySelector('[data-pack="pinyin"]').addEventListener('click', function () {
      if (playedToday('pinyin')) return promptDone(container, '拼音包');
      startGame(container, 'pinyin');
    });
    container.querySelector('[data-pack="english"]').addEventListener('click', function () {
      if (playedToday('english')) return promptDone(container, '英语包');
      renderLevelChooser(container);
    });
  }

  // 英语难度选择：三档棋盘与次数完全相同，只按词库星级占比换词
  function renderLevelChooser(container) {
    var html = '<section class="card mem-hero">' +
        '<div class="mem-hero__t"><span class="mem-hero__ico">🎮</span>英语翻牌 · 选难度' +
          '<button type="button" class="mem-rules-btn" data-rules="1">ⓘ 规则</button></div>' +
        '<div class="mem-hero__chips"><span>每天 1 次</span><span>三档都是 8 对 / 16 张 / 32 次</span></div>' +
      '</section><section class="card mem-levels">';
    for (var i = 0; i < EN_LEVELS.length; i++) {
      var c = EN_LEVELS[i];
      html += '<button type="button" class="btn btn--block mem-level' + (c.def ? ' is-def' : '') + '" data-level="' + c.key + '">' +
        '<span class="mem-level__ico mem-level__ico--' + c.key + '">' + c.name.charAt(0) + '</span>' +
        '<span class="mem-level__txt">' +
          '<span class="mem-level__t">' + c.name + (c.def ? ' <em>默认</em>' : '') + '</span>' +
          '<span class="mem-level__s">' + c.desc + (c.hint ? ' · 中文卡带图提示' : '') + '</span>' +
          '<span class="mem-level__r">全配对 ' + c.reward + '</span>' +
        '</span>' +
        '<span class="mem-level__go">点我开始 →</span>' +
      '</button>';
    }
    html += '<button type="button" class="btn btn--block mem-level__back" data-back="1">← 返回</button></section>';
    container.innerHTML = html;
    rootEl = container;
    var bs = container.querySelectorAll('[data-level]');
    for (var j = 0; j < bs.length; j++) {
      (function (b) {
        b.addEventListener('click', function () { startGame(container, 'english', b.getAttribute('data-level')); });
      })(bs[j]);
    }
    container.querySelector('[data-back]').addEventListener('click', function () { renderChooser(container); });
  }

  // 第 7 轮：两个入口改卡片式（图标 + 标题 + 说明 + 状态），标题统一「记忆翻牌-拼音 / -英语」
  function chooserBtn(pack) {
    var def = packDef(pack);
    var done = playedToday(pack);
    var rows = Math.ceil(def.pairs * 2 / def.cols);
    return '<button type="button" class="btn btn--block mem-choose' + (done ? ' is-done' : '') + '" data-pack="' + pack + '">' +
      '<span class="mem-choose__ico mem-choose__ico--' + pack + '">' + (pack === 'pinyin' ? '拼' : 'AB') + '</span>' +
      '<span class="mem-choose__txt">' +
        '<span class="mem-choose__t">' + def.label + '</span>' +
        '<span class="mem-choose__s">' + rows + ' × ' + def.cols + ' · ' + def.sub + ' · ' +
          (def.pairs * 2) + ' 张 / ' + turnsFor(def.pairs) + ' 次</span>' +
      '</span>' +
      '<span class="mem-choose__state' + (done ? ' is-done' : '') + '">' +
        (done ? '今天已玩 ✓' : (pack === 'english' ? '选难度 →' : '点我开始 →')) + '</span>' +
      '</button>';
  }

  // 今天已玩过：不再另开一层弹窗（会和游戏弹窗打架），直接在弹窗体内换页
  function promptDone(container, name) {
    container.innerHTML =
      '<div class="mem-done">' +
        '<div class="mem-done__t">' + name + '今天已经玩过啦</div>' +
        '<div class="mem-done__s">明天再来吧～</div>' +
        '<button type="button" class="btn btn--primary" data-back="1">返回</button>' +
      '</div>';
    container.querySelector('[data-back]').addEventListener('click', function () { renderChooser(container); });
  }

  APP.screens.memory = {
    render: function (container) { session = null; renderChooser(container); },
    // 供测试/调试读取结算档位与次数规则
    _tierFor: tierFor,
    _turnsFor: turnsFor,
    _bonusFor: bonusFor,
    _EN_LEVELS: EN_LEVELS,
    _pickByLevel: pickByLevel,
    _wordLevel: wordLevel,
    _levelCfg: levelCfg,
    _session: function () { return session; }
  };

  // —— 玩耍入口：悬浮弹窗直接盖在养成页上玩，不跳页 ——
  var modalEl = null;

  function closeGame() {
    if (!modalEl) return;
    modalEl.innerHTML = '';
    modalEl.onclick = null;
    modalEl.style.display = 'none';
    modalEl = null;
    session = null;
    // 关掉后养成页的果实 / 经验 / 羁绊要跟着更新
    if (APP.refresh) APP.refresh();
  }

  // v64：规则弹窗做在玩耍弹窗「内部」，不复用全局 APP.ui.sheet（同一 #uiOverlay 会互相覆盖）。
  function toggleRules(show) {
    if (!modalEl) return;
    var panel = modalEl.querySelector('#memRules');
    if (panel) panel.style.display = show ? '' : 'none';
  }

  APP.openMemory = function () {
    var el = document.getElementById('uiOverlay');
    if (!el) {
      el = document.createElement('div');
      el.id = 'uiOverlay';
      el.className = 'ui-overlay';
      document.body.appendChild(el);
    }
    el.style.display = '';
    el.innerHTML =
      '<div class="ui-overlay__bg"></div>' +
      '<div class="ui-modal ui-modal--game" role="dialog" aria-label="玩耍">' +
        '<button type="button" class="ui-modal__x" data-close="1" aria-label="关闭">×</button>' +
        '<div class="mem-body" id="memBody"></div>' +
        '<div class="mem-rules" id="memRules" style="display:none">' +
          '<div class="mem-rules__bg" data-rules-close="1"></div>' +
          '<div class="mem-rules__card" role="dialog" aria-label="玩法规则">' +
            '<div class="mem-rules__hd">玩法规则' +
              '<button type="button" class="mem-rules__x" data-rules-close="1" aria-label="关闭规则">×</button></div>' +
            '<div class="mem-rules__body">' + rulesHtml() + '</div>' +
            '<button type="button" class="btn btn--primary btn--block mem-rules__ok" data-rules-close="1">知道啦</button>' +
          '</div>' +
        '</div>' +
      '</div>';
    modalEl = el;
    el.onclick = function (e) {
      var t = e.target;
      if (!t.getAttribute) return;
      if (t.getAttribute('data-rules')) { toggleRules(true); return; }
      if (t.getAttribute('data-rules-close')) { toggleRules(false); return; }
      if (t.getAttribute('data-close')) closeGame();
    };
    var body = el.querySelector('#memBody');
    if (body) renderChooser(body);
  };
})(window.APP);
