window.APP = window.APP || {};
(function (APP) {
  'use strict';

  // ===== 样式（博士引导居中弹窗 + 轻提示）=====
  var DOC_CSS =
    // 博士是「解锁时刻」的最高优先级引导：必须盖住解锁任务面板(140)、分叉弹窗(200)、通用弹层(100)，
    // 否则用户开着面板时博士会在底下弹完就永久错过（历史 bug：面板整片盖住博士）。
    // 2026-11-14：底部浮层改为「居中弹窗」，博士形象统一用全身图。
    '#docOverlay{position:fixed;inset:0;z-index:220;display:none;align-items:center;justify-content:center;padding:16px;font-family:inherit}' +
    '#docOverlay .doc-bg{position:absolute;inset:0;background:rgba(20,16,12,.52)}' +
    '#docOverlay .doc-sheet{position:relative;display:flex;align-items:flex-end;gap:6px;width:100%;max-width:430px;max-height:86vh;overflow-y:auto;background:#fff;border-radius:18px;padding:16px 14px;box-shadow:0 14px 40px rgba(0,0,0,.3);transform:translateY(14px) scale(.96);transition:transform .26s ease,opacity .26s ease;opacity:0}' +
    '#docOverlay.is-in .doc-sheet{transform:translateY(0) scale(1);opacity:1}' +
    '#docOverlay .doc-fig{flex:none;width:96px;pointer-events:none}' +
    '#docOverlay .doc-fig img{width:100%;display:block;filter:drop-shadow(0 4px 8px rgba(0,0,0,.16))}' +
    '#docOverlay .doc-bubble{flex:1;min-width:0;align-self:center}' +
    '#docOverlay .doc-f{font-weight:800;color:#3a2c1c;font-size:15px;margin-bottom:6px}' +
    '#docOverlay .doc-t{font-size:13px;color:#5a4632;line-height:1.55}' +
    '#docOverlay .doc-line{padding:4px 0;font-size:12.5px;line-height:1.6}' +
    '#docOverlay .doc-line + .doc-line{border-top:1px dashed rgba(90,70,50,.16);margin-top:2px}' +
    '#docOverlay .doc-line:first-child{font-weight:700;color:#3a2c1c;font-size:13px}' +
    '#docOverlay .doc-reward{display:inline-block;margin-top:10px;background:#FFF3D6;border:1px solid #E5C77A;color:#8A5A12;border-radius:10px;padding:5px 10px;font-size:12px;font-weight:700}' +
    '#docOverlay .doc-actions{display:flex;gap:8px;margin-top:14px}' +
    '#docOverlay .doc-go{flex:1;min-width:0;background:#e0542f;color:#fff;border:none;border-radius:12px;padding:11px 8px;font-weight:700;font-size:13px;cursor:pointer;white-space:nowrap}' +
    '#docOverlay .doc-ok{flex:none;background:#f1e8d8;color:#5a4632;border:none;border-radius:12px;padding:11px 12px;font-weight:700;font-size:13px;cursor:pointer;white-space:nowrap}' +
    '#obToast{position:fixed;left:50%;top:66px;transform:translateX(-50%) translateY(-12px);background:rgba(40,32,24,.92);color:#fff;padding:9px 16px;border-radius:20px;font-size:13px;z-index:230;opacity:0;transition:opacity .25s,transform .25s;pointer-events:none;max-width:86vw;text-align:center}' +
    '#obToast.is-show{opacity:1;transform:translateX(-50%) translateY(0)}';

  // 解锁任务面板：日程页入口条 + 居中弹窗（与博士浮层共用一层样式注入）
  var TASK_CSS =
    '.unlock-entry{display:flex;align-items:center;gap:10px;width:100%;margin-top:10px;padding:9px 11px;border:1px solid var(--line-soft,#e6eaf3);border-radius:12px;background:var(--surface,#eaeef8);color:var(--text,#242733);text-align:left;cursor:pointer;font:inherit}' +
    '.unlock-entry:active{background:var(--line-soft,#e6eaf3)}' +
    '.unlock-entry__i{flex:none;font-size:18px;line-height:1}' +
    '.unlock-entry__m{flex:1;min-width:0;display:flex;flex-direction:column;gap:2px}' +
    '.unlock-entry__t{font-size:13px;font-weight:700}' +
    '.unlock-entry__t em{font-style:normal;font-weight:600;color:var(--ink,#3b4cca);margin-left:6px;font-size:12px}' +
    '.unlock-entry__s{font-size:11px;color:var(--muted,#666d80);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}' +
    '.unlock-entry__go{flex:none;font-size:12px;font-weight:700;color:var(--ink,#3b4cca)}' +
    '#taskOverlay{position:fixed;inset:0;z-index:140;display:none;font-family:inherit}' +
    '#taskOverlay .tk-bg{position:absolute;inset:0;background:rgba(20,16,12,.5)}' +
    '#taskOverlay .tk-modal{position:absolute;left:50%;top:50%;transform:translate(-50%,-48%) scale(.96);width:calc(100% - 28px);max-width:460px;max-height:84vh;display:flex;flex-direction:column;background:var(--card,#fff);border-radius:18px;box-shadow:0 12px 40px rgba(0,0,0,.28);opacity:0;transition:transform .24s ease,opacity .24s ease;overflow:hidden}' +
    '#taskOverlay.is-in .tk-modal{transform:translate(-50%,-50%) scale(1);opacity:1}' +
    '#taskOverlay .tk-head{position:relative;flex:none;padding:16px 18px 12px;border-bottom:1px solid var(--line-soft,#e6eaf3)}' +
    '#taskOverlay .tk-title{font-size:17px;font-weight:800;color:var(--text,#242733)}' +
    '#taskOverlay .tk-x{position:absolute;right:12px;top:12px;width:30px;height:30px;border:none;background:var(--surface,#eaeef8);border-radius:50%;font-size:16px;color:var(--muted,#666d80);cursor:pointer}' +
    '#taskOverlay .tk-sum{margin-top:10px;font-size:12px;color:var(--muted,#666d80)}' +
    '#taskOverlay .tk-bar{height:7px;border-radius:99px;background:var(--ring-off,#dde3f0);margin-top:7px;overflow:hidden}' +
    '#taskOverlay .tk-bar i{display:block;height:100%;border-radius:99px;background:var(--ink,#3b4cca);transition:width .35s}' +
    '#taskOverlay .tk-next{margin-top:8px;font-size:12px;font-weight:700;color:var(--ink,#3b4cca)}' +
    '#taskOverlay .tk-body{flex:1;overflow-y:auto;padding:12px 14px 4px;-webkit-overflow-scrolling:touch}' +
    '#taskOverlay .tk-item{border:1px solid var(--line-soft,#e6eaf3);border-radius:12px;margin-bottom:10px;overflow:hidden}' +
    '#taskOverlay .tk-item.is-now{border-color:var(--ink,#3b4cca)}' +
    '#taskOverlay .tk-item.is-open .tk-item__h{border-bottom:1px solid var(--line-soft,#e6eaf3)}' +
    '#taskOverlay .tk-item__h{display:flex;align-items:center;gap:9px;width:100%;padding:11px 12px;border:none;background:transparent;text-align:left;cursor:pointer;font:inherit;color:var(--text,#242733)}' +
    '#taskOverlay .tk-tier{flex:none;width:30px;height:30px;border-radius:9px;background:var(--surface,#eaeef8);color:var(--ink,#3b4cca);font-size:12px;font-weight:800;display:flex;align-items:center;justify-content:center}' +
    '#taskOverlay .tk-item.is-done .tk-tier{background:var(--ink,#3b4cca);color:#fff}' +
    '#taskOverlay .tk-item__n{flex:1;min-width:0;display:flex;flex-direction:column;gap:2px}' +
    '#taskOverlay .tk-item__t{font-size:13px;font-weight:700}' +
    '#taskOverlay .tk-item__c{font-size:11px;color:var(--muted,#666d80)}' +
    // 展开时隐藏卡头的条件小字：条件只在展开区的任务清单里出现一次（收起态才需要卡头概览）
    '#taskOverlay .tk-item.is-open .tk-item__c{display:none}' +
    '#taskOverlay .tk-state{flex:none;font-size:10px;font-weight:700;border-radius:99px;padding:3px 8px;background:var(--surface,#eaeef8);color:var(--muted,#666d80)}' +
    '#taskOverlay .tk-state.is-done{background:#e3f5e9;color:var(--ok,#2e9e5b)}' +
    '#taskOverlay .tk-state.is-now{background:#e8ecff;color:var(--ink,#3b4cca)}' +
    '#taskOverlay .tk-arrow{flex:none;font-size:11px;color:var(--muted,#666d80)}' +
    '#taskOverlay .tk-detail{display:none;padding:10px 12px 12px;background:var(--bg,#f3f6fc)}' +
    '#taskOverlay .tk-item.is-open .tk-detail{display:block}' +
    '#taskOverlay .tk-count-line{margin-top:9px;font-size:12px;color:var(--muted,#666d80)}' +
    // 累计打卡次数统一高亮：加粗 + 橙色，出现在面板汇总行与各档进度里
    '#taskOverlay .tk-hl{color:#e0542f;font-weight:800;font-size:14px;margin:0 2px}' +
    '#taskOverlay .tk-tasks li small .tk-hl{font-size:13px}' +
    '#taskOverlay .tk-tasks{list-style:none;margin:0 0 9px;padding:0}' +
    '#taskOverlay .tk-tasks li{font-size:12px;color:var(--text,#242733);padding:3px 0;display:flex;gap:7px;align-items:flex-start}' +
    '#taskOverlay .tk-tasks li i{font-style:normal;flex:none;width:15px;color:var(--muted,#666d80)}' +
    '#taskOverlay .tk-tasks li.is-ok i{color:var(--ok,#2e9e5b)}' +
    '#taskOverlay .tk-tasks li small{margin-left:auto;color:var(--muted,#666d80);font-size:11px;flex:none}' +
    '#taskOverlay .tk-reward{display:inline-block;font-size:11px;font-weight:700;color:#8a5a12;background:#fff3d6;border:1px solid #e5c77a;border-radius:9px;padding:4px 9px}' +
    '#taskOverlay .tk-reward.is-got{background:#e3f5e9;border-color:#bfe5cd;color:#2e7d4f}' +
    '#taskOverlay .tk-go{display:block;width:100%;margin-top:9px;border:none;border-radius:10px;background:var(--ink,#3b4cca);color:#fff;font-size:12px;font-weight:700;padding:9px;cursor:pointer}' +
    '#taskOverlay .tk-foot{flex:none;padding:10px 16px 14px;border-top:1px solid var(--line-soft,#e6eaf3);font-size:11px;color:var(--muted,#666d80);line-height:1.5}' +
    '#taskOverlay .tk-foot em{font-style:normal;color:var(--ink,#3b4cca);font-weight:700}' +
    '#taskOverlay .tk-reward-row{display:flex;align-items:center;gap:8px;flex-wrap:wrap}' +
    '#taskOverlay .tk-doclink{margin-left:auto;border:1px solid var(--line-soft,#e6eaf3);background:transparent;color:var(--ink,#3b4cca);font:inherit;font-size:11px;font-weight:700;border-radius:9px;padding:4px 9px;cursor:pointer;white-space:nowrap}' +
    '#taskOverlay .tk-doclink:active{background:var(--surface,#eaeef8)}' +
    '#taskOverlay .tk-or{color:var(--ink,#3b4cca);font-weight:800;margin:0 2px}' +
    '.care-btn.is-locked{opacity:.52;filter:grayscale(.55);border-style:dashed}';

  DOC_CSS += TASK_CSS;

  // ===== 各档位条件（2026-11-15：前四档改为「累计打卡次数 + 登录天数」双条件）=====
  // 「1 次打卡」= 完成 1 条日程任务（done/submitted/approved），累计全历史、不按月清零。
  // 「1 天登录」= 有真实打卡记录的一个不同日期（instances 里当天至少有一条已完成）。
  // 两个条件都要满足，避免小孩一天之内把全部功能刷开；T5 起仍按主力等级。
  // T5 图鉴+捕捉(Lv5) / T6 对战(Lv7) / T7 道馆(Lv10) 不受影响。
  var UNLOCK_REQ = {
    play:     { checks: 2,  days: 2 },
    train:    { checks: 5,  days: 3 },
    ranch:    { checks: 7,  days: 3 },
    exchange: { checks: 10, days: 4 }
  };
  function reqText(id) {
    var q = UNLOCK_REQ[id];
    return '累计打卡 ' + q.checks + ' 次 · 登录 ' + q.days + ' 天';
  }
  function openLine(id, name) {
    var q = UNLOCK_REQ[id];
    return '打卡 ' + q.checks + ' 次 + 登录 ' + q.days + ' 天，' + name + '开放啦！';
  }
  var TALK = {
    play: { name: '玩耍 · 记忆翻牌', req: reqText('play'), tier: 1 },
    train: { name: '训练 · 四种小游戏', req: reqText('train'), tier: 2 },
    ranch: { name: '宝可梦乐园', req: reqText('ranch'), tier: 3 },
    exchange: { name: '兑换中心', req: reqText('exchange'), tier: 4 },
    dex: { name: '宝可梦图鉴', req: '主力宝可梦达到 5 级', tier: 5 },
    catch: { name: '野外探险·捕捉', req: '主力宝可梦达到 5 级', tier: 5 },
    battle: { name: '外出战斗', req: '主力宝可梦达到 7 级', tier: 6 },
    gym: { name: '道馆挑战', req: '主力宝可梦达到 10 级', tier: 7 }
  };
  // 播报顺序：图鉴与捕捉同在 Lv.5 解锁，合并成一次播报，所以 'catch' 不单独入队
  var ORDER = ['play', 'train', 'ranch', 'exchange', 'dex', 'battle', 'gym'];

  function esc(t) { return String(t == null ? '' : t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
  function isDoneStatus(s) { return s === 'done' || s === 'submitted' || s === 'approved'; }

  // ===== 读取真实存档指标 =====
  function evalState() {
    var s = (APP.store && APP.store.get) ? APP.store.get() : {};
    var p = (APP.store && APP.store.activePokemon) ? APP.store.activePokemon() : null;
    var level = p ? (p.level || 1) : 1;
    var tasksDone = 0, activeDays = 0, inst = s.instances || {};
    for (var d in inst) {
      if (!Object.prototype.hasOwnProperty.call(inst, d)) continue;
      var day = inst[d] || {}, hasReal = false;
      for (var k in day) {
        if (!Object.prototype.hasOwnProperty.call(day, k)) continue;
        if (day[k] && isDoneStatus(day[k].status)) { tasksDone++; hasReal = true; }
      }
      if (hasReal) activeDays++;   // 只统计「真打过卡」的日期，当天的空 pending 记录不算
    }
    var bp = (APP.store && APP.store.bondProgress) ? APP.store.bondProgress(p) : { percent: 0, daysCared: 0 };
    var bond = bp.percent || 0;
    var careCount = bp.daysCared || 0;
    // crossedDay / bond / careCount 仅为兼容旧存档诊断保留；activeDays 现在就是「登录天数」。
    var today = APP.todayStr ? APP.todayStr() : '';
    var created = (s.meta && s.meta.createdAt) || '';
    var crossedDay = !!(created && today && created !== today);
    var st = {};
    st.play = tasksDone >= UNLOCK_REQ.play.checks && activeDays >= UNLOCK_REQ.play.days;
    st.train = tasksDone >= UNLOCK_REQ.train.checks && activeDays >= UNLOCK_REQ.train.days;
    st.ranch = tasksDone >= UNLOCK_REQ.ranch.checks && activeDays >= UNLOCK_REQ.ranch.days;
    st.exchange = tasksDone >= UNLOCK_REQ.exchange.checks && activeDays >= UNLOCK_REQ.exchange.days;
    st.dex = level >= 5;
    st.catch = level >= 5;
    st.battle = level >= 7;
    st.gym = level >= 10;
    // 老存档（升级前玩耍 / 训练本来就无门槛）不回收已用的功能。
    // onboarding 的老档分支会写入 legacy:true；新档一律按上面的条件走。
    var u = (APP.store && APP.store.unlock) ? APP.store.unlock() : {};
    if (u.legacy) { st.play = true; st.train = true; }
    // 条件调整后的迁移保护：已经播过讲解 / 发过奖励的档位不回收功能。
    // 否则前四档新增「登录天数」后，已开了玩耍的用户会被重新锁上（gate 读的正是 evalState）。
    var seenKeep = u.seen || {}, claimedKeep = u.claimed || {};
    for (var ck in UNLOCK_REQ) {
      if (Object.prototype.hasOwnProperty.call(UNLOCK_REQ, ck) && (seenKeep[ck] || claimedKeep[ck])) st[ck] = true;
    }
    return { st: st, level: level, tasksDone: tasksDone, loginDays: activeDays, crossedDay: crossedDay, bond: bond, careCount: careCount };
  }

  // 是否解锁（true=已解锁）。支持 ranch/catch/exchange/dex/battle/gym
  function gate(id) {
    var res = evalState();
    return !!(res.st[id]);
  }

  function isGated(id) { return !!TALK[id]; }

  function tierInfo(id) {
    if (id) {
      var t = TALK[id];
      return t ? { id: id, name: t.name, req: t.req, tier: t.tier } : null;
    }
    // 未指定 → 返回下一个尚未解锁的档位
    var res = evalState();
    for (var i = 0; i < ORDER.length; i++) {
      if (!res.st[ORDER[i]]) return { id: ORDER[i], name: TALK[ORDER[i]].name, req: TALK[ORDER[i]].req, tier: TALK[ORDER[i]].tier };
    }
    return null;
  }

  // ===== 博士引导浮层 =====
  var docEl = null, DOC_OPEN = false, DOC_QUEUE = [], docHideTimer = null;

  // 样式在模块加载时就注入：日程页的入口条需要样式，不能等博士浮层首次打开才有
  function injectStyle() {
    if (typeof document === 'undefined' || !document.head || !document.createElement) return;
    if (document.getElementById('doc-style')) return;
    var st = document.createElement('style');
    st.id = 'doc-style'; st.textContent = DOC_CSS; document.head.appendChild(st);
  }

  function ensureDocEl() {
    if (docEl) return docEl;
    injectStyle();
    docEl = document.getElementById('docOverlay');
    if (!docEl) { docEl = document.createElement('div'); docEl.id = 'docOverlay'; document.body.appendChild(docEl); }
    return docEl;
  }

  // 讲解文案：一行一个重点、行间留分隔，不再塞成一整段。
  // 首行讲「解锁了什么」，后面只留孩子真正需要知道的两件事。
  function buildDoc(id) {
    if (id === 'play') return { f: '解锁：玩耍 · 记忆翻牌',
      t: [openLine('play', '【玩耍】'), '记忆翻牌：拼音 / 英语每天各 1 次', '全部配对 → 经验、果实，还有机会得碎片'],
      go: '#/care', goLabel: '去玩耍' };
    if (id === 'train') return { f: '解锁：训练',
      t: [openLine('train', '【训练】'), '四种小游戏：乘法表 / 成语 / 井字棋 / 猜拳，每天各 1 次', '「完美」经验更多；饱腹低于 30 不能训练'],
      go: '#/care', goLabel: '去训练' };
    if (id === 'ranch') return { f: '解锁：宝可梦乐园',
      t: [openLine('ranch', '【乐园】'), '给伙伴安排帮手、陪它玩耍', '每天结算羁绊值'],
      go: '#/ranch', goLabel: '去乐园看看' };
    if (id === 'exchange') return { f: '解锁：兑换中心',
      t: [openLine('exchange', '【兑换中心】'), '碎片可换精灵球、战斗券', '完成任务就能攒碎片'],
      go: '#/exchange', goLabel: '去兑换中心' };
    if (id === 'dex') return { f: '解锁：图鉴 + 野外探险',
      t: ['主力达到 Lv.5，【图鉴】和【野外捕捉】开放啦！', '先去图鉴认识更多宝可梦', '再出发去野外收服新伙伴'],
      go: '#/dex', goLabel: '去看看图鉴' };
    if (id === 'battle') return { f: '解锁：外出战斗',
      t: ['主力达到 Lv.7，【外出战斗】开放啦！', '在探险页切到「外出战斗」页签', '赢了能拿奖励和经验'],
      go: '#/catch', goLabel: '去外出战斗' };
    if (id === 'gym') return { f: '解锁：道馆挑战',
      t: ['主力突破 Lv.10，【道馆挑战】开放啦！', '在探险页切到「道馆挑战」页签', '赢徽章、攒心愿星'],
      go: '#/catch', goLabel: '去挑战道馆' };
    return null;
  }

  // 数组 → 逐行短句；字符串保持原样（首登寄语等旧调用仍传字符串）
  function docBody(t) {
    if (Object.prototype.toString.call(t) === '[object Array]') {
      var out = '';
      for (var i = 0; i < t.length; i++) out += '<div class="doc-line">' + esc(t[i]) + '</div>';
      return out;
    }
    return t || '';
  }

  function doctor(o) {
    o = o || {};
    // 博士出现时收起解锁任务面板：两层浮层叠在一起会互相抢点击，也会让博士被看成「没出现」
    if (TASK_OPEN) closeTasks();
    var el = ensureDocEl();
    if (docHideTimer) { clearTimeout(docHideTimer); docHideTimer = null; }
    // 博士形象：192px 小图已内联进 index.html，弹窗打开零网络请求；
    // 常量未加载时回退到原 PNG（单独打开源码调试页时用）
    var img = APP.DOCTOR_ART || 'assets/doctor-full.png';
    var go = o.go || '';
    var goLabel = o.goLabel || '去看看';
    el.innerHTML =
      '<div class="doc-bg" data-doc-close="1"></div>' +
      '<div class="doc-sheet">' +
        '<div class="doc-fig"><img src="' + img + '" alt="宝可梦博士"></div>' +
        '<div class="doc-bubble">' +
          (o.f ? '<div class="doc-f">' + esc(o.f) + '</div>' : '') +
          '<div class="doc-t">' + docBody(o.t) + '</div>' +
          (o.reward ? '<div class="doc-reward">🎁 解锁奖励：' + esc(o.reward) + ' 已到账</div>' : '') +
          '<div class="doc-actions">' +
            (go ? '<button type="button" class="doc-go" data-doc-go="1">' + esc(goLabel) + ' →</button>' : '') +
            '<button type="button" class="doc-ok" data-doc-ok="1">知道了</button>' +
          '</div>' +
        '</div>' +
      '</div>';
    el.style.display = 'flex';   // 必须内联覆盖 CSS 的 display:none；flex 才能让卡片水平垂直居中
    DOC_OPEN = true;
    void el.offsetWidth; // 强制重排以触发过渡
    el.classList.add('is-in');
    el.onclick = function (e) {
      var t = e.target;
      if (t.getAttribute && t.getAttribute('data-doc-go')) {
        closeDoc();
        if (go) window.location.hash = go;
        // 「去看看」同样要推进队列：否则同一刻解锁多档时，后面几档的讲解会永久卡住不播
        setTimeout(pumpDoc, 240);
        return;
      }
      if (t.getAttribute && (t.getAttribute('data-doc-ok') || t.getAttribute('data-doc-close'))) { closeDoc(); pumpDoc(); }
    };
  }

  function closeDoc() {
    DOC_OPEN = false;
    if (docEl) docEl.classList.remove('is-in');
    if (docHideTimer) clearTimeout(docHideTimer);
    docHideTimer = setTimeout(function () {
      if (docEl && !DOC_OPEN) { docEl.style.display = 'none'; docEl.innerHTML = ''; docEl.onclick = null; }
    }, 220);
  }

  function pumpDoc() {
    if (DOC_OPEN) return;
    if (!DOC_QUEUE.length) { if (docEl) { docEl.style.display = 'none'; docEl.innerHTML = ''; docEl.onclick = null; } return; }
    doctor(DOC_QUEUE.shift());
  }

  // ===== 轻提示 =====
  var toastEl = null, toastTimer = null;
  function toast(msg) {
    if (!toastEl) {
      toastEl = document.getElementById('obToast');
      if (!toastEl) { toastEl = document.createElement('div'); toastEl.id = 'obToast'; document.body.appendChild(toastEl); }
    }
    toastEl.textContent = msg;
    toastEl.classList.add('is-show');
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { toastEl.classList.remove('is-show'); }, 2200);
  }

  // ===== 解锁任务奖励（数值按确认方案）=====
  // 前期给养成资源，中后期给碎片 / 心愿星；汇率是「战斗券 5 碎片、精灵球 7 碎片」，
  // 让「刚好够换一次」本身带教学意义。每档只发一次，由 unlock.claimed 保证幂等。
  var REWARD = {
    start:    '树果 ×3',
    play:     '树果 ×2',
    train:    '树果 ×2 · 碎片 ×2',
    ranch:    '树果 ×3 · 精灵球 ×2',
    exchange: '碎片 ×5',
    dex:      '碎片 ×8',
    battle:   '碎片 ×10 · 战斗券 ×1',
    gym:      '心愿星 ×1 · 碎片 ×15'
  };

  // 树果 / 精灵球 / 战斗券直接改 wallet，与 care.js、memory.js 等现有资源变动做法一致
  // （树果上限 99）。碎片 / 心愿星走现有 addShards / addWishStars，自动写 shardLog 流水。
  function grant(id) {
    var s = APP.store.get();
    if (!s.wallet) s.wallet = {};
    var w = s.wallet;
    if (!w.tickets || typeof w.tickets !== 'object') w.tickets = { capture: 0, battle: 0 };
    function bump(obj, k, n, cap) {
      obj[k] = Math.max(0, Math.min(cap || 99999, (obj[k] || 0) + n));
    }
    if (id === 'start') {
      bump(w, 'berries', 3, 99);
    } else if (id === 'play') {
      bump(w, 'berries', 2, 99);
    } else if (id === 'train') {
      bump(w, 'berries', 2, 99);
      APP.store.addShards(2, '解锁奖励·训练');
    } else if (id === 'ranch') {
      bump(w, 'berries', 3, 99); bump(w.tickets, 'capture', 2);
    } else if (id === 'exchange') {
      APP.store.addShards(5, '解锁奖励·兑换中心');
    } else if (id === 'dex') {
      APP.store.addShards(8, '解锁奖励·图鉴与捕捉');
    } else if (id === 'battle') {
      bump(w.tickets, 'battle', 1);
      APP.store.addShards(10, '解锁奖励·外出战斗');
    } else if (id === 'gym') {
      APP.store.addWishStars(1, '解锁奖励·道馆挑战');
      APP.store.addShards(15, '解锁奖励·道馆挑战');
    }
    APP.store.save();   // 统一落盘（上面两个 API 内部也各自 save，重复写无副作用）
  }

  // ===== 解锁检查：评估各档位，对新解锁的触发博士引导 + 发放奖励 =====
  function check() {
    if (!APP.store || !APP.store.get || !APP.store.unlock || !APP.store.setUnlock) return;
    var res = evalState();
    var u = APP.store.unlock();
    var seen = u.seen || {};
    var claimed = u.claimed || {};
    // 历史字段 fixT1：旧版误判自愈曾会清掉 seen.ranch。2026-11-14 条件改为累计打卡次数后，
    // 该自愈已无意义，还会误删真实的已播标记，这里只补写标记位、不再动 seen。
    if (!u.fixT1) {
      APP.store.setUnlock({ seen: seen, fixT1: true });
      u = APP.store.unlock();
      seen = u.seen || {};
    }
    var changed = false, claimedChanged = false, played = false;

    // T0「启程」首登即开：不发博士浮层（首登结语由 onboarding 负责），静默到账，面板里可查。
    var ob = APP.store.onboarding ? APP.store.onboarding() : {};
    if (ob.onboarded && !claimed.start) {
      grant('start'); claimed.start = true; claimedChanged = true;
    }

    for (var i = 0; i < ORDER.length; i++) {
      var id = ORDER[i];
      var unlocked = !!res.st[id];
      var firstTime = unlocked && !seen[id];
      // 奖励与「引导是否已播」解耦：只要已解锁且没领过就发。这样云端同步下来的
      // 存档即使带着 seen，也不会让奖励永远发不出去；老存档在 onboarding 里已把 claimed 全标记，不补发。
      var justGranted = false;
      if (unlocked && !claimed[id] && REWARD[id]) {
        grant(id); claimed[id] = true; claimedChanged = true; justGranted = true;
      }
      if (firstTime) {
        seen[id] = true;
        changed = true;
        if (id === 'dex') seen.catch = true; // 图鉴与捕捉同档，不单独补一次播报
        var d = buildDoc(id);
        if (d) {
          // 奖励在解锁当刻就已到账，胶囊只是告知；点「去看看」跳过去能看到余额变化。
          if (justGranted && REWARD[id]) d.reward = REWARD[id];
          DOC_QUEUE.push(d);
          played = true;
        }
      }
    }
    if (claimedChanged) APP.store.setUnlock({ claimed: claimed });
    if (changed) APP.store.setUnlock({ seen: seen });
    // 新档位解锁 / 奖励发放：立刻上云，换设备不会重播讲解或重复领奖
    if ((changed || claimedChanged) && APP.sync && APP.sync.criticalPush) APP.sync.criticalPush();
    pumpDoc();
    // played 供 app.js 判断：本次有新解锁讲解时，「要不要注册账号」提醒让位，避免两层弹窗打架
    res.played = played;
    return res;
  }

  // ===== 解锁任务面板：日程页入口条 + 居中弹窗 =====
  // 八档清单与条件/奖励按确认方案，进度全部实读现有解锁判定与存档，不另建一套进度。
  // 2026-11-15：前四档改为「累计打卡次数 + 登录天数」双条件，展开后各显示一行带进度的任务；
  // 收起时卡头小字隐藏条件，只在展开区出现，避免同一条件重复显示。
  // 双条件档位统一生成两条任务，避免四份重复代码
  function checkTasks(id, r) {
    var q = UNLOCK_REQ[id];
    return [
      { t: '累计打卡 ' + q.checks + ' 次', ok: r.tasksDone >= q.checks, hint: Math.min(r.tasksDone, q.checks) + '/' + q.checks },
      { t: '累计登录 ' + q.days + ' 天', ok: r.loginDays >= q.days, hint: Math.min(r.loginDays, q.days) + '/' + q.days }
    ];
  }

  var TIERS = [
    {
      key: 'start', tag: 'T0', name: '启程 · 日程 / 基础照料', req: '首登即开', reward: '树果 ×3', go: '',
      // 首登即开、奖励在 onboarded 时就发，不需要再挂一条「完成 1 次每日打卡」
      tasks: function (r, ob) {
        return [
          { t: '选择第一支宝可梦', ok: !!ob.firstPokemon },
          { t: '选择主角形象', ok: !!ob.character }
        ];
      }
    },
    {
      key: 'play', tag: 'T1', name: '玩耍 · 记忆翻牌', req: reqText('play'), reward: '树果 ×2', go: '#/care',
      tasks: function (r) { return checkTasks('play', r); }
    },
    {
      key: 'train', tag: 'T2', name: '训练 · 四种小游戏', req: reqText('train'), reward: '树果 ×2 · 碎片 ×2', go: '#/care',
      tasks: function (r) { return checkTasks('train', r); }
    },
    {
      key: 'ranch', tag: 'T3', name: '宝可梦乐园', req: reqText('ranch'), reward: '树果 ×3 · 精灵球 ×2', go: '#/ranch',
      tasks: function (r) { return checkTasks('ranch', r); }
    },
    {
      key: 'exchange', tag: 'T4', name: '兑换中心', req: reqText('exchange'), reward: '碎片 ×5', go: '#/exchange',
      tasks: function (r) { return checkTasks('exchange', r); }
    },
    {
      key: 'dex', tag: 'T5', name: '图鉴 + 野外探险', req: '主力 Lv.5', reward: '碎片 ×8', go: '#/dex',
      tasks: function (r) {
        return [{ t: '主力宝可梦升到 5 级', ok: r.level >= 5, hint: 'Lv.' + Math.min(r.level, 5) + '/5' }];
      }
    },
    {
      key: 'battle', tag: 'T6', name: '外出战斗', req: '主力 Lv.7', reward: '碎片 ×10 · 战斗券 ×1', go: '#/catch',
      tasks: function (r) {
        return [{ t: '主力宝可梦升到 7 级', ok: r.level >= 7, hint: 'Lv.' + Math.min(r.level, 7) + '/7' }];
      }
    },
    {
      key: 'gym', tag: 'T7', name: '道馆挑战', req: '主力 Lv.10', reward: '心愿星 ×1 · 碎片 ×15', go: '#/catch',
      tasks: function (r) {
        return [{ t: '主力宝可梦升到 10 级', ok: r.level >= 10, hint: 'Lv.' + Math.min(r.level, 10) + '/10' }];
      }
    }
  ];

  function panelData() {
    var r = evalState();
    var ob = (APP.store && APP.store.onboarding) ? APP.store.onboarding() : {};
    var info = tierInfo();
    var now = info ? info.id : '';
    if (now === 'catch') now = 'dex';
    var done = 0;
    for (var i = 1; i < TIERS.length; i++) if (r.st[TIERS[i].key]) done++;
    done++; // T0 首登即开
    var claimed = (APP.store && APP.store.unlock) ? (APP.store.unlock().claimed || {}) : {};
    return { r: r, ob: ob, now: now, done: done, total: TIERS.length, info: info, claimed: claimed };
  }

  // 日程页进度卡内的常驻入口条
  function entryHtml() {
    var d = panelData();
    var next = d.info ? ('下个目标：' + d.info.name + ' · ' + d.info.req) : '全部功能已解锁，继续收集徽章吧！';
    return '<button type="button" class="unlock-entry" data-act="open-unlock-tasks">' +
      '<span class="unlock-entry__i">🗺️</span>' +
      '<span class="unlock-entry__m">' +
        '<span class="unlock-entry__t">解锁任务<em>冒险 ' + d.done + '/' + d.total + '</em></span>' +
        '<span class="unlock-entry__s">' + esc(next) + '</span>' +
      '</span>' +
      '<span class="unlock-entry__go">查看 ›</span>' +
    '</button>';
  }

  var taskEl = null, TASK_OPEN = false, taskHideTimer = null;
  function up(node, attr) {
    while (node && node !== taskEl && !(node.getAttribute && node.getAttribute(attr) !== null)) node = node.parentNode;
    return (node && node !== taskEl && node.getAttribute) ? node : null;
  }
  function ensureTaskEl() {
    if (taskEl) return taskEl;
    injectStyle();
    taskEl = document.getElementById('taskOverlay');
    if (!taskEl) { taskEl = document.createElement('div'); taskEl.id = 'taskOverlay'; document.body.appendChild(taskEl); }
    return taskEl;
  }

  // 进度 hint 形如「3/5」：把「累计已完成次数」加粗 + 橙色突出，目标值保持常规字重
  function hlCount(h) {
    return String(h).replace(/^(\d+)(\/\d+.*)$/, '<b class="tk-hl">$1</b>$2');
  }

  function taskItemHtml(t, d) {
    var isDone = t.key === 'start' ? true : !!d.r.st[t.key];
    var isNow = !isDone && d.now === t.key;
    var got = !!d.claimed[t.key];
    var cls = 'tk-item' + (isDone ? ' is-done' : '') + (isNow ? ' is-now' : '') + (isNow ? ' is-open' : '');
    var list = t.tasks(d.r, d.ob, (APP.store && APP.store.get) ? APP.store.get() : {});
    var lis = '';
    for (var i = 0; i < list.length; i++) {
      var it = list[i];
      // 「或」条件已合并成一行，只把行内的「或」字加粗，不再拆成两行圆圈
      var label = esc(it.t).replace(/或/g, '<b class="tk-or">或</b>');
      lis += '<li class="' + (it.ok ? 'is-ok' : '') + '"><i>' + (it.ok ? '✓' : '○') + '</i>' +
        '<span>' + label + '</span>' +
        (it.hint ? '<small>' + hlCount(esc(it.hint)) + '</small>' : '') + '</li>';
    }
    var state = isDone ? '<span class="tk-state is-done">已解锁</span>' :
      (isNow ? '<span class="tk-state is-now">进行中</span>' : '<span class="tk-state">未解锁</span>');
    // 已解锁档位可随时重听讲解：博士原本只在达成那一瞬出现，错过就永久看不到
    var docLink = (isDone && t.key !== 'start')
      ? '<button type="button" class="tk-doclink" data-tk-doc="' + t.key + '">🔊 听博士讲解</button>'
      : '';
    return '<div class="' + cls + '" data-tier="' + t.tag + '">' +
      '<button type="button" class="tk-item__h" data-tk-toggle="1">' +
        '<span class="tk-tier">' + t.tag + '</span>' +
        '<span class="tk-item__n"><span class="tk-item__t">' + esc(t.name) + '</span>' +
        '<span class="tk-item__c">' + esc(t.req) + '</span></span>' +
        state + '<span class="tk-arrow">' + (isNow ? '▾' : '▸') + '</span>' +
      '</button>' +
      '<div class="tk-detail">' +
        '<ul class="tk-tasks">' + lis + '</ul>' +
        '<div class="tk-reward-row">' +
          '<span class="tk-reward' + (got ? ' is-got' : '') + '">' +
            (got ? '✓ 已领取：' : '完成奖励：') + esc(t.reward) + '</span>' + docLink +
        '</div>' +
        (isDone && t.go ? '<button type="button" class="tk-go" data-tk-go="' + t.go + '">去看看 →</button>' : '') +
      '</div>' +
    '</div>';
  }

  function openTasks() {
    var el = ensureTaskEl();
    var d = panelData();
    if (taskHideTimer) { clearTimeout(taskHideTimer); taskHideTimer = null; }
    var items = '';
    for (var i = 0; i < TIERS.length; i++) items += taskItemHtml(TIERS[i], d);
    var pct = Math.round(d.done / d.total * 100);
    var nextLine = d.info
      ? ('下个目标：' + esc(d.info.name) + ' · ' + esc(d.info.req))
      : '全部功能已解锁，继续收集徽章吧！';
    el.innerHTML =
      '<div class="tk-bg" data-tk-close="1"></div>' +
      '<div class="tk-modal" role="dialog" aria-label="解锁任务">' +
        '<div class="tk-head">' +
          '<div class="tk-title">🗺️ 解锁任务</div>' +
          '<button type="button" class="tk-x" data-tk-close="1" aria-label="关闭">×</button>' +
          '<div class="tk-sum">冒险进度 ' + d.done + ' / ' + d.total + ' 个功能已解锁</div>' +
          '<div class="tk-bar"><i style="width:' + pct + '%"></i></div>' +
          '<div class="tk-count-line">累计打卡 <b class="tk-hl">' + d.r.tasksDone + '</b> 次 · 登录 <b class="tk-hl">' + d.r.loginDays + '</b> 天（完成 1 条任务算 1 次打卡，当天有打卡即算登录 1 天）</div>' +
          '<div class="tk-next">' + nextLine + '</div>' +
        '</div>' +
        '<div class="tk-body">' + items + '</div>' +
        '<div class="tk-foot">博士：<em>每解锁一个新功能，我都会来给你讲解，并把奖励一并送上～</em><br>' +
        '※ 奖励在解锁时自动到账，每档只发一次；错过讲解可点每档「🔊 听博士讲解」重听</div>' +
      '</div>';
    el.style.display = 'block';   // 必须内联覆盖 CSS 的 display:none
    TASK_OPEN = true;
    void el.offsetWidth;
    el.classList.add('is-in');
    el.onclick = function (e) {
      var t = e.target;
      var go = up(t, 'data-tk-go');
      if (go) { closeTasks(); window.location.hash = go.getAttribute('data-tk-go'); return; }
      var docBtn = up(t, 'data-tk-doc');
      if (docBtn) { replay(docBtn.getAttribute('data-tk-doc')); return; }
      if (t.getAttribute && t.getAttribute('data-tk-close')) { closeTasks(); return; }
      var head = up(t, 'data-tk-toggle');
      if (head) {
        var item = head.parentNode;
        var open = item.classList.toggle('is-open');
        var ar = head.querySelector('.tk-arrow');
        if (ar) ar.textContent = open ? '▾' : '▸';
      }
    };
  }

  function closeTasks() {
    TASK_OPEN = false;
    if (!taskEl) return;
    taskEl.classList.remove('is-in');
    if (taskHideTimer) clearTimeout(taskHideTimer);
    taskHideTimer = setTimeout(function () {
      if (taskEl && !TASK_OPEN) { taskEl.style.display = 'none'; taskEl.innerHTML = ''; taskEl.onclick = null; }
    }, 220);
  }

  // 面板里「听博士讲解」：随时重播该档讲解并展示奖励，不再依赖「恰好在场」的那一瞬。
  // doctor() 内部会先收起任务面板，避免两层浮层叠在一起。
  function replay(id) {
    var d = buildDoc(id);
    if (!d) return;
    d.reward = REWARD[id] || '';
    DOC_QUEUE.length = 0;   // 清掉旧的待播队列，避免讲完又冒出历史讲解
    doctor(d);
  }

  if (typeof document !== 'undefined' && document.addEventListener) {
    document.addEventListener('keydown', function (e) {
      if (TASK_OPEN && (e.key === 'Escape' || e.keyCode === 27)) closeTasks();
    });
  }

  injectStyle();

  APP.unlock = {
    doctor: doctor,
    toast: toast,
    check: check,
    gate: gate,
    isGated: isGated,
    tierInfo: tierInfo,
    evalState: evalState,
    entryHtml: entryHtml,
    openTasks: openTasks,
    closeTasks: closeTasks,
    replay: replay
  };
})(window.APP);
