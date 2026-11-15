window.APP = window.APP || {};

(function (APP) {
  'use strict';

  // 「我的数据」聚合页：把分散在家长后台与日程页的数据模块统一收拢到一处。
  // 顺序（从上到下）：今日概览 → 本周完成率 → 各分类完成率 → 近期流水（经验/碎片双标签）→ 数据备份
  var backupInput = null;
  var bound = false;
  var XP_PER_PAGE = 3; // 近期流水每页展示 3 天（折叠式：一天一行合计）
  var xpPage = 0;      // 当前页（0 起）
  var xpOpen = {};     // 已展开明细的日期：{ '2026-10-20': true }
  var flowTab = 'exp'; // 近期流水标签：'exp' 经验 / 'shards' 碎片

  function esc(t) {
    return String(t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  function closest(node, selector) {
    var attr = selector.replace('[', '').replace(']', '');
    while (node && node.getAttribute) {
      if (node.getAttribute(attr)) return node;
      node = node.parentNode;
    }
    return null;
  }

  // 分类完成率环形图：一个分类一个环，环按「安排数量」切成 N 块，
  // 完成几项就点亮几块（颜色/深浅区分），分类名与 X/Y 直接写在环心。
  // 块数上限 16：安排数超过 16 时按比例折算，避免块太碎看不清（墨水屏尤其）。
  var RING_MAX_SEG = 16;

  function ringSvg(p) {
    var total = p.total;
    var n = total > RING_MAX_SEG ? RING_MAX_SEG : total;
    var on = p.done <= 0 ? 0 : Math.max(1, Math.round(p.done / total * n));
    if (on > n) on = n;

    var r = 40;
    var C = 2 * Math.PI * r;
    var segDeg = 360 / n;
    var gapDeg = n > 1 ? (segDeg > 12 ? 5 : segDeg * 0.35) : 0;
    var len = Math.max(0.6, (segDeg - gapDeg) / 360 * C);
    var rest = Math.max(0, C - len);

    var segs = '';
    for (var i = 0; i < n; i++) {
      var off = -(i * segDeg) / 360 * C;
      segs += '<circle class="ring__seg' + (i < on ? ' is-on' : '') + '" cx="50" cy="50" r="' + r +
        '" stroke-dasharray="' + len.toFixed(2) + ' ' + rest.toFixed(2) +
        '" stroke-dashoffset="' + off.toFixed(2) + '"/>';
    }

    return '<svg class="ring" viewBox="0 0 100 100" role="img" aria-label="' + esc(p.type) +
      ' ' + p.done + '/' + total + '">' +
      '<g transform="rotate(-90 50 50)">' + segs + '</g>' +
      '<text class="ring__name" x="50" y="45" text-anchor="middle">' + esc(p.type) + '</text>' +
      '<text class="ring__val" x="50" y="65" text-anchor="middle">' + p.done + '/' + total + '</text>' +
      '</svg>';
  }

  // 近 7 天完成率柱图（与家长后台「每日完成率」同源：weeklyStats().days）
  // 当天没有任务时不写数字（原来的「—」容易被看成「一」），改标「无」
  function weeklyBars(st) {
    var cells = '';
    for (var i = 0; i < st.days.length; i++) {
      var d = st.days[i];
      var empty = d.total === 0;
      cells += '<div class="week__col' + (empty ? ' is-empty' : '') + '">' +
        '<div class="week__track">' +
          (empty ? '' : '<div class="week__fill" style="height:' + d.rate + '%"></div>') +
        '</div>' +
        '<div class="week__rate">' + (empty ? '无' : d.rate + '%') + '</div>' +
        '<div class="week__dow">' + d.dow + '</div></div>';
    }
    return cells;
  }

  function mdText(date) {
    var p = String(date).split('-');
    if (p.length < 3) return String(date);
    return parseInt(p[1], 10) + '月' + parseInt(p[2], 10) + '日';
  }

  function dayLabel(date) {
    if (!date) return '未知日期';
    if (date === APP.todayStr()) return '今天 · ' + mdText(date);
    if (date === APP.dateOffset(-1)) return '昨天 · ' + mdText(date);
    var dow = ['日', '一', '二', '三', '四', '五', '六'][new Date(date + 'T00:00:00').getDay()];
    return mdText(date) + ' 周' + dow;
  }

  // 按日分组：同一天的多条记录聚成一组，组头显示当天合计
  function groupByDay(list) {
    var groups = [];
    var cur = null;
    for (var i = 0; i < list.length; i++) {
      var x = list[i];
      var d = x.date || '';
      if (!cur || cur.date !== d) {
        cur = { date: d, sum: 0, items: [] };
        groups.push(cur);
      }
      cur.items.push(x);
      cur.sum += Number(x.amount) || 0;
    }
    return groups;
  }

  // 折叠式流水：一天一行（日期 + 条数 + 当日合计），点这一行才展开明细；每页 3 天
  // unit：当前标签的计量单位（经验 / 碎片），用于空态文案与当日合计后缀
  function xpBodyHtml(groups, unit) {
    if (!groups.length) {
      return '<p class="empty-note">还没有' + unit + '记录，完成任务 / 训练后会自动记在这里</p>';
    }

    var pages = Math.ceil(groups.length / XP_PER_PAGE);
    if (xpPage > pages - 1) xpPage = pages - 1;
    if (xpPage < 0) xpPage = 0;
    var start = xpPage * XP_PER_PAGE;
    var shown = groups.slice(start, start + XP_PER_PAGE);

    var html = '';
    for (var i = 0; i < shown.length; i++) {
      var g = shown[i];
      var open = !!xpOpen[g.date];
      // 展开态用「向下」箭头、收起态用「向右」箭头（直接换图形，不依赖 CSS 动画）
      var caret = open
        ? '<svg class="xp__caret" viewBox="0 0 12 12" aria-hidden="true"><path d="M2.5 4.5L6 8l3.5-3.5" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>'
        : '<svg class="xp__caret" viewBox="0 0 12 12" aria-hidden="true"><path d="M4.5 2.5L8 6l-3.5 3.5" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>';
      html += '<div class="xp__day' + (open ? ' is-open' : '') + '">' +
        '<button type="button" class="xp__head" data-act="xp-toggle" data-date="' + esc(g.date) + '">' +
          caret +
          '<span class="xp__date">' + dayLabel(g.date) + '</span>' +
          '<span class="xp__count">' + g.items.length + ' 条</span>' +
          '<span class="xp__day-sum' + (g.sum < 0 ? ' is-minus' : '') + '">' + (g.sum >= 0 ? '+' : '') + g.sum + ' ' + unit + '</span>' +
        '</button>';

      if (open) {
        html += '<div class="xp__items">';
        for (var j = 0; j < g.items.length; j++) {
          var x = g.items[j];
          var amt = Number(x.amount) || 0;
          html += '<div class="xp__item">' +
            '<span class="xp__time">' + (x.time ? esc(x.time) : '') + '</span>' +
            '<span class="xp__src">' + esc(x.source || '') + '</span>' +
            '<span class="xp__amt' + (amt < 0 ? ' is-minus' : '') + '">' + (amt >= 0 ? '+' : '') + amt + '</span>' +
          '</div>';
        }
        html += '</div>';
      }
      html += '</div>';
    }

    if (pages > 1) {
      html += '<div class="pager">' +
        '<button type="button" class="btn btn--sm" data-act="xp-prev"' + (xpPage === 0 ? ' disabled' : '') + '>‹ 上一页</button>' +
        '<span class="pager__info">第 ' + (xpPage + 1) + ' / ' + pages + ' 页</span>' +
        '<button type="button" class="btn btn--sm" data-act="xp-next"' + (xpPage === pages - 1 ? ' disabled' : '') + '>下一页 ›</button>' +
      '</div>';
    }
    return html;
  }

  // 近期流水卡片：经验 / 碎片 双标签切换。
  // 经验 = 宝可梦训练/战斗经验（xpLog）；碎片（拼图）= 任务/审核/乐园/互动奖励（shardLog）。
  function xpCardHtml() {
    var isShards = flowTab === 'shards';
    var src = isShards ? (APP.store.get().shardLog || []) : APP.store.xpLog();
    var unit = isShards ? '碎片' : '经验';
    var groups = groupByDay(src);
    var total = 0;
    for (var i = 0; i < groups.length; i++) total += groups[i].items.length;
    var side = groups.length ? ('共 ' + groups.length + ' 天 · ' + total + ' 条') : '';
    return '<section class="card" id="xpCard"><h2>近期流水' +
      (side ? '<span class="card__side">' + side + '</span>' : '') +
      '</h2>' +
      '<div class="flow-tabs">' +
        '<button type="button" class="flow-tab' + (!isShards ? ' is-on' : '') + '" data-act="flow-tab" data-tab="exp">经验</button>' +
        '<button type="button" class="flow-tab' + (isShards ? ' is-on' : '') + '" data-act="flow-tab" data-tab="shards">碎片 <i class="shard shard--sm"></i></button>' +
      '</div>' +
      xpBodyHtml(groups, unit) + '</section>';
  }

  // 数据备份：导出/导入 JSON。导入前先确认，避免孩子端误触覆盖。
  function ensureBackupInput() {
    if (!backupInput) {
      backupInput = document.createElement('input');
      backupInput.type = 'file';
      backupInput.accept = 'application/json,.json';
      backupInput.style.display = 'none';
      document.body.appendChild(backupInput);
      backupInput.addEventListener('change', function () {
        var file = backupInput.files && backupInput.files[0];
        if (!file) return;
        var reader = new FileReader();
        reader.onload = function () {
          try {
            APP.store.importData(String(reader.result));
            backupInput.value = '';
            alert('恢复成功');
            APP.refresh();
          } catch (e) {
            alert('恢复失败：' + e.message);
          }
        };
        reader.readAsText(file);
      });
    }
  }

  function render(container) {
    ensureBackupInput();

    var s = APP.store.get();
    var st = APP.store.weeklyStats();
    var queue = APP.store.getAuditQueue();
    var pending = 0;
    for (var i = 0; i < queue.length; i++) {
      if (queue[i].inst.status === 'submitted') pending++;
    }

    var today = st.days[6];
    var todayRate = today.total ? Math.round(today.done / today.total * 100) + '%' : '今日无任务';
    var weekHasData = false;
    for (var w = 0; w < st.days.length; w++) {
      if (st.days[w].total > 0) { weekHasData = true; break; }
    }

    // ① 今日概览：只放「今天」的指标。本周平均挪到下方「本周完成率」，避免今日卡里混着本周数
    var html = '<section class="card"><h2>今日概览</h2><ul class="list">' +
      '<li><span class="k">今日完成</span><span class="v">' + today.done + ' / ' + today.total + '</span></li>' +
      '<li><span class="k">今日完成率</span><span class="v">' + todayRate + '</span></li>' +
      '<li><span class="k">待审核 / 待确认</span><span class="v">' + pending + ' 项</span></li>' +
      '<li><span class="k">本月累计打卡</span><span class="v">' + APP.store.monthCheckinCount() + ' 天</span></li>' +
    '</ul></section>';

    // ② 本周完成率（近 7 天柱图 + 平均）
    html += '<section class="card"><h2>本周完成率<span class="card__side">' +
      (weekHasData ? '平均 ' + st.avg + '%' : '近 7 天暂无记录') +
      '</span></h2><div class="week">' + weeklyBars(st) + '</div></section>';

    // ③ 各分类完成率（近 7 天，一个分类一个环形；新增分类自动多一个环，不受任务条数影响）
    html += '<section class="card"><h2>各分类完成率<span class="card__side">近 7 天</span></h2>';
    if (!st.perType.length) {
      html += '<p class="empty-note">近 7 天还没有安排任务</p>';
    } else {
      html += '<div class="ring-grid">';
      for (var t = 0; t < st.perType.length; t++) {
        html += ringSvg(st.perType[t]);
      }

    }
    html += '</section>';

    // ④ 近期流水（经验 / 碎片 双标签，按日分组）
    html += xpCardHtml();

    // ⑤ 数据备份（导出 / 导入）
    html += '<section class="card"><h2>数据备份</h2>' +
      '<p>导出为 JSON 文件保存；换设备时用「导入恢复」还原全部数据。</p>' +
      '<div class="row">' +
        '<button type="button" class="btn" data-act="export">导出备份</button>' +
        '<button type="button" class="btn" data-act="import">导入恢复</button>' +
      '</div></section>';

    // 账号卡 → 精简同步卡 → 统计与备份。
    // 「数据存档」槽位卡已移除：本机旧记录不再作为可选数据源暴露，导入入口只在家长后台（家长密码可见）。
    container.innerHTML = accountCardHtml() + ghCardHtml() + html;

    if (!bound) {
      container.addEventListener('click', onClick);
      bound = true;
    }
  }

  // 主角形象行：显示当前形象 + 每月重选入口（形象选择已迁到「我的数据-账号」）
  function charBlockHtml() {
    var mt = (APP.store.settings() && APP.store.settings().myTrainer) || 0;
    var names = ['红帽少年', '红裙少女', '绿帽少年', '橙帽少女'];
    var name = names[mt] || names[0];
    var ob = APP.store.onboarding ? APP.store.onboarding() : {};
    var now = Date.now(); var gap = 30 * 24 * 3600 * 1000;
    var cd = 0;
    if (ob.reselectTime && now - ob.reselectTime < gap) cd = Math.ceil((gap - (now - ob.reselectTime)) / 86400000);
    return '<div class="char-block">' +
      '<span class="char-block__k">主角形象</span>' +
      '<span class="char-block__v"><b>' + esc(name) + '</b>' +
      (cd > 0 ? ' <i class="lock-tip">每月可重选 · 剩 ' + cd + ' 天</i>' : ' <i class="lock-tip">每月可重选 1 次</i>') +
      '</span>' +
      (cd > 0 ? '' : '<button type="button" class="btn btn--sm" data-act="reselect-char">重选</button>') +
      '</div>';
  }

  // 未确认本机模式时账号卡整块不显示，但主角形象必须始终可重选 → 单独出一个小卡兜底
  function charCardHtml() {
    return '<section class="card"><h2>账号<span class="card__side">主角形象</span></h2>' +
      charBlockHtml() +
      '</section>';
  }

  // 「我的数据」页对所有人（含小孩）只显示精简同步卡：存档同步按钮 + 状态 + 规则，
  // 不出现 owner / repo / branch / PAT —— 连接设置只允许在家长后台改。
  function ghCardHtml() {
    return (APP.ghui && APP.ghui.compactCardHtml) ? APP.ghui.compactCardHtml() : '';
  }

  // 账号卡：已登录 → 用户名 + 退出登录（纯静态强制登录，无本机模式）
  function accountCardHtml() {
    if (!APP.auth) return charCardHtml();
    var acc = APP.auth.session();
    if (!acc) return charCardHtml();
    return '<section class="card"><h2>账号<span class="card__side">' +
      esc(acc.nickname || acc.accountId) + '</span></h2>' +
      '<ul class="list">' +
        '<li><span class="k">账号码</span><span class="v">' + esc(acc.accountId) + '</span></li>' +
        '<li><span class="k">当前身份</span><span class="v">' +
          (acc.role === 'parent' ? '大人（可进后台）' : '小朋友') + '</span></li>' +
      '</ul>' +
      charBlockHtml() +
      '<div class="row"><button type="button" class="btn" data-act="logout">退出登录</button>' +
        '<button type="button" class="btn" data-act="add-to-home">放到手机桌面</button></div>' +
      '<p class="field__hint">换设备用同一账号码登录即可看到同一份数据；退出后需要用密码重新登录。' +
        '点「放到手机桌面」可随时重新查看添加步骤。</p>' +
      '</section>';
  }

  function onClick(e) {
    var btn = closest(e.target, '[data-act]');
    if (!btn) return;
    var act = btn.getAttribute('data-act');
    if (act === 'reselect-char') { if (APP.onboarding && APP.onboarding.reselect) APP.onboarding.reselect(); return; }
    if (act === 'add-to-home') { if (APP.pwaInstall && APP.pwaInstall.open) APP.pwaInstall.open(); return; }
    if (APP.ghui && APP.ghui.handle(act)) return;
    if (act === 'export') {
      var text = APP.store.exportData();
      APP.store.download('pokedex-backup-' + APP.todayStr() + '.json', text);
    } else if (act === 'import') {
      APP.ui.confirm('导入备份会覆盖当前全部数据，确定继续？', '导入恢复').then(function (ok) {
        if (ok) backupInput.click();
      });
    } else if (act === 'xp-toggle') {
      var d = btn.getAttribute('data-date');
      if (xpOpen[d]) delete xpOpen[d]; else xpOpen[d] = true;
      APP.refresh();
    } else if (act === 'xp-prev') {
      if (xpPage > 0) { xpPage--; APP.refresh(); }
    } else if (act === 'xp-next') {
      xpPage++; APP.refresh();
    } else if (act === 'flow-tab') {
      var tab = btn.getAttribute('data-tab');
      if (tab && tab !== flowTab) { flowTab = tab; APP.refresh(); }
    } else if (act === 'logout') {
      APP.ui.confirm('退出后需要用密码重新登录，确定退出？', '退出登录').then(function (ok) {
        if (ok) {
          APP.auth.logout();
          APP.refresh();
        }
      });
    }
  }

  APP.screens.mine = { render: render };
})(window.APP);
