window.APP = window.APP || {};

(function (APP) {
  'use strict';

  // 内部视图状态（模块级变量跨刷新保留，整页重载才重置，符合"无会话持久化"的安全预期）
  var view = 'login';
  var authed = false;
  var editingId = null;
  var bound = false;
  // 调试页的操作结果提示（{ ok, text }），只在调试页内有效
  var debugMsg = null;
  // 账号页的操作结果提示（{ ok, text }）
  var accountMsg = null;

  function esc(t) {
    return String(t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  // 后台顶部导航：左侧「‹ 返回」回上一级（首页视图时留白对齐），右侧「退出后台」回孩子端
  function header(title, sub, showBack) {
    var left = showBack
      ? '<button type="button" class="btn btn--sm" data-act="back">‹ 返回</button>'
      : '<span class="pbar__side"></span>';
    return '<div class="pbar">' + left +
      '<div class="pbar__title"><strong>' + esc(title) + '</strong>' +
      (sub ? '<span>' + esc(sub) + '</span>' : '') + '</div>' +
      '<button type="button" class="btn btn--sm" data-act="exit">退出后台</button>' +
    '</div>';
  }

  function templateDefaults(type) {
    var map = {
      '作业': { title: '作业', type: '作业', shards: 1, mode: 'photo', deadline: '21:00', slot: 'evening' },
      '阅读': { title: '阅读', type: '阅读', shards: 1, mode: 'check', deadline: '20:30', slot: 'evening' },
      '运动': { title: '运动', type: '运动', shards: 1, mode: 'check', deadline: '18:00', slot: 'afternoon' },
      '家务': { title: '家务', type: '家务', shards: 1, mode: 'check', deadline: '07:40', slot: 'morning' },
      '睡眠': { title: '睡眠', type: '睡眠', shards: 1, mode: 'check', deadline: '21:30', slot: 'evening' },
      '吃饭': { title: '吃饭', type: '吃饭', shards: 1, mode: 'check', deadline: '12:00', slot: 'anytime' },
      '上学': { title: '上学', type: '上学', shards: 1, mode: 'check', deadline: '07:50', slot: 'morning' },
      '其他': { title: '', type: '其他', shards: 1, mode: 'check', deadline: '', slot: 'anytime' }
    };
    return map[type] || { title: '', type: '作业', shards: 1, mode: 'check', deadline: '', slot: 'anytime' };
  }

  function fieldVal(id) {
    var el = document.getElementById(id);
    return el ? String(el.value || '').trim() : '';
  }

  // 账号与密码（T7）：改昵称 / 改大人密码（需旧密码）/ 重置小孩密码（不需旧密码）
  // 纯静态版直接读写 GitHub 账号文件（APP.auth.*），不再走后端 API。
  function renderAccount(container) {
    var s = APP.auth && APP.auth.session ? APP.auth.session() : null;
    if (!s) return renderHome(container);

    var html = header('账号与密码', '登录与安全', true);
    html += '<section class="card">' +
      '<h2>账号信息</h2>' +
      '<ul class="list">' +
        '<li><span class="k">账号码</span><span class="v">' + esc(s.accountId) + '</span></li>' +
        '<li><span class="k">当前身份</span><span class="v">大人（可进后台与审核）</span></li>' +
      '</ul>' +
      '<p class="field__hint">换设备时用账号码 + 对应密码登录，就能看到同一份数据。</p>' +
    '</section>';

    html += '<section class="card">' +
      '<h2>孩子昵称</h2>' +
      '<label class="field"><span>登录页显示的名字</span>' +
        '<input id="acc_nickname" type="text" maxlength="24" value="' + esc(s.nickname || '') + '" autocomplete="off">' +
      '</label>' +
      '<div class="row"><button type="button" class="btn" data-act="save-nickname">保存昵称</button></div>' +
    '</section>';

    html += '<section class="card">' +
      '<h2>改大人密码</h2>' +
      '<label class="field"><span>当前大人密码</span><input id="acc_old" type="password" autocomplete="off"></label>' +
      '<label class="field"><span>新大人密码（8–64 位）</span><input id="acc_new" type="password" autocomplete="off"></label>' +
      '<label class="field"><span>再输一次新密码</span><input id="acc_new2" type="password" autocomplete="off"></label>' +
      '<div class="row"><button type="button" class="btn btn--primary" data-act="save-parent-pwd">保存新密码</button></div>' +
    '</section>';

    html += '<section class="card">' +
      '<h2>重置小孩密码</h2>' +
      '<p>孩子忘了密码时在这里直接重设，不需要旧密码。建议 4–6 位数字。</p>' +
      '<label class="field"><span>新的小孩密码（4–16 位）</span><input id="kid_new" type="text" inputmode="numeric" autocomplete="off"></label>' +
      '<label class="field"><span>再输一次新密码</span><input id="kid_new2" type="text" inputmode="numeric" autocomplete="off"></label>' +
      '<div class="row"><button type="button" class="btn btn--primary" data-act="reset-child-pwd">重置小孩密码</button></div>' +
    '</section>';

    if (accountMsg) {
      html += '<p class="hint"' + (accountMsg.ok ? '' : ' style="color:#c0392b"') + '>' + esc(accountMsg.text) + '</p>';
    }
    container.innerHTML = html;
  }

  function render(container) {
    // 用大人密码登录过（跨设备已验明身份）→ 不再要求本机 PIN，直接进后台
    if (view === 'login' && APP.auth && APP.auth.role && APP.auth.role() === 'parent') {
      authed = true;
      return renderHome(container);
    }
    if (view === 'login') return renderLogin(container);
    if (view === 'home') return renderHome(container);
    if (view === 'tasks') return renderTasks(container);
    if (view === 'edit') return renderEdit(container);
    if (view === 'audit') return renderAudit(container);
    if (view === 'debug') return renderDebug(container);
    if (view === 'playtools') return renderPlayTools(container);
    if (view === 'settings') return renderSettings(container);
    if (view === 'account') return renderAccount(container);
    renderLogin(container);
  }

  function renderLogin(container) {
    container.innerHTML =
      '<div class="pbar">' +
        '<button type="button" class="btn btn--sm" data-act="exit">‹ 返回</button>' +
        '<div class="pbar__title"><strong>家长后台</strong><span>请输入管理密码</span></div>' +
        '<span class="pbar__side"></span>' +
      '</div>' +
      '<section class="card">' +
        '<label class="field"><span>管理密码</span>' +
          '<input id="pin" type="password" inputmode="numeric" maxlength="12" placeholder="请输入管理密码" autocomplete="off">' +
        '</label>' +
        '<button type="button" class="btn btn--primary btn--block" data-act="login">进入</button>' +
        '<p class="hint">输错或不想进时，点左上角「‹ 返回」即可回到孩子的打卡页。</p>' +
      '</section>';
  }

  function renderHome(container) {
    var s = APP.store.get();
    var queue = APP.store.getAuditQueue();
    var pending = 0;
    for (var i = 0; i < queue.length; i++) if (queue[i].inst.status === 'submitted') pending++;
    // 心愿礼物待确认也计入「待处理」
    try {
      var wOrders = APP.store.wishOrders ? APP.store.wishOrders() : [];
      for (var wi = 0; wi < wOrders.length; wi++) {
        if (wOrders[wi].status === 'pending') pending++;
      }
    } catch (e) {}
    var st = APP.store.weeklyStats();

    var html = header('家长后台', '家庭打卡管理');
    var wallet = s.wallet || {};
    var tk = wallet.tickets || {};
    html += '<section class="card">' +
      '<h2>今日概览</h2>' +
      '<ul class="list">' +
        '<li><span class="k">今日完成</span><span class="v">' + st.days[6].done + ' / ' + st.days[6].total + '</span></li>' +
        '<li><span class="k">本周平均完成率</span><span class="v">' + st.avg + '%</span></li>' +
        '<li><span class="k">待审核 / 待确认</span><span class="v">' + pending + ' 项</span></li>' +
        '<li><span class="k">本月累计打卡</span><span class="v">' + APP.store.monthCheckinCount() + ' 天</span></li>' +
      '</ul>' +
      '<h2>资源报表</h2>' +
      '<ul class="list">' +
        '<li><span class="k">碎片 <i class="shard shard--sm"></i></span><span class="v">' + (wallet.shards || 0) + '</span></li>' +
        '<li><span class="k">精灵球 / 战斗券</span><span class="v">' + (tk.capture != null ? tk.capture : '—') + ' / ' + (tk.battle != null ? tk.battle : '—') + '</span></li>' +
        '<li><span class="k">本周获得碎片</span><span class="v">+' + weekShardGain(s) + '</span></li>' +
      '</ul>' +
    '</section>';

    html += '<div class="pnav">' +
      '<button type="button" class="pnav__btn" data-act="go-tasks">任务管理</button>' +
      '<button type="button" class="pnav__btn" data-act="go-audit">审核队列' + (pending ? '（' + pending + '）' : '') + '</button>' +
      '<button type="button" class="pnav__btn" data-act="go-playtools">玩法与题库</button>' +
      '<button type="button" class="pnav__btn" data-act="go-debug">宝可梦调试</button>' +
      '<button type="button" class="pnav__btn" data-act="go-settings">设置</button>' +
      // 接入账号体系后才有「账号与密码」（本机 PIN 模式下没有账号可管）
      ((APP.auth && APP.auth.session()) ? '<button type="button" class="pnav__btn" data-act="go-account">账号与密码</button>' : '') +
    '</div>';

    container.innerHTML = html;
  }

  // 本周获得的碎片合计：扫最近 7 天实例的 shardGained（含打钩直发与审核发放）
  function weekShardGain(s) {
    var sum = 0;
    for (var d = 0; d < 7; d++) {
      var dt = APP.dateOffset(-d);
      var day = s.instances && s.instances[dt];
      if (!day) continue;
      var keys = Object.keys(day);
      for (var i = 0; i < keys.length; i++) {
        var g = day[keys[i]].shardGained;
        if (typeof g === 'number' && g > 0) sum += g;
      }
    }
    return sum;
  }

  function renderTasks(container) {
    var s = APP.store.get();
    var html = header('任务管理', '添加 / 编辑 / 删除', true);

    html += '<div class="pnav pnav--wrap">';
    for (var t = 0; t < APP.TYPES.length; t++) {
      html += '<button type="button" class="pnav__btn pnav__btn--sm" data-tpl="' + APP.TYPES[t] + '">+ ' + APP.TYPES[t] + '</button>';
    }
    html += '</div>';

    html += '<section class="card"><h2>当前任务（' + s.tasks.length + '）</h2><div class="tasks">';
    for (var i = 0; i < s.tasks.length; i++) {
      var tk = s.tasks[i];
      var wd = tk.weekdays && tk.weekdays.length === 7 ? '每天' : ('周' + (tk.weekdays || []).map(function (w) { return ['一', '二', '三', '四', '五', '六', '日'][w - 1]; }).join(''));
      html += '<div class="task">' +
        '<div class="task__body">' +
          '<div class="task__title">' + esc(tk.title) +
            '<span class="badge"><i class="shard shard--sm"></i> ' + (tk.shards || 1) + '</span>' +
            '<span class="badge">' + (APP.MODE_LABEL[tk.mode] || '直接打钩') + '</span>' +
          '</div>' +
          '<div class="task__meta">' + tk.type + ' · ' + (APP.SLOT_LABEL[tk.slot] || '随时') + ' · ' + wd + (tk.deadline ? ' · ' + tk.deadline : '') + '</div>' +
        '</div>' +
        '<div class="task__action">' +
          '<button type="button" class="btn btn--sm" data-act="edit" data-task="' + tk.id + '">编辑</button>' +
          '<button type="button" class="btn btn--sm" data-act="del" data-task="' + tk.id + '">删除</button>' +
        '</div>' +
      '</div>';
    }
    html += '</div></section>';

    container.innerHTML = html;
  }

  function renderEdit(container) {
    var task = null;
    if (editingId) {
      task = APP.store.findTask(editingId);
    }
    // 优先级：编辑已有任务 > 套用模板 > 空白默认
    var d = task || pendingTemplate || { title: '', type: '作业', shards: 1, mode: 'check', deadline: '', slot: 'anytime', weekdays: APP.ALL_WEEK.slice() };
    if (!d.mode) d.mode = d.needReview ? 'photo' : 'check';
    var wd = (task && task.weekdays) || (pendingTemplate && pendingTemplate.weekdays) || APP.ALL_WEEK.slice();

    function opt(val, label, sel) { return '<option value="' + val + '"' + (sel ? ' selected' : '') + '>' + label + '</option>'; }
    function wdbox(v) {
      return '<label class="wd"><input type="checkbox" name="wd" value="' + v + '"' + (wd.indexOf(v) >= 0 ? ' checked' : '') + '>' + ['一', '二', '三', '四', '五', '六', '日'][v - 1] + '</label>';
    }

    var html = header(task ? '编辑任务' : '新增任务', '填写任务信息', true);
    html += '<section class="card"><div class="form">' +
      '<label class="field"><span>任务名称</span><input id="f_title" type="text" value="' + esc(d.title) + '" placeholder="如：完成数学作业"></label>' +
      '<label class="field"><span>类型</span><select id="f_type">' +
        (function () {
          var o = '';
          for (var ti = 0; ti < APP.TYPES.length; ti++) {
            o += opt(APP.TYPES[ti], APP.TYPES[ti], d.type === APP.TYPES[ti]);
          }
          return o;
        })() + '</select></label>' +
      '<label class="field"><span>奖励碎片</span><input id="f_shards" type="number" min="1" max="20" step="1" value="' + (d.shards || 1) + '"></label>' +
      '<label class="field"><span>时段分组</span><select id="f_slot">' +
        opt('morning', '早晨', d.slot === 'morning') + opt('afternoon', '下午', d.slot === 'afternoon') +
        opt('evening', '晚上', d.slot === 'evening') + opt('anytime', '随时', d.slot === 'anytime') + '</select></label>' +
      '<label class="field"><span>完成方式</span><select id="f_mode">' +
        opt('check', '直接打钩', d.mode === 'check') + opt('photo', '拍照提交（家长看照片审核）', d.mode === 'photo') + '</select>' +
        '<span class="field__hint">拍照提交：孩子上传作业照片，家长审核通过后才发碎片。直接打钩：是否立即得碎片由「设置 → 打钩立即发碎片」开关控制。</span>' +
      '</label>' +
      '<label class="field"><span>截止时间（可选）</span><input id="f_deadline" type="time" value="' + (d.deadline || '') + '"></label>' +
      '<div class="field"><span>排程（每周几执行）</span><div class="wd-row">' +
        wdbox(1) + wdbox(2) + wdbox(3) + wdbox(4) + wdbox(5) + wdbox(6) + wdbox(7) +
      '</div></div>' +
      '<div class="row">' +
        '<button type="button" class="btn" data-act="cancel">取消</button>' +
        '<button type="button" class="btn btn--primary" data-act="save">保存</button>' +
      '</div>' +
    '</div></section>';

    container.innerHTML = html;
  }

  // 心愿礼物：孩子用道馆心愿星提交，家长确认兑换或退回（退回会返星）
  function wishAuditHtml() {
    var orders = APP.store.wishOrders ? APP.store.wishOrders() : [];
    var pending = orders.filter(function (o) { return o.status === 'pending'; });
    var h = '<section class="card"><h2>心愿礼物（待确认 ' + pending.length + '）</h2>';
    if (!pending.length) {
      h += '<p class="hint">暂无待确认的心愿礼物。</p>';
    } else {
      h += '<div class="tasks">';
      for (var i = 0; i < pending.length; i++) {
        var o = pending[i];
        h += '<div class="task"><div class="task__body">' +
          '<div class="task__title">¥' + o.yuan + ' 心愿礼物' +
            '<span class="badge">' + o.stars + ' ⭐</span>' +
            '<span class="badge">' + esc(o.date) + '</span></div>' +
          '<div class="task__meta">孩子留言：' + esc(o.note || '（无）') + '</div></div>' +
          '<div class="task__action">' +
            '<button type="button" class="btn btn--primary btn--sm" data-act="wish-ok" data-id="' + esc(o.id) + '">已兑换</button>' +
            '<button type="button" class="btn btn--sm" data-act="wish-no" data-id="' + esc(o.id) + '">退回（退星）</button>' +
          '</div></div>';
      }
      h += '</div>';
    }
    return h + '</section>';
  }

  function renderAudit(container) {
    var queue = APP.store.getAuditQueue();
    var html = header('审核队列', '待确认与待审核', true);
    html += '<section class="card"><h2>待处理（' + queue.length + '）</h2>';

    if (!queue.length) {
      html += '<p class="hint">暂无待确认或待审核的完成记录。</p>';
    } else {
      html += '<div class="tasks">';
      for (var i = 0; i < queue.length; i++) {
        var q = queue[i];
        var photoTask = q.task.mode === 'photo';
        var thumb = q.inst.photoId ? '<div class="task__thumb"><img data-photo="' + q.inst.photoId + '" alt="作业照片（点击查看大图）"></div>' : '';
        var note = q.inst.status === 'rejected' ? '<div class="task__meta">驳回原因：' + esc(q.inst.reviewNote || '（无说明）') + '</div>' : '';
        var stateText;
        if (q.inst.status === 'submitted') {
          stateText = photoTask ? '待审核（' + (q.inst.submittedAt || '') + ' 提交照片）' : '待确认（' + (q.inst.submittedAt || '') + ' 已打钩）';
        } else {
          stateText = '已驳回，可重新通过';
        }
        html += '<div class="task ' + (q.inst.status === 'rejected' ? 'is-rejected' : 'is-submitted') + '">' +
          '<div class="task__body">' +
            '<div class="task__title">' + esc(q.task.title) + ' <span class="badge"><i class="shard shard--sm"></i> ' + (q.task.shards || 1) + '</span>' +
              '<span class="badge">' + q.date + '</span>' +
              (q.inst.isFast ? '<span class="badge badge--fast">快手</span>' : '') + '</div>' +
            '<div class="task__meta">' + stateText + '</div>' +
            note + thumb +
          '</div>' +
          '<div class="task__action">' +
            (q.inst.status === 'submitted'
              ? '<button type="button" class="btn btn--primary btn--sm" data-act="approve" data-date="' + q.date + '" data-task="' + q.taskId + '">通过</button>' +
                '<button type="button" class="btn btn--sm" data-act="reject" data-date="' + q.date + '" data-task="' + q.taskId + '">驳回</button>'
              : '<button type="button" class="btn btn--primary btn--sm" data-act="approve" data-date="' + q.date + '" data-task="' + q.taskId + '">通过</button>') +
          '</div>' +
        '</div>';
      }
      html += '</div>';
    }
    html += '</section>';
    html += wishAuditHtml();
    container.innerHTML = html;

    var thumbs = container.querySelectorAll('[data-photo]');
    for (var j = 0; j < thumbs.length; j++) {
      (function (node) {
        var id = node.getAttribute('data-photo');
        APP.photos.src(id).then(function (dataUrl) { if (dataUrl) node.src = dataUrl; });
      })(thumbs[j]);
    }
  }

  // ===== 宝可梦调试（测试用，会直接改数据）=====

  function debugCurrentHtml() {
    var p = APP.store.activePokemon();
    if (!p) {
      return '<p class="hint">当前没有照顾的宝可梦。用下面的「添加宝可梦」加一只。</p>';
    }
    var need = APP.store.settings().expPerLevel;
    var inLevel = p.exp % need;
    var nextLv = APP.evo.levelNeed(p.dexNo);
    var tail;
    if (nextLv) {
      tail = '距下一形态还差 Lv.' + nextLv + (p.level >= nextLv ? '（已达标，等一次升级触发）' : '');
    } else if (APP.evo.isFinalForm(p.dexNo)) {
      tail = '已是最终形态';
    } else {
      // 剩下的可能是石头 / 交换类进化（已记录但暂未启用），别误写成「没有进化」
      var pend = APP.evo.pendingNext(p.dexNo);
      if (pend.length) {
        var labels = [];
        for (var qi = 0; qi < pend.length; qi++) {
          var kd = pend[qi].kind;
          labels.push(kd === 'item' ? (pend[qi].itemName || '道具') : (kd === 'trade' ? '交换' : '特殊条件'));
        }
        tail = '还有 ' + pend.length + ' 种进化（' + labels.join(' / ') + '），暂未启用';
      } else {
        tail = '这只没有进化';
      }
    }
    return '<div class="dbg__cur">' +
      '<img class="dbg__art" src="assets/pokemon/' + APP.pad3(p.dexNo) + '.png" alt="">' +
      '<div class="dbg__info">' +
        '<div class="dbg__line"><strong>' + esc(p.nickname) + '</strong>' +
          '<span class="badge">' + APP.pad3(p.dexNo) + '</span>' +
          '<span class="badge">Lv.' + p.level + '</span></div>' +
        '<div class="dbg__meta">经验 ' + inLevel + ' / ' + need + ' · 累计 ' + p.exp + '</div>' +
        '<div class="dbg__meta">' + tail + '</div>' +
        '<div class="dbg__meta">🤝 羁绊 ' + APP.store.calcStars(p) + '/5 星（' + (p.bond ? Math.round(p.bond.daysCared * 10) / 10 : 0) + ' 天 / ' + (p.bond ? p.bond.perfectDays : 0) + ' 元气 / ' + (p.bond ? p.bond.wins : 0) + ' 胜）</div>' +
      '</div>' +
    '</div>';
  }

  // 调试页顶部右侧：用户数据速览（道具与次数分开显示），免得来回切页面核对
  // 概念口径与游戏页一致：精灵球/战斗券是道具，捕捉/战斗「剩余次数」是入场门禁 canPlay().left
  function leftNow(kind) {
    var g = APP.store.canPlay(kind);
    if (g.ok) return (typeof g.left === 'number') ? g.left + ' 次' : '不限';
    if (g.reason === 'cooldown') return '冷却·还差 ' + g.waitDays + ' 天';
    if (g.reason === 'holidayLimit') return '0 次·今日用完';
    return '—';
  }
  function debugUserHtml() {
    var s = APP.store.get();
    var w = s.wallet || {};
    var tk = w.tickets || {};
    return '<ul class="list dbg__userlist">' +
      '<li><span class="k">精灵球</span><span class="v">' + (tk.capture || 0) + ' 个</span></li>' +
      '<li><span class="k">捕捉次数</span><span class="v">' + leftNow('capture') + '</span></li>' +
      '<li><span class="k">战斗券</span><span class="v">' + (tk.battle || 0) + ' 张</span></li>' +
      '<li><span class="k">战斗次数</span><span class="v">' + leftNow('battle') + '</span></li>' +
      '<li><span class="k">训练次数</span><span class="v">' + APP.store.getOutings() + '</span></li>' +
      '<li><span class="k">果实 🍒</span><span class="v">' + (w.berries || 0) + '</span></li>' +
      '<li><span class="k">药水 🧪</span><span class="v">' + (w.potions || 0) + '</span></li>' +
      '<li><span class="k">碎片 <i class="shard shard--sm"></i></span><span class="v">' + (w.shards || 0) + '</span></li>' +
    '</ul>';
  }
  function showRulesModal() {
    var g = APP.store.settings().playGate || { normalGapDays: 2, holidayPerDay: 3 };
    APP.ui.noticeCard({
      title: '次数与冷却规则',
      msg: '<b>捕捉 / 战斗</b>各有两样东西：<br>' +
        '① <b>道具</b>——精灵球、战斗券，每次入场各扣 1 个；<br>' +
        '② <b>入场次数</b>——与道具分开计。<br><br>' +
        '<b>次数规则：</b><br>' +
        '· 周六 / 周日 / 节假日：每天限 ' + g.holidayPerDay + ' 次，用完显示「今天次数用完」，<b>第二天自动恢复</b>；<br>' +
        '· 周一至周五：不限次数，但每玩一次要隔 ' + g.normalGapDays + ' 天才能再玩（<b>冷却</b>）。<br><br>' +
        '<b>冷却</b>不是倒计时消失的东西：它记的是「上次玩的日期」，到日子自动解除。<br><br>' +
        '<b>训练（外出）次数</b>：战斗 / 训练共用，每周自动累积，上限 10。<br><br>' +
        '<b>家长调试：</b>调试卡设置的「剩余次数」<b>不受上述上限约束</b>、可任意加，<b>次日自动刷新</b>回上面的正常规则；保存会同时清除冷却。'
    });
  }

  function ownedText() {
    var list = APP.store.listPokemon();
    if (!list.length) return '（还没有任何宝可梦）';
    var out = [];
    for (var i = 0; i < list.length; i++) {
      out.push(list[i].nickname + '(' + APP.pad3(list[i].dexNo) + ')' + (list[i].slot !== 'box' ? '·队伍' : ''));
    }
    return out.join('、');
  }

  // 输入编号时实时给出名字与头像，避免记错编号
  function updatePreview(preId, raw) {
    var el = document.getElementById(preId);
    if (!el) return;
    var isAdd = preId === 'd_add_pre';
    var n = parseInt(String(raw || '').replace(/[^0-9]/g, ''), 10);
    if (!n) {
      el.innerHTML = '<span class="dbg__hint">输入编号</span>';
      return;
    }
    var info = APP.evo.get(n);
    if (!info) {
      el.innerHTML = '<span class="dbg__hint dbg__hint--err">编号不在本期图鉴清单内（001–386 中已选定的宝可梦）</span>';
      return;
    }
    var owned = null;
    var list = APP.store.listPokemon();
    for (var i = 0; i < list.length; i++) {
      if (list[i].dexNo === n) owned = list[i];
    }
    el.innerHTML = '<img class="dbg__thumb" src="assets/pokemon/' + APP.pad3(n) + '.png" alt="">' +
      '<span class="dbg__name">' + esc(info.name) + '</span>' +
      '<span class="dbg__no">' + APP.pad3(n) + '</span>' +
      (owned ? '<span class="badge">' + (owned.slot !== 'box' ? '队伍中' : '已拥有') + '</span>' : '');
  }

  function renderDebug(container) {
    var html = header('宝可梦调试', '测试用 · 会直接修改数据', true);

    if (debugMsg) {
      html += '<section class="card dbg__msg ' + (debugMsg.ok ? 'is-ok' : 'is-err') + '">' +
        esc(debugMsg.text) + '</section>';
    }

    html += '<section class="card dbg__curcard"><div class="dbg__top">' +
      '<div class="dbg__top-main"><h2>当前主力</h2>' + debugCurrentHtml() + '</div>' +
      '<div class="dbg__top-user"><h2 class="dbg__user-t">用户数据' +
        '<button type="button" class="dbg__rules-btn" data-act="debug-rules">规则</button></h2>' +
        debugUserHtml() + '</div>' +
    '</div></section>';

    // 四个功能两列排布：主力信息 + 四个按钮尽量在一屏内可见
    html += '<div class="dbg__grid">' +

      '<div class="dbg__cell">' +
        '<h3 class="dbg__cell-t">添加宝可梦</h3>' +
        '<input class="dbg__in" id="d_add" type="text" inputmode="numeric" maxlength="3" placeholder="如 007" autocomplete="off">' +
        '<div class="dbg__pre" id="d_add_pre"><span class="dbg__hint">输入编号</span></div>' +
        '<button type="button" class="btn btn--primary btn--block btn--sm" data-act="debug-add">添加</button>' +
      '</div>' +

      '<div class="dbg__cell">' +
        '<h3 class="dbg__cell-t">更换主力</h3>' +
        '<input class="dbg__in" id="d_switch" type="text" inputmode="numeric" maxlength="3" placeholder="如 025" autocomplete="off">' +
        '<div class="dbg__pre" id="d_switch_pre"><span class="dbg__hint">输入编号</span></div>' +
        '<button type="button" class="btn btn--primary btn--block btn--sm" data-act="debug-switch">更换</button>' +
      '</div>' +

      '<div class="dbg__cell">' +
        '<h3 class="dbg__cell-t">主力加经验</h3>' +
        '<input class="dbg__in" id="d_exp" type="number" inputmode="numeric" min="1" step="1" placeholder="如 110" autocomplete="off">' +
        '<div class="dbg__pre"><span class="dbg__hint">100 经验 = 1 级</span></div>' +
        '<button type="button" class="btn btn--primary btn--block btn--sm" data-act="debug-exp">添加</button>' +
      '</div>' +

      '<div class="dbg__cell">' +
        '<h3 class="dbg__cell-t">重置主力</h3>' +
        '<div class="dbg__pre"><span class="dbg__hint">经验清零、还原基础形态</span></div>' +
        '<button type="button" class="btn btn--block btn--sm dbg__danger" data-act="debug-reset">重置</button>' +
      '</div>' +

      '<div class="dbg__cell dbg__cell--bond">' +
        '<h3 class="dbg__cell-t">羁绊数据修改</h3>' +
        '<div class="dbg__bondgrid">' +
          '<label class="dbg__bondrow"><span>照顾天数</span><input class="dbg__in" id="b_days" type="number" inputmode="numeric" min="0" step="1" autocomplete="off"></label>' +
          '<label class="dbg__bondrow"><span>元气满满天数</span><input class="dbg__in" id="b_perfect" type="number" inputmode="numeric" min="0" step="1" autocomplete="off"></label>' +
          '<label class="dbg__bondrow"><span>对战胜场</span><input class="dbg__in" id="b_wins" type="number" inputmode="numeric" min="0" step="1" autocomplete="off"></label>' +
        '</div>' +
        '<button type="button" class="btn btn--primary btn--block btn--sm" data-act="debug-bond">保存并刷新星级</button>' +
      '</div>' +

      '<div class="dbg__cell dbg__cell--bond">' +
        '<h3 class="dbg__cell-t">次数修改</h3>' +
        '<div class="dbg__bondgrid">' +
          '<label class="dbg__bondrow"><span>精灵球</span><input class="dbg__in" id="c_balls" type="number" inputmode="numeric" min="0" step="1" autocomplete="off"></label>' +
          '<label class="dbg__bondrow"><span>捕捉剩余</span><input class="dbg__in" id="c_catchleft" type="number" inputmode="numeric" min="0" step="1" placeholder="留空不修改" autocomplete="off"></label>' +
          '<label class="dbg__bondrow"><span>战斗券</span><input class="dbg__in" id="c_tickets" type="number" inputmode="numeric" min="0" step="1" autocomplete="off"></label>' +
          '<label class="dbg__bondrow"><span>战斗剩余</span><input class="dbg__in" id="c_battleleft" type="number" inputmode="numeric" min="0" step="1" placeholder="留空不修改" autocomplete="off"></label>' +
          '<label class="dbg__bondrow"><span>外出次数</span><input class="dbg__in" id="c_outings" type="number" inputmode="numeric" min="0" max="10" step="1" autocomplete="off"></label>' +
          '<div class="dbg__bondrow"><span>碎片</span>' +
            '<input class="dbg__in" id="c_shards" type="number" inputmode="numeric" min="1" step="1" placeholder="如 5" autocomplete="off">' +
            '<button type="button" class="btn btn--sm" data-act="debug-shard-add">调入</button>' +
            '<button type="button" class="btn btn--sm dbg__danger" data-act="debug-shard-sub">扣减</button>' +
          '</div>' +
        '</div>' +
        '<p class="hint">精灵球/战斗券是道具，入场各扣 1 个；「剩余」是入场次数：<b>留空 = 不修改</b>，填了就设为该值（不受每日上限约束、可任意加，次日自动刷新回正常规则）。碎片行填数量点「调入/扣减」立即生效，不用点「保存」。详见「用户数据」旁的「规则」。</p>' +
        '<button type="button" class="btn btn--primary btn--block btn--sm" data-act="debug-counts">保存</button>' +
      '</div>' +

      '</div>';

    html += '<p class="hint">' +
      '编号取本期图鉴清单（001–386 内已选定的宝可梦，含 152–386），进化形态（如 008 卡咪龟）也可直接添加；重置会清空历史/羁绊/状态并移除图鉴记录。<br>' +
      '已拥有：' + esc(ownedText()) +
    '</p>';

    container.innerHTML = html;

    // 羁绊输入框回填当前值
    var bp = APP.store.activePokemon();
    if (bp && bp.bond) {
      var bDays = document.getElementById('b_days');
      var bPerf = document.getElementById('b_perfect');
      var bWins = document.getElementById('b_wins');
      if (bDays) bDays.value = bp.bond.daysCared || 0;
      if (bPerf) bPerf.value = bp.bond.perfectDays || 0;
      if (bWins) bWins.value = bp.bond.wins || 0;
    }

    // 次数修改：三个输入框回填当前值
    var walletNow = APP.store.get().wallet || {};
    var tksNow = walletNow.tickets || {};
    var cBalls = document.getElementById('c_balls');
    var cTick = document.getElementById('c_tickets');
    var cOut = document.getElementById('c_outings');
    if (cBalls) cBalls.value = tksNow.capture || 0;
    if (cTick) cTick.value = tksNow.battle || 0;
    // 捕捉剩余 / 战斗剩余不回填：留空 = 不修改，避免保存时被当前值悄悄覆盖
    if (cOut) cOut.value = APP.store.getOutings();
  }

  // ===== 玩法与题库：调试用，重置当天次数 + 自定义题库 =====
  var PLAY_NAMES = [
    ['pinyin', '记忆翻牌 · 拼音'], ['english', '记忆翻牌 · 英语'],
    ['mul99', '训练 · 99乘法表'], ['idiom', '训练 · 成语填空'],
    ['tic', '训练 · 井字棋'], ['rps', '训练 · 剪刀石头布']
  ];
  function playStatus() {
    var s = APP.store.get(), t = APP.todayStr(), m = {}, tr = {}, i;
    var ma = Array.isArray(s.memoryPlays) ? s.memoryPlays : [];
    for (i = 0; i < ma.length; i++) if (ma[i].date === t) m = ma[i].packs || {};
    var ta = Array.isArray(s.trainingPlays) ? s.trainingPlays : [];
    for (i = 0; i < ta.length; i++) if (ta[i].date === t) tr = ta[i].games || {};
    return { m: m, tr: tr };
  }
  function resetPlayCounts(kind) {
    var s = APP.store.get(), t = APP.todayStr(), n = 0;
    function clearDay(arr) {
      if (!Array.isArray(arr)) return arr;
      var out = [];
      for (var i = 0; i < arr.length; i++) {
        if (arr[i].date === t) n++; else out.push(arr[i]);
      }
      return out;
    }
    if (kind === 'memory' || kind === 'all') s.memoryPlays = clearDay(s.memoryPlays);
    if (kind === 'training' || kind === 'all') s.trainingPlays = clearDay(s.trainingPlays);
    APP.store.save();
    return n;
  }
  function renderPlayTools(container) {
    var ps = playStatus(), i;
    var html = header('玩法与题库', '调试用 · 会直接修改当天次数', true);
    html += '<section class="card"><h2>玩法重置</h2>' +
      '<p class="hint">今日已玩状态（重置后当天还能再玩一次）</p><div class="pt-grid">';
    for (i = 0; i < PLAY_NAMES.length; i++) {
      var k = PLAY_NAMES[i][0];
      var done = (i < 2 ? ps.m[k] : ps.tr[k]) === true;
      html += '<div class="pt-item"><span>' + PLAY_NAMES[i][1] + '</span>' +
        '<b class="' + (done ? 'is-done' : '') + '">' + (done ? '✓ 已玩' : '— 可玩') + '</b></div>';
    }
    html += '</div><div class="row pt-btns">' +
      '<button type="button" class="btn" data-act="play-reset-memory">重置记忆翻牌</button>' +
      '<button type="button" class="btn" data-act="play-reset-training">重置训练</button>' +
      '<button type="button" class="btn btn--primary" data-act="play-reset-all">全部重置</button>' +
      '</div><p class="hint">只重置当天的可玩次数，已获得的经验 / 果实 / 碎片不回收；保存后随存档同步。</p></section>';

    var bk = APP.bankImport ? APP.bankImport.stats() : { idiom: 0, pinyin: 0, english: 0, enabled: true };
    html += '<section class="card"><h2>自定义题库</h2>' +
      '<div class="row">' +
        '<a class="btn" href="' + (APP.bankImport ? APP.bankImport.TEMPLATE_URL : '#') + '" download>下载模板</a>' +
        '<button type="button" class="btn btn--primary" data-act="bank-upload">上传题库</button>' +
      '</div>' +
      '<p class="hint">当前：成语 ' + bk.idiom + ' 题 · 拼音 ' + bk.pinyin + ' 组 · 英语 ' + bk.english + ' 组，' +
        (bk.enabled ? '<b>已启用</b>' : '<b>已停用</b>') + '。<br>' +
        '只导入「启用=1」的行，自动跳过重复题与格式错误的行；题目与内置题库合并后随存档同步到云端。也支持直接上传按 [成语填空] 分块的 TSV。</p>' +
      '<div class="row">' +
        '<button type="button" class="btn btn--sm" data-act="bank-toggle">' + (bk.enabled ? '停用自定义题库' : '启用自定义题库') + '</button>' +
        '<button type="button" class="btn btn--sm" data-act="bank-clear">清空自定义题库</button>' +
      '</div>' +
      '<p class="hint">停用后题目仍保留、随时可再启用；清空只删除三个自定义题库，内置题目不受影响。</p>' +
    '</section>';
    container.innerHTML = html;
  }

  function renderSettings(container) {
    var st = APP.store.settings();
    var inkMode = (st && st.inkMode) || 'auto';
    var inkOn = document.body.classList.contains('ink');
    var modeLabel = { auto: '自动检测', color: '始终彩色', ink: '始终黑白' };
    var expOnCheck = APP.store.expOnCheck();
    var html = header('设置', '密码与数据', true);
    html += '<section class="card"><h2>碎片发放</h2><div class="form">' +
      '<label class="field field--row"><span>打钩立即发碎片</span><input id="s_exponcheck" type="checkbox"' + (expOnCheck ? ' checked' : '') + '></label>' +
      '<p class="hint">' +
        '打开：孩子打钩后碎片立即到账。<br>' +
        '关闭：孩子打钩后碎片<b>不立即到账</b>，需你在「审核队列」确认通过后才发放（防止孩子自己乱点打钩刷碎片）。<br>' +
        '注意：「拍照提交」类任务无论此开关如何，都要审核通过后才发碎片。' +
      '</p>' +
    '</div></section>';

    html += '<section class="card"><h2>显示模式</h2><div class="form">' +
      '<label class="field"><span>界面配色</span><select id="s_ink">' +
        '<option value="auto"' + (inkMode === 'auto' ? ' selected' : '') + '>自动（检测到墨水屏自动转黑白）</option>' +
        '<option value="color"' + (inkMode === 'color' ? ' selected' : '') + '>始终彩色</option>' +
        '<option value="ink"' + (inkMode === 'ink' ? ' selected' : '') + '>始终黑白（墨水屏）</option>' +
      '</select></label>' +
      '<p class="hint">当前生效：' + (inkOn ? '黑白（墨水屏模式）' : '彩色') + '。普通手机/电脑默认彩色；在墨水屏上打开会自动变黑白，宝可梦立绘同步转灰，减少残影。</p>' +
    '</div></section>';

    html += '<section class="card"><h2>修改管理密码</h2><div class="form">' +
      '<label class="field"><span>新密码</span><input id="s_pin" type="password" inputmode="numeric" maxlength="12" placeholder="4-12 位数字/字母"></label>' +
      '<label class="field"><span>确认密码</span><input id="s_pin2" type="password" inputmode="numeric" maxlength="12"></label>' +
      '<button type="button" class="btn btn--primary btn--block" data-act="setpin">保存新密码</button>' +
    '</div></section>';

    html += '<section class="card"><h2>数据管理</h2>' +
      '<div class="row">' +
        '<button type="button" class="btn" data-act="restore">恢复默认任务</button>' +
        '<button type="button" class="btn" data-act="reset">清空全部数据</button>' +
      '</div>' +
      '<p class="hint">恢复默认任务：清空自定义任务、还原为内置 5 项；清空全部数据：重置整个应用（含打卡记录、宝可梦、照片），不可逆。</p>' +
    '</section>';

    // 自定义题库已搬到首页「玩法与题库」页，避免两处重复

    // 纯静态版：原「服务器」设置替换为 GitHub 同步设置（家长在此填写仓库与 PAT，每台设备一次）
    html += (APP.ghui && APP.ghui.cardHtml) ? APP.ghui.cardHtml() : '';

    container.innerHTML = html;

    // 显示模式：选择即生效并持久化（切模式后 APP.refresh 会重新渲染）
    var inkSel = document.getElementById('s_ink');
    if (inkSel) {
      inkSel.addEventListener('change', function () {
        APP.store.setInkMode(inkSel.value);
        APP.refresh();
      });
    }

    // 打钩立即发碎片：勾选即生效并持久化（存储键仍为 expOnCheck，避免牵动多文件）
    var expBox = document.getElementById('s_exponcheck');
    if (expBox) {
      expBox.addEventListener('change', function () {
        APP.store.setExpOnCheck(expBox.checked);
        APP.refresh();
      });
    }
  }

  function readForm() {
    var title = (document.getElementById('f_title').value || '').trim();
    var type = document.getElementById('f_type').value;
    var shards = parseInt(document.getElementById('f_shards').value, 10);
    if (isNaN(shards) || shards < 1) shards = 1;
    var mode = document.getElementById('f_mode').value;
    var deadline = document.getElementById('f_deadline').value || '';
    var slot = document.getElementById('f_slot').value;
    var wd = [];
    var boxes = containerRef.querySelectorAll('input[name="wd"]:checked');
    for (var i = 0; i < boxes.length; i++) wd.push(parseInt(boxes[i].value, 10));
    if (wd.length === 0) wd = APP.ALL_WEEK.slice();
    return { title: title || type, type: type, shards: shards, mode: mode, deadline: deadline, slot: slot, weekdays: wd };
  }

  var containerRef = null;

  function onClick(e) {
    var photoNode = closest(e.target, '[data-photo]');
    if (photoNode) { APP.ui.previewPhoto(photoNode.getAttribute('data-photo')); return; }

    var btn = closest(e.target, '[data-act]');
    var tplBtn = closest(e.target, '[data-tpl]');

    if (tplBtn) {
      var type = tplBtn.getAttribute('data-tpl');
      var t = templateDefaults(type);
      editingId = null;
      // 用模板默认值直接打开编辑表单
      pendingTemplate = t;
      view = 'edit';
      APP.refresh();
      return;
    }
    if (!btn) return;
    var act = btn.getAttribute('data-act');
    var taskId = btn.getAttribute('data-task');
    var date = btn.getAttribute('data-date');

    // GitHub 同步设置卡（我的数据页 / 后台设置页共用）：gh-save / gh-test / gh-sync
    if (APP.ghui && APP.ghui.handle(act)) { APP.refresh(); return; }

    if (act === 'login') {
      var pin = (document.getElementById('pin') || {}).value || '';
      if (pin === APP.store.get().family.pin) {
        authed = true; view = 'home'; APP.refresh();
      } else {
        alert('密码错误');
      }
      return;
    }
    if (act === 'exit') {
      authed = false;
      view = 'login';
      editingId = null;
      pendingTemplate = null;
      window.location.hash = '#/schedule';
      return;
    }
    if (act === 'back') {
      // 编辑页返回任务列表，其余子页返回后台首页
      view = (view === 'edit') ? 'tasks' : 'home';
      editingId = null;
      pendingTemplate = null;
      APP.refresh();
      return;
    }
    if (act === 'go-tasks') { view = 'tasks'; APP.refresh(); return; }
    if (act === 'go-audit') { view = 'audit'; APP.refresh(); return; }
    if (act === 'go-playtools') { view = 'playtools'; APP.refresh(); return; }
    if (act === 'go-debug') { view = 'debug'; debugMsg = null; APP.refresh(); return; }
    if (act === 'go-settings') { view = 'settings'; APP.refresh(); return; }
    if (act === 'play-reset-memory' || act === 'play-reset-training' || act === 'play-reset-all') {
      var pk = act === 'play-reset-memory' ? 'memory' : (act === 'play-reset-training' ? 'training' : 'all');
      var pn = resetPlayCounts(pk);
      APP.refresh();
      APP.ui.noticeCard({ title: '已重置', msg: '当天次数已清除（' + pn +
        ' 条记录），现在可以重新玩一次。已获得的经验 / 果实 / 碎片不回收。' });
      return;
    }
    if (act === 'go-account') { view = 'account'; accountMsg = null; APP.refresh(); return; }
    if (act === 'save-nickname') {
      var nick = fieldVal('acc_nickname');
      if (!nick) { accountMsg = { ok: false, text: '昵称不能为空' }; APP.refresh(); return; }
      return APP.auth.updateProfile(nick).then(function (j) {
        if (j && j.ok) {
          accountMsg = { ok: true, text: '昵称已更新' };
        } else {
          accountMsg = { ok: false, text: (j && j.error) || '保存失败' };
        }
        APP.refresh();
      });
    }
    if (act === 'save-parent-pwd') {
      var oldP = fieldVal('acc_old'), np = fieldVal('acc_new'), np2 = fieldVal('acc_new2');
      if (np !== np2) { accountMsg = { ok: false, text: '两次输入的新密码不一致' }; APP.refresh(); return; }
      if (np.length < 8) { accountMsg = { ok: false, text: '大人密码需 8 位以上' }; APP.refresh(); return; }
      return APP.auth.changeParentPwd(oldP, np).then(function (j) {
        accountMsg = (j && j.ok)
          ? { ok: true, text: '大人密码已修改，下次登录请用新密码' }
          : { ok: false, text: (j && j.error) || '修改失败' };
        APP.refresh();
      });
    }
    if (act === 'reset-child-pwd') {
      var kp = fieldVal('kid_new'), kp2 = fieldVal('kid_new2');
      if (kp !== kp2) { accountMsg = { ok: false, text: '两次输入的新密码不一致' }; APP.refresh(); return; }
      if (kp.length < 4) { accountMsg = { ok: false, text: '小孩密码需 4 位以上' }; APP.refresh(); return; }
      return APP.auth.resetChildPwd(kp).then(function (j) {
        accountMsg = (j && j.ok)
          ? { ok: true, text: '小孩密码已重置，孩子下次登录用新密码' }
          : { ok: false, text: (j && j.error) || '重置失败' };
        APP.refresh();
      });
    }

    // ===== 宝可梦调试的四个动作 =====
    if (act === 'debug-add') {
      var addEl = document.getElementById('d_add');
      var r1 = APP.store.addPokemonByDex(addEl ? addEl.value : '');
      debugMsg = { ok: r1.ok, text: r1.msg };
      APP.refresh();
      return;
    }
    if (act === 'debug-bond') {
      var bDays = document.getElementById('b_days');
      var bPerf = document.getElementById('b_perfect');
      var bWins = document.getElementById('b_wins');
      var r5 = APP.store.debugSetBond(
        bDays ? bDays.value : '',
        bPerf ? bPerf.value : '',
        bWins ? bWins.value : ''
      );
      debugMsg = { ok: r5.ok, text: r5.msg };
      APP.refresh();
      return;
    }
    if (act === 'debug-rules') {
      showRulesModal();
      return;
    }
    if (act === 'debug-counts') {
      var cBallsEl = document.getElementById('c_balls');
      var cTickEl = document.getElementById('c_tickets');
      var cCatchLEl = document.getElementById('c_catchleft');
      var cBattleLEl = document.getElementById('c_battleleft');
      var cOutEl = document.getElementById('c_outings');
      var r7 = APP.store.debugSetCounts(
        cBallsEl ? cBallsEl.value : '',
        cTickEl ? cTickEl.value : '',
        cOutEl ? cOutEl.value : '',
        cCatchLEl ? cCatchLEl.value : '',
        cBattleLEl ? cBattleLEl.value : ''
      );
      debugMsg = { ok: r7.ok, text: r7.msg };
      APP.refresh();
      return;
    }
    if (act === 'debug-switch') {
      var swEl = document.getElementById('d_switch');
      var r2 = APP.store.setActiveByDex(swEl ? swEl.value : '');
      debugMsg = { ok: r2.ok, text: r2.msg };
      APP.refresh();
      return;
    }
    // 调整碎片：调入 / 扣减（调试用，直接改钱包；扣到 0 为止）。输入框在「次数修改」卡内
    if (act === 'debug-shard-add' || act === 'debug-shard-sub') {
      var shEl = document.getElementById('c_shards');
      var n4 = parseInt(shEl ? shEl.value : '', 10);
      if (isNaN(n4) || n4 <= 0) {
        debugMsg = { ok: false, text: '请先填一个大于 0 的数量' };
      } else {
        var delta = act === 'debug-shard-add' ? n4 : -n4;
        var before4 = APP.store.get().wallet.shards || 0;
        APP.store.addShards(delta, '家长后台调试' + (delta > 0 ? '调入' : '扣减'));
        var after4 = APP.store.get().wallet.shards || 0;
        debugMsg = { ok: true, text: '碎片 ' + before4 + ' → ' + after4 + (delta < 0 && n4 > before4 ? '（不足部分扣到 0）' : '') };
      }
      APP.refresh();
      return;
    }

    if (act === 'debug-exp') {
      var expEl = document.getElementById('d_exp');
      var r3 = APP.store.debugAddExp(expEl ? expEl.value : '');
      if (r3.ok) {
        var need = APP.store.settings().expPerLevel;
        debugMsg = {
          ok: true,
          text: '已添加 ' + r3.gained + ' 经验：Lv.' + r3.from.level + ' ' + r3.from.inLevel + '/' + need +
            ' → Lv.' + r3.to.level + ' ' + r3.to.inLevel + '/' + need +
            (r3.evolved ? '（已直接进化为 ' + r3.evolvedTo + '，不播放演出）' : '') +
            (r3.capped ? '（请求 ' + r3.requested + '，已满级，剩余未发放）' : '')
        };
      } else {
        debugMsg = { ok: false, text: r3.msg };
      }
      APP.refresh();
      // 家长后台平时不播事件（留到孩子端），但调试页要当场看到升级 / 进化，所以这里主动播
      if (APP.events) APP.events.flush();
      return;
    }
    if (act === 'debug-reset') {
      APP.ui.confirm('重置这只宝可梦？经验会清零并还原成基础形态，这只宝可梦的进化历史、羁绊与图鉴记录都会被清空，不可撤销。', '重置').then(function (ok) {
        if (!ok) return;
        var r4 = APP.store.resetActivePokemon();
        debugMsg = { ok: r4.ok, text: r4.msg };
        APP.refresh();
      });
      return;
    }

    if (act === 'edit') { editingId = taskId; pendingTemplate = null; view = 'edit'; APP.refresh(); return; }
    if (act === 'del') {
      APP.ui.confirm('确定删除该任务？删除后历史打卡记录保留，但今后不再生成此任务。', '删除').then(function (ok) {
        if (ok) { APP.store.removeTask(taskId); APP.refresh(); }
      });
      return;
    }
    if (act === 'cancel') { view = 'tasks'; APP.refresh(); return; }

    if (act === 'save') {
      var data = readForm();
      if (editingId) {
        data.id = editingId;
        APP.store.updateTask(data);
      } else {
        APP.store.addTask(data);
      }
      editingId = null; pendingTemplate = null;
      view = 'tasks'; APP.refresh();
      return;
    }

    if (act === 'wish-ok' || act === 'wish-no') {
      APP.store.finishWish(btn.getAttribute('data-id'), act === 'wish-ok');
      APP.refresh();
      return;
    }

    if (act === 'approve') {
      APP.store.approve(date, taskId);
      APP.refresh();
      return;
    }
    if (act === 'reject') {
      var reason = window.prompt('请填写驳回原因（孩子端可见）：', '');
      if (reason === null) return; // 取消
      APP.store.reject(date, taskId, reason);
      APP.refresh();
      return;
    }

    if (act === 'setpin') {
      var p1 = (document.getElementById('s_pin') || {}).value || '';
      var p2 = (document.getElementById('s_pin2') || {}).value || '';
      if (!p1) { alert('密码不能为空'); return; }
      if (p1 !== p2) { alert('两次输入不一致'); return; }
      APP.store.setPin(p1);
      alert('密码已更新');
      APP.refresh();
      return;
    }
    if (act === 'restore') {
      APP.ui.confirm('恢复默认任务将覆盖当前所有任务（含自定义），确定？', '恢复').then(function (ok) {
        if (ok) { APP.store.restoreDefaultTasks(); APP.refresh(); }
      });
      return;
    }
    if (act === 'reset') {
      APP.ui.confirm('将清空全部数据（打卡记录、宝可梦、照片等），此操作不可逆！确定？', '清空').then(function (ok) {
        if (ok) { APP.store.resetAll(); alert('已清空，应用已重置'); APP.refresh(); }
      });
      return;
    }
    if (act === 'bank-upload') {
      APP.bankImport.pick().then(function (sheets) {
        var res;
        try { res = APP.bankImport.applySheets(sheets); }
        catch (e) { APP.ui.noticeCard({ title: '导入失败', msg: esc(e.message) }); return; }
        APP.ui.noticeCard({ title: '题库导入完成', msg: APP.bankImport.summaryHtml(res) })
          .then(function () { APP.refresh(); });
      })['catch'](function (e) {
        APP.ui.noticeCard({ title: '导入失败', msg: esc(e && e.message ? e.message : String(e)) });
      });
      return;
    }
    if (act === 'bank-toggle') {
      APP.bankImport.setEnabled(!APP.bankImport.stats().enabled);
      APP.refresh();
      return;
    }
    if (act === 'bank-clear') {
      APP.ui.confirm('确定清空全部自定义题库？内置题目不受影响，此操作不可撤销。', '清空').then(function (ok) {
        if (ok) { APP.bankImport.clear(); APP.refresh(); }
      });
      return;
    }
  }

  var pendingTemplate = null;

  function closest(node, selector) {
    var attr = selector.replace('[', '').replace(']', '');
    while (node && node.getAttribute) {
      if (node.getAttribute(attr)) return node;
      node = node.parentNode;
    }
    return null;
  }

  // 离开家长后台时调用（路由切走或点「退出后台」）：清登录态，下次进入需重新输密码
  function reset() {
    authed = false;
    view = 'login';
    editingId = null;
    pendingTemplate = null;
    debugMsg = null;
    accountMsg = null;
  }

  // 编号输入时实时预览（头像 + 名字），避免记错编号
  function onInput(e) {
    var t = e && e.target;
    if (!t || !t.id) return;
    if (t.id === 'd_add') updatePreview('d_add_pre', t.value);
    else if (t.id === 'd_switch') updatePreview('d_switch_pre', t.value);
  }

  // 登录页与调试页支持回车提交，少点一次按钮
  function onKeydown(e) {
    var key = e.key || e.keyCode;
    if (key !== 'Enter' && key !== 13) return;
    if (!containerRef) return;
    if (view === 'login') {
      var btn = containerRef.querySelector('[data-act="login"]');
      if (btn) btn.click();
      return;
    }
    if (view === 'debug') {
      var map = { d_add: 'debug-add', d_switch: 'debug-switch', d_exp: 'debug-exp' };
      var id = e.target && e.target.id;
      if (id && map[id]) {
        var b = containerRef.querySelector('[data-act="' + map[id] + '"]');
        if (b) b.click();
      }
    }
  }

  function renderEntry(container) {
    containerRef = container;
    render(container);
    if (!bound) {
      container.addEventListener('click', onClick);
      container.addEventListener('keydown', onKeydown);
      container.addEventListener('input', onInput);
      bound = true;
    }
  }

  APP.screens.parent = { render: renderEntry, reset: reset };
})(window.APP);
