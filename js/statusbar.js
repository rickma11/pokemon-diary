window.APP = window.APP || {};

(function (APP) {
  'use strict';

  // 状态栏三档显示：
  //   full —— 日程 / 养成：头像 + 名字 + 等级 + 经验条 + 经验数字
  //   mini —— 乐园 / 图鉴 / 对战：头像 + 名字 Lv + 细经验条（高度约减半）
  //   none —— 我的数据 / 家长后台：整条隐藏
  // 精灵球数量不在这里显示：目前既无法获得也无法消耗，只在乐园-捕捉页展示。

  var lastMode = 'full';
  var noticeTimer = null;

  function applyMode(el, mode) {
    var body = document.body;
    body.classList.remove('sb-full');
    body.classList.remove('sb-mini');
    body.classList.remove('sb-none');
    body.classList.add('sb-' + mode);
    el.classList.toggle('statusbar--mini', mode === 'mini');
  }

  function clearNotice(el) {
    if (noticeTimer) {
      clearTimeout(noticeTimer);
      noticeTimer = null;
    }
    el.classList.remove('statusbar--notice');
    el.onclick = null;
  }

  function render(mode) {
    var el = document.getElementById('statusbar');
    if (!el) return;

    clearNotice(el);

    mode = mode || 'full';
    lastMode = mode;
    var p = APP.store.activePokemon();

    if (!p || mode === 'none') {
      el.style.display = 'none';
      applyMode(el, 'none');
      return;
    }

    el.style.display = '';
    applyMode(el, mode);

    var prog = APP.store.levelProgress();
    var art = '<div class="statusbar__art"><img src="' + APP.art.sm(p.dexNo) + '" alt=""></div>';
    var nameRow = '<div class="statusbar__row">' +
      '<span class="statusbar__name">' + p.nickname + '</span>' +
      '<span class="statusbar__lv">Lv.' + p.level + (prog.maxed ? ' 满级' : '') + '</span>' +
    '</div>';
    var expText = prog.maxed ? '已满级，经验不再增加' : '经验 ' + prog.inLevel + ' / ' + prog.need;

    if (mode === 'mini') {
      el.innerHTML = art +
        '<div class="statusbar__main">' + nameRow +
          '<div class="bar bar--slim"><div class="bar__fill" style="width:' + prog.percent + '%"></div></div>' +
        '</div>';
      return;
    }

    el.innerHTML = art +
      '<div class="statusbar__main">' + nameRow +
        '<div class="bar"><div class="bar__fill" style="width:' + prog.percent + '%"></div></div>' +
        '<div class="statusbar__exp">' + expText + '</div>' +
      '</div>';
  }

  // 临时提示条（升级 / 满级提醒）：整条状态栏换成一行大字。
  // 彩色屏 2.5 秒后自动恢复；墨水屏传 manual=true，点一下才恢复，避免二次全屏刷新。
  function notice(text, opts) {
    var el = document.getElementById('statusbar');
    if (!el || el.style.display === 'none' || !el.innerHTML) return false;
    opts = opts || {};

    clearNotice(el);
    el.classList.add('statusbar--notice');
    el.innerHTML = '<div class="statusbar__notice">' +
      '<span class="statusbar__notice-txt">' + text + '</span>' +
      (opts.manual ? '<span class="statusbar__notice-ok">点击关闭</span>' : '') +
    '</div>';

    var close = function () {
      clearNotice(el);
      render(lastMode);
    };
    if (opts.manual) {
      el.onclick = close;
    } else {
      noticeTimer = setTimeout(close, opts.ms || 2500);
    }
    return true;
  }

  APP.statusbar = { render: render, notice: notice };
})(window.APP);
