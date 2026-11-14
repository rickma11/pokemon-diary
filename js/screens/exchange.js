(function () {
  'use strict';

  var APP = window.APP;
  APP.screens = APP.screens || {};

  // B1 兑换中心：把日程 / 乐园 / 养成攒的碎片换成精灵球、战斗券。
  // 底层结算走 store.exchangeShards（A0 已落地），本页只做展示与交互。

  function closest(node, selector) {
    var attr = selector.replace('[', '').replace(']', '');
    while (node && node.getAttribute) {
      if (node.getAttribute(attr)) return node;
      node = node.parentNode;
    }
    return null;
  }

  function esc(t) {
    return String(t === undefined || t === null ? '' : t)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  // 每种券的兑换数量（步进器 / 批量档共用；翻页切走再回来也保留）
  var qty = { capture: 1, battle: 1 };
  var TIERS = [1, 5, 10]; // 批量档（用户拍板：×1 / ×5 / ×10）
  // 心愿礼物：1⭐ = 10 元，单笔 ≤100 元；提交后由家长在后台确认
  var wishQty = 10;
  var wishNote = '';   // 切金额档位时保留孩子已经填好的留言
  var WISH_TIERS = [10, 30, 50, 100];

  var KINDS = [
    { id: 'battle', name: '战斗券', icon: '⚔️' },
    { id: 'capture', name: '精灵球', icon: '<i class="pkball pkball--lg"></i>' }
  ];

  function rateOf(kind) {
    try {
      var r = APP.store.settings().exchangeRate || {};
      return r[kind] || (kind === 'battle' ? 5 : 7);
    } catch (e) {
      return kind === 'battle' ? 5 : 7;
    }
  }

  // 轻提示：兑换成功 / 失败时短暂显示，自动消失（不弹窗打断）
  function toast(text, ok) {
    var el = document.createElement('div');
    el.className = 'toast' + (ok === false ? ' is-bad' : ' is-ok');
    el.textContent = text;
    document.body.appendChild(el);
    setTimeout(function () {
      el.classList.add('is-out');
      setTimeout(function () {
        if (el.parentNode) el.parentNode.removeChild(el);
      }, 320);
    }, 1800);
  }

  function wishRules() {
    return (APP.gymData && APP.gymData.RULES) || { starYuan: 10, maxYuan: 100 };
  }

  // 心愿礼物：用道馆首通得到的心愿星换真实礼物，家长确认后生效、驳回退星。
  function wishHtml(w) {
    var R = wishRules();
    var stars = (w && w.wishStars) || 0;
    var need = wishQty / R.starYuan;
    var orders = APP.store.wishOrders ? APP.store.wishOrders() : [];
    var pending = null;
    for (var i = 0; i < orders.length; i++) {
      if (orders[i].status === 'pending') { pending = orders[i]; break; }
    }
    var tiers = '';
    for (var j = 0; j < WISH_TIERS.length; j++) {
      var y = WISH_TIERS[j];
      tiers += '<button type="button" class="ex-wish__tier' + (y === wishQty ? ' is-on' : '') +
        '" data-act="wish-tier" data-yuan="' + y + '">¥' + y + '</button>';
    }
    return '<section class="card ex-card ex-card--wish">' +
      '<div class="ex-card__head">' +
        '<span class="ex-card__badge">🎁</span>' +
        '<div class="ex-card__title">' +
          '<div class="wish-title__row"><h2>心愿礼物</h2>' +
            '<button type="button" class="ex-wish__info" data-act="wish-info">ⓘ 说明</button></div>' +
          '<span>持有 ' + stars + ' ⭐ · 1⭐ = 10 元</span>' +
        '</div>' +
        '<span class="ex-card__rate">找家长兑换真实礼物</span>' +
      '</div>' +
      '<div class="ex-card__body">' +
        '<div class="ex-wish__tiers">' + tiers + '</div>' +
        '<label class="ex-wish__label" for="wishNote">想要什么（可留空）</label>' +
        '<input id="wishNote" class="ex-wish__input" type="text" maxlength="60" ' +
          'placeholder="如：一套乐高 / 一本绘本" value="' + esc(wishNote) + '">' +
        (pending ? '<div class="ex-wish__pending">⏳ 待家长确认：¥' + pending.yuan +
          ' / ' + pending.stars + ' ⭐（' + pending.date + '）' +
          (pending.note ? ' · ' + esc(pending.note) : '') + '</div>' : '') +
      '</div>' +
      '<button type="button" class="btn btn--primary btn--block ex-card__go" data-act="wish-go"' +
        (stars < need || pending ? ' disabled' : '') + '>提交心愿（耗 ' + need + ' ⭐）</button>' +
      '</section>';
  }

  // 说明文字收进弹窗，入口在「心愿礼物」标题旁
  function wishInfoHtml() {
    var need = wishQty / wishRules().starYuan;
    var body = '<div class="gym-note">提交后扣 <b>' + need + ' ⭐</b>（= ¥' + wishQty +
      '），家长在后台确认后就能兑换；若被驳回，心愿星会原数退回。</div>' +
      '<ul class="gym-rulelist">' +
        '<li>1⭐ = 10 元，可选 ¥10 / ¥30 / ¥50 / ¥100</li>' +
        '<li>单笔最高 100 元，一次只能有一单待家长确认</li>' +
        '<li>家长确认后心愿礼物生效；驳回则星星原数返还</li>' +
      '</ul>';
    if (APP.ui && APP.ui.sheet) APP.ui.sheet('心愿礼物怎么换', body);
  }

  function walletHtml(w) {
    var shards = (w && w.shards) || 0;
    var cap = (w && w.tickets && w.tickets.capture) || 0;
    var bat = (w && w.tickets && w.tickets.battle) || 0;
    return '<section class="card ex-wallet">' +
      '<div class="ex-wallet__cell"><i class="shard shard--lg"></i><b>' + shards + '</b><span>碎片</span></div>' +
      '<div class="ex-wallet__cell"><i>⚔️</i><b>' + bat + '</b><span>战斗券</span></div>' +
      '<div class="ex-wallet__cell"><i class="pkball"></i><b>' + cap + '</b><span>精灵球</span></div>' +
      '</section>';
  }

  function cardHtml(k, w) {
    var rate = rateOf(k.id);
    var q = qty[k.id] || 1;
    var cost = rate * q;
    var hold = (w && w.tickets && w.tickets[k.id]) || 0;
    var shards = (w && w.shards) || 0;
    var afford = shards >= cost;
    var tiers = '';
    for (var i = 0; i < TIERS.length; i++) {
      var on = q === TIERS[i] ? ' is-on' : '';
      tiers += '<button type="button" class="ex-tier' + on + '" data-act="tier" data-kind="' +
        k.id + '" data-qty="' + TIERS[i] + '">×' + TIERS[i] + '</button>';
    }
    return '<section class="card ex-card ex-card--' + k.id + '">' +
      '<div class="ex-card__head">' +
        '<span class="ex-card__badge">' + k.icon + '</span>' +
        '<div class="ex-card__title"><h2>' + k.name + '</h2><span>当前持有 ' + hold + ' ' + (k.id === 'capture' ? '个' : '张') + '</span></div>' +
        '<span class="ex-card__rate">' + rate + ' 碎片 = 1 ' + (k.id === 'capture' ? '个' : '张') + '</span>' +
      '</div>' +
      '<div class="ex-card__body">' +
        '<div class="ex-step">' +
          '<button type="button" class="ex-step__btn" data-act="dec" data-kind="' + k.id + '"' +
            (q <= 1 ? ' disabled' : '') + '>−</button>' +
          '<span class="ex-step__num">' + q + '</span>' +
          '<button type="button" class="ex-step__btn" data-act="inc" data-kind="' + k.id + '">＋</button>' +
        '</div>' +
        '<div class="ex-tiers">' + tiers + '</div>' +
      '</div>' +
      '<button type="button" class="btn btn--primary btn--block ex-card__go" data-act="go" data-kind="' +
        k.id + '"' + (afford ? '' : ' disabled') + '>兑换（耗 ' + cost + ' 碎片）</button>' +
      '</section>';
  }

  function render(container) {
    var s = APP.store.get();
    var w = s.wallet || {};
    var html = walletHtml(w);
    for (var i = 0; i < KINDS.length; i++) html += cardHtml(KINDS[i], w);
    html += wishHtml(w);
    html += '<p class="ex-gift">💡 新账号已自动赠送：精灵球 ×3、战斗券 ×4。' +
      '碎片不够时先去完成日程任务，乐园的宝可梦也会帮忙攒碎片。</p>';
    container.innerHTML = html;
    // 同一函数引用重复 addEventListener 会被浏览器去重，安全
    container.addEventListener('click', onClick);
  }

  function onClick(e) {
    var btn = closest(e.target, '[data-act]');
    if (!btn) return;
    var act = btn.getAttribute('data-act');
    var kind = btn.getAttribute('data-kind');
    if (act === 'tier') {
      qty[kind] = parseInt(btn.getAttribute('data-qty'), 10) || 1;
      APP.refresh();
    } else if (act === 'dec') {
      if (qty[kind] > 1) { qty[kind]--; APP.refresh(); }
    } else if (act === 'inc') {
      qty[kind]++;
      APP.refresh();
    } else if (act === 'wish-tier') {
      var keepEl = document.getElementById('wishNote');
      wishNote = keepEl ? keepEl.value : '';
      wishQty = parseInt(btn.getAttribute('data-yuan'), 10) || 10;
      APP.refresh();
    } else if (act === 'wish-info') {
      wishInfoHtml();
    } else if (act === 'wish-go') {
      var noteEl = document.getElementById('wishNote');
      var wr = APP.store.submitWish(wishQty, noteEl ? noteEl.value : '');
      toast(wr.msg, !wr.ok);
      if (wr.ok) wishNote = '';
      APP.refresh();
    } else if (act === 'go') {
      var res = APP.store.exchangeShards(kind, qty[kind]);
      if (res && res.ok) {
        toast(res.msg, true);
        APP.refresh();
      } else {
        toast((res && res.msg) || '兑换失败', false);
      }
    }
  }

  APP.screens.exchange = { render: render };
})();
