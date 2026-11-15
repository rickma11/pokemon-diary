// 添加到手机桌面。
// 平台现实（不要承诺做不到的部分）：
//   · Android / Chrome（含 Edge 等 Chromium 内核）：浏览器会发 beforeinstallprompt，
//     缓存住这个事件，用户点「确认」就能调起系统安装确认，真的在桌面生成精灵球图标。
//   · iOS / iPadOS Safari：浏览器不允许网页程序化添加图标，也没有安装事件。
//     只能弹「分享 → 添加到主屏幕」图文指引，由用户自己点两下完成。
//   · 微信 / QQ 等内置浏览器：既不能安装也不能加桌面，提示用系统浏览器打开。
// beforeinstallprompt 在页面加载后不久就触发，必须在脚本执行期就挂监听并缓存事件，
// 等「首登结束、第一次进日程页」时再决定要不要 prompt()。
window.APP = window.APP || {};

(function (APP) {
  'use strict';

  var ASK_KEY = 'pokedex-pwa-asked-v1';
  var deferred = null;      // 缓存的 beforeinstallprompt 事件
  var installed = false;
  var asking = false;

  function lsGet(k) { try { return window.localStorage.getItem(k); } catch (e) { return null; } }
  function lsSet(k, v) { try { window.localStorage.setItem(k, v); } catch (e) {} }
  function ua() { return String((window.navigator && window.navigator.userAgent) || ''); }

  function standalone() {
    try {
      if (window.navigator.standalone) return true;
      if (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches) return true;
    } catch (e) {}
    return false;
  }
  function isIOS() {
    if (/iPad|iPhone|iPod/.test(ua())) return true;
    // iPadOS 13+ 默认报 Macintosh，用多点触控区分
    return /Macintosh/.test(ua()) && (window.navigator.maxTouchPoints || 0) > 1;
  }
  function isMobile() {
    return /Android|iPhone|iPad|iPod|Mobile|Windows Phone/i.test(ua()) || isIOS();
  }
  function isInAppBrowser() {
    return /MicroMessenger|QQ\/|Weibo|DingTalk|Alipay|UCBrowser/i.test(ua());
  }

  if (typeof window !== 'undefined' && window.addEventListener) {
    window.addEventListener('beforeinstallprompt', function (e) {
      e.preventDefault();      // 不阻止的话浏览器会自己弹一次，我们就没法挑时机了
      deferred = e;
    });
    window.addEventListener('appinstalled', function () {
      installed = true;
      deferred = null;
      lsSet(ASK_KEY, 'installed');
    });
  }

  // 其它浮层（博士讲解 / 升级庆祝 / 首登结语）共用一个 overlay，撞车就延后一点再问
  function overlayBusy() {
    var el = document.getElementById('uiOverlay');
    if (!el) return false;
    if (el.style.display === 'none') return false;
    return !!(el.innerHTML && el.innerHTML.length > 40);
  }

  var STEPS_CSS =
    '<style>.pwa-steps{text-align:left;font-size:13px;line-height:1.8;color:#5a4632;margin:6px 0}' +
    '.pwa-steps li{margin:6px 0}.pwa-steps b{color:#c0492b}' +
    '.pwa-note{font-size:12px;line-height:1.7;color:#8d8371;text-align:left;margin:10px 0 0}</style>';

  function iosSteps() {
    return STEPS_CSS +
      '<ol class="pwa-steps">' +
        '<li>点屏幕<b>底部中间的「分享」按钮</b>（方框向上箭头 ↑）。</li>' +
        '<li>在弹出菜单里往下滑，点<b>「添加到主屏幕」</b>。</li>' +
        '<li>右上角点「添加」，桌面就会出现<b>精灵球图标「宝可梦训练日记」</b>。</li>' +
      '</ol>' +
      '<p class="pwa-note">只能用 <b>Safari</b> 操作；iPhone 不允许网页自动添加图标，这一步必须手动点一下。' +
      '点桌面图标打开时没有浏览器地址栏，和 App 一样。</p>';
  }

  function androidSteps() {
    return STEPS_CSS +
      '<ol class="pwa-steps">' +
        '<li>点浏览器<b>右上角「⋮」菜单</b>。</li>' +
        '<li>选<b>「添加到主屏幕」/「安装应用」</b>，确认即可。</li>' +
      '</ol>' +
      '<p class="pwa-note">如果刚才的系统安装弹窗被关掉了，按上面两步也能加。' +
      '桌面图标是精灵球，名字叫「宝可梦训练日记」。</p>';
  }

  function inAppSteps() {
    return STEPS_CSS +
      '<p class="pwa-steps">当前是在<b>微信 / QQ 等内置浏览器</b>里，无法添加桌面图标。</p>' +
      '<ol class="pwa-steps">' +
        '<li>点右上角「…」→ <b>在浏览器打开</b>（iPhone 选 Safari，安卓选 Chrome）。</li>' +
        '<li>再按浏览器菜单里的「添加到主屏幕 / 安装应用」操作一次。</li>' +
      '</ol>';
  }

  function desktopSteps() {
    return STEPS_CSS +
      '<p class="pwa-steps">这台是电脑。Chrome / Edge 地址栏右侧若有<b>「安装」图标</b>，点一下即可把日记装成独立窗口。</p>' +
      '<p class="pwa-note">手机上的桌面图标需要在手机浏览器里打开本站添加。</p>';
  }

  function showSteps() {
    if (!APP.ui || !APP.ui.sheet) return;
    if (isInAppBrowser()) return APP.ui.sheet('用系统浏览器打开', inAppSteps());
    if (isIOS()) return APP.ui.sheet('iPhone / iPad 添加到桌面', iosSteps());
    if (isMobile()) return APP.ui.sheet('安卓手机添加到桌面', androidSteps());
    return APP.ui.sheet('添加到桌面', desktopSteps());
  }

  // force=true：我的数据 → 账号里的手动入口，忽略「已经问过」标记
  function ask(force) {
    if (asking) return;
    if (standalone() || installed) {
      if (force && APP.ui && APP.ui.sheet) {
        APP.ui.sheet('已经在桌面啦', STEPS_CSS + '<p class="pwa-steps">现在就是从桌面图标打开的，不用再添加一次。</p>');
      }
      return;
    }
    if (!force && lsGet(ASK_KEY)) return;
    if (!APP.ui || !APP.ui.confirm) return;

    asking = true;
    var canInstall = !!deferred;
    var okText = canInstall ? '添加到桌面' : '看添加步骤';
    var lead = canInstall
      ? '确认后会弹出浏览器的安装提示，同意即可在桌面生成<b>精灵球图标「宝可梦训练日记」</b>，以后一点就开，不用再输网址。'
      : (isIOS()
        ? '确认后给你看 3 步图示：<b>分享 → 添加到主屏幕 → 添加</b>。iPhone 不允许网页自动加图标，需要手动点一下。'
        : '确认后给你看这台浏览器添加到桌面的具体步骤。');

    APP.ui.confirm(
      lead + '<br><span style="font-size:12px;color:#8d8371">只是加个快捷入口，不会上传或改变任何打卡数据。</span>',
      okText, '以后再说', '把日记放到手机桌面？'
    ).then(function (ok) {
      asking = false;
      if (!ok) { lsSet(ASK_KEY, 'later'); return; }   // 只主动问一次，之后可从「我的数据 → 账号」重开
      lsSet(ASK_KEY, 'done');
      if (!deferred) return showSteps();
      var ev = deferred;
      deferred = null;
      try {
        var p = ev.prompt();
        Promise.resolve(p)['catch'](function () {});
        if (ev.userChoice) {
          Promise.resolve(ev.userChoice).then(function (choice) {
            if (choice && choice.outcome === 'accepted') {
              lsSet(ASK_KEY, 'installed');
              installed = true;
              if (APP.unlock && APP.unlock.toast) APP.unlock.toast('✅ 已添加到桌面，下次点精灵球就能进');
            } else {
              lsSet(ASK_KEY, 'later');   // 系统弹窗里点了取消，之后仍可手动重开
              showSteps();
            }
          })['catch'](function () {});
        }
      } catch (e) {
        showSteps();
      }
    })['catch'](function () { asking = false; });
  }

  // 首登结束、或已完成首登的用户升级后第一次打开：只在手机上主动问一次。
  // 别和博士讲解 / 首登结语抢同一个浮层；内部有 ASK_KEY，问过就不再设定时器。
  function maybePrompt(tries) {
    if (tries === undefined) tries = 0;
    if (!isMobile()) return;              // 电脑不主动打扰，手动入口仍在「我的数据 → 账号」
    if (standalone() || installed || lsGet(ASK_KEY)) return;
    setTimeout(function () {
      if (overlayBusy()) {
        if (tries < 4) return maybePrompt(tries + 1);
        return;                              // 一直有别的浮层，这轮就不问了，手动入口仍在
      }
      ask(false);
    }, tries === 0 ? 1100 : 1600);
  }

  APP.pwaInstall = {
    maybePrompt: maybePrompt,
    open: function () { ask(true); },
    canInstall: function () { return !!deferred; },
    installed: function () { return standalone() || installed; },
    platform: function () { return isIOS() ? 'ios' : isInAppBrowser() ? 'in-app' : isMobile() ? 'android' : 'desktop'; }
  };
})(window.APP);
