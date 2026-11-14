window.APP = window.APP || {};

(function (APP) {
  'use strict';

  // 家长后台「自定义题库」：下载模板 / 上传题库（.xlsx 或 AI 输出的 .tsv）。
  // 零依赖：XLSX = ZIP(deflate-raw) + XML，用浏览器原生 DecompressionStream / DOMParser 解析；
  // Excel 另存产生的 sharedStrings 与 openpyxl 的 inlineStr 两种写法都支持。
  // 数据存进 state.customBanks，随现有 store.save() → sync.push() 链路同步到云端。

  var TEMPLATE = 'docs/训练题库拓展模板-V2.xlsx';
  var HEADERS = {
    '成语填空': ['成语', '挖空位', '答案', '干扰项1', '干扰项2', '干扰项3', '提示', '难度', '启用'],
    '拼音翻牌': ['汉字', '拼音', '难度', '启用'],
    '英语翻牌': ['单词', '中文', '图标', '难度', '启用']
  };
  var KEYS = { '成语填空': 'idiom', '拼音翻牌': 'pinyin', '英语翻牌': 'english' };
  var BANK_KEYS = ['idiom', 'pinyin', 'english'];

  function trim(s) { return String(s == null ? '' : s).replace(/^\s+|\s+$/g, ''); }
  function esc(s) {
    return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
  function utf8(bytes) { return new TextDecoder('utf-8').decode(bytes); }

  // ===== ZIP 读取（只看 central directory，只解压需要的 XML）=====
  function inflateRaw(bytes) {
    if (typeof DecompressionStream === 'undefined' || typeof Blob === 'undefined' || !Blob.prototype.stream) {
      return Promise.reject(new Error('当前浏览器不支持解析 xlsx，请改用新版 Edge / Chrome，或把题目另存为 TSV 后上传'));
    }
    var ds;
    try { ds = new DecompressionStream('deflate-raw'); }
    catch (e) { return Promise.reject(new Error('当前浏览器不支持解析 xlsx，请改用新版 Edge / Chrome，或上传 TSV 文件')); }
    try {
      var stream = new Blob([bytes]).stream().pipeThrough(ds);
      return new Response(stream).arrayBuffer().then(function (ab) { return new Uint8Array(ab); });
    } catch (e2) { return Promise.reject(new Error('解压失败：' + e2.message)); }
  }

  function unzip(buf) {
    var u = new Uint8Array(buf);
    var dv = new DataView(u.buffer, u.byteOffset, u.byteLength);
    var n = u.length, eocd = -1, i;
    for (i = n - 22; i >= 0 && i >= n - 65558; i--) {
      if (dv.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
    }
    if (eocd < 0) return Promise.reject(new Error('文件不是有效的 xlsx（找不到 ZIP 目录）'));
    var count = dv.getUint16(eocd + 10, true);
    var cd = dv.getUint32(eocd + 16, true);
    var p = cd, wanted = [];
    for (var k = 0; k < count; k++) {
      if (p + 46 > n || dv.getUint32(p, true) !== 0x02014b50) break;
      var method = dv.getUint16(p + 10, true);
      var csize = dv.getUint32(p + 20, true);
      var fnLen = dv.getUint16(p + 28, true);
      var exLen = dv.getUint16(p + 30, true);
      var cmLen = dv.getUint16(p + 32, true);
      var lo = dv.getUint32(p + 42, true);
      var name = utf8(u.subarray(p + 46, p + 46 + fnLen));
      if (/^xl\/(workbook\.xml|_rels\/workbook\.xml\.rels|sharedStrings\.xml|worksheets\/sheet\d+\.xml)$/.test(name)) {
        wanted.push({ name: name, method: method, csize: csize, lo: lo });
      }
      p += 46 + fnLen + exLen + cmLen;
    }
    return Promise.all(wanted.map(function (e) {
      if (e.lo + 30 > n) return Promise.resolve({ name: e.name, text: '' });
      var lfn = dv.getUint16(e.lo + 26, true);
      var lex = dv.getUint16(e.lo + 28, true);
      var start = e.lo + 30 + lfn + lex;
      var bytes = u.subarray(start, start + e.csize);
      if (e.method === 0) return Promise.resolve({ name: e.name, text: utf8(bytes) });
      if (e.method !== 8) return Promise.reject(new Error('不支持的压缩格式'));
      return inflateRaw(bytes).then(function (out) { return { name: e.name, text: utf8(out) }; });
    })).then(function (list) {
      var map = {};
      for (var j = 0; j < list.length; j++) map[list[j].name] = list[j].text;
      return map;
    });
  }

  // ===== XLSX → { Sheet 名: 二维行数组 } =====
  function xmlDoc(text) {
    var d = new DOMParser().parseFromString(text, 'application/xml');
    if (d.getElementsByTagName('parsererror').length) throw new Error('xlsx 内部 XML 解析失败');
    return d;
  }
  function colIndex(ref) {
    var m = /^([A-Z]+)/.exec(ref || '');
    if (!m) return -1;
    var s = m[1], v = 0;
    for (var i = 0; i < s.length; i++) v = v * 26 + (s.charCodeAt(i) - 64);
    return v - 1;
  }
  function cellValue(c, sst) {
    var t = c.getAttribute('t') || '';
    if (t === 'inlineStr') return c.textContent || '';
    var v = c.getElementsByTagName('v')[0];
    var raw = v ? (v.textContent || '') : '';
    if (t === 's') return sst[parseInt(raw, 10)] || '';
    return raw;
  }
  function sheetRows(xml, sst) {
    var d = xmlDoc(xml), rn = d.getElementsByTagName('row'), out = [];
    for (var r = 0; r < rn.length; r++) {
      var idx = parseInt(rn[r].getAttribute('r'), 10);
      if (!(idx > 0)) idx = r + 1;
      var arr = [], cells = rn[r].getElementsByTagName('c');
      for (var c = 0; c < cells.length; c++) {
        var ci = colIndex(cells[c].getAttribute('r'));
        if (ci < 0) ci = c;
        if (ci < 40) arr[ci] = cellValue(cells[c], sst);
      }
      for (var j = 0; j < arr.length; j++) if (arr[j] == null) arr[j] = '';
      out[idx - 1] = arr;
    }
    for (var q = 0; q < out.length; q++) if (!out[q]) out[q] = [];
    return out;
  }
  function readXlsx(buf) {
    return unzip(buf).then(function (files) {
      var wbXml = files['xl/workbook.xml'], relXml = files['xl/_rels/workbook.xml.rels'];
      if (!wbXml || !relXml) throw new Error('xlsx 缺少工作簿信息，请确认用的是模板文件');
      var wb = xmlDoc(wbXml), rels = xmlDoc(relXml);
      var relMap = {}, relNodes = rels.getElementsByTagName('Relationship');
      for (var i = 0; i < relNodes.length; i++) relMap[relNodes[i].getAttribute('Id')] = relNodes[i].getAttribute('Target');
      var sst = [], sXml = files['xl/sharedStrings.xml'];
      if (sXml) {
        var sd = xmlDoc(sXml), sis = sd.getElementsByTagName('si');
        for (var t = 0; t < sis.length; t++) sst.push(sis[t].textContent || '');
      }
      var out = {}, sheetNodes = wb.getElementsByTagName('sheet');
      for (var s = 0; s < sheetNodes.length; s++) {
        var sh = sheetNodes[s], name = sh.getAttribute('name');
        if (!Object.prototype.hasOwnProperty.call(HEADERS, name)) continue;
        var rid = '', attrs = sh.attributes;
        for (var a = 0; a < attrs.length; a++) {
          if (attrs[a].localName === 'id' || attrs[a].name === 'r:id') { rid = attrs[a].value; break; }
        }
        var target = relMap[rid] || '';
        var path = target.charAt(0) === '/' ? target.slice(1)
          : ('xl/' + target.replace(/^\.\//, '').replace(/^\//, ''));
        if (files[path]) out[name] = sheetRows(files[path], sst);
      }
      return out;
    });
  }

  // ===== AI 输出的 TSV（按 [Sheet 名] 分块）→ 同样的二维行数组 =====
  function parseTsv(text) {
    var out = {}, cur = null;
    var lines = String(text).replace(/^\uFEFF/, '').split(/\r?\n/);
    for (var i = 0; i < lines.length; i++) {
      var ln = lines[i];
      var m = /^\[([^\]]+)\]\s*$/.exec(ln);
      if (m && Object.prototype.hasOwnProperty.call(HEADERS, m[1])) {
        cur = m[1];
        if (!out[cur]) out[cur] = [HEADERS[cur].slice()];
        continue;
      }
      if (!cur || !ln) continue;
      out[cur].push(ln.split('\t'));
    }
    return out;
  }

  // ===== 校验 / 映射 / 去重 =====
  function ensure(s) {
    if (!s.customBanks || typeof s.customBanks !== 'object') {
      s.customBanks = { idiom: [], pinyin: [], english: [], enabled: true };
    }
    for (var i = 0; i < BANK_KEYS.length; i++) {
      if (!Array.isArray(s.customBanks[BANK_KEYS[i]])) s.customBanks[BANK_KEYS[i]] = [];
    }
    if (typeof s.customBanks.enabled !== 'boolean') s.customBanks.enabled = true;
    return s.customBanks;
  }
  function usedMap(banks) {
    var used = { idiom: {}, pinyin: {}, english: {} };
    var i, list = APP.IDIOMS || [];
    for (i = 0; i < list.length; i++) used.idiom[String(list[i].w)] = 1;
    list = APP.WORDS_PINYIN || [];
    for (i = 0; i < list.length; i++) used.pinyin[String(list[i].h)] = 1;
    list = APP.WORDS_ENGLISH || [];
    for (i = 0; i < list.length; i++) used.english[String(list[i].e)] = 1;
    for (i = 0; i < BANK_KEYS.length; i++) {
      var k = BANK_KEYS[i], arr = banks[k] || [];
      for (var j = 0; j < arr.length; j++) used[k][String(arr[j].w || arr[j].h || arr[j].e)] = 1;
    }
    return used;
  }
  function parseBanks(sheets) {
    var res = { added: { idiom: [], pinyin: [], english: [] }, skipped: [], sheets: [] };
    var banks = ensure(APP.store.get());
    var used = usedMap(banks);
    for (var name in HEADERS) {
      if (!Object.prototype.hasOwnProperty.call(HEADERS, name)) continue;
      var rows = sheets[name];
      if (!rows || !rows.length) continue;
      var want = HEADERS[name], head = [], c;
      for (c = 0; c < want.length; c++) head.push(trim((rows[0] || [])[c]));
      var okHead = true;
      for (c = 0; c < want.length; c++) if (head[c] !== want[c]) { okHead = false; break; }
      if (!okHead) { res.skipped.push(name + '：表头与模板不一致，已跳过该 Sheet'); continue; }
      res.sheets.push(name);
      var key = KEYS[name];
      for (var r = 1; r < rows.length; r++) {
        var vals = [];
        for (var v = 0; v < want.length; v++) vals.push(trim((rows[r] || [])[v]));
        var any = false;
        for (v = 0; v < vals.length; v++) if (vals[v]) { any = true; break; }
        if (!any) continue;
        if (vals[vals.length - 1] !== '1') continue;   // 启用=0 / 空 → 静默跳过
        var lv = parseInt(vals[vals.length - 2], 10);
        if (!(lv >= 1 && lv <= 5)) { res.skipped.push(name + ' 第' + (r + 1) + '行：难度不是 1~5'); continue; }
        var item = null, uniq = '';
        if (key === 'idiom') {
          var w = vals[0], pos = parseInt(vals[1], 10), a = vals[2], d = [vals[3], vals[4], vals[5]];
          if (w.length !== 4) { res.skipped.push(name + ' 第' + (r + 1) + '行：不是四字成语'); continue; }
          if (!(pos >= 1 && pos <= 4) || w.charAt(pos - 1) !== a) {
            res.skipped.push(name + ' 第' + (r + 1) + '行：挖空位与答案不符'); continue;
          }
          var bad = false;
          for (v = 0; v < 3; v++) if (!d[v] || d[v].length !== 1 || d[v] === a) bad = true;
          if (d[0] === d[1] || d[0] === d[2] || d[1] === d[2]) bad = true;
          if (bad) { res.skipped.push(name + ' 第' + (r + 1) + '行：干扰项不合规'); continue; }
          uniq = w;
          item = { w: w, i: pos - 1, a: a, d: d, level: lv };
        } else if (key === 'pinyin') {
          if (vals[0].length !== 1 || !vals[1]) { res.skipped.push(name + ' 第' + (r + 1) + '行：汉字/拼音不完整'); continue; }
          uniq = vals[0];
          item = { h: vals[0], p: vals[1], level: lv };
        } else {
          if (!vals[0] || !vals[1]) { res.skipped.push(name + ' 第' + (r + 1) + '行：单词/中文不完整'); continue; }
          uniq = vals[0];
          item = { e: vals[0], cn: vals[1], i: vals[2], level: lv };
        }
        if (used[key][uniq]) { res.skipped.push(name + ' 第' + (r + 1) + '行：与内置或已有题库重复'); continue; }
        used[key][uniq] = 1;
        res.added[key].push(item);
      }
    }
    return res;
  }
  function applySheets(sheets) {
    var res = parseBanks(sheets);
    if (!res.sheets.length) throw new Error('没找到任何题库 Sheet。请使用模板填写，或上传按 [成语填空] 分块的 TSV。');
    var total = res.added.idiom.length + res.added.pinyin.length + res.added.english.length;
    res.total = total;
    if (!total) return res;                 // 一行都没通过，不写存档
    var banks = ensure(APP.store.get());
    for (var i = 0; i < BANK_KEYS.length; i++) {
      var k = BANK_KEYS[i];
      banks[k] = banks[k].concat(res.added[k]);
    }
    banks.enabled = true;                   // 导入后自动启用，避免「导入了却没生效」
    APP.store.save();
    return res;
  }

  // ===== 对外 API =====
  function stats() {
    var b = ensure(APP.store.get());
    return { idiom: b.idiom.length, pinyin: b.pinyin.length, english: b.english.length, enabled: b.enabled };
  }
  function setEnabled(on) {
    var b = ensure(APP.store.get());
    b.enabled = !!on;
    APP.store.save();
    return b.enabled;
  }
  function clear() {
    var b = ensure(APP.store.get());
    for (var i = 0; i < BANK_KEYS.length; i++) b[BANK_KEYS[i]] = [];
    APP.store.save();
  }
  function readFile(file) {
    var name = String(file.name || '').toLowerCase();
    if (/\.(tsv|txt)$/.test(name)) {
      return new Promise(function (resolve, reject) {
        var r = new FileReader();
        r.onload = function () { resolve(parseTsv(String(r.result))); };
        r.onerror = function () { reject(new Error('文件读取失败')); };
        r.readAsText(file, 'utf-8');
      });
    }
    return new Promise(function (resolve, reject) {
      var r = new FileReader();
      r.onload = function () { resolve(r.result); };
      r.onerror = function () { reject(new Error('文件读取失败')); };
      r.readAsArrayBuffer(file);
    }).then(readXlsx);
  }
  var input = null;
  function pick() {
    if (!input) {
      input = document.createElement('input');
      input.type = 'file';
      input.accept = '.xlsx,.tsv,.txt';
      input.style.display = 'none';
      document.body.appendChild(input);
    }
    return new Promise(function (resolve, reject) {
      input.value = '';
      input.onchange = function () {
        var f = input.files && input.files[0];
        if (!f) return;
        readFile(f).then(resolve, reject);
      };
      input.click();
    });
  }
  function summaryHtml(res) {
    var h = '成语填空 +' + res.added.idiom.length + ' 题 · 拼音翻牌 +' + res.added.pinyin.length +
      ' 组 · 英语翻牌 +' + res.added.english.length + ' 组';
    h += '<br>合计新增 <b>' + res.total + '</b> 条，已自动启用自定义题库。';
    if (res.skipped.length) {
      h += '<br><br>跳过 ' + res.skipped.length + ' 行：<br>' + res.skipped.slice(0, 6).map(esc).join('<br>');
      if (res.skipped.length > 6) h += '<br>… 其余 ' + (res.skipped.length - 6) + ' 行略';
    }
    var online = APP.auth && APP.auth.session();
    h += '<br><br>' + (online ? '已保存到本机并同步到云端。' : '已保存到本机（本机模式不上传云端，换设备不会同步）。');
    return h;
  }

  APP.bankImport = {
    TEMPLATE_URL: TEMPLATE,
    pick: pick,
    readFile: readFile,
    readXlsx: readXlsx,
    parseTsv: parseTsv,
    applySheets: applySheets,
    summaryHtml: summaryHtml,
    stats: stats,
    setEnabled: setEnabled,
    clear: clear
  };
})(window.APP);
