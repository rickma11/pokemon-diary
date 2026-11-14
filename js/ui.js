window.APP = window.APP || {};

(function (APP) {
  'use strict';

  function overlay() {
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

  function previewDataUrl(dataUrl) {
    var el = overlay();
    el.innerHTML =
      '<div class="ui-overlay__bg" data-close="1"></div>' +
      '<div class="ui-overlay__img"><img src="' + dataUrl + '" alt="预览"></div>' +
      '<div class="ui-overlay__hint">点击任意处关闭</div>';
    el.onclick = function (e) {
      var t = e.target;
      if (t.getAttribute && t.getAttribute('data-close')) { closeOverlay(); return; }
      if (t.tagName === 'IMG') { closeOverlay(); }
    };
  }

  function previewPhoto(photoId) {
    APP.photos.src(photoId).then(function (dataUrl) {
      if (dataUrl) previewDataUrl(dataUrl);
      else alert('照片不存在或已丢失');
    });
  }

  function esc(t) {
    return String(t === undefined || t === null ? '' : t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  // 精灵球小图标（GBA 风弹窗标题用）
  var POKEBALL =
    '<svg class="ui-modal__ball" viewBox="0 0 20 20" aria-hidden="true">' +
      '<circle cx="10" cy="10" r="8.3" fill="#fff" stroke="#4A3728" stroke-width="1.6"/>' +
      '<path d="M1.7 10a8.3 8.3 0 0 1 16.6 0Z" fill="#E24B4A"/>' +
      '<path d="M1.7 10h16.6" stroke="#4A3728" stroke-width="1.6"/>' +
      '<circle cx="10" cy="10" r="2.7" fill="#fff" stroke="#4A3728" stroke-width="1.6"/>' +
    '</svg>';

  function titleHtml(title) {
    return title ? '<h3 class="ui-modal__title">' + POKEBALL + esc(title) + '</h3>' : '';
  }

  // 确认弹层：返回 Promise<boolean>
  function confirm(message, okText, cancelText, title) {
    okText = okText || '确定';
    cancelText = cancelText || '取消';
    return new Promise(function (resolve) {
      var el = overlay();
      el.innerHTML =
        '<div class="ui-overlay__bg" data-close="1"></div>' +
        '<div class="ui-modal">' +
          titleHtml(title) +
          '<p class="ui-modal__msg">' + message + '</p>' +
          '<div class="row">' +
            '<button type="button" class="btn" data-c="0">' + cancelText + '</button>' +
            '<button type="button" class="btn btn--primary" data-c="1">' + okText + '</button>' +
          '</div>' +
        '</div>';
      el.onclick = function (e) {
        var c = e.target.getAttribute && e.target.getAttribute('data-c');
        if (c === '1') { closeOverlay(); resolve(true); }
        else if (c === '0' || (e.target.getAttribute && e.target.getAttribute('data-close'))) {
          closeOverlay(); resolve(false);
        }
      };
    });
  }

  // 提示卡：图 + 标题 + 说明 + 一个确认按钮（升级提醒 / 满级提醒 / 换主力提醒）
  function noticeCard(opts) {
    opts = opts || {};
    return new Promise(function (resolve) {
      var el = overlay();
      var art = opts.art
        ? '<div class="ui-modal__art"><img src="' + opts.art + '" alt=""></div>'
        : '';
      el.innerHTML =
        '<div class="ui-overlay__bg"></div>' +
        '<div class="ui-modal ui-modal--notice">' +
          art +
          titleHtml(opts.title) +
          '<p class="ui-modal__msg">' + (opts.msg || '') + '</p>' +
          '<button type="button" class="btn btn--primary btn--block" data-ok="1">' + (opts.ok || '知道啦') + '</button>' +
        '</div>';
      el.onclick = function (e) {
        var ok = e.target.getAttribute && e.target.getAttribute('data-ok');
        if (ok) {
          closeOverlay();
          resolve(true);
        }
      };
    });
  }

  // 通用说明弹层：标题 + 自定义 HTML 正文 + 一个关闭按钮。
  // 道馆规则 / 单馆奖励表格 / 心愿礼物说明共用，避免每个页面各写一套 overlay。
  function sheet(title, bodyHtml) {
    var el = overlay();
    el.innerHTML =
      '<div class="ui-overlay__bg" data-close="1"></div>' +
      '<div class="ui-modal ui-modal--sheet" role="dialog" aria-label="' + esc(title) + '">' +
        '<button type="button" class="ui-modal__x" data-close="1" aria-label="关闭">×</button>' +
        titleHtml(title) +
        bodyHtml +
        '<button type="button" class="btn btn--primary btn--block" data-close="1" ' +
          'style="margin-top:12px">知道啦</button>' +
      '</div>';
    el.onclick = function (e) {
      if (e.target.getAttribute && e.target.getAttribute('data-close')) closeOverlay();
    };
  }

  APP.ui = {
    previewPhoto: previewPhoto,
    previewDataUrl: previewDataUrl,
    confirm: confirm,
    noticeCard: noticeCard,
    sheet: sheet,
    close: closeOverlay
  };
})(window.APP);
