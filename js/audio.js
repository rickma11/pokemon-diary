window.APP = window.APP || {};

(function (APP) {
  'use strict';

  // 音频模块：升级 / 进化 / 连击庆祝时使用。
  // 方案 B（真实叫声）优先；文件缺失或加载失败回退方案 A（WebAudio 合成）。
  // 墨水屏（body.ink）下完全不播，省电防残影。
  // 浏览器自动播放策略：AudioContext 需在用户首次交互后才能出声，这里在首次
  // pointerdown/keydown/touchstart 时解锁。

  var AC = null;

  function ac() {
    if (!AC) {
      try { AC = new (window.AudioContext || window.webkitAudioContext)(); }
      catch (e) { AC = null; }
    }
    if (AC && AC.state === 'suspended') { AC.resume(); }
    return AC;
  }

  function isInk() {
    return document.body.classList.contains('ink');
  }

  // 声音总开关：settings.soundOn=false 时完全静音（墨水屏下也恒静音，由 isInk 处理）
  function soundOn() {
    try {
      var s = APP.store && APP.store.settings && APP.store.settings();
      return !s || s.soundOn !== false;
    } catch (e) { return true; }
  }

  // 首次交互解锁音频上下文（绕过自动播放限制）
  function unlock() { var c = ac(); if (c && c.state === 'suspended') c.resume(); }
  ['pointerdown', 'keydown', 'touchstart'].forEach(function (ev) {
    window.addEventListener(ev, unlock, { passive: true });
  });

  // ===== 方案 A：WebAudio 合成（零文件，忠实复刻参考项目）=====
  function beep(f, d, type, vol) {
    var c = ac();
    if (!c) return;
    var o = c.createOscillator(), g = c.createGain();
    o.type = type || 'sine';
    o.frequency.value = f;
    var t = c.currentTime;
    g.gain.setValueAtTime(vol || 0.13, t);
    g.gain.exponentialRampToValueAtTime(0.0008, t + d);
    o.connect(g); g.connect(c.destination);
    o.start(t); o.stop(t + d);
  }
  var A = {
    click: function () { if (!soundOn()) return; beep(660, 0.07, 'triangle', 0.08); },
    ok: function () {
      if (!soundOn()) return;
      beep(660, 0.10, 'triangle', 0.12);
      setTimeout(function () { beep(880, 0.14, 'triangle', 0.12); }, 90);
    },
    level: function () {
      if (!soundOn()) return;
      [523, 659, 784, 1047].forEach(function (f, i) {
        setTimeout(function () { beep(f, 0.16, 'triangle', 0.13); }, i * 110);
      });
    },
    evo: function () {
      if (!soundOn()) return;
      [392, 523, 659, 784, 1047, 1319].forEach(function (f, i) {
        setTimeout(function () { beep(f, 0.13, 'sine', 0.12); }, i * 95);
      });
    },
    catch: function () {
      if (!soundOn()) return;
      [660, 880, 1047, 1319].forEach(function (f, i) {
        setTimeout(function () { beep(f, 0.12, 'sine', 0.13); }, i * 90);
      });
    }
  };

  // 合成兜底音：升级/进化用上行音，连击用轻快音
  function synthChime() {
    if (isInk() || !soundOn()) return;
    A.level();
  }

  // ===== 方案 B：真实叫声（B 优先，失败回退 A）=====
  var CRY_BASE = 'assets/cries/';
  function playCry(dex) {
    if (isInk() || !soundOn()) return;
    if (dex == null) { synthChime(); return; }
    var src = CRY_BASE + APP.pad3(dex) + '.ogg';
    try {
      var el = new Audio(src);
      el.volume = 0.8;
      var p = el.play();
      if (p && p.catch) p.catch(function () { synthChime(); });
      el.onerror = function () { synthChime(); };
    } catch (e) {
      synthChime();
    }
  }

  // B3 捕捉动画：抛球 / 砸中 / 开盖 / 闭合四段短音，以及成功的单声「叮」
  // （sfxCatch 是四音上行旋律，不是这里要的「叮一下」）
  var BALL_TONE = {
    fly:   [300, 0.18, 'triangle', 0.06],
    hit:   [150, 0.09, 'square',   0.10],
    open:  [720, 0.10, 'sine',     0.09],
    close: [430, 0.12, 'sine',     0.10]
  };
  function sfxBall(kind) {
    if (isInk() || !soundOn()) return;
    var q = BALL_TONE[kind];
    if (q) beep(q[0], q[1], q[2], q[3]);
  }
  function sfxDing() {
    if (isInk() || !soundOn()) return;
    beep(1046.5, 0.42, 'sine', 0.16);
    setTimeout(function () { beep(1568, 0.34, 'sine', 0.10); }, 90);
  }

  // B4 战斗 4 个短音（WebAudio 合成，不下载文件）。墨水屏 / 关声音时整体静音。
  function slide(f0, f1, d, vol) {
    var c = ac();
    if (!c) return;
    var o = c.createOscillator(), g = c.createGain(), t = c.currentTime;
    o.type = 'sine';
    o.frequency.setValueAtTime(f0, t);
    o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + d);
    g.gain.setValueAtTime(vol || 0.12, t);
    g.gain.exponentialRampToValueAtTime(0.0008, t + d);
    o.connect(g); g.connect(c.destination);
    o.start(t); o.stop(t + d);
  }
  function sfxHit() {
    if (isInk() || !soundOn()) return;
    beep(170, 0.10, 'square', 0.12);
    beep(90, 0.15, 'triangle', 0.09);
  }
  function sfxSuper() {
    if (isInk() || !soundOn()) return;
    beep(784, 0.10, 'triangle', 0.12);
    setTimeout(function () { beep(1046.5, 0.16, 'triangle', 0.12); }, 85);
  }
  function sfxFaint() {
    if (isInk() || !soundOn()) return;
    slide(620, 110, 0.45, 0.13);
  }
  function sfxWin() {
    if (isInk() || !soundOn()) return;
    [523, 659, 784, 1047].forEach(function (f, i) {
      setTimeout(function () { beep(f, 0.18, 'triangle', 0.12); }, i * 105);
    });
  }

  APP.audio = {
    playCry: playCry,
    sfxLevel: A.level,
    sfxEvo: A.evo,
    sfxCatch: A.catch,
    sfxOk: A.ok,
    sfxClick: A.click,
    sfxBall: sfxBall,
    sfxDing: sfxDing,
    sfxHit: sfxHit,
    sfxSuper: sfxSuper,
    sfxFaint: sfxFaint,
    sfxWin: sfxWin
  };
})(window.APP);
