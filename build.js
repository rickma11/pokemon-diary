#!/usr/bin/env node
/* 零依赖构建：把 index.src.html 里的全部 JS / CSS 内联进 index.html。
 *
 *   node build.js
 *
 * 原来首页要按顺序等 34 个 JS + 2 个 CSS 全部下载完才渲染，国内访问 github.io
 * 首屏经常要 5-10 秒。合并后首屏只有 1 个 HTML 请求（gzip 后约 250KB）。
 * 源码仍然是一个个独立文件，改完跑一次这个脚本即可；更新推送.bat 会自动调用。
 */
'use strict';
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const ROOT = __dirname;
const abs = p => path.join(ROOT, p);
const read = p => fs.readFileSync(abs(p), 'utf8');
const exists = p => fs.existsSync(abs(p));

let html = read('index.src.html');

// ---- 1) CSS：所有 stylesheet link 合成一个 <style> ----
const cssTags = [...html.matchAll(/<link rel="stylesheet" href="([^"]+\.css)">/g)];
if (!cssTags.length) throw new Error('index.src.html 找不到 CSS link');
// 内联后 CSS 就在页面根目录了，url('../assets/…') 会解析到站点根之外（404，图全丢）。
// 统一改写成 url('assets/…')：http 与 file:// 双击打开都能正确取到图。
const cssText = cssTags.map(m => '\n/* ===== ' + m[1] + ' ===== */\n' + read(m[1]))
  .join('\n')
  .replace(/url\((['"]?)\.\.\/assets\//g, 'url($1assets/');
html = html.replace(cssTags[0][0], () => '<style>' + cssText + '\n</style>');
for (let i = 1; i < cssTags.length; i++) html = html.replace(cssTags[i][0], () => '');

// ---- 2) JS：按原顺序拼接，保留换行（不压缩，否则 // 注释会吞掉后面的代码）----
const jsTags = [...html.matchAll(/<script defer src="([^"]+\.js)"><\/script>/g)];
if (jsTags.length < 30) throw new Error('脚本数量异常：' + jsTags.length);
let jsText = jsTags.map(m => '\n/* ===== ' + m[1] + ' ===== */\n' + read(m[1])).join('\n;\n');
// 内联脚本里出现 </script 会提前闭合标签，<!-- 会被当成注释开头
jsText = jsText.replace(/<\/script/gi, '<\\/script').replace(/<!--/g, '<\\!--');
html = html.replace(jsTags[0][0], () => '<script defer>\n' + jsText + '\n</script>');
for (let i = 1; i < jsTags.length; i++) html = html.replace(jsTags[i][0], () => '');

// ---- 3) 首屏骨架图：把 128px 小图也内联，省掉首屏唯一的图片请求 ----
let artCount = 0;
html = html.replace(/src="assets\/tiny\/(\d+)\.webp"/g, (all, id) => {
  const f = 'assets/tiny/' + id + '.webp';
  if (!exists(f)) throw new Error('缺小图 ' + f);
  artCount++;
  return 'src="data:image/webp;base64,' + fs.readFileSync(abs(f)).toString('base64') + '"';
});

// ---- 4) 注入页面版本号（与 SW 缓存版本号同源，供「我的数据-版本信息」显示）----
// 版本号唯一真相在 sw.js 的 var CACHE='pokedex-checkin-vNN'，这里读出来注入，
// 免得页面里再写死一个数字、每次发版漏改。读不到就留空（页面显示 —）。
const swText = read('sw.js');
const m = swText.match(/pokedex-checkin-(v\d+)/);
const buildVer = m ? m[1] : '';
html = html.replace('<!DOCTYPE html>', () =>
  '<!DOCTYPE html>\n<!-- 由 build.js 从 index.src.html 自动生成，请勿直接编辑；改源码后运行 node build.js -->' +
  '\n<script>window.APP_BUILD_VERSION=' + JSON.stringify(buildVer) + ';</script>');

if (/<script defer src=/.test(html)) throw new Error('仍有未内联的外部脚本');
if (/<link rel="stylesheet"/.test(html)) throw new Error('仍有未内联的样式表');

fs.writeFileSync(abs('index.html'), html, 'utf8');
const raw = Buffer.byteLength(html);
const gz = zlib.gzipSync(Buffer.from(html)).length;
console.log('内联 JS   : ' + jsTags.length + ' 个');
console.log('内联 CSS  : ' + cssTags.length + ' 个');
console.log('内联小图  : ' + artCount + ' 张');
console.log('index.html: ' + (raw / 1024).toFixed(1) + ' KB（gzip 约 ' + (gz / 1024).toFixed(1) + ' KB）');
console.log('首屏代码请求: ' + (jsTags.length + cssTags.length) + ' → 1');
