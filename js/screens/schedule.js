window.APP = window.APP || {};

(function (APP) {
  'use strict';

  var TYPE_ICON = {
    '作业': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 20h4L20 8l-4-4L4 16v4z"/><path d="M14 6l4 4"/></svg>',
    '阅读': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 4.5A1.5 1.5 0 016.5 3H19v15H6.5A1.5 1.5 0 015 19.5V4.5z"/><path d="M8.5 7.5h7M8.5 11h7"/></svg>',
    '运动': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12h3l2.5-6 3 12 3-9 2 3h4.5"/></svg>',
    '家务': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3.5 8h17l-1.8 12.5H5.3L3.5 8z"/><path d="M8.5 8l2-4.5M15.5 8l-2-4.5"/></svg>',
    '睡眠': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 5v14"/><path d="M3 9h13a4 4 0 0 1 4 4v6"/><path d="M3 19h18"/><path d="M6.5 12.5h4"/></svg>',
    '吃饭': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 12h16v1.5a8 8 0 01-16 0V12z"/><path d="M4.5 20h15"/><path d="M9.5 9c0-1.2 1-1.3 1-2.5S9.5 5 9.5 4"/><path d="M14 9c0-1.2 1-1.3 1-2.5S14 5 14 4"/></svg>',
    '上学': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6.5 8.5a5.5 5.5 0 0111 0V20h-11V8.5z"/><path d="M9.5 8.5a2.5 2.5 0 015 0"/><path d="M6.5 13.5h11"/></svg>',
    '其他': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="5" cy="12" r="1.4"/><circle cx="12" cy="12" r="1.4"/><circle cx="19" cy="12" r="1.4"/></svg>'
  };

  // 碎片图标（拼图），用于任务卡奖励徽章与钱包条
  var SHARD_ICON = '<i class="shard shard--sm"></i>';

  var STATUS_TEXT = {
    pending: '待完成',
    done: '已完成',
    submitted: '待家长审核',
    approved: '已通过',
    rejected: '被驳回'
  };

  var pendingTaskId = null;
  var photoInput = null;
  var bound = false;
  // 「已完成」折叠区：默认收起，点标题栏展开（本次会话内记住选择，刷新不丢）
  var doneOpen = false;

  // 下拉时进度卡只留「今日进度 + 进度条」，回到顶部自动展开。
  // 折叠/展开用两个阈值做滞回，避免在临界点反复切换导致卡片高度抖动。
  var scrollBound = false;
  var compactOn = false;
  function applyCompact(force) {
    var card = document.querySelector ? document.querySelector('.schedule-progress') : null;
    if (!card) return;
    var y = window.pageYOffset || document.documentElement.scrollTop || 0;
    var want = compactOn ? (y > 24) : (y > 72);
    if (force || want !== compactOn) {
      compactOn = want;
      if (want) card.classList.add('is-compact');
      else card.classList.remove('is-compact');
    }
  }
  function bindScroll() {
    if (scrollBound || !window.addEventListener) return;
    window.addEventListener('scroll', function () { applyCompact(false); });
    scrollBound = true;
  }

  function ensureInputs() {
    if (!photoInput) {
      photoInput = document.createElement('input');
      photoInput.type = 'file';
      photoInput.accept = 'image/*';
      photoInput.style.display = 'none';
      document.body.appendChild(photoInput);
      photoInput.addEventListener('change', function () {
        var file = photoInput.files && photoInput.files[0];
        if (!file || !pendingTaskId) return;
        var taskId = pendingTaskId;
        APP.photos.compress(file, function (dataUrl) {
          if (!dataUrl) return;
          var photoId = APP.photos.newId();
          APP.photos.put(photoId, dataUrl).then(function () {
            APP.store.submitHomework(taskId, photoId);
            // 登记照片元数据并立刻尝试上传；失败会留在未同步队列，下次周期/联网自动重试
            APP.store.addPhotoMeta(photoId);
            if (APP.sync && APP.sync.uploadPhotos) APP.sync.uploadPhotos();
            pendingTaskId = null;
            photoInput.value = '';
            APP.refresh();
          });
        });
      });
    }
  }

  function closest(node, selector) {
    var attr = selector.replace('[', '').replace(']', '');
    while (node && node.getAttribute) {
      if (node.getAttribute(attr)) return node;
      node = node.parentNode;
    }
    return null;
  }

  function escapeText(text) {
    return String(text).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  function taskRow(task, inst) {
    var status = inst ? inst.status : 'pending';
    var done = APP.store.isDoneStatus(status);
    var icon = TYPE_ICON[task.type] || TYPE_ICON['作业'];
    var photoTask = APP.store.isPhotoTask(task);

    var badges = '<span class="badge badge--shard">' + SHARD_ICON + '+' + (task.shards || 1) + ' 碎片</span>';
    if (inst && inst.isFast) badges += '<span class="badge badge--fast">快手</span>';
    if (status === 'approved') badges += '<span class="badge badge--ok">已通过</span>';
    if (status === 'rejected') badges += '<span class="badge badge--danger">被驳回</span>';

    var meta = '';
    if (status === 'submitted') {
      meta = (inst.photoId ? '已提交作业照片，等待家长审核' : '已打钩，等待家长确认') +
        (inst.submittedAt ? '（' + inst.submittedAt + '）' : '');
    } else if (status === 'approved') {
      meta = '家长已通过 ✓ 获得 +' + (task.shards || 1) + ' 碎片';
    } else if (status === 'rejected') {
      meta = '被驳回：' + (inst.reviewNote || '（无说明）');
    } else if (status === 'done') {
      meta = '已完成 ✓ 获得 +' + (task.shards || 1) + ' 碎片';
    } else if (photoTask) {
      meta = '需拍照提交，家长审核后获得碎片';
    } else if (!APP.store.expOnCheck()) {
      meta = '完成后打钩，家长确认后获得碎片';
    } else {
      meta = '完成后打钩';
    }

    var thumb = '';
    if (inst && inst.photoId) {
      thumb = '<div class="task__thumb"><img data-photo="' + inst.photoId + '" alt="作业照片（点击查看大图）"></div>';
    }

    var action = '';
    if (status === 'done') {
      action = '<button type="button" class="btn btn--sm" data-act="undo" data-task="' + task.id + '">撤销</button>';
    } else if (status === 'rejected') {
      var relabel = photoTask ? '重新拍照' : '重新打钩';
      action = '<button type="button" class="btn btn--primary" data-act="' + (photoTask ? 'photo' : 'check') + '" data-task="' + task.id + '">' + relabel + '</button>';
    } else if (status === 'submitted') {
      action = '<span class="task__wait">审核中…</span>';
    } else if (status === 'approved') {
      action = '<span class="task__done">已通过</span>';
    } else if (photoTask) {
      action = '<button type="button" class="btn btn--primary" data-act="photo" data-task="' + task.id + '">拍照提交</button>';
    } else {
      action = '<button type="button" class="btn btn--primary" data-act="check" data-task="' + task.id + '">打钩</button>';
    }

    var cls = 'task';
    if (status === 'done' || status === 'approved') cls += ' is-approved';
    else if (status === 'submitted') cls += ' is-submitted';
    else if (status === 'rejected') cls += ' is-rejected';

    // 已通过/已打钩的任务标题划横线（审核中的不划）
    var titleCls = 'task__title';
    if (status === 'done' || status === 'approved') titleCls += ' is-line';

    // 截止标签：填了用填的，没填按时段兜底（上午 12:00 / 下午 18:00 / 晚上 22:00）
    var dl = effectiveDeadline(task);
    var dlHtml = dl
      ? '<span class="task__dl">截止 ' + escapeText(dl) + '</span>'
      : '';

    // 窄屏重排：图标 / 内容 / 按钮三列，内容区独占整行宽度。
    // 标题单独一行不换行，碎片与截止时间收进同一条标签行，说明文字放最后。
    return '<div class="' + cls + '">' +
      '<div class="task__icon">' + icon + '</div>' +
      '<div class="task__body">' +
        '<div class="' + titleCls + '">' + escapeText(task.title) + '</div>' +
        '<div class="task__tags">' + badges + dlHtml + '</div>' +
        '<div class="task__meta">' + escapeText(meta) + '</div>' +
        thumb +
      '</div>' +
      '<div class="task__action">' + action + '</div>' +
    '</div>';
  }

  // 生效截止时间：任务自填优先，否则按时段兜底；随时段无兜底，返回空
  function effectiveDeadline(task) {
    if (task.deadline) return task.deadline;
    var slot = task.slot || 'anytime';
    return APP.SLOT_DEADLINE[slot] || '';
  }

  // 组内按截止时间从早到晚排（含时段兜底值）；都无截止时间的保持原有相对顺序
  function sortByDeadline(group) {
    var withIdx = [];
    for (var i = 0; i < group.length; i++) withIdx.push({ t: group[i], i: i });
    withIdx.sort(function (a, b) {
      var da = effectiveDeadline(a.t);
      var db = effectiveDeadline(b.t);
      if (da && db) return da < db ? -1 : (da > db ? 1 : 0);
      if (da) return -1;
      if (db) return 1;
      return a.i - b.i;
    });
    var out = [];
    for (var j = 0; j < withIdx.length; j++) out.push(withIdx[j].t);
    return out;
  }

  function groupHtml(list, inst) {
    var html = '';
    for (var s = 0; s < APP.SLOTS.length; s++) {
      var slot = APP.SLOTS[s];
      var group = [];
      for (var i = 0; i < list.length; i++) {
        if ((list[i].slot || 'anytime') === slot) group.push(list[i]);
      }
      if (!group.length) continue;
      group = sortByDeadline(group);
      html += '<h3 class="group-title">' + APP.SLOT_LABEL[slot] + '</h3><div class="tasks">';
      for (var j = 0; j < group.length; j++) {
        html += taskRow(group[j], inst[group[j].id]);
      }
      html += '</div>';
    }
    return html;
  }

  // 已完成区条目：跨时段平铺，按 时段顺序 + 组内截止时间 排（不带时段标题）
  function doneRowsHtml(list, inst) {
    var rows = [];
    for (var s = 0; s < APP.SLOTS.length; s++) {
      var slot = APP.SLOTS[s];
      var group = [];
      for (var i = 0; i < list.length; i++) {
        if ((list[i].slot || 'anytime') === slot) group.push(list[i]);
      }
      if (!group.length) continue;
      group = sortByDeadline(group);
      for (var j = 0; j < group.length; j++) rows.push(taskRow(group[j], inst[group[j].id]));
    }
    return rows.join('');
  }

  function render(container) {
    ensureInputs();

    // 动态测量顶栏实际高度，供 .card--sticky 的 top 使用（主题/字体不同高度不同，写死必遮挡）
    if (document.querySelector) {
      var appbar = document.querySelector('.appbar');
      if (appbar && appbar.offsetHeight) {
        document.documentElement.style.setProperty('--appbar-h', appbar.offsetHeight + 'px');
      }
    }

    var s = APP.store.get();
    var today = APP.todayStr();
    var inst = APP.store.ensureInstances(today);
    var list = APP.store.tasksFor(today);
    var prog = APP.store.progressOf(today);
    var percent = prog.total ? Math.round(prog.done / prog.total * 100) : 0;

    var w = s.wallet || { shards: 0 };
    var milestones = APP.store.comboMilestones();
    var streakNow = APP.store.monthCheckinCount();
    var streakBest = s.streak.monthBest || 0;
    var claimed = s.streak.claimed || [];

    // 今日打卡反馈：完成数超过一半即视为今日已打卡（不要求全部做满）
    var checkinBadge = '';
    if (prog.total > 0) {
      if (prog.done > prog.total / 2) {
        checkinBadge = '<div class="schedule-progress__checkin is-ok">今日已打卡 ✓</div>';
      } else {
        var needMore = Math.floor(prog.total / 2) + 1 - prog.done;
        checkinBadge = '<div class="schedule-progress__checkin">再做 ' + needMore + ' 项即可打卡</div>';
      }
    }

    var streakHtml = '<div class="schedule-progress__streak-row">' +
      '<span class="schedule-progress__streak">本月累计打卡 <b class="ck-hl">' + streakNow + '</b> 天（历史最佳 ' + streakBest + ' 天）</span>' +
      '<span class="shard-pill" title="碎片余额：完成任务 / 挂机产出">' + SHARD_ICON + ' ' + (w.shards || 0) + '</span>' +
    '</div>';

    var ladder = '<div class="combo">' +
      '<div class="combo__t">连击阶梯<span class="combo__sub">自然月内累计打卡解锁</span></div>' +
      '<div class="combo__row">';
    for (var ci = 0; ci < milestones.length; ci++) {
      var m = milestones[ci];
      var reached = streakNow >= m.d;
      var got = claimed.indexOf(m.d) >= 0;
      ladder += '<div class="combo__node' + (reached ? ' is-reached' : '') + (got ? ' is-got' : '') + '">' +
        '<div class="combo__d">' + m.d + '天</div>' +
        '<div class="combo__r">' + (got ? '+'+m.r+' 已得' : '+'+m.r) + '</div>' +
      '</div>';
    }
    ladder += '</div>';
    var nextM = null;
    for (var ni2 = 0; ni2 < milestones.length; ni2++) {
      if (streakNow < milestones[ni2].d) { nextM = milestones[ni2]; break; }
    }
    var ladderHint = nextM
      ? ('再连续 ' + (nextM.d - streakNow) + ' 天解锁 +' + nextM.r + ' 碎片')
      : '本月连击奖励已全部拿下，太棒了！';
    ladder += '<div class="combo__hint">' + ladderHint + '</div></div>';

    var html = '<section class="card card--sticky schedule-progress">' +
      '<h2>今日进度<span class="card__side">' + prog.done + ' / ' + prog.total + '</span></h2>' +
      '<div class="bar"><div class="bar__fill" style="width:' + percent + '%"></div></div>' +
      checkinBadge +
      streakHtml +
      ladder +
      (APP.unlock && APP.unlock.entryHtml ? APP.unlock.entryHtml() : '') +
    '</section>';

    if (!list.length) {
      html += '<section class="card empty">' +
        '<div class="empty__icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><rect x="5" y="3.5" width="14" height="17" rx="2"/><path d="M8.5 8h7M8.5 12h7M8.5 16h4"/></svg></div>' +
        '<p class="empty__title">今天还没有安排的任务</p>' +
        '<p>家长可在后台「长按顶部图标 3 秒」进入设置，添加今日任务。</p>' +
      '</section>';
    } else {
      // 拆分：上面只放未完成任务，已完成（含审核中）统一移到底部折叠区
      var pendingList = [];
      var doneList = [];
      for (var i = 0; i < list.length; i++) {
        var it = inst[list[i].id];
        if (it && APP.store.isDoneStatus(it.status)) doneList.push(list[i]);
        else pendingList.push(list[i]);
      }
      html += '<section class="card"><h2>今日任务</h2>';
      if (pendingList.length) {
        html += groupHtml(pendingList, inst);
      } else {
        html += '<p class="hint">今天的任务都完成了，真棒！明细在下方「已完成」里。</p>';
      }
      if (doneList.length) {
        html += '<div class="done-box' + (doneOpen ? '' : ' is-collapsed') + '">' +
          '<button type="button" class="done-box__head" data-act="toggle-done" aria-expanded="' + (doneOpen ? 'true' : 'false') + '">' +
            '<span class="done-box__arrow">' + (doneOpen ? '▾' : '▸') + '</span>' +
            '<span class="done-box__title">已完成</span>' +
            '<span class="done-box__count">' + doneList.length + '</span>' +
          '</button>' +
          '<div class="done-box__list">' + doneRowsHtml(doneList, inst) + '</div>' +
        '</div>';
      }
      html += '</section>';
    }

    container.innerHTML = html;
    // innerHTML 会丢掉旧节点上的 class，每次重绘都要按当前滚动位置重新套用折叠态
    bindScroll();
    applyCompact(true);

    var thumbs = container.querySelectorAll('[data-photo]');
    for (var j = 0; j < thumbs.length; j++) {
      (function (node) {
        var id = node.getAttribute('data-photo');
        APP.photos.src(id).then(function (dataUrl) {
          if (dataUrl) node.src = dataUrl;
        });
      })(thumbs[j]);
    }

    if (!bound) {
      container.addEventListener('click', onClick);
      bound = true;
    }
  }

  function onClick(e) {
    var photoNode = closest(e.target, '[data-photo]');
    if (photoNode) {
      APP.ui.previewPhoto(photoNode.getAttribute('data-photo'));
      return;
    }
    var btn = closest(e.target, '[data-act]');
    if (!btn) return;
    var act = btn.getAttribute('data-act');
    var taskId = btn.getAttribute('data-task');

    if (act === 'open-unlock-tasks') {
      if (APP.unlock && APP.unlock.openTasks) APP.unlock.openTasks();
      return;
    }
    if (act === 'check') {
      APP.store.checkIn(taskId);
      if (APP.sync && APP.sync.criticalPush) APP.sync.criticalPush();
      APP.refresh();
    } else if (act === 'undo') {
      APP.store.undo(taskId);
      if (APP.sync && APP.sync.criticalPush) APP.sync.criticalPush();
      APP.refresh();
    } else if (act === 'photo') {
      pendingTaskId = taskId;
      photoInput.click();
    } else if (act === 'toggle-done') {
      doneOpen = !doneOpen;
      APP.refresh();
    }
  }

  APP.screens.schedule = { render: render };
})(window.APP);
