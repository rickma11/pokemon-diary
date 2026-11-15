window.APP = window.APP || {};

(function (APP) {
  'use strict';

  // ===== 立绘资源管理 =====
  //
  // 一只宝可梦有两套尺寸：
  //   大图 475px（assets/pokemon/NNN.webp）  —— 养成页舞台、进化演出这类要放大看的地方
  //   小图 128px（assets/pokemon/sm/NNN.png） —— 状态栏头像、图鉴网格、宝可梦中心卡片、选宠页
  //
  // 为什么小图直接用 PNG 而不是 WebP：
  //   小图 PNG 只有 6KB（做了调色板压缩），和 WebP 的 5KB 基本一样大，
  //   但 PNG 是所有浏览器都认的老格式 —— 有个别手机浏览器解不出 WebP，
  //   整页立绘就会变成一个个空框。状态栏、图鉴这类用量最大的地方，
  //   宁可多 1KB，也要保证任何设备都出图。
  //   大图（只有养成页舞台、进化演出用到）继续走 WebP，失败自动退回同名 PNG。
  //
  // 兜底链：显式 data-fb 列表 → 同名 .webp 换 .png → 放弃并留日志

  function pad3(n) {
    var s = String(n);
    while (s.length < 3) s = '0' + s;
    return s;
  }

  function lg(dex) { return 'assets/pokemon/' + pad3(dex) + '.webp'; }
  function lgPng(dex) { return 'assets/pokemon/' + pad3(dex) + '.png'; }
  function sm(dex) { return 'assets/pokemon/sm/' + pad3(dex) + '.png'; }
  function smPng(dex) { return 'assets/pokemon/sm/' + pad3(dex) + '.png'; }

  // ===== 全局兜底：任何 <img> 加载失败都自动往下退一级 =====
  // data-fb 里可以放多条候选（用 | 分隔，按顺序试），试完再走扩展名兜底
  function onImgError(e) {
    var el = e.target;
    if (!el || el.tagName !== 'IMG') return;
    var fb = el.getAttribute('data-fb');
    if (fb) {
      var list = fb.split('|');
      list.shift();                 // 去掉刚失败的那条
      if (list.length) {
        el.setAttribute('data-fb', list.join('|'));
        el.src = list[0];
        return;
      }
      el.removeAttribute('data-fb');
    }
    var src = el.getAttribute('src') || '';
    if (/\.webp(\?|#|$)/i.test(src)) {
      el.src = src.replace(/\.webp(\?|#|$)/i, '.png$1');
      return;
    }
    if (window.console && console.warn) console.warn('[art] 图片加载失败：', src);
  }
  document.addEventListener('error', onImgError, true);

  // ===== 预热：把某只宝可梦的图先抓进浏览器缓存 =====
  // 只预热 webp；png 兜底留在真失败时按需取（才 6KB，没必要提前下）
  var warmed = Object.create(null);
  function warmOne(url) {
    if (!url || warmed[url]) return;
    warmed[url] = 1;
    try {
      var img = new Image();
      img.onload = function () { if (img.decode) { try { img.decode(); } catch (e) {} } };
      img.onerror = function () {};
      img.src = url;
    } catch (e) {}
  }
  // withLarge=false 只预热小图；withGif=true 连养成页的动图一起预热（只给主力用）
  function warm(dex, withLarge, withGif) {
    if (dex === null || dex === undefined || dex === '') return;
    warmOne(sm(dex));
    if (withLarge !== false) warmOne(lg(dex));
    if (withGif) warmOne('assets/pokemon/animated/' + pad3(dex) + '.gif');
  }
  // 主力宝可梦：小图 + 大图 + 动图，一次性备齐
  function warmMain(dex) {
    warm(dex, true, true);
  }

  // ===== 生成 img 标签 =====
  // opts: { cls, alt, lazy, size: 'lg'|'sm', fallback: '备用地址（可多条，用 | 分隔）' }
  function imgTag(dex, opts) {
    opts = opts || {};
    var url = opts.size === 'lg' ? lg(dex) : sm(dex);
    return '<img src="' + url + '"' +
      (opts.cls ? ' class="' + opts.cls + '"' : '') +
      ' alt="' + (opts.alt || '') + '"' +
      (opts.lazy ? ' loading="lazy"' : '') +
      (opts.fallback ? ' data-fb="' + opts.fallback + '"' : '') +
      '>';
  }

  APP.art = {
    pad3: pad3,
    lg: lg, lgPng: lgPng,
    sm: sm, smPng: smPng,
    warm: warm,
    warmMain: warmMain,
    imgTag: imgTag
  };
})(window.APP);
