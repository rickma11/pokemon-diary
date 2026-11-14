window.APP = window.APP || {};

/* 养成页「训练」· V7
   统一外壳：全局 3:00 + 每步 10 秒；四个玩法只实现 init / next / render / pick / timeout。
   动画（反馈 1.2s、出拳 1.4s、井字棋骰子/落子/胜负）期间挂起计时，由外壳统一调度。
   三档奖励：全对「完美」100%、完成 80%「优秀」80%、未达标「加油」50%。
   井字棋单局制：胜 = 完美，平或负 = 加油。
   消耗：体力 −10、饱腹 −10（饱腹 <30 不能训练）；先发经验再扣饱腹，避免被旧规则减半。
   中途退出不扣消耗、不消耗次数、不计奖励。 */
(function (APP) {
  'use strict';

  var STEP_SEC = 10;
  var TOTAL_SEC = 180;
  var FOOD_GATE = 30;
  var COST_FOOD = 10;
  var COST_ENERGY = 10;
  var HOLD_QUIZ = 1200, HOLD_RPS = 1400, HOLD_TIC_AI = 1000, HOLD_TIC_END = 1500, HOLD_DICE = 1200;

  var TIERS = {
    perfect: { name: '完美', exp: 6, mood: 10, shard: 0.45, title: '全对啦，太厉害了！', cls: 'is-perfect' },
    good:    { name: '优秀', exp: 5, mood: 8,  shard: 0.36, title: '达标啦，做得很好！', cls: 'is-good' },
    poor:    { name: '加油', exp: 3, mood: 5,  shard: 0,    title: '这次差一点，下次加油！', cls: 'is-poor' }
  };

  function esc(t) {
    return String(t === undefined || t === null ? '' : t)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }
  function rnd(n) { return Math.floor(Math.random() * n); }
  function shuffle(a) {
    for (var i = a.length - 1; i > 0; i--) {
      var j = rnd(i + 1), t = a[i]; a[i] = a[j]; a[j] = t;
    }
    return a;
  }
  function mmss(n) {
    n = Math.max(0, n | 0);
    var m = Math.floor(n / 60), s = n % 60;
    return m + ':' + (s < 10 ? '0' : '') + s;
  }
  function statOf(k) {
    var p = APP.store.activePokemon();
    return p && p.stats ? p.stats[k] : 0;
  }

  // 二期家长后台自定义题库的合并入口（停用开关在 bank-import.js 里控制）
  function bank(name) {
    var s = APP.store.get(), c = s && s.customBanks;
    if (!c || c.enabled === false) return [];
    var b = c[name];
    return Array.isArray(b) ? b : [];
  }
  function idiomPool() { return (APP.IDIOMS || []).concat(bank('idiom')); }

  function scoreGrade(s) {
    if (s.score >= s.def.steps) return 'perfect';
    if (s.score >= s.def.target) return 'good';
    return 'poor';
  }

  // 每日次数：state.trainingPlays = [{ date, games:{ mul99:true, ... } }]
  function dayEntry(make) {
    var s = APP.store.get();
    if (!Array.isArray(s.trainingPlays)) s.trainingPlays = [];
    var t = APP.todayStr();
    for (var i = 0; i < s.trainingPlays.length; i++) {
      if (s.trainingPlays[i].date === t) return s.trainingPlays[i];
    }
    if (!make) return null;
    var e = { date: t, games: {} };
    s.trainingPlays.push(e);
    if (s.trainingPlays.length > 30) s.trainingPlays.shift();
    return e;
  }
  function playedToday(game) {
    var e = dayEntry(false);
    return !!(e && e.games && e.games[game]);
  }
  function markPlayed(game) {
    var e = dayEntry(true);
    if (!e.games) e.games = {};
    e.games[game] = true;
    APP.store.save();
  }
  function playedCount() {
    var e = dayEntry(false), n = 0;
    if (e && e.games) { for (var k in e.games) if (e.games[k]) n++; }
    return n;
  }

  // ===== 出题：99 乘法表（求积 A / 求乘数 B / 求被乘数 C）=====
  // kind 由一局的配额传入（4/4/4）；不传时随机，供调试与兼容旧调用。
  function makeMulQuestion(kind) {
    if (!kind) {
      var roll = Math.random();
      kind = roll < 0.5 ? 'A' : (roll < 0.85 ? 'B' : 'C');
    }
    var a = 1 + rnd(9), b = 1 + rnd(9), v = a * b;
    var answer, title, cand = [];
    if (kind === 'A') {
      title = a + ' × ' + b + ' = ?';
      answer = v;
      cand = [a * (b + 1), (a + 1) * b, a * (b > 1 ? b - 1 : b + 2),
              (a > 1 ? a - 1 : a + 2) * b, v + a, v + b, v - 1, v + 1];
    } else if (kind === 'B') {
      title = a + ' × ? = ' + v;
      answer = b;
      for (var i = 1; i <= 9; i++) cand.push(i);
    } else {
      title = '? × ' + b + ' = ' + v;
      answer = a;
      for (var j = 1; j <= 9; j++) cand.push(j);
    }
    // 干扰项代回校验：错误选项代入等式后结果必须 != 目标值，且不等于正确答案。
    var seen = {}, wrong = [];
    seen[answer] = true;
    shuffle(cand);
    for (var c = 0; c < cand.length && wrong.length < 3; c++) {
      var x = cand[c];
      if (x <= 0 || seen[x]) continue;
      var recompute = kind === 'A' ? x : (kind === 'B' ? a * x : x * b);
      if (recompute === v || x === answer) continue;
      seen[x] = true;
      wrong.push(x);
    }
    while (wrong.length < 3) {
      var fb = 100 + wrong.length + rnd(50);
      if (!seen[fb]) { seen[fb] = true; wrong.push(fb); }
    }
    var opts = shuffle([String(answer)].concat(wrong.map(String)));
    return {
      title: title, sub: '选出正确的数字', options: opts,
      answer: opts.indexOf(String(answer)), answerText: String(answer), fullWord: ''
    };
  }

  // ===== 出题：成语填空 =====
  // pos 为 0 起索引，由一局的位置配额传入；同一成语可以在不同题里挖不同位。
  function makeIdiomQuestion(pos) {
    var pool = idiomPool(), wordSet = {}, charsAll = [], valid = [], k, j;
    for (k = 0; k < pool.length; k++) {
      var w = String((pool[k] && pool[k].w) || '');
      if (w.length !== 4) continue;
      wordSet[w] = true;
      valid.push(pool[k]);
      for (j = 0; j < 4; j++) charsAll.push(w.charAt(j));
    }
    if (!valid.length) return makeMulQuestion();
    var it = valid[rnd(valid.length)];
    var chars = String(it.w).split('');
    var p = typeof pos === 'number' ? pos : rnd(4);
    var ans = chars[p];
    var seen = {}; seen[ans] = true;
    var cand = (Array.isArray(it.d) ? it.d.slice() : []);
    shuffle(cand);
    shuffle(charsAll);
    for (k = 0; k < charsAll.length; k++) cand.push(charsAll[k]);
    var fallback = ['天', '地', '人', '山', '水', '风', '云', '花', '月', '日', '大', '小', '上', '下', '中', '心'];
    shuffle(fallback);
    for (k = 0; k < fallback.length; k++) cand.push(fallback[k]);
    var wrong = [];
    for (k = 0; k < cand.length && wrong.length < 3; k++) {
      var d = String(cand[k] || '');
      if (d.length !== 1 || seen[d]) continue;
      var t = chars.slice(); t[p] = d;
      if (wordSet[t.join('')]) continue;   // 排除代回后能凑成另一条已收录成语的字
      seen[d] = true;
      wrong.push(d);
    }
    while (wrong.length < 3) wrong.push('〇');
    var opts = shuffle([ans].concat(wrong));
    chars[p] = '○';
    return {
      title: chars.join(' '), sub: '补上缺少的那个字', options: opts,
      answer: opts.indexOf(ans), answerText: ans, fullWord: String(it.w)
    };
  }

  // ===== 答题类（乘法表 / 成语填空共用）=====
  function quizInit(s) {
    s.q = null; s.fb = null;
    // 一局 12 题：乘法表三题型各 4 题；成语四个挖空位各 3 题，顺序都打乱。
    s.kinds = s.game === 'mul99'
      ? shuffle(['A', 'A', 'A', 'A', 'B', 'B', 'B', 'B', 'C', 'C', 'C', 'C'])
      : null;
    s.pos = s.game === 'idiom' ? shuffle([0, 0, 0, 1, 1, 1, 2, 2, 2, 3, 3, 3]) : null;
  }
  function quizNext(s) {
    s.fb = null;
    var n = Math.min(s.step, s.def.steps - 1);
    s.q = s.game === 'mul99' ? makeMulQuestion(s.kinds[n]) : makeIdiomQuestion(s.pos[n]);
  }
  function quizRender(s) {
    var fb = s.fb;
    var big = s.game === 'idiom' ? 'tr-quiz__word' : 'tr-quiz__expr';
    var h = '<div class="tr-quiz__tip">' + esc(s.q.sub) + '</div>' +
      '<div class="' + big + '">' + esc(s.q.title) + '</div><div class="tr-quiz__opts">';
    for (var i = 0; i < s.q.options.length; i++) {
      var cls = 'tr-opt';
      if (fb) {
        if (i === s.q.answer) cls += ' is-right';
        else if (i === fb.chosen) cls += ' is-wrong';
      }
      h += '<button type="button" class="' + cls + '" data-pick="' + i + '"' + (fb ? ' disabled' : '') + '>' +
        esc(s.q.options[i]) + '</button>';
    }
    h += '</div>';
    if (fb) {
      var txt = fb.ok ? '✅ 答对啦！' : (fb.timedOut ? '⏰ 超时啦！' : '❌ 答错了，');
      if (!fb.ok) {
        txt += '正确答案是「' + esc(s.q.answerText) + '」';
        if (s.q.fullWord) txt += '（' + esc(s.q.fullWord) + '）';
      }
      h += '<div class="tr-fb ' + (fb.ok ? 'is-ok' : 'is-no') + '">' + txt + '</div>';
    }
    return h;
  }
  function quizStepLabel(s) {
    var n = s.fb ? s.step : s.step + 1;   // 反馈停留期间仍显示当前题号
    return '第 ' + Math.min(n, s.def.steps) + ' / ' + s.def.steps + ' 题 · 已答对 ' + s.score +
      ' · 达标 ' + s.def.target + ' 题';
  }
  function quizResolve(s, idx, timedOut) {
    var ok = !timedOut && idx === s.q.answer;
    if (ok) s.score++;
    s.step++;
    s.fb = { ok: ok, chosen: idx, timedOut: !!timedOut };
    if (s.step >= s.def.steps) return { end: true, grade: scoreGrade(s), hold: HOLD_QUIZ };
    return { end: false };
  }
  function quizPick(s, idx) { return quizResolve(s, idx, false); }
  function quizTimeout(s) { return quizResolve(s, -1, true); }

  // ===== 剪刀石头布（手型 + 出拳动画）=====
  var RPS = [{ n: '石头', i: '✊' }, { n: '剪刀', i: '✌️' }, { n: '布', i: '🖐️' }];
  function rpsInit(s) { s.lastMsg = ''; s.rps = null; }
  function rpsNext(s) { s.rps = null; }
  function rpsRender(s) {
    if (s.rps) {
      if (s.rps.timeout) {
        return '<div class="tr-quiz__tip">第 ' + s.step + ' 回合</div>' +
          '<div class="tr-duel"><div class="tr-duel__hand is-pop">⏰<span>没来得及出手</span></div></div>' +
          '<div class="tr-fb is-no">⏰ 超时啦！本回合判负</div>';
      }
      var m = RPS[s.rps.mine], f = RPS[s.rps.foe];
      var draw = s.rps.mine === s.rps.foe;
      var meWin = !!s.rps.win, foeWin = !meWin && !draw;
      var out = meWin ? '🎉 这一回合你赢啦！' :
        (draw ? '🤝 平手，再来一回合' : '这回合对手赢了，继续加油！');
      return '<div class="tr-quiz__tip">第 ' + s.step + ' 回合 · 双方出拳</div>' +
        '<div class="tr-duel">' +
          '<div class="tr-duel__hand is-pop' + (meWin ? ' is-win' : '') + '">' + m.i +
            (meWin ? '<b class="tr-duel__win">WIN</b>' : '') +
            '<span>你 · ' + m.n + '</span></div>' +
          '<div class="tr-duel__vs">VS</div>' +
          '<div class="tr-duel__hand is-pop' + (foeWin ? ' is-win' : '') + '">' + f.i +
            (foeWin ? '<b class="tr-duel__win">WIN</b>' : '') +
            '<span>对手 · ' + f.n + '</span></div>' +
        '</div>' +
        '<div class="tr-fb ' + (meWin ? 'is-ok' : 'is-no') + '">' + out + '</div>';
    }
    var h = '<div class="tr-quiz__tip">选一个手势，赢下 ' + s.def.target + ' 个回合就达标</div><div class="tr-rps">';
    for (var i = 0; i < 3; i++) {
      h += '<button type="button" class="tr-hand" data-pick="' + i + '">' +
        '<span class="tr-hand__ico">' + RPS[i].i + '</span><span class="tr-hand__t">' + RPS[i].n + '</span></button>';
    }
    return h + '</div>';
  }
  function rpsStepLabel(s) {
    var n = s.rps ? s.step : s.step + 1;
    return '第 ' + Math.min(n, s.def.steps) + ' / ' + s.def.steps + ' 回合 · 已赢 ' + s.score +
      ' · 达标 ' + s.def.target + ' 胜';
  }
  function rpsResolve(s, idx, timedOut) {
    if (timedOut) {
      s.step++;
      s.rps = { timeout: true };
      s.lastMsg = '';
    } else {
      var foe = rnd(3);
      var win = (idx === 0 && foe === 1) || (idx === 1 && foe === 2) || (idx === 2 && foe === 0);
      if (win) s.score++;
      s.step++;
      s.rps = { mine: idx, foe: foe, win: win };
      s.lastMsg = '';
    }
    if (s.step >= s.def.steps) return { end: true, grade: scoreGrade(s), hold: HOLD_RPS };
    return { end: false };
  }
  function rpsPick(s, idx) { return rpsResolve(s, idx, false); }
  function rpsTimeout(s) { return rpsResolve(s, -1, true); }

  // ===== 井字棋 · 消失规则（1 局 / 摇骰子定先手 / 玩家落子后 1 秒 AI 落子 / 全局 3:00）=====
  var LINES = [[0, 1, 2], [3, 4, 5], [6, 7, 8], [0, 3, 6],
               [1, 4, 7], [2, 5, 8], [0, 4, 8], [2, 4, 6]];
  function lineOf(b, side) {
    for (var i = 0; i < LINES.length; i++) {
      var L = LINES[i];
      if (b[L[0]] === side && b[L[1]] === side && b[L[2]] === side) return L;
    }
    return null;
  }
  function emptyCells(b) {
    var out = [];
    for (var i = 0; i < 9; i++) if (!b[i]) out.push(i);
    return out;
  }
  // 对手：必杀 → 必堵 → 随机（每步基于当前棋盘重算，旧子会消失）
  function aiMove(b) {
    var e = emptyCells(b), i, t;
    for (i = 0; i < e.length; i++) {
      t = b.slice(); t[e[i]] = 'o';
      if (lineOf(t, 'o')) return e[i];
    }
    for (i = 0; i < e.length; i++) {
      t = b.slice(); t[e[i]] = 'x';
      if (lineOf(t, 'x')) return e[i];
    }
    return e[rnd(e.length)];
  }
  function ticInit(s) {
    s.board = [null, null, null, null, null, null, null, null, null];
    s.xq = []; s.oq = []; s.anim = null; s.banner = null;
    s.dice = { rolling: true, first: Math.random() < 0.5 ? 'me' : 'foe' };
    s.lastMsg = '先连成三连线就获胜；每方场上最多留 3 枚，落第 4 枚时最早那枚消失';
  }
  function ticNext(s) { s.anim = null; s.banner = null; }
  function ticRender(s) {
    var a = s.anim || {}, line = a.line || null;
    var h = '<div class="tr-quiz__tip">你执 × · 对手执 ○ · ' +
      (s.dice && !s.dice.rolling && s.dice.first === 'foe' ? '对手先手 · ' : '你先手 · ') +
      '每子 10 秒</div><div class="tr-ttt">';
    for (var i = 0; i < 9; i++) {
      var v = s.board[i];
      var cls = 'tr-cell' + (v ? ' is-taken' : '') +
        (a.last === i ? ' is-new' : '') + (a.fade === i ? ' is-fade' : '') +
        (line && line.indexOf(i) >= 0 ? ' is-line' : '');
      // 被移除的旧子仍短暂显示，配合淡出动画，避免棋盘突然变样
      var mark = v === 'x' ? '×' : (v === 'o' ? '○' : (a.fade === i ? (a.fadeMark === 'o' ? '○' : '×') : ''));
      h += '<button type="button" class="' + cls + '" data-pick="' + i + '">' + mark + '</button>';
    }
    h += '</div>';
    if (s.banner) h += '<div class="tr-fb ' + (s.banner.ok ? 'is-ok' : 'is-no') + '">' + esc(s.banner.text) + '</div>';
    return h;
  }
  function ticStepLabel(s) {
    return '第 ' + (s.step + 1) + ' 手 · 1 局定胜负 · ' +
      (s.dice && !s.dice.rolling ? (s.dice.first === 'me' ? '你先手' : '对手先手') : '摇骰子中');
  }
  function ticPick(s, idx) {
    if (s.board[idx]) return { ignore: true };
    s.board[idx] = 'x'; s.xq.push(idx); s.step++;
    // 先判本次落子是否连成三连线，再移除自己最早那枚（第 4 枚刚好连线仍算赢）
    var xWin = lineOf(s.board, 'x');
    s.anim = { last: idx, fade: null, line: xWin };
    if (s.xq.length > 3) {
      var oldX = s.xq.shift(); s.board[oldX] = null;
      s.anim.fade = oldX; s.anim.fadeMark = 'x';
    }
    if (xWin) {
      s.banner = { ok: true, text: '🎉 连成三连线，这局你赢啦！' };
      return { end: true, grade: 'perfect', result: 'win', hold: HOLD_TIC_END,
               msg: '🎉 连成三连线，这局你赢啦！' };
    }
    if (!emptyCells(s.board).length) {
      s.banner = { ok: false, text: '🤝 棋盘满了，本局打平' };
      return { end: true, grade: 'poor', result: 'draw', hold: HOLD_TIC_END, msg: '棋盘满了，本局打平' };
    }
    s.lastMsg = '你落在第 ' + (idx + 1) + ' 格，对手想一想…';
    return { chain: HOLD_TIC_AI };
  }
  // 玩家落子 1 秒后由外壳调用：对手落子 + 胜负判定
  function ticAfter(s) {
    var move = aiMove(s.board);
    s.board[move] = 'o'; s.oq.push(move);
    var oWin = lineOf(s.board, 'o');
    s.anim = { last: move, fade: null, line: oWin };
    if (s.oq.length > 3) {
      var oldO = s.oq.shift(); s.board[oldO] = null;
      s.anim.fade = oldO; s.anim.fadeMark = 'o';
    }
    if (oWin) {
      s.banner = { ok: false, text: '对手连成三连线，这局输了，下次加油！' };
      return { end: true, grade: 'poor', result: 'lose', hold: HOLD_TIC_END,
               msg: '对手连成三连线，这局输了，下次加油！' };
    }
    s.lastMsg = '对手落在第 ' + (move + 1) + ' 格，轮到你啦';
    return { end: false };
  }
  function ticTimeout(s) {
    s.banner = { ok: false, text: '⏰ 10 秒内没有落子，本局打平' };
    return { end: true, grade: 'poor', result: 'draw', hold: HOLD_TIC_END,
             msg: '⏰ 10 秒内没有落子，本局打平' };
  }
  // 对手先手时开局先落一子（骰子动画结束后调用）
  function ticAiFirst(s) {
    var move = aiMove(s.board);
    s.board[move] = 'o'; s.oq.push(move);
    s.anim = { last: move, fade: null, line: null };
    s.lastMsg = '对手先落一子，轮到你啦';
  }

  var GAMES = {
    mul99: { key: 'mul99', label: '99 乘法表', desc: '12 题 · 三种题型各 4 题', badge: '×', color: '#BA7517',
             steps: 12, target: 10, hold: HOLD_QUIZ, init: quizInit, next: quizNext, render: quizRender,
             pick: quizPick, timeout: quizTimeout, stepLabel: quizStepLabel },
    idiom: { key: 'idiom', label: '成语填空', desc: '12 题 · 四个位置轮流挖', badge: '成', color: '#993C1D',
             steps: 12, target: 10, hold: HOLD_QUIZ, init: quizInit, next: quizNext, render: quizRender,
             pick: quizPick, timeout: quizTimeout, stepLabel: quizStepLabel },
    tic:   { key: 'tic', label: '井字棋', desc: '1 局定胜负 · 摇骰子定先手', badge: '井', color: '#378ADD',
             steps: 0, target: 1, hold: 0, init: ticInit, next: ticNext, render: ticRender,
             pick: ticPick, timeout: ticTimeout, stepLabel: ticStepLabel, after: ticAfter },
    rps:   { key: 'rps', label: '剪刀石头布', desc: '10 回合 · 手型出拳', badge: '猜', color: '#1D9E75',
             steps: 10, target: 8, hold: HOLD_RPS, init: rpsInit, next: rpsNext, render: rpsRender,
             pick: rpsPick, timeout: rpsTimeout, stepLabel: rpsStepLabel }
  };
  var ORDER = ['mul99', 'idiom', 'tic', 'rps'];

  var modalEl = null, bodyEl = null, session = null, tickTimer = null, notice = '';
  var animTimers = [];

  function clearTimer() { if (tickTimer) { clearInterval(tickTimer); tickTimer = null; } }
  function clearAnim() {
    for (var i = 0; i < animTimers.length; i++) clearTimeout(animTimers[i]);
    animTimers = [];
  }
  function later(ms, fn) {
    var t = setTimeout(function () {
      for (var i = 0; i < animTimers.length; i++) if (animTimers[i] === t) { animTimers.splice(i, 1); break; }
      if (session && !session.finished) fn();
    }, ms);
    animTimers.push(t);
  }
  function pause() { if (session) session.paused = true; }
  function resume() { if (session) { session.paused = false; session.stepLeft = STEP_SEC; } }
  function closeGame() {
    clearTimer(); clearAnim();
    session = null;
    if (modalEl) { modalEl.innerHTML = ''; modalEl.onclick = null; modalEl.style.display = 'none'; modalEl = null; }
    if (APP.refresh) APP.refresh();
  }

  // ===== 训练中心 =====
  function renderChooser() {
    var food = statOf('food');
    var canGo = food >= FOOD_GATE;
    var h =
      '<section class="card tr-hero">' +
        '<div class="tr-hero__hd"><div><div class="tr-hero__t">💪 训练中心</div>' +
          '<div class="tr-hero__s">每节课约 3 分钟 · 每个玩法每天各 1 次</div></div>' +
          '<span class="tr-hero__count">今日 ' + playedCount() + ' / 4</span></div>' +
        '<div class="tr-cost">参与消耗　体力 −10 · 饱腹 −10<br>' +
          '全对「完美」+6 经验 +10 心情 · 45% 概率 +1 碎片<br>' +
          '达标「优秀」+5 经验 +8 心情 · 36% 概率 +1 碎片<br>' +
          '未达标「加油」+3 经验 +5 心情 · 无碎片</div>' +
        (canGo ? '<div class="tr-gate is-ok">饱腹 ' + food + ' · 可以开始训练</div>'
               : '<div class="tr-gate is-no">饱腹 ' + food + ' 低于 30，先喂点东西再来吧</div>') +
        (notice ? '<div class="tr-notice">' + esc(notice) + '</div>' : '') +
      '</section>' +
      '<section class="tr-grid">';
    for (var i = 0; i < ORDER.length; i++) {
      var d = GAMES[ORDER[i]], done = playedToday(d.key);
      h += '<button type="button" class="tr-choose' + (done ? ' is-done' : '') + '" data-game="' + d.key + '">' +
        '<span class="tr-choose__ico" style="background:' + d.color + '">' + d.badge + '</span>' +
        '<span class="tr-choose__t">' + d.label + '</span>' +
        '<span class="tr-choose__s">' + d.desc + '</span>' +
        '<span class="tr-choose__go">' + (done ? '今天已练 ✓' : '点我开始 →') + '</span>' +
      '</button>';
    }
    h += '</section>' +
      '<details class="tr-rules"><summary>玩法规则</summary>' +
        '<div>· 全局 3 分钟，每步（每题 / 每子 / 每回合）限时 10 秒；动画播放时计时暂停。</div>' +
        '<div>· 完成 100%（全对）→「完美」档：100% 奖励；完成 80% →「优秀」档：80% 奖励；未达标 →「加油」档：50% 奖励。</div>' +
        '<div>· 12 题里答对 10 题、10 回合里赢 8 回合即为达标；全对 / 全胜才拿满额奖励。</div>' +
        '<div>· 井字棋 1 局定胜负：开局摇骰子定先手，获胜 = 完美档，输或打平 = 加油档；每方场上最多 3 枚，落第 4 枚时自己最早那枚消失。</div>' +
        '<div>· 答题类超时判该题错并自动进下一题；剪刀石头布超时判该回合负；井字棋超时或 3 分钟到 → 打平。</div>' +
        '<div>· 中途退出不扣体力、饱腹，也不消耗今日次数，且不计奖励。</div>' +
        '<div>· 👑 元气满满：三维同时 ≥90 时，训练经验额外 +10%（可与各档叠加）。</div>' +
        '<div>· 饱腹低于 30 不能训练；消耗在结算时扣，训练后记得喂食。</div>' +
      '</details>' +
      '<div class="tr-foot"><button type="button" class="btn btn--block" data-close="1">关闭</button></div>';
    bodyEl.innerHTML = h;
    notice = '';
  }

  function canStart(game) {
    var p = APP.store.activePokemon();
    if (!p) return '还没有主力宝可梦，去家长后台添加一只吧';
    if (!p.stats) p.stats = { food: 80, mood: 80, energy: 80 };
    if (p.stats.food < FOOD_GATE) return '饱腹感低于 30，先喂点东西再来训练吧～';
    if (playedToday(game)) return '今天这个玩法已经练过啦，明天再来～';
    return '';
  }

  function startGame(game) {
    var def = GAMES[game];
    if (!def) return;
    var why = canStart(game);
    if (why) { notice = why; renderChooser(); return; }
    clearTimer(); clearAnim();
    session = {
      game: game, def: def, step: 0, score: 0, q: null,
      stepLeft: STEP_SEC, totalLeft: TOTAL_SEC, finished: false, paused: false,
      lastMsg: '', board: null, xq: null, oq: null, anim: null, dice: null
    };
    def.init(session);
    renderShell();
    if (game === 'tic') {
      renderDice();
      pause();
      updateHud();
      later(HOLD_DICE, function () {
        session.dice.rolling = false;
        session.lastMsg = session.dice.first === 'me' ? '🎲 你先下！' : '🎲 对手先下！';
        if (session.dice.first === 'foe') {
          ticAiFirst(session);
          renderPlay();
          later(600, function () { resume(); renderPlay(); updateHud(); });
        } else {
          resume(); renderPlay(); updateHud();
        }
      });
    } else {
      nextStep();
    }
    tickTimer = setInterval(tick, 1000);
  }

  function renderShell() {
    bodyEl.innerHTML =
      '<section class="card tr-hud">' +
        '<div class="tr-hud__row tr-hud__row--head">' +
          '<span class="tr-hud__name">' + session.def.label + '</span>' +
          '<span class="tr-hud__clock" id="trClock">' + mmss(session.totalLeft) + '</span></div>' +
        '<div class="tr-hud__step" id="trStep"></div>' +
        '<div class="tr-stepbar"><i id="trStepBar"></i></div>' +
        '<div class="tr-hud__row tr-hud__row--sub"><span id="trStepSec">本步 10 秒</span>' +
          '<span>体力 ' + statOf('energy') + ' · 饱腹 ' + statOf('food') + ' · 心情 ' + statOf('mood') + '</span></div>' +
      '</section>' +
      '<section class="card tr-play" id="trPlay"></section>' +
      '<div class="tr-feedback" id="trFeedback"></div>';
    updateHud();
  }

  function renderDice() {
    var el = document.getElementById('trPlay');
    if (!el || !session.dice) return;
    var d = session.dice;
    el.innerHTML = '<div class="tr-dice">' +
      '<div class="tr-dice__box ' + (d.rolling ? 'is-rolling' : 'is-stop') + '">' +
        (d.rolling ? '⚄' : (d.first === 'me' ? '⚅' : '⚀')) + '</div>' +
      '<div class="tr-dice__t">' + (d.rolling ? '摇骰子决定谁先下…' :
        (d.first === 'me' ? '🎲 点数大，你先下！' : '🎲 对手点数大，对手先下！')) + '</div>' +
      '<div class="tr-dice__s">你执 × · 对手执 ○ · 先连成三连线者获胜</div>' +
    '</div>';
  }

  function nextStep() {
    if (!session || session.finished) return;
    session.stepLeft = STEP_SEC;
    session.def.next(session);
    renderPlay();
    updateHud();
  }

  function renderPlay() {
    var el = document.getElementById('trPlay');
    if (el) el.innerHTML = session.def.render(session);
    var fb = document.getElementById('trFeedback');
    if (fb) fb.innerHTML = session.lastMsg ? esc(session.lastMsg) : '';
  }

  function updateHud() {
    var c = document.getElementById('trClock');
    var st = document.getElementById('trStep');
    var bar = document.getElementById('trStepBar');
    var sec = document.getElementById('trStepSec');
    if (c) c.textContent = mmss(session.totalLeft);
    if (st) st.textContent = session.def.stepLabel(session);
    if (bar) {
      bar.style.width = Math.max(0, session.stepLeft / STEP_SEC * 100) + '%';
      bar.className = session.stepLeft <= 3 ? 'is-urgent' : '';
    }
    if (sec) {
      sec.textContent = session.paused ? '动画中 · 计时暂停' : '本步 ' + session.stepLeft + ' 秒';
      sec.className = !session.paused && session.stepLeft <= 3 ? 'is-urgent' : '';
    }
  }

  // 统一的「一次结果 → 动画停留 → 下一步 / 结算」调度
  function handleResult(r) {
    if (!r || r.ignore) return;
    if (r.msg) session.lastMsg = r.msg;
    if (r.chain) {
      pause(); renderPlay(); updateHud();
      later(r.chain, function () {
        var r2 = session.def.after(session);
        if (r2.msg) session.lastMsg = r2.msg;
        renderPlay(); updateHud();
        if (r2.end) {
          later(r2.hold || HOLD_TIC_END, function () { finish(r2.grade, r2); });
        } else {
          resume(); updateHud();
        }
      });
      return;
    }
    pause();
    renderPlay();
    updateHud();
    later(r.end ? (r.hold || 0) : (session.def.hold || HOLD_QUIZ), function () {
      if (r.end) { finish(r.grade || 'poor', r); return; }
      resume();
      nextStep();
    });
  }

  function onPick(v) {
    if (!session || session.finished || session.paused) return;
    handleResult(session.def.pick(session, v));
  }

  function tick() {
    if (!session || session.finished || session.paused) return;
    session.totalLeft--;
    session.stepLeft--;
    if (session.totalLeft <= 0) {
      var res = session.game === 'tic' ? 'poor' : scoreGrade(session);
      session.lastMsg = '⏰ 3 分钟到，训练结束';
      finish(res, { result: 'draw' });
      return;
    }
    if (session.stepLeft <= 0) {
      handleResult(session.def.timeout(session));
      return;
    }
    updateHud();
  }

  // 结算：先发经验（饱腹仍 ≥30，不触发减半），再扣消耗，最后记羁绊与次数。
  function finish(grade, r) {
    if (!session || session.finished) return;
    session.finished = true;
    clearTimer(); clearAnim();
    var t = TIERS[grade] || TIERS.poor;
    var shardHit = false;
    var p = APP.store.activePokemon();
    if (p) APP.store.checkPerfect(p);           // 按扣之前的三维判定元气满满
    var gotExp = APP.store.addExp(t.exp, '训练·' + session.def.label);
    if (t.shard > 0) {
      shardHit = Math.random() < t.shard;
      if (shardHit) APP.store.addShards(1, '训练');
    }
    p = APP.store.activePokemon();
    if (p) {
      if (!p.stats) p.stats = { food: 80, mood: 80, energy: 80 };
      p.stats.food = APP.clamp(p.stats.food - COST_FOOD, 0, 100);
      p.stats.energy = APP.clamp(p.stats.energy - COST_ENERGY, 0, 100);
      p.stats.mood = APP.clamp(p.stats.mood + t.mood, 0, 100);
      APP.store.markBonded('training');
    }
    APP.store.pushCare({
      t: 'train', game: session.def.label, grade: t.name,
      exp: gotExp, mood: t.mood, shard: shardHit ? 1 : 0,
      score: session.score, steps: session.def.steps
    });
    markPlayed(session.game);
    APP.store.save();
    if (APP.refresh) APP.refresh();
    renderResult(grade, { exp: gotExp, mood: t.mood, shardHit: shardHit,
                          score: session.score, result: (r && r.result) || '' });
  }

  function renderResult(grade, info) {
    var t = TIERS[grade] || TIERS.poor;
    var detail;
    if (session.game === 'tic') {
      detail = grade === 'perfect' ? '你连成三连线，赢下这局' :
        (info.result === 'draw' ? '本局打平' : '对手连成三连线，这局输了');
    } else if (session.game === 'rps') {
      detail = '赢 ' + info.score + ' / ' + session.def.steps + ' 回合';
    } else {
      detail = '答对 ' + info.score + ' / ' + session.def.steps + ' 题';
    }
    var h =
      '<section class="card tr-result">' +
        '<div class="tr-result__hd">' +
          '<span class="tr-badge ' + t.cls + '">' + t.name + '</span>' +
          '<div><h3 class="tr-result__t">' + t.title + '</h3>' +
            '<p class="tr-result__s">' + session.def.label + ' · ' + detail + '</p></div>' +
        '</div>' +
        '<div class="tr-result__li"><span>经验</span><b>+' + info.exp + '</b></div>' +
        '<div class="tr-result__li"><span>心情</span><b>+' + info.mood + '</b></div>' +
        '<div class="tr-result__li"><span>碎片</span><b>' + (info.shardHit ? '+1 命中' : '—') + '</b></div>' +
        '<div class="tr-result__li"><span>羁绊</span><b>今日陪伴 ✓</b></div>' +
        '<div class="tr-result__cost">已消耗　体力 −' + COST_ENERGY + ' · 饱腹 −' + COST_FOOD + '</div>' +
        '<div class="tr-result__btns">' +
          '<button type="button" class="btn btn--primary" data-back="1">返回选择</button>' +
          '<button type="button" class="btn" data-close="1">关闭</button>' +
        '</div>' +
      '</section>';
    bodyEl.innerHTML = h;
    session = null;
  }

  function dataOf(node, name) {
    while (node && node !== modalEl) {
      if (node.getAttribute && node.getAttribute(name) !== null) return node.getAttribute(name);
      node = node.parentNode;
    }
    return null;
  }

  // ===== 入口：养成页「训练」按钮直接开悬浮弹窗，不跳路由 =====
  APP.openTraining = function () {
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
      '<div class="ui-modal ui-modal--game tr-modal" role="dialog" aria-label="训练">' +
        '<button type="button" class="ui-modal__x" data-close="1" aria-label="关闭">×</button>' +
        '<div id="trBody"></div>' +
      '</div>';
    modalEl = el;
    bodyEl = el.querySelector('#trBody');
    clearTimer(); clearAnim();
    session = null;
    notice = '';
    el.onclick = function (e) {
      var t = e.target;
      if (dataOf(t, 'data-close') !== null) { closeGame(); return; }
      if (dataOf(t, 'data-back') !== null) {
        clearTimer(); clearAnim(); session = null; renderChooser(); return;
      }
      var g = dataOf(t, 'data-game');
      if (g) { startGame(g); return; }
      var pick = dataOf(t, 'data-pick');
      if (pick !== null) onPick(parseInt(pick, 10));
    };
    renderChooser();
  };

  // 调试/测试用
  APP.trainingDebug = {
    games: GAMES, TIERS: TIERS, scoreGrade: scoreGrade, current: function () { return session; },
    makeMulQuestion: makeMulQuestion, makeIdiomQuestion: makeIdiomQuestion,
    quizInit: quizInit, quizNext: quizNext, quizRender: quizRender,
    rpsRender: rpsRender, ticRender: ticRender
  };
})(window.APP);
