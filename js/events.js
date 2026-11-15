window.APP = window.APP || {};

(function (APP) {
  'use strict';

  // 事件消费层：把 store 里排队的事件（进化 / 满级 / 60 级 / 最终形态 / 升级）
  // 变成孩子看得见的反馈。app.js 每次渲染后调用 flush()。
  //
  // 播放顺序：进化 → 满级 → 60 级 → 最终形态 → 升级提示条。
  // 进化演出要先播，因为它是「形态变了」这件事本身；升级提示条放最后，它是状态栏上的临时横幅。

  var queue = [];
  var playing = false;
  var EVO_FIRST_MS = 2600;   // 彩色屏第一段（闪烁）时长，接近 GBA 的节奏

  function isInk() {
    return document.body.classList.contains('ink');
  }

  // 庆祝动画开关：settings.celebrateOn=false 时关闭彩带等庆祝视觉（墨水屏下恒关闭，由 isInk 处理）
  function celebrateOn() {
    try {
      var s = APP.store && APP.store.settings && APP.store.settings();
      return !s || s.celebrateOn !== false;
    } catch (e) { return true; }
  }

  function overlayEl() {
    var el = document.getElementById('uiOverlay');
    if (!el) {
      el = document.createElement('div');
      el.id = 'uiOverlay';
      el.className = 'ui-overlay';
      document.body.appendChild(el);
    }
    // 打开（或复用）时确保可见：closeOverlay 会把上一次用过的 overlay 隐藏掉
    el.style.display = '';
    return el;
  }

  function closeOverlay() {
    var el = document.getElementById('uiOverlay');
    if (el) {
      el.innerHTML = '';
      el.onclick = null;
      // 关键：overlay 是 position:fixed;inset:0 的全屏层，
      // 只清空内容不隐藏的话，这层透明 div 会继续盖住整个屏幕、吃掉所有点击。
      el.style.display = 'none';
    }
  }

  function art(dexNo) {
    return 'assets/pokemon/' + APP.pad3(dexNo) + '.webp';
  }

  function sortEvents(list) {
    var order = { evolve: 0, maxed: 1, lv60: 2, final: 3, levelup: 4, combo: 5 };
    return list.sort(function (a, b) {
      var oa = order[a.t] === undefined ? 9 : order[a.t];
      var ob = order[b.t] === undefined ? 9 : order[b.t];
      return oa - ob;
    });
  }

  function drain() {
    if (queue.length) return true;
    var list = APP.store.takeEvents();
    if (!list.length) return false;
    queue = sortEvents(list);
    return true;
  }

  // 每次渲染后调用：取事件、按顺序播放
  function flush() {
    if (playing) return;
    if (!drain()) {
      // store 里没有事件，但上次进化被打断（关页面 / 刷新）→ 补播
      var p = APP.store.activePokemon();
      if (!p || !p.pendingEvo) return;
      queue.push({
        t: 'evolve',
        fromDex: p.dexNo, fromName: p.nickname,
        toDex: p.pendingEvo.toDex, toName: p.pendingEvo.toName,
        resume: true
      });
    }
    next();
  }

  function next() {
    if (!queue.length && !drain()) {
      playing = false;
      return;
    }
    playing = true;
    var ev = queue.shift();
    if (ev.t === 'evolve') playEvolve(ev);
    else if (ev.t === 'maxed') playMaxed(ev);
    else if (ev.t === 'lv60') playLv60(ev);
    else if (ev.t === 'final') playFinal(ev);
    else if (ev.t === 'levelup') playLevelUp(ev);
    else if (ev.t === 'combo') playCombo(ev);
    else next();
  }

  // 当前主力宝可梦的图鉴号（叫声用）
  function activeDex() {
    var p = APP.store.activePokemon();
    return p ? p.dexNo : null;
  }

  // 庆祝视觉：彩色模式撒彩带 + 播叫声；墨水屏跳过（信息已由原静态反馈传达）
  function celebrateBurst() {
    if (isInk()) return;
    if (celebrateOn()) confetti();
    if (APP.audio) APP.audio.playCry(activeDex());
  }

  // 彩带：26 片随机色/位置/延迟的 CSS 下落碎片，约 2.6s 自动移除
  function confetti() {
    if (isInk()) return;
    var layer = document.createElement('div');
    layer.className = 'celebrate';
    var colors = ['#ff5d5d', '#ffd23f', '#5ad1ff', '#6be585', '#c98bff', '#ff9f43'];
    var n = 26, html = '';
    for (var i = 0; i < n; i++) {
      var left = (Math.random() * 100).toFixed(2);
      var c = colors[i % colors.length];
      var delay = (Math.random() * 0.5).toFixed(2);
      var dur = (1.6 + Math.random() * 1.0).toFixed(2);
      var rot = (Math.random() * 360 | 0);
      var size = (7 + Math.random() * 6 | 0);
      html += '<i class="confetti" style="left:' + left + '%;background:' + c +
        ';animation-delay:' + delay + 's;animation-duration:' + dur + 's;width:' + size +
        'px;height:' + (size * 0.6 | 0) + 'px;transform:rotate(' + rot + 'deg)"></i>';
    }
    layer.innerHTML = html;
    document.body.appendChild(layer);
    setTimeout(function () {
      if (layer.parentNode) layer.parentNode.removeChild(layer);
    }, 2600);
  }

  // ===== 连击达成：彩带 + 大字「连击 N 天！」+ 叫声 =====
  function playCombo(ev) {
    if (isInk()) { next(); return; }
    if (celebrateOn()) {
      var layer = document.createElement('div');
      layer.className = 'celebrate celebrate--combo';
      layer.innerHTML = '<div class="celebrate__label">连击 ' + ev.d + ' 天！<span>+' + ev.r + ' <i class="shard shard--sm"></i></span></div>';
      document.body.appendChild(layer);
      confetti();
      setTimeout(function () {
        if (layer.parentNode) layer.parentNode.removeChild(layer);
      }, 2200);
    }
    if (APP.audio) APP.audio.playCry(activeDex());
    next();
  }

  // ===== 升级：状态栏临时换成「升级！Lv.x」，不阻塞后续事件 =====
  function playLevelUp(ev) {
    var text = '升级！Lv.' + ev.to;
    if (isInk()) APP.statusbar.notice(text, { manual: true });
    else APP.statusbar.notice(text, { ms: 2500 });
    celebrateBurst();
    next();
  }

  // ===== 满级：经验不再增加，提示换着培养 =====
  function playMaxed(ev) {
    var msg = ev.justNow
      ? ev.nickname + ' 已经升到 Lv.' + ev.level + '，这是最高等级。之后不会再获得经验，可以去养成页换一只主力宝可梦。'
      : ev.nickname + ' 已经是 Lv.' + ev.level + ' 满级，这次没有获得经验。可以去养成页换一只主力宝可梦。';
    APP.ui.noticeCard({
      art: art(ev.dexNo),
      title: ev.justNow ? '满级啦！' : '已经是满级了',
      msg: msg,
      ok: '知道啦'
    }).then(function () {
      APP.refresh();
      next();
    });
  }

  // ===== 60 级：后续成长变慢，提示换着培养 =====
  function playLv60(ev) {
    APP.ui.noticeCard({
      art: art(APP.store.activePokemon() ? APP.store.activePokemon().dexNo : 25),
      title: 'Lv.' + ev.level + ' 达成',
      msg: ev.nickname + ' 已经到 Lv.' + ev.level + ' 啦，后面的成长会慢下来。可以去养成页换一只主力宝可梦，换着养能练更多伙伴。',
      ok: '知道啦'
    }).then(function () {
      APP.refresh();
      next();
    });
  }

  // ===== 进化到最终形态 =====
  function playFinal(ev) {
    APP.ui.noticeCard({
      art: art(ev.dexNo),
      title: '已经是最终形态',
      msg: ev.name + ' 已经进化到最终形态，之后只会继续升级。可以去养成页换一只主力宝可梦，把新的伙伴也带上。',
      ok: '知道啦'
    }).then(function () {
      APP.refresh();
      next();
    });
  }

  // ===== 进化演出：两段对白 + 闪烁 + 变形（复刻 GBA） =====
  function playEvolve(ev) {
    if (!APP.evo.get(ev.toDex)) {
      next();
      return;
    }
    var ink = isInk();
    var el = overlayEl();
    var evolved = false;
    var timer = null;

    function stage1Html() {
      return '<div class="ui-overlay__bg"></div>' +
        '<div class="evo__box">' +
          '<div class="evo__stage">' +
            '<img class="evo__img' + (ink ? '' : ' is-blink') + '" src="' + art(ev.fromDex) + '" alt="">' +
          '</div>' +
          '<div class="evo__dialog">' +
            '<p class="evo__text">咦？' + ev.fromName + ' 开始进化了！</p>' +
            (ink ? '<button type="button" class="btn evo__btn" data-act="evo-next">继续</button>' : '') +
          '</div>' +
        '</div>';
    }

    function stage2() {
      if (evolved) return;
      evolved = true;
      APP.store.evolveTo(ev.toDex);
      celebrateBurst(); // 变形瞬间撒彩带 + 播新形态的叫声
      el.innerHTML = '<div class="ui-overlay__bg"></div>' +
        '<div class="evo__box">' +
          '<div class="evo__stage">' +
            '<img class="evo__img is-appear" src="' + art(ev.toDex) + '" alt="">' +
          '</div>' +
          '<div class="evo__dialog">' +
            '<p class="evo__text">' + ev.fromName + ' 进化成了 ' + ev.toName + '！</p>' +
            '<button type="button" class="btn btn--primary evo__btn" data-act="evo-done">太好了</button>' +
          '</div>' +
        '</div>';
    }

    function finish() {
      if (timer) {
        clearTimeout(timer);
        timer = null;
      }
      closeOverlay();
      // 连跳进化：这段演完后若还满足下一阶段（一次跨多级时会出现），插到队首接着播
      var np = APP.store.activePokemon();
      if (np && np.pendingEvo) {
        queue.unshift({
          t: 'evolve',
          fromDex: np.dexNo, fromName: np.nickname,
          toDex: np.pendingEvo.toDex, toName: np.pendingEvo.toName
        });
      }
      APP.refresh();
      next();
    }

    el.innerHTML = stage1Html();
    el.onclick = function (e) {
      var act = e.target.getAttribute && e.target.getAttribute('data-act');
      if (act === 'evo-next') stage2();
      else if (act === 'evo-done') finish();
    };

    // 彩色屏自动推进到变形；墨水屏不做动画，靠「继续」按钮手动推进（避免二次全屏刷新）
    if (!ink) timer = setTimeout(stage2, EVO_FIRST_MS);
  }

  // 测试用：清空播放状态
  function reset() {
    queue = [];
    playing = false;
    closeOverlay();
  }

  // B3 捕捉成功复用同一套彩带（isInk 已在 confetti 内部挡掉，开关由调用方判断）
  APP.events = { flush: flush, reset: reset, confetti: confetti };
})(window.APP);
