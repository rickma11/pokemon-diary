(function () {
  'use strict';

  var APP = window.APP;
  APP.screens = APP.screens || {};

  // 图鉴页：资料查看 + 收集进度 + 家族进化链。
  // 数据来源 js/data/dex.js（离线）；收集状态读 store.catches ∪ store.pokemon。
  // 本期不做捕捉 / 对战入口，点亮接口等 B3 捕捉接上。
  var D = APP.dexData;
  var TY = {};
  D.TYPES.forEach(function (t) { TY[t.k] = t; });

  // 筛选状态只在模块内存里：切走再回来保留，不写存档
  var S = {
    gen: D.GENS[0].id,
    type: 'all',
    status: 'all',
    q: '',
    showName: true,
    cur: null,
    fi: 0
  };

  // 家族属性并集：任一形态带该属性，筛选时这格就命中
  var FAM = {};
  D.ENTRIES.forEach(function (e) {
    var t = {};
    e.types.forEach(function (k) { t[k] = 1; });
    e.path.forEach(function (p) { p.types.forEach(function (k) { t[k] = 1; }); });
    FAM[e.id] = t;
  });

  var containerEl = null;
  var topBtn = null;
  var bound = false;

  function pad(n) {
    var s = String(n);
    while (s.length < 3) s = '0' + s;
    return s;
  }

  function esc(v) {
    return String(v == null ? '' : v)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  function badges(types, small) {
    return (types || []).map(function (k) {
      var t = TY[k];
      if (!t) return '';
      return '<span class="dex-tp' + (small ? ' dex-tp--sm' : '') +
        '" style="background:' + t.color + '">' + t.zh + '</span>';
    }).join('');
  }

  // 编号所属世代：用于详情页进化链中标记「本时代 / 跨世代」形态
  function genOf(id) {
    id = Number(id);
    for (var i = 0; i < D.GENS.length; i++) {
      var g = D.GENS[i];
      if (id >= g.from && id <= g.to) return g.id;
    }
    return '';
  }
  // 世代 id（如 "Gen1 关都"）→ 地区名（"关都"），用于链节点上的小标签
  function genShort(gid) {
    return (gid || '').replace(/^Gen\d+\s*/, '');
  }

  function ownedSet() {
    var s = APP.store.get() || {}, o = {}, i;
    var cs = s.catches || [], ps = s.pokemon || [];
    for (i = 0; i < cs.length; i++) o[Number(cs[i].dexNo)] = 1;
    for (i = 0; i < ps.length; i++) o[Number(ps[i].dexNo)] = 1;
    return o;
  }

  // 战斗中遇到但未捕捉的编号集合（点亮图鉴为「已发现」，区别于「已拥有」）
  function seenSet() {
    var s = APP.store.get() || {}, o = {};
    (s.seen || []).forEach(function (d) { o[Number(d)] = 1; });
    return o;
  }

  function got(e, own) {
    for (var i = 0; i < e.path.length; i++) if (own[e.path[i].id]) return true;
    return false;
  }

  function lit(e, own) {
    var n = 0;
    for (var i = 0; i < e.path.length; i++) if (own[e.path[i].id]) n++;
    return n;
  }

  function hit(e, own, se) {
    if (e.g !== S.gen) return false;
    if (S.type !== 'all' && !(FAM[e.id] || {})[S.type]) return false;
    var g = got(e, own);
    var sv = e.path.some(function (p) { return se && se[p.id]; });
    if (S.status === 'got' && !g) return false;
    if (S.status === 'no' && (g || sv)) return false;
    if (S.status === 'seen' && (!sv || g)) return false;
    if (S.q) {
      var q = S.q, found = false, i;
      if (pad(e.id) === q || String(e.id) === q || e.zh.indexOf(q) >= 0) found = true;
      for (i = 0; i < e.path.length; i++) {
        var p = e.path[i];
        if (p.zh.indexOf(q) >= 0 || pad(p.id) === q || String(p.id) === q) found = true;
      }
      if (!found) return false;
    }
    return true;
  }

  // 已拥有的排前面；两组内部都按图鉴编号升序
  function sortEntries(list, own) {
    return list.slice().sort(function (a, b) {
      var ga = got(a, own) ? 0 : 1, gb = got(b, own) ? 0 : 1;
      if (ga !== gb) return ga - gb;
      var ia = ga === 0 ? a.id : a.path[0].id;
      var ib = gb === 0 ? b.id : b.path[0].id;
      return ia - ib;
    });
  }

  // 方案1：无论是否已拥有，卡片一律显示该格「代表形态」本身（归属本时代的形态编号/属性），
  // 不再回退到跨世代的基础形态，避免「关都编号混进城都」的错觉；完整进化链点进详情看。
  function cardForm(e, own) {
    return { id: e.id, zh: e.zh, types: e.types };
  }

  function firstAt(e, s) {
    var ids = {}, best = '';
    e.path.forEach(function (p) { ids[p.id] = 1; });
    (s.catches || []).forEach(function (c) {
      if (ids[Number(c.dexNo)] && c.at && (!best || c.at < best)) best = c.at;
    });
    return best;
  }

  function findEntry(id) {
    for (var i = 0; i < D.ENTRIES.length; i++) if (D.ENTRIES[i].id === id) return D.ENTRIES[i];
    return null;
  }

  function overviewHtml(own) {
    var all = D.ENTRIES, gotN = 0, litN = 0, ts = {};
    all.forEach(function (e) {
      if (got(e, own)) { gotN++; e.types.forEach(function (t) { ts[t] = 1; }); }
      litN += lit(e, own);
    });
    var lines = D.GENS.map(function (g) {
      var a = all.filter(function (e) { return e.g === g.id; });
      return g.short + ' ' + a.filter(function (e) { return got(e, own); }).length + '/' + a.length;
    }).join('　');
    return '<section class="card card--sticky dex-overview">' +
      '<h2>我的收集进度 <span class="dex-sub">· 按进化家族</span></h2>' +
      '<div class="dex-ov__row"><span class="dex-ov__big">' + gotN + '</span>' +
      '<span class="dex-ov__unit">/ ' + all.length + ' 格已拥有</span>' +
      '<span class="dex-ov__side">点亮形态 ' + litN + ' 个<br>属性收集 ' +
        Object.keys(ts).length + '/' + D.TYPES.length + '</span></div>' +
      '<div class="dex-ov__bar"><i style="width:' + Math.round(gotN / all.length * 100) + '%"></i></div>' +
      '<div class="dex-ov__gens">' + lines + '</div></section>';
  }

  function filterHtml() {
    var gens = D.GENS.map(function (g) {
      return '<button type="button" class="dex-gen' + (S.gen === g.id ? ' is-on' : '') +
        '" data-act="gen" data-gen="' + esc(g.id) + '">' + esc(g.label) + '</button>';
    }).join('');
    var sts = [['all', '全部'], ['got', '已拥有'], ['seen', '已遇到'], ['no', '未发现']].map(function (t) {
      return '<button type="button" class="dex-chip' + (S.status === t[0] ? ' is-on' : '') +
        '" data-act="status" data-v="' + t[0] + '">' + t[1] + '</button>';
    }).join('');
    // 属性改下拉：右对齐贴在状态筛选行末尾，去掉横滑胶囊与「属性：全部」按钮
    var opts = '<option value="all"' + (S.type === 'all' ? ' selected' : '') + '>全部属性</option>' +
      D.TYPES.map(function (t) {
        return '<option value="' + t.k + '"' + (S.type === t.k ? ' selected' : '') + '>' + t.zh + '</option>';
      }).join('');
    return '<section class="card dex-filter">' +
      '<div class="dex-gens">' + gens + '</div>' +
      '<div class="dex-row">' + sts +
        '<select class="dex-sel" id="dexType" aria-label="按属性筛选">' + opts + '</select>' +
      '</div>' +
      '<input class="dex-search" id="dexQ" type="search" placeholder="搜编号或名字，如 006 / 喷火龙" value="' + esc(S.q) + '">' +
      '<label class="dex-sw"><input type="checkbox" id="dexName"' + (S.showName ? ' checked' : '') +
        '> 未发现的宝可梦显示名称</label>' +
      '<p class="dex-filter__hint">💡 上方标签可点：切换世代（关都 / 城都 / 丰缘）、筛选「已拥有 · 已遇到 · 未发现」，右侧下拉可按属性筛</p>' +
      '</section>';
  }

  function gridInnerHtml(own) {
    var se = seenSet();
    var list = sortEntries(D.ENTRIES.filter(function (e) { return hit(e, own, se); }), own);
    if (!list.length) {
      return '<div class="dex-empty">没有符合条件的宝可梦<br><br>' +
        '<button type="button" class="dex-chip" data-act="clear">清除筛选</button></div>';
    }
    return list.map(function (e) {
      var g = got(e, own), sv = e.path.some(function (p) { return se[p.id]; });
      var lit2 = g || sv;
      var f = cardForm(e, own);
      var nm = (lit2 || S.showName) ? f.zh : '？？？';
      var stTxt = g ? '已拥有' : sv ? '已发现' : '未获得';
      var stCls = g ? '' : sv ? ' is-seen' : ' is-no';
      var dots = '';
      for (var i = 0; i < e.path.length; i++) dots += own[e.path[i].id] ? '●' : se[e.path[i].id] ? '◐' : '○';
      return '<div class="dex-card' + (g ? ' is-got' : sv ? ' is-seen' : '') + '" role="button" tabindex="0" ' +
        'data-act="card" data-id="' + e.id + '">' +
        '<span class="dex-card__no">' + pad(f.id) + '</span>' +
        '<span class="dex-card__st' + stCls + '">' + stTxt + '</span>' +
        '<img class="dex-card__img' + (lit2 ? '' : ' is-sil') +
          '" src="assets/pokemon/' + pad(f.id) + '.png" alt="" loading="lazy">' +
        '<div class="dex-card__nm' + (lit2 || S.showName ? '' : ' is-hide') + '">' + esc(nm) + '</div>' +
        '<div class="dex-tps">' + badges(f.types) + '</div>' +
        '<div class="dex-card__dots">' + dots + '</div></div>';
    }).join('');
  }

  function modalHtml(e, own, s) {
    var se = seenSet();
    var p = e.path[S.fi] || e.path[0];
    var om = !!own[p.id], sm = !!se[p.id] && !om, litP = om || sm;
    var at = firstAt(e, s), chain = '';
    var crossGen = e.path.some(function (x) { return genOf(x.id) !== e.g; });
    e.path.forEach(function (x, i) {
      if (i) chain += '<div class="dex-arrow">›</div>';
      var gx = genOf(x.id);
      var cur = crossGen && gx === e.g;
      var cls = 'dex-fnode' + (i === S.fi ? ' is-on' : '');
      if (crossGen) cls += cur ? ' is-cur' : ' is-other';
      chain += '<div class="' + cls +
        '" data-act="form" data-fi="' + i + '">' +
        '<img class="dex-fnode__img' + (own[x.id] || se[x.id] ? '' : ' is-sil') +
          '" src="assets/pokemon/' + pad(x.id) + '.png" alt="">' +
        '<div class="dex-fnode__zh">' + pad(x.id) + ' ' + x.zh + '</div>' +
        (!cur && crossGen && gx ? '<div class="dex-fnode__gen">' + genShort(gx) + '</div>' : '') +
        (x.cond ? '<div class="dex-fnode__cond">' + esc(x.cond) + '</div>' : '') + '</div>';
    });
    var famOwned = got(e, own);
    var famSeen = !famOwned && e.path.some(function (x) { return se[x.id]; });
    var mstatTail = famOwned ? (at ? '首次获得 ' + esc(at) : '还没有遇到它')
      : famSeen ? '已遇到，尚未捕捉' : '还没有遇到它';
    return '<div class="dex-modal card" role="dialog" aria-modal="true">' +
      '<button type="button" class="dex-modal__x" data-act="close" aria-label="关闭">×</button>' +
      '<div class="dex-mhead">' +
        '<img class="dex-mhead__img' + (litP ? '' : ' is-sil') +
          '" src="assets/pokemon/' + pad(p.id) + '.png" alt="">' +
        '<h2>' + esc(p.zh) + '</h2>' +
        '<div class="dex-mhead__no">No.' + pad(p.id) + '　' + esc(e.g) + '　' +
          (om ? '已拥有' : sm ? '已发现' : '未点亮') + '</div>' +
        '<div class="dex-tps">' + badges(p.types) + '</div>' +
        '<div class="dex-mstat">家族进度 ' + lit(e, own) + ' / ' + e.path.length + ' 形态　·　' +
          mstatTail + '</div></div>' +
      '<div class="dex-forms">' + chain + '</div>' +
      '<div class="dex-mrow">' +
        '<button type="button" class="btn" data-act="cry">🔊 听叫声</button>' +
        '<button type="button" class="btn btn--primary" data-act="close">关闭</button></div>' +
      '<p class="dex-hint">💡 ' + (famOwned
        ? '点上面的小图可以切换形态，属性徽章会跟着变（例如小火龙只有「火」，喷火龙是「火 / 飞行」）。'
        : famSeen
          ? '你在战斗中遇到过它（还没抓到）。图鉴已记录为「已发现」，抓到后会升级为「已拥有」。'
          : '未发现的格子显示的是这个家族的初始形态。等捕捉玩法上线后，抓到基础形态就会点亮；本期图鉴只做查看。') +
      '</p></div>';
  }

  function pageHtml() {
    var s = APP.store.get() || {}, own = ownedSet();
    return '<div class="dex-page">' +
      overviewHtml(own) + filterHtml() +
      '<div class="dex-grid" id="dexGrid">' + gridInnerHtml(own) + '</div>' +
      '<div class="dex-mask' + (S.cur ? ' is-on' : '') + '" id="dexMask">' +
        (S.cur ? modalHtml(S.cur, own, s) : '') + '</div>' +
      '</div>';
  }

  function draw() {
    if (!containerEl) return;
    containerEl.innerHTML = pageHtml();
    var page = containerEl.querySelector ? containerEl.querySelector('.dex-page') : null;
    var el = page || containerEl;
    if (el.addEventListener) {
      el.addEventListener('click', onClick);
      el.addEventListener('change', onChange);
      el.addEventListener('input', onInput);
    }
  }

  function drawGrid() {
    var grid = containerEl && containerEl.querySelector ? containerEl.querySelector('#dexGrid') : null;
    if (grid) grid.innerHTML = gridInnerHtml(ownedSet());
    else draw();
  }

  function drawModal() {
    var mask = containerEl && containerEl.querySelector ? containerEl.querySelector('#dexMask') : null;
    if (!mask) { draw(); return; }
    var s = APP.store.get() || {}, own = ownedSet();
    mask.className = 'dex-mask is-on';
    mask.innerHTML = S.cur ? modalHtml(S.cur, own, s) : '';
  }

  function closeModal() {
    S.cur = null;
    var mask = containerEl && containerEl.querySelector ? containerEl.querySelector('#dexMask') : null;
    if (mask) { mask.className = 'dex-mask'; mask.innerHTML = ''; }
  }

  function closestAct(node) {
    while (node && node !== containerEl) {
      if (node.getAttribute && node.getAttribute('data-act')) return node;
      node = node.parentNode;
    }
    return null;
  }

  function onClick(e) {
    var btn = closestAct(e.target);
    if (!btn) {
      if (e.target && e.target.id === 'dexMask') closeModal();
      return;
    }
    var act = btn.getAttribute('data-act');
    if (act === 'gen') {
      S.gen = btn.getAttribute('data-gen'); S.cur = null; draw();
    } else if (act === 'status') {
      S.status = btn.getAttribute('data-v'); S.cur = null; draw();
    } else if (act === 'clear') {
      S.gen = D.GENS[0].id; S.type = 'all'; S.status = 'all'; S.q = ''; draw();
    } else if (act === 'card') {
      var ent = findEntry(Number(btn.getAttribute('data-id')));
      if (!ent) return;
      var ownNow = ownedSet();
      S.cur = ent;
      // 详情默认选中：
      //   - 已拥有 → 当前进化状态（家族里你已抓到的最进化形态；没进化就停在初始，已进化就显示当前形态）
      //   - 未拥有 → 代表形态（跨世代家族落到本时代代表，如叉字蝠；同世代家族落到最终形态）
      var fiDef = 0;
      if (got(ent, ownNow)) {
        for (var i = ent.path.length - 1; i >= 0; i--) { if (ownNow[ent.path[i].id]) { fiDef = i; break; } }
      } else {
        for (var i = 0; i < ent.path.length; i++) { if (ent.path[i].id === ent.id) { fiDef = i; break; } }
      }
      S.fi = fiDef;
      if (APP.audio && APP.audio.sfxClick) APP.audio.sfxClick();
      drawModal();
    } else if (act === 'form') {
      S.fi = Number(btn.getAttribute('data-fi')) || 0; drawModal();
    } else if (act === 'cry') {
      if (S.cur && APP.audio && APP.audio.playCry) {
        var p = S.cur.path[S.fi] || S.cur.path[0];
        APP.audio.playCry(p.id);
        btn.textContent = '🔊 播放中…';
        setTimeout(function () { btn.textContent = '🔊 听叫声'; }, 1200);
      }
    } else if (act === 'close') {
      closeModal();
    }
  }

  function onChange(e) {
    var t = e.target, id = t && t.id;
    if (id === 'dexType') { S.type = t.value || 'all'; S.cur = null; draw(); }
    else if (id === 'dexName') { S.showName = !!t.checked; drawGrid(); }
  }

  function onInput(e) {
    if (e.target && e.target.id === 'dexQ') {
      S.q = String(e.target.value || '').trim();
      drawGrid();
    }
  }

  // 复用日程页已有的 .card--sticky 约定：动态量顶栏高度，写 --appbar-h
  function syncStickyTop() {
    try {
      var bar = document.querySelector ? document.querySelector('.appbar') : null;
      var h = bar && bar.offsetHeight ? bar.offsetHeight : 64;
      if (document.documentElement && document.documentElement.style &&
          document.documentElement.style.setProperty) {
        document.documentElement.style.setProperty('--appbar-h', h + 'px');
      }
    } catch (err) {}
  }

  // 右下角一键回顶：只在图鉴页且页面已下拉时出现
  function syncTopBtn() {
    if (!topBtn || !topBtn.classList) return;
    var hash = String((window.location && window.location.hash) || '').replace('#/', '');
    var y = window.pageYOffset ||
      (document.documentElement && document.documentElement.scrollTop) || 0;
    topBtn.classList.toggle('is-on', hash === 'dex' && y > 220);
  }

  function setupTop() {
    if (!topBtn && document.createElement && document.body && document.body.appendChild) {
      topBtn = document.createElement('button');
      topBtn.type = 'button';
      topBtn.className = 'dex-top-btn';
      topBtn.setAttribute('aria-label', '回到顶部');
      topBtn.textContent = '↑ 顶部';
      document.body.appendChild(topBtn);
      if (topBtn.addEventListener) {
        topBtn.addEventListener('click', function () {
          try { window.scrollTo(0, 0); } catch (err) {}
          syncTopBtn();
        });
      }
    }
    if (!bound && window.addEventListener) {
      bound = true;
      window.addEventListener('scroll', syncTopBtn);
      window.addEventListener('hashchange', syncTopBtn);
    }
    syncTopBtn();
  }

  function render(container) {
    containerEl = container;
    syncStickyTop();
    setupTop();
    draw();
  }

  APP.screens.dex = {
    render: render,
    // 给冒烟测试用的纯逻辑入口
    logic: {
      ownedSet: ownedSet, seenSet: seenSet, got: got, lit: lit, hit: hit,
      sortEntries: sortEntries, cardForm: cardForm, badges: badges,
      state: S, entries: D.ENTRIES, types: D.TYPES, battleOnly: D.BATTLE_ONLY
    }
  };
})();
