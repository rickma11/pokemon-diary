window.APP = window.APP || {};

(function (APP) {
  'use strict';

  // ===== Task 7a：养成页骨架 + 宝可梦渲染（含已验收的 7c 背身双动画互动）=====
  // 动画是「数据（官方 GIF 文件）」+「通用代码（按 id 切换 / 叠 CSS 反应）」。
  // 喂食 / 玩耍会真实改动三维状态并存档；抚摸 / 饥饿 / 不开心是互动反应（不改或微调状态）。

  var pads = APP.pad3;

  function frontSrc(dex) { return 'assets/pokemon/animated/' + pads(dex) + '.gif'; }
  function backSrc(dex) { return 'assets/pokemon/animated/back/' + pads(dex) + '.gif'; }
  function stillSrc(dex) { return 'assets/pokemon/' + pads(dex) + '.webp'; } // 兜底：官方静态立绘一定存在
  function nameOf(p) {
    if (p.nickname) return p.nickname;
    var info = APP.evo && APP.evo.get ? APP.evo.get(p.dexNo) : null;
    return (info && info.name) || ('#' + pads(p.dexNo));
  }
  function esc(t) {
    return String(t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  // 精灵球：切换弹窗标题 + GBA 屏内交换演出共用（与 ui.js 的 GBA 弹窗同一颗球）
  function ballSvg(cls) {
    return '<svg' + (cls ? ' class="' + cls + '"' : '') + ' viewBox="0 0 20 20" aria-hidden="true">' +
      '<circle cx="10" cy="10" r="8.3" fill="#fff" stroke="#4A3728" stroke-width="1.6"/>' +
      '<path d="M1.7 10a8.3 8.3 0 0 1 16.6 0Z" fill="#E24B4A"/>' +
      '<path d="M1.7 10h16.6" stroke="#4A3728" stroke-width="1.6"/>' +
      '<circle cx="10" cy="10" r="2.7" fill="#fff" stroke="#4A3728" stroke-width="1.6"/>' +
      '</svg>';
  }

  // 齿轮图标：养成页 GBA 屏右上角「设置」按钮（与 更换 按钮同一套掌机按键质感）
  function gearSvg() {
    return '<svg class="gba-set-btn__gear" viewBox="0 0 24 24" aria-hidden="true">' +
      '<path d="M19.14 12.94a7.49 7.49 0 0 0 .05-.94 7.49 7.49 0 0 0-.05-.94l2.03-1.58a.5.5 0 0 0 .12-.64l-1.92-3.32a.5.5 0 0 0-.61-.22l-2.39.96a7.03 7.03 0 0 0-1.62-.94l-.36-2.54a.5.5 0 0 0-.5-.42h-3.84a.5.5 0 0 0-.5.42l-.36 2.54c-.59.24-1.13.56-1.62.94l-2.39-.96a.5.5 0 0 0-.61.22L2.74 8.84a.5.5 0 0 0 .12.64l2.03 1.58c-.03.31-.05.62-.05.94s.02.63.05.94l-2.03 1.58a.5.5 0 0 0-.12.64l1.92 3.32a.5.5 0 0 0 .61.22l2.39-.96c.49.38 1.03.7 1.62.94l.36 2.54a.5.5 0 0 0 .5.42h3.84a.5.5 0 0 0 .5-.42l.36-2.54c.59-.24 1.13-.56 1.62-.94l2.39.96a.5.5 0 0 0 .61-.22l1.92-3.32a.5.5 0 0 0-.12-.64l-2.03-1.58zM12 15.5A3.5 3.5 0 1 1 12 8.5a3.5 3.5 0 0 1 0 7z" fill="#4A3728"/>' +
      '</svg>';
  }

  // —— 模块级交互状态（每次 render 重新绑定元素，这里只存临时引用）——
  var stageEl, imgEl, bubbleEl, sysEl;
  var seqTimers = [];
  var revertTimer = null;
  var unhappyClicks = 0;
  var petCdWarn = 0;   // 抚摸冷却期内的连点次数：≥2 次才提示（第 1 次静默，动画照播）
  var curDex = 25;
  var typeTimer = null;   // GBA 对话框打字机
  var sysTimer = null;    // 系统提示自动收回
  var swapBusy = false;   // 交换演出播放中：锁住互动，避免中途打断或改错状态
  var swapTimers = [];    // 交换演出独立计时（不与 clearSeq 共用，防止被其它互动清掉后卡死）

  function later(fn, ms) { var t = setTimeout(fn, ms); seqTimers.push(t); }
  function clearSeq() {
    if (revertTimer) { clearTimeout(revertTimer); revertTimer = null; }
    for (var i = 0; i < seqTimers.length; i++) clearTimeout(seqTimers[i]);
    seqTimers = [];
    if (stageEl) stageEl.classList.remove('shake');
  }

  // 兜底：动画 GIF 万一拿不到（老缓存 / 网络问题），退回静态立绘，绝不出现空白或碎图
  function fallbackStill() {
    if (!imgEl) return;
    imgEl.onerror = null;
    imgEl.src = stillSrc(curDex);
  }
  function showFront() {
    imgEl.onerror = fallbackStill;
    imgEl.src = frontSrc(curDex);
  }
  function showBack() {
    imgEl.onerror = fallbackStill;
    imgEl.src = backSrc(curDex);
  }

  // 宝可梦自己的台词 → 头顶气泡（保留）；空文本表示「此刻不说话」，要顺手收掉上一次的气泡
  function showBubble(txt) {
    if (!bubbleEl) return;
    if (!txt) { bubbleEl.classList.remove('show'); bubbleEl.textContent = ''; return; }
    bubbleEl.textContent = txt;
    bubbleEl.classList.remove('show');
    void bubbleEl.offsetWidth; // 强制重排以重启动画
    bubbleEl.classList.add('show');
  }

  // —— GBA 风底部对话框 · 系统 / 博士口吻 ——
  // 口径 A（2026-11-15 确认）：这个框只讲事实、给下一步，句子完整、带主语，
  // 不用日志符号（冒号 / 箭头 / 「·」）和后台词（生效中、获得、累计）；
  // 宝可梦的情绪和撒娇只放在头顶气泡里，两套口吻不混。
  // 空闲轮播每条 7 秒；临时插话优先，说完 4.2 秒自动回到轮播。
  var SYS_DEFAULT = '点下面的按钮，就能喂食、抚摸、玩耍和训练了。';
  var ROTATE_MS = 7000;
  var GAME_LABELS = [
    { k: 'mul99', n: '99 乘法表' }, { k: 'idiom', n: '成语填空' },
    { k: 'tic', n: '井字棋' }, { k: 'rps', n: '剪刀石头布' }
  ];
  var feedItems = [], feedIdx = 0, feedTimer = null;
  var sysBusy = false, feedInited = false, lastEventAt = 0;

  function dayEntry(list) {
    var t = APP.todayStr();
    for (var i = 0; i < list.length; i++) if (list[i] && list[i].date === t) return list[i];
    return null;
  }
  // 临时插话：结算 / 升级 / 进化，都改成能读出口语的完整句，数值仍照实报
  function careText(e) {
    if (!e) return SYS_DEFAULT;
    if (e.t === 'evo') return (e.fromName || '宝可梦') + '进化成' + (e.name || '新样子') + '了！';
    if (e.t === 'level') return '宝可梦升到 Lv.' + e.level + '了，继续加油！';
    if (e.t === 'train') {
      var g = e.grade === '完美' ? '拿了完美' : (e.grade === '优秀' ? '表现优秀' : '也认真完成了');
      return '这局「' + (e.game || '训练') + '」' + g + '！经验 +' + (e.exp || 0) + '、心情 +' + (e.mood || 0) +
        (e.shard ? '，还多拿了 1 个碎片。' : '，继续加油！');
    }
    if (e.t === 'play') {
      var r = (e.done >= e.pairs) ? '全部配对成功' : ('配上了 ' + e.done + ' 对');
      return '「' + (e.title || '翻牌') + '」' + r + '！' +
        (e.exp ? '经验 +' + e.exp + '，' : '') + (e.berry ? '树果 +' + e.berry + '，' : '') +
        (e.shard ? '还多拿了 1 个碎片。' : '继续加油！');
    }
    if (e.t === 'exp') return '拿到 ' + e.exp + ' 点经验，离升级又近了一步呢。';
    return e.txt || SYS_DEFAULT;
  }
  // 轮播里的成长播报：整句自带主语，不再用「名字 + 短句」硬拼出「妙蛙种子 刚完成…」这种病句
  function careTextShort(e, name) {
    var nm = name || '宝可梦';
    if (e.t === 'evo') return (e.fromName || nm) + '进化成' + (e.name || '新伙伴') + '了，样子也变了呢。';
    if (e.t === 'level') return nm + '升到 Lv.' + (e.level || '') + '了，越来越厉害！';
    if (e.t === 'train') {
      var g = e.grade === '完美' ? '拿了完美' : (e.grade === '优秀' ? '表现优秀' : '也认真完成了');
      return '刚才那局「' + (e.game || '训练') + '」' + g + '，真棒！';
    }
    if (e.t === 'play') return '刚才的「' + (e.title || '翻牌') + '」配上了 ' + (e.done || 0) + ' 对，太厉害了！';
    return '';
  }
  function buildFeed(p) {
    var s = APP.store.get(), out = [], i;
    var name = p ? nameOf(p) : '';
    // 玩法是否解锁：未解锁（带锁）则不在提示里邀请该玩法
    var trainOpen = featureOpen('train');
    var playOpen = featureOpen('play');

    // 训练：今天还剩几项没做（读当天 trainingPlays.games，4 个小游戏各算 1 项）
    var demo = APP.auth && APP.auth.isDemo && APP.auth.isDemo();
    if (trainOpen) {
      if (demo) {
        out.push('演示模式，训练随时都能练，想练几次就练几次。');
      } else {
        var tr = dayEntry((s && s.trainingPlays) || []) || {}, games = tr.games || {};
        var tn = 0; for (i = 0; i < GAME_LABELS.length; i++) if (games[GAME_LABELS[i].k]) tn++;
        var tLeft = GAME_LABELS.length - tn;
        if (tLeft <= 0) out.push('今天四项训练全做完了，明天再来挑战吧。');
        else out.push('今天还剩 ' + tLeft + ' 项训练没做，点「训练」接着做吧。');
        if (p && p.stats && p.stats.food < 30) out.push('宝可梦饿着肚子没法训练，先给它喂一颗树果吧。');
        else if (p && p.perfectToday) out.push('今天宝可梦元气满满，训练能多拿 10% 经验呢。');
      }
    }

    // 玩耍：拼音 / 英语各算 1 项
    if (playOpen) {
      if (demo) {
        out.push('演示模式，拼音和英语翻牌想玩几次都可以。');
      } else {
        var mem = dayEntry((s && s.memoryPlays) || []) || {}, packs = mem.packs || {};
        var pd = 0; if (packs.pinyin) pd++; if (packs.english) pd++;
        var pLeft = 2 - pd;
        if (pLeft <= 0) out.push('今天的拼音和英语翻牌都玩过了，明天再来吧。');
        else out.push('今天还剩 ' + pLeft + ' 项翻牌没玩，点「玩耍」接着玩吧。');
      }
    }

    // 最近一次成长：整句播报，不再拼名字前缀
    var log = (s && s.careLog) || [];
    for (i = 0; i < log.length; i++) {
      var e = log[i];
      if (e.t === 'evo' || e.t === 'level' || e.t === 'train' || e.t === 'play') {
        var line = careTextShort(e, name);
        if (line) out.push(line);
        break;
      }
    }

    if (!out.length) out.push(SYS_DEFAULT);
    return out;
  }
  function showFeed() {
    if (sysBusy || !sysEl || !feedItems.length) return;
    var n = sysEl.querySelector('.care-dlg__name');
    var t = sysEl.querySelector('.care-dlg__txt');
    if (n) n.textContent = '提示';
    if (t) t.textContent = feedItems[feedIdx % feedItems.length];
    sysEl.classList.remove('is-on', 'is-done');
  }
  function stopFeed() { if (feedTimer) { clearInterval(feedTimer); feedTimer = null; } }
  function startFeed() {
    if (typeTimer) { clearInterval(typeTimer); typeTimer = null; }
    if (sysTimer) { clearTimeout(sysTimer); sysTimer = null; }
    stopFeed();
    sysBusy = false;
    var s = APP.store.get(), log = (s && s.careLog) || [], newest = log[0];
    if (!feedInited) {
      feedInited = true;
      if (newest && newest.at) lastEventAt = newest.at;
    } else if (newest && newest.at && newest.at !== lastEventAt && newest.d === APP.todayStr()) {
      lastEventAt = newest.at;
      showSys(careText(newest));   // 新结算 / 升级 / 进化：插话一次，轮播第 4 条仍会常驻兜底
    }
    feedItems = buildFeed(APP.store.activePokemon());
    showFeed();
    feedTimer = setInterval(function () { feedIdx++; showFeed(); }, ROTATE_MS);
  }
  function clearSys() {
    if (typeTimer) { clearInterval(typeTimer); typeTimer = null; }
    if (sysTimer) { clearTimeout(sysTimer); sysTimer = null; }
    sysBusy = false;
    if (!sysEl) return;
    sysEl.classList.remove('is-on', 'is-done');
    feedItems = buildFeed(APP.store.activePokemon());
    showFeed();
    if (!feedTimer) feedTimer = setInterval(function () { feedIdx++; showFeed(); }, ROTATE_MS);
  }
  function showSys(txt) {
    if (!txt || !sysEl) return;
    if (typeTimer) { clearInterval(typeTimer); typeTimer = null; }
    if (sysTimer) { clearTimeout(sysTimer); sysTimer = null; }
    stopFeed();
    sysBusy = true;
    var n = sysEl.querySelector('.care-dlg__name');
    var t = sysEl.querySelector('.care-dlg__txt');
    if (n) n.textContent = '提示';
    sysEl.classList.remove('is-done');
    sysEl.classList.add('is-on');
    // 墨水屏不打字（刷新慢、闪屏），直接整句
    if (document.body.classList.contains('ink')) {
      t.textContent = txt;
      sysEl.classList.add('is-done');
    } else {
      t.textContent = '';
      var i = 0;
      typeTimer = setInterval(function () {
        i++;
        t.textContent = txt.slice(0, i);
        if (i >= txt.length) {
          clearInterval(typeTimer); typeTimer = null;
          sysEl.classList.add('is-done');
        }
      }, 28);
    }
    sysTimer = setTimeout(clearSys, 4200);
  }

  function setState(s) {
    if (stageEl) stageEl.className = 'care-stage state-' + s;
  }

  // 真实存档里改三维状态（v1 单设备，直接改 live 状态后 save）
  // V5：照顾对象 = activePokemon()（队伍全员平等，照顾谁就改谁）
  function bumpStats(deltas) {
    var p = APP.store.activePokemon();
    if (!p) return null;
    if (!p.stats) p.stats = { food: 80, mood: 80, energy: 80 };
    for (var k in deltas) {
      if (typeof p.stats[k] === 'number') {
        p.stats[k] = APP.clamp(p.stats[k] + deltas[k], 0, 100);
      }
    }
    APP.store.save();
    return p;
  }

  // 顶部果实数 / 元气满满徽章 / 副标题提示，随互动实时刷新
  function renderWallet() {
    var el = document.getElementById('careBerry');
    if (!el) return;
    var s = APP.store.get();
    el.textContent = '🍒 ×' + (s.wallet ? s.wallet.berries : 0);
  }
  // 头部徽章只讲「今天」和「成就」：累计天数交给下面的羁绊卡片，避免同一信息出现两遍
  function renderPerfect(p) {
    var el = document.getElementById('carePerfect');
    if (!el) return;
    if (!p || !p.bond) { el.innerHTML = ''; return; }
    var pd = p.bond.perfectDays || 0;
    if (p.perfectToday) {
      // 与名字同一水平线，文案精简；「必得 +5 碎片」在规则弹窗 / 达成提示里说
      el.innerHTML = '<span class="care-badge care-badge--ok" title="元气满满：今日经验 +10%，当天首次达成必得 +5 碎片">👑 元气满满 · 经验+10%</span>';
    } else if (pd >= 30) {
      el.innerHTML = '<span class="care-badge care-badge--crown">👑 完美大师 · ' + pd + ' 天</span>';
    } else {
      el.innerHTML = '';
    }
  }
  // 三维/状态变化后只刷新轮播内容，不重启计时，避免互动时文案跳回第一条
  function updateSub(p) {
    feedItems = buildFeed(APP.store.activePokemon());
    showFeed();
  }

  // —— 7f：羁绊卡片 ——
  function fmtDays(n) {
    var v = Math.round(n * 10) / 10;
    return v % 1 ? v.toFixed(1) : String(Math.round(v));
  }
  function starStr(n) {
    var s = '';
    for (var i = 0; i < 5; i++) s += i < n ? '★' : '☆';
    return s;
  }
  // 一屏优先：三项指标做成一行三列的迷你条，不再竖着堆三行
  function bondMetricHtml(label, cur, max) {
    var pct = Math.min(100, Math.round(cur / max * 100));
    return '<div class="bond-metric">' +
      '<div class="bond-metric__lb"><span>' + label + '</span><span>' + cur + '/' + max + '</span></div>' +
      '<div class="care-bar__track"><div class="care-bar__fill" style="width:' + pct + '%"></div></div>' +
      '</div>';
  }
  function renderBond(p) {
    var el = document.getElementById('careBond');
    if (!el) return;
    if (!p || !p.bond) { el.innerHTML = ''; return; }
    var pr = APP.store.bondProgress(p);
    el.innerHTML =
      // 羁绊条：与切换弹窗同一套金色徽章观感（弱小的灰色小星 → 放大描边的金星）
      '<div class="bond-head">' +
        '<span class="bond-head__lb">🤝 羁绊</span>' +
        '<span class="bond-head__stars">' + starStr(pr.stars) + '</span>' +
        '<span class="bond-head__v"><b>' + pr.stars + '</b>/5</span>' +
        '<span class="bond-head__pct">进度 ' + pr.percent + '%</span>' +
        (p.bondedToday ? '<span class="bond-head__today">✓今日陪伴</span>' : '') +
        '<button type="button" class="bond-rules" data-act="rules">📖 规则</button>' +
      '</div>' +
      '<div class="bond-metrics">' +
        bondMetricHtml('照顾', fmtDays(pr.daysCared), 30) +
        bondMetricHtml('元气', pr.perfectDays, 30) +
        bondMetricHtml('胜场', pr.wins, 20) +
      '</div>';
    // innerHTML 重建后要重新绑定（render 时绑的是旧节点）
    var rl = el.querySelector('[data-act="rules"]');
    if (rl) rl.addEventListener('click', onButton);
  }

  function renderBars(p) {
    var keys = ['food', 'mood', 'energy'];
    for (var i = 0; i < keys.length; i++) {
      var k = keys[i];
      var bar = document.getElementById('careBar-' + k);
      if (!bar) continue;
      var v = p.stats ? p.stats[k] : 0;
      bar.querySelector('.care-bar__v').textContent = v;
      bar.querySelector('.care-bar__fill').style.width = v + '%';
      bar.className = 'care-bar' + (v < 30 ? ' is-low' : '');
    }
  }

  // 待机台词：以宝可梦的「心情/状态」为主角（饿→想吃东西，不开心→想被摸，元气→满足…）
  function restBubble(p) {
    // 拿不到宝可梦时不硬塞台词：气泡是宝可梦在说话，没有它就不显示（口径 A）
    if (!p || !p.stats) return '';
    if (p.stats.food < 30) return '肚子好饿…想吃点东西~';
    if (p.stats.mood < 30) return '有点不开心…想让你摸摸我~';
    if (p.stats.energy < 30) return '好累呀，想睡一觉~';
    if (p.perfectToday) return '今天元气满满！超幸福~';
    var greet = ['今天也要一起玩哦~', '在吗在吗？陪我一会儿嘛~', '嘻嘻，今天也要加油哦~'];
    return greet[Math.floor(Math.random() * greet.length)];
  }

  // 静止状态：由真实数值推导（饥饿 / 不开心会背身）
  function setResting(p) {
    clearSeq();
    unhappyClicks = 0;
    showFront();
    if (!p || !p.stats) { setState('idle'); renderPerfect(null); updateSub(null); return; }
    APP.store.checkPerfect(p);
    if (p.stats.mood < 30) {
      showBack(); setState('unhappy');
    } else if (p.stats.food < 30) {
      setState('hungry');
    } else {
      setState('idle');
    }
    showBubble(restBubble(p)); // 待机台词随心情/状态变化
    renderBars(p);
    renderPerfect(p);
    renderBond(p);
    updateSub(p);
  }

  // —— 互动反应（移植自已验收的 7c Demo，并接到真实状态）——
  function doFeed() { // 喂食：消耗 1 颗果实 → 饱食+30、心情+10、体力+10（加餐回力）
    var p = APP.store.activePokemon();
    if (!p) { showSys('还没有主力宝可梦，请家长帮忙添加一只吧。'); return; }
    var s = APP.store.get();
    if (!s.wallet || s.wallet.berries <= 0) {
      clearSeq(); showFront(); setState('idle');
      showSys('树果用完了，去做日程任务或者玩翻牌就能再拿到。');
      return;
    }
    s.wallet.berries -= 1;
    p = bumpStats({ food: 30, mood: 10, energy: 10 });
    clearSeq(); showFront(); setState('feed'); showBubble('好好吃！谢谢你~');
    // 7f：喂食计入当天照顾（喂/玩/练当天计满 1 天，重复不累加）
    APP.store.markBonded('feed');
    if (p) { renderBars(p); renderWallet(); APP.store.checkPerfect(p); renderPerfect(p); renderBond(p); updateSub(p); }
    revertTimer = setTimeout(function () { setResting(APP.store.activePokemon()); }, 2400);
  }
  // 抚摸：正面摇摆 → 转身扭屁股 → 回正面。
  // 规则：动画永远照播（孩子点了就有反应），只是数值加成有 5 分钟冷却；
  //      冷却期内第 1 次再摸 → 静默（不加数值也不打扰）；连点第 2 次起 → 才提示还要等多久。
  function doPet() {
    // V5.1：抚摸有 30% 概率顺带回一点体力（安抚放松）
    var petHeal = Math.random() < 0.3;
    var p = bumpStats(petHeal ? { mood: 5, energy: 5 } : { mood: 5 });
    var r = APP.store.petBond();
    clearSeq(); unhappyClicks = 0;
    showFront(); setState('tickle'); showBubble('嘻嘻~');
    if (p) { renderBars(p); APP.store.checkPerfect(p); renderPerfect(p); renderBond(p); updateSub(p); }
    later(function () { showBack(); setState('tickle-back'); showBubble('嘻嘻~（扭屁股）'); }, 1100);
    if (r && r.ok) {
      petCdWarn = 0;
      // 今日已陪伴满：情绪化反馈即可，不再弹"不计入"冷提示
      showBubble(r.counted === false ? '今天已经陪过我啦，不过还是喜欢被摸摸~' : '好舒服~被摸摸最开心了');
    } else if (r && /抚摸太快/.test(r.msg)) {
      petCdWarn++;
      if (petCdWarn >= 2) showSys(r.msg);
    } else if (r) {
      petCdWarn = 0;
      showSys(r.msg); // 抚摸计满 5 次等运营提示仍保留
    }
    later(function () { setResting(APP.store.activePokemon()); }, 2300);
  }
  function pokeUnhappy() {
    unhappyClicks++;
    if (stageEl) {
      stageEl.classList.remove('shake'); void stageEl.offsetWidth; stageEl.classList.add('shake');
    }
    if (unhappyClicks >= 3) { showBubble('…好吧，不气了'); later(function () { setResting(APP.store.activePokemon()); }, 800); }
    else { showBubble('哼，别戳啦'); }
  }

  function barHtml(k, label, val) {
    return '<div class="care-bar' + (val < 30 ? ' is-low' : '') + '" id="careBar-' + k + '">' +
      '<div class="care-bar__lb"><span>' + label + '</span><span class="care-bar__v">' + val + '</span></div>' +
      '<div class="care-bar__track"><div class="care-bar__fill" style="width:' + val + '%"></div></div>' +
      '</div>';
  }

  // ===== V5.1：「我的队伍」条已挪回乐园页（只显示体力）；养成页只照顾主力，
  //         切换主力走 GBA 屏「更换」按钮 → 宝可梦中心弹窗（openSwitcher）。=====

  function render(container) {
    var p = APP.store.activePokemon();
    if (!p) {
      container.innerHTML = '<section class="card"><h2>宝可梦养成</h2>' +
        '<p>还没有宝可梦。请在家长后台「宝可梦调试」里添加一只（默认已带皮卡丘）。</p></section>';
      return;
    }
    curDex = p.dexNo;
    var st = p.stats || { food: 80, mood: 80, energy: 80 };
    var name = nameOf(p);
    var s = APP.store.get();

    var html =
      // 名字 / 等级 / 元气满满徽章 / 果实 / 三维条合成一张卡：全部压在两行内，一屏才放得下
      '<section class="card care-card care-head">' +
        '<div class="care-head__row">' +
          // V5.1：名字 / 等级 / 徽章同行靠左，果实数量留最右（切换入口在 GBA 屏「更换」按钮）
          '<div class="care-head__id">' +
            '<div class="care-head__name">' + esc(name) + ' <span class="care-head__lv">Lv.' + (p.level || 1) + '</span></div>' +
            '<div class="care-head__badge" id="carePerfect"></div>' +
          '</div>' +
          '<div class="care-head__berry" id="careBerry">🍒 ×' + (s.wallet ? s.wallet.berries : 0) + '</div>' +
        '</div>' +
        '<div class="care-bars">' +
          barHtml('food', '饱腹感', st.food) +
          barHtml('mood', '心情', st.mood) +
          barHtml('energy', '体力', st.energy) +
        '</div>' +
      '</section>' +

      // GBA 掌机：机身 + 液晶屏（动画区和底部对话条在同一块屏幕里）
      '<div class="gba-shell">' +
        '<div class="gba-shell__top">' +
          '<span class="gba-shell__led"></span><span class="gba-shell__brand">POWER</span>' +
        '</div>' +
        '<div class="gba-screen">' +
          '<div class="care-stage state-idle" id="careStage">' +
            '<div class="care-bubble" id="careBubble"></div>' +
            '<div class="care-creature-wrap" id="careCreature">' +
              '<img class="care-creature" id="careImg" src="' + frontSrc(curDex) + '" alt="' + esc(name) + '">' +
              '<div class="care-fx care-stars">✨</div>' +
              '<div class="care-fx care-sweat">💦</div>' +
              '<div class="care-fx care-note">🎵</div>' +
              '<div class="care-fx care-rain">🌧️</div>' +
            '</div>' +
            // 交换演出层（默认隐藏，playSwap 时按段切换 class）
            '<div class="care-swap-ball" id="careSwapBall">' + ballSvg('') + '</div>' +
            '<div class="care-swap-flash" id="careSwapFlash"></div>' +
          '</div>' +
          // 屏幕内工具条：更换 / 设置 移到对话框上方（data-act 不变，仍由 onButton 接管）
          '<div class="gba-screen__tools">' +
            '<button type="button" class="gba-swap-btn" data-act="switch">' + ballSvg('gba-swap-btn__ball') + '<span>更换</span></button>' +
            '<button type="button" class="gba-set-btn" data-act="careset" aria-label="设置">' + gearSvg() + '<span>设置</span></button>' +
          '</div>' +
          // GBA 风对话框：系统提示走这里，宝可梦台词走头顶气泡
          '<div class="care-dlg" id="careDlg">' +
            '<span class="care-dlg__name"></span>' +
            '<span class="care-dlg__txt">' + SYS_DEFAULT + '</span>' +
            '<span class="care-dlg__caret">▼</span>' +
          '</div>' +
        '</div>' +
        '<div class="gba-shell__foot">POKEMON</div>' +
      '</div>' +
      '<section class="card care-card"><div class="care-btns">' +
        careBtn('feed', '🍎', '喂食') +
        careBtn('pet', '✋', '抚摸') +
        careBtn('play', '🎮', '玩耍', 'play') +
        careBtn('train', '💪', '训练', 'train') +
      '</div></section>' +

      '<section class="card care-card bond-card" id="careBond"></section>';

    container.innerHTML = html;

    // 绑定元素引用
    stageEl = document.getElementById('careStage');
    imgEl = document.getElementById('careImg');
    bubbleEl = document.getElementById('careBubble');
    sysEl = document.getElementById('careDlg');
    seqTimers = []; revertTimer = null; unhappyClicks = 0; petCdWarn = 0;
    if (imgEl) imgEl.onerror = fallbackStill; // HTML 里首次加载也要有兜底
    startFeed();

    // 按钮（直接绑定，避免与日程页的全局监听冲突）
    var btns = container.querySelectorAll('[data-act]');
    for (var i = 0; i < btns.length; i++) {
      btns[i].addEventListener('click', onButton);
    }
    // 点宝可梦身体：不开心时戳它，否则抚摸
    document.getElementById('careCreature').addEventListener('click', function () {
      if (swapBusy) return; // 交换演出播放中不响应戳/摸
      if (stageEl && stageEl.classList.contains('state-unhappy')) pokeUnhappy();
      else doPet();
    });

    // 初始静止态（由真实数值推导）
    setResting(p);
    renderWallet();
  }

  function overlayEl() {
    var el = document.getElementById('uiOverlay');
    if (!el) {
      el = document.createElement('div');
      el.id = 'uiOverlay';
      el.className = 'ui-overlay';
      document.body.appendChild(el);
    }
    el.style.display = '';
    return el;
  }

  // 规则说明：把散在各处的数值规则一次讲清（孩子和家长都能看懂）
  var RULES_HTML =
    '<div class="rules-sec"><div class="rules-t">三维状态（0–100）· 只结算主力</div>' +
      '<div class="rules-li">饱腹感：每天 0 点 −20；低于 30 → 当天经验减半</div>' +
      '<div class="rules-li">心情：每天 0 点 −15</div>' +
      '<div class="rules-li">体力：乐园劳动 −10~40（每只不同，天生勤快的消耗小）；休息一天 +50；体力 &lt;50 会自动休息</div>' +
    '</div>' +
    '<div class="rules-sec"><div class="rules-t">👑 元气满满</div>' +
      '<div class="rules-li">三维同时 ≥90 → 当天经验 +10%，并累计 1 个元气天数，必得 +5 碎片</div>' +
      '<div class="rules-li">每天 0 点重新判定，所以要天天照顾</div>' +
    '</div>' +
    '<div class="rules-sec"><div class="rules-t">四个互动（只对主力）</div>' +
      '<div class="rules-li">🍎 喂食：消耗 1 颗果实 → 饱腹感 +30、心情 +10、体力 +10</div>' +
      '<div class="rules-li">🎮 玩耍：心情 +10、体力 −5 → 记忆翻牌（拼音 / 英语每天各 1 次）；拼音全部配对 +5 经验 +1 果实（45% 概率 +1 碎片）</div>' +
      '<div class="rules-li">英语翻牌进局前选难度：简单 ★1~3（全配对 +3 经验 / 25% 碎片）、中等 ★2~4（+5 经验 / 45%）、困难 ★3~5（+8 经验 +2 果实 / 65%）；三档都是 8 对 16 张 / 32 次</div>' +
      '<div class="rules-li">💪 训练：体力 −10、饱腹 −10（饱腹 &lt;30 不能训练）；每玩法每天各 1 次，全局 3 分钟、每步 10 秒</div>' +
      '<div class="rules-li">训练三档：全对「完美」+6 经验 +10 心情（45% +1 碎片）；完成 80% 达标「优秀」+5 经验 +8 心情（36% +1 碎片）；未达标「加油」+3 经验 +5 心情；井字棋赢 = 完美、输或平 = 加油</div>' +
      '<div class="rules-li">👑 元气满满加成：三维同时 ≥90 时，训练经验额外 +10%（可与三档叠加）；中途退出不扣消耗与次数</div>' +
      '<div class="rules-li">✋ 抚摸：心情 +5，30% 概率体力 +5；羁绊 +0.1 天（5 分钟 1 次，每天最多 5 次）</div>' +
    '</div>' +
    '<div class="rules-sec"><div class="rules-t">🍒 果实怎么来</div>' +
      '<div class="rules-li">每天保底 +1；队伍劳动的日子：90% 概率再 +1、20% 概率又 +1（平均约 1.1 颗/天）</div>' +
      '<div class="rules-li">玩耍全部配对 +1 果实（英语困难档 +2）</div>' +
    '</div>' +
    '<div class="rules-sec"><div class="rules-t">🤝 羁绊与星级</div>' +
      '<div class="rules-li">喂食 / 玩耍：当天计 1 天（同一天重复不再累加）</div>' +
      '<div class="rules-li">抚摸：每次 +0.1 天，一天最多 +0.5 天</div>' +
      '<div class="rules-li">星级 = 照顾天数 + 元气天数 + 对战胜场：★ 7 天；★★ 14 / 7 / 3；★★★ 21 / 14 / 6；★★★★ 28 / 20 / 12；★★★★★ 30 / 30 / 20</div>' +
      '<div class="rules-li">外出战斗在主力 Lv.7 时开放，赢一场就能多攒一个胜场</div>' +
    '</div>';

  function openRules() {
    var el = overlayEl();
    el.innerHTML =
      '<div class="ui-overlay__bg" data-close="1"></div>' +
      '<div class="ui-modal ui-modal--rules">' +
        '<h3 class="ui-modal__title">📖 怎么玩</h3>' +
        RULES_HTML +
        '<div class="row"><button type="button" class="btn btn--primary btn--block" data-c="1">知道啦</button></div>' +
      '</div>';
    el.onclick = function (e) {
      var t = e.target;
      if (t.getAttribute && (t.getAttribute('data-c') || t.getAttribute('data-close'))) closeOverlay();
    };
  }

  function closeOverlay() {
    var el = document.getElementById('uiOverlay');
    if (el) { el.innerHTML = ''; el.onclick = null; el.style.display = 'none'; }
  }

  // 养成页设置：声音开关 + 庆祝动画开关（即时写入存档，全站（音频 / 庆祝层）共用）
  function openCareSettings() {
    var el = overlayEl();
    var st = APP.store.settings();
    function rowHtml(key, icon, label, desc, on) {
      return '<div class="set-row">' +
        '<div class="set-row__txt">' +
          '<div class="set-row__label">' + icon + ' ' + label + '</div>' +
          '<div class="set-row__desc">' + desc + '</div>' +
        '</div>' +
        '<button type="button" class="toggle' + (on ? ' is-on' : '') + '" data-toggle="' + key + '" role="switch" aria-checked="' + on + '">' +
          '<span class="toggle__knob"></span>' +
        '</button>' +
      '</div>';
    }
    el.innerHTML =
      '<div class="ui-overlay__bg" data-close="1"></div>' +
      '<div class="ui-modal care-settings">' +
        '<h3 class="ui-modal__title">⚙ 设置</h3>' +
        '<div class="set-list">' +
          rowHtml('soundOn', '🔊', '声音', '升级 / 进化 / 连击的叫声与音效', st.soundOn !== false) +
          rowHtml('celebrateOn', '🎉', '庆祝动画', '升级 / 进化 / 连击的彩带庆祝', st.celebrateOn !== false) +
          rowHtml('catchAnimOn', '🎬', '捕捉动画', '野外探险的抛球 / 开盖 / 摆动 3 秒（关掉直接出结果）', st.catchAnimOn !== false) +
        '</div>' +
        '<div class="row"><button type="button" class="btn btn--primary btn--block" data-c="1">完成</button></div>' +
      '</div>';
    el.onclick = function (e) {
      var t = e.target;
      // 找到被点的开关（点旋钮子元素时 e.target 是 span，要上溯到 .toggle）
      var toggleEl = (t.closest && t.closest('.toggle')) || null;
      if (!toggleEl && t.classList && t.classList.contains('toggle')) toggleEl = t;
      if (toggleEl) {
        var key = toggleEl.getAttribute('data-toggle');
        var cur = APP.store.settings()[key] !== false;
        var nv = !cur;
        APP.store.setSetting(key, nv);
        toggleEl.classList.toggle('is-on', nv);
        toggleEl.setAttribute('aria-checked', String(nv));
        return;
      }
      if (t.getAttribute && (t.getAttribute('data-c') || t.getAttribute('data-close'))) closeOverlay();
    };
  }

  // ===== 切换照顾对象 + 队伍编辑：宝可梦中心弹窗 =====
  // 渐进披露：网格只给头像+名字（一屏看得全），选中后上方详情区才展开完整信息
  function switchBarHtml(label, v, cls) {
    return '<div class="sw-bar">' +
      '<span class="sw-bar__lb">' + label + '</span>' +
      '<div class="sw-bar__track"><div class="sw-bar__fill ' + cls + '" style="width:' + v + '%"></div></div>' +
      '<span class="sw-bar__v">' + v + '</span>' +
      '</div>';
  }
  function switchDetailHtml(p) {
    var st = p.stats || { food: 80, mood: 80, energy: 80 };
    var pr = APP.store.bondProgress(p);
    var inTeam = p.slot !== 'box';
    var isCur = APP.store.activePokemon() && APP.store.activePokemon().id === p.id;
    var where = isCur ? ' · 主力中' : (inTeam ? ' · 队伍中' : ' · 在仓库');
    return '<div class="sw-detail__art"><img src="' + stillSrc(p.dexNo) + '" alt="' + esc(nameOf(p)) + '"></div>' +
      '<div class="sw-detail__info">' +
        '<div class="sw-detail__name">' + esc(nameOf(p)) + ' <span class="sw-detail__lv">Lv.' + (p.level || 1) + '</span></div>' +
        '<div class="sw-detail__no">#' + pads(p.dexNo) + where + '</div>' +
        switchBarHtml('饱', st.food, 'is-food') +
        switchBarHtml('心', st.mood, 'is-mood') +
        switchBarHtml('体', st.energy, 'is-energy') +
        '<div class="sw-bond">' +
          '<span class="sw-bond__lb">羁绊</span>' +
          '<span class="sw-bond__stars">' + starStr(pr.stars) + '</span>' +
          '<span class="sw-bond__v">陪伴 ' + fmtDays(pr.daysCared) + ' 天</span>' +
        '</div>' +
      '</div>';
  }
  function switchCellHtml(p, curId) {
    var inTeam = p.slot !== 'box';
    var isCur = p.id === curId;
    return '<div class="sw-cell' + (inTeam ? '' : ' sw-cell--box') + '" data-id="' + esc(p.id) + '">' +
      '<div class="sw-cell__art"><img src="' + stillSrc(p.dexNo) + '" alt="' + esc(nameOf(p)) + '"></div>' +
      '<div class="sw-cell__name">' + esc(nameOf(p)) + '</div>' +
      (isCur
        ? '<span class="sw-cell__tag">主力</span>'
        : (inTeam ? '<span class="sw-cell__tag sw-cell__tag--team">队</span>' : '')) +
      '</div>';
  }
  // ===== 宝可梦中心（V5 合并队伍编辑）=====
  // 全收录网格：队伍成员带「队」角标、仓库成员虚线；选中后可 设为照顾对象 / 加入·移出队伍
  function openSwitcher() {
    var s = APP.store.get();
    var list = (s.pokemon || []).slice();
    var cur = APP.store.activePokemon();
    if (!cur) { showSys('还没有宝可梦'); return; }
    var curId = cur.id;
    // 队伍在前（照顾对象最前），仓库按编号
    list.sort(function (a, b) {
      var ta = a.slot !== 'box', tb = b.slot !== 'box';
      if (ta !== tb) return ta ? -1 : 1;
      if (ta && tb && ((a.id === curId) !== (b.id === curId))) return a.id === curId ? -1 : 1;
      return a.dexNo - b.dexNo;
    });
    function teamCount() {
      var n = 0;
      for (var i = 0; i < list.length; i++) if (list[i].slot !== 'box') n++;
      return n;
    }
    var el = overlayEl();
    var sel = cur;
    // 窗口至少容纳 2 排 × 4 只：不够 8 格就补虚线空位（宝可梦 PC 箱子的观感，窗口也不会缩成一小条）
    var cells = '';
    for (var i = 0; i < list.length; i++) cells += switchCellHtml(list[i], curId);
    var slots = Math.max(8, Math.ceil(list.length / 4) * 4);
    for (var j = list.length; j < slots; j++) {
      cells += '<div class="sw-cell sw-cell--empty"><div class="sw-cell__art"></div>' +
        '<div class="sw-cell__name">空位</div></div>';
    }
    el.innerHTML =
      '<div class="ui-overlay__bg" data-close="1"></div>' +
      '<div class="ui-modal ui-modal--switch">' +
        '<div class="sw-head">' + ballSvg('ui-modal__ball') +
          '<h3 class="ui-modal__title">宝可梦中心</h3>' +
          '<span class="sw-count">已收录 <b>' + list.length + '</b> 只</span>' +
        '</div>' +
        '<div class="sw-detail" id="swDetail">' + switchDetailHtml(cur) + '</div>' +
        '<div class="sw-grid" id="swGrid">' + cells + '</div>' +
        '<p class="sw-hint">最多 5 只宝可梦加入队伍，未入队的宝可梦会寄存在宝可梦中心。</p>' +
        '<div class="row">' +
          '<button type="button" class="btn" data-c="0">取消</button>' +
          '<button type="button" class="btn" id="swTeam"></button>' +
          '<button type="button" class="btn btn--primary" id="swOk"></button>' +
        '</div>' +
      '</div>';
    var detailEl = el.querySelector('#swDetail');
    var okBtn = el.querySelector('#swOk');
    var teamBtn = el.querySelector('#swTeam');
    function findSel() {
      for (var i = 0; i < list.length; i++) if (list[i].id === sel.id) return list[i];
      return sel;
    }
    function refreshBtns() {
      var p = findSel();
      var inTeam = p.slot !== 'box';
      var n = teamCount();
      if (inTeam) {
        teamBtn.textContent = '移出队伍';
        teamBtn.disabled = n <= 1;
        teamBtn.title = n <= 1 ? '队伍至少要留一只' : '';
        okBtn.disabled = p.id === curId;
        okBtn.textContent = p.id === curId ? '主力中' : '设为主力';
      } else {
        teamBtn.textContent = '加入队伍';
        teamBtn.disabled = n >= 5;
        teamBtn.title = n >= 5 ? '队伍已满 5 只，先移出一只' : '';
        okBtn.disabled = true;
        okBtn.textContent = '先加入队伍';
      }
    }
    function gridHtml() {
      var html = '';
      for (var i = 0; i < list.length; i++) html += switchCellHtml(list[i], curId);
      var slots2 = Math.max(8, Math.ceil(list.length / 4) * 4);
      for (var j2 = list.length; j2 < slots2; j2++) {
        html += '<div class="sw-cell sw-cell--empty"><div class="sw-cell__art"></div>' +
          '<div class="sw-cell__name">空位</div></div>';
      }
      return html;
    }
    function select(p) {
      sel = p;
      var all = el.querySelectorAll('.sw-cell');
      for (var i = 0; i < all.length; i++) {
        var pid = all[i].getAttribute('data-id');
        if (pid && pid === p.id) all[i].classList.add('is-sel');
        else all[i].classList.remove('is-sel');
      }
      detailEl.innerHTML = switchDetailHtml(p);
      refreshBtns();
    }
    el.onclick = function (e) {
      var t = e.target;
      if (t.getAttribute && t.getAttribute('data-close')) { closeOverlay(); return; }
      if (t.getAttribute && t.getAttribute('data-c') === '0') { closeOverlay(); return; }
      if (t.getAttribute && t.id === 'swTeam') {
        var p = findSel();
        var r = (p.slot !== 'box') ? APP.store.sendToBox(p.id) : APP.store.addToParty(p.id);
        if (r && r.ok) {
          var np = null, all = APP.store.get().pokemon || [];
          for (var i2 = 0; i2 < all.length; i2++) if (all[i2].id === p.id) np = all[i2];
          for (var i3 = 0; i3 < list.length; i3++) if (list[i3].id === p.id) list[i3] = np;
          el.querySelector('#swGrid').innerHTML = gridHtml();
          select(np);
          // 从乐园等非养成页打开时：队伍变了立即刷新底层页面，
          // 让牧场动画里的宝可梦形象马上跟着换（弹窗挂在 body 上，refresh 不会关掉它）
          if (!document.getElementById('careStage')) APP.refresh();
        }
        return;
      }
      var node = t;
      while (node && node !== el && !(node.getAttribute && node.getAttribute('data-id'))) node = node.parentNode;
      if (node && node !== el) {
        var pid = node.getAttribute('data-id');
        for (var i4 = 0; i4 < list.length; i4++) {
          if (list[i4].id === pid) { select(list[i4]); return; }
        }
      }
      if (t.getAttribute && t.id === 'swOk') {
        var p2 = findSel();
        if (!p2 || p2.id === curId || p2.slot === 'box') return;
        closeOverlay();
        // 养成页：播 GBA 交换演出；从乐园打开时没有演出元素，直接换主力
        if (document.getElementById('careStage')) {
          doSwitch(cur.dexNo, p2.dexNo, nameOf(cur), nameOf(p2));
        } else {
          var r3 = APP.store.setCareTarget(p2.id);
          if (r3 && r3.ok) APP.refresh();
        }
      }
    };
    select(cur); // 默认展示当前照顾对象
  }

  // ===== 交换演出：GBA 屏内三段（收回 → 传送 → 放出）=====
  // 演出期间只做视觉，不改数据；最后一段的回调里才真正切换照顾对象并刷新
  function isInkMode() {
    return !!(document.body && document.body.classList.contains('ink'));
  }
  function clearSwapTimers() {
    for (var i = 0; i < swapTimers.length; i++) clearTimeout(swapTimers[i]);
    swapTimers = [];
  }
  function playSwap(fromDex, toDex, fromName, toName, done) {
    clearSwapTimers();
    swapBusy = true;
    if (bubbleEl) bubbleEl.classList.remove('show');
    var ballEl = document.getElementById('careSwapBall');
    var flashEl = document.getElementById('careSwapFlash');
    function cleanup() {
      clearSwapTimers();
      swapBusy = false;
      if (ballEl) ballEl.className = 'care-swap-ball';
      if (flashEl) flashEl.className = 'care-swap-flash';
      if (stageEl) stageEl.classList.remove('is-busy');
    }
    // 墨水屏不做动画（与进化演出一致）：直接换 + 一句提示
    if (isInkMode()) {
      showSys(fromName + '回到队伍，' + toName + '上场了！');
      swapTimers.push(setTimeout(function () { cleanup(); done(); }, 600));
      return;
    }
    if (stageEl) stageEl.classList.add('is-busy');
    setState('swap-out');
    showSys(fromName + '先回队伍里休息一下。');
    swapTimers.push(setTimeout(function () {
      if (ballEl) ballEl.className = 'care-swap-ball is-in';
      setState('swap-warp');
      showSys('正在换伙伴…');
    }, 800));
    swapTimers.push(setTimeout(function () {
      if (ballEl) ballEl.className = 'care-swap-ball is-out';
      if (flashEl) flashEl.className = 'care-swap-flash is-on';
      curDex = toDex;
      if (imgEl) { imgEl.onerror = fallbackStill; imgEl.src = frontSrc(toDex); }
      setState('swap-in');
      showSys(toName + '上场了！');
    }, 2000));
    swapTimers.push(setTimeout(function () {
      cleanup();
      done();
    }, 2900));
  }

  function doSwitch(fromDex, toDex, fromName, toName) {
    playSwap(fromDex, toDex, fromName, toName, function () {
      var r = APP.store.setActiveByDex(toDex);
      if (!r || !r.ok) { showSys((r && r.msg) || '这只暂时换不了，再试一次吧。'); return; }
      APP.refresh();
    });
  }

  // ===== 功能解锁：玩耍 / 训练（档位见 unlock.js 的 T1 / T2）=====
  // 养成页本身首登即开，但这两个按钮要按解锁档位逐步开放；喂食 / 抚摸始终可用。
  // 未解锁时置灰加锁标，点一下给轻提示，不打断当前页面（与探险页锁页签同一套做法）。
  function featureOpen(id) {
    return !APP.unlock || !APP.unlock.gate || APP.unlock.gate(id);
  }
  function lockTip(id) {
    // 还差几次打卡 / 还差几天由 unlock.js 按真实进度算，这里不再抄一份条件数
    var msg = (APP.unlock && APP.unlock.lockMsg) ? APP.unlock.lockMsg(id) : '🔒 这个功能还没开放，再等等吧。';
    if (APP.unlock && APP.unlock.toast) APP.unlock.toast(msg);
  }
  function careBtn(act, icon, label, gateId) {
    var locked = !!gateId && !featureOpen(gateId);
    return '<button type="button" class="btn care-btn' + (locked ? ' is-locked' : '') + '" data-act="' + act + '">' +
      (locked ? '🔒 ' + label : icon + ' ' + label) + '</button>';
  }

  function onButton(e) {
    if (swapBusy) return; // 交换演出播放中，忽略一切互动
    var act = e.currentTarget.getAttribute('data-act');
    if (act === 'feed') doFeed();
    else if (act === 'play') {
      if (!featureOpen('play')) { lockTip('play'); return; }
      // 7d：玩耍 → 进记忆翻牌（拼音/英语，每天各 1 次）。点进去先 +10 心情，玩闹耗 5 体力。
      bumpStats({ mood: 10, energy: -5 });
      // 7f：玩耍计入当天照顾
      APP.store.markBonded('play');
      renderBars(APP.store.activePokemon());
      APP.store.activePokemon() && (function () {
        var p = APP.store.activePokemon(); APP.store.checkPerfect(p); renderPerfect(p); renderBond(p); updateSub(p);
      })();
      // 还没开始玩就别说「再来一次」：改成出发时的招呼
      showBubble('走！去玩翻牌～');
      APP.openMemory();
    }
    else if (act === 'pet') doPet();
    else if (act === 'train') {
      if (!featureOpen('train')) { lockTip('train'); return; }
      APP.openTraining();
    }
    else if (act === 'switch') openSwitcher();
    else if (act === 'rules') openRules();
    else if (act === 'careset') openCareSettings();
  }

  APP.screens.care = { render: render, openSwitcher: openSwitcher };
})(window.APP);
