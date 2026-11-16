# 交接卡：继续开发「宝可梦训练日记」

> **这份文件是给「另一个窗口的 AI 助手」直接读的**：自包含、不含任何令牌或凭据，读完即可开工，不需要用户再补充或修改内容。
>
> - 最近更新：2026-11-15 21:00（演示存档 v2 轮，详见第 15 节；SW 仍为 v83）
> - 本地主交接文档：`F:/宝可梦日常打卡工具/docs/项目交接与继续指南.md`（含敏感配置，`docs/` 被 `.gitignore` 排除、**不进公开仓库**；其他窗口读它可能被安全策略拦下，所以请优先读本文件）
> - 部署说明：`deploy-package/AI_DEPLOY_GUIDE.md`；完整使用/安全说明：`README.md`

---

## 0. 一分钟现状（开工前必读）

| 项目 | 值 |
|---|---|
| 项目路径 | `F:/宝可梦日常打卡工具`（Git Bash：`/f/宝可梦日常打卡工具`） |
| 仓库 | `rickma11/pokemon-diary`（Public，分支 `main`） |
| 线上地址 | https://rickma11.github.io/pokemon-diary/ |
| 形态 | 纯静态单页 PWA，**无后端、无打包工具**；Node 只用于 `build.js` 和本地预览 |
| 入口 | `index.html`（约 1.37 MB，**构建产物**，内联了全部 38 个 JS + 2 个 CSS） |
| 源码 | `js/`、`css/`、`index.src.html`、`sw.js`、`manifest.json` |
| 构建 | `node build.js`（`index.src.html` → `index.html`）；`更新推送.bat` 会自动调用 |
| 离线缓存 | 根目录 `sw.js`，当前 `var CACHE = 'pokedex-checkin-v83'` |
| 账号/存档 | 客户端 AES-GCM 加密后写进仓库 `accounts/` 与 `saves/`；App 运行时会往 `main` 写 `sync: saves/...` commit |
| 当前线上 | 本轮 v83；发布后以 `pages/builds/latest` 与线上 `index.html` 为准 |
| 当前本地 | 与本轮线上一致；`accounts/` + `saves/` 共 4 个文件原样保留 |

> **commit 号说明**：远端 `main` 会因 App 运行时写档（`sync: saves/...`）和**纯文档提交**不断前进。上表的 `d84ef845` 指的是**代码版本**；判断「页面是不是这一版」，看 `index.html` 的 sha 或 Pages 构建，不要只比对 `main` 的最新 commit。纯文档提交不会改 `index.html`，页面完全不受影响。

**一句话铁律**：线上页面只加载 `index.html`，源码文件不会被浏览器读取。**只改 `js/xxx.js` 就直接 push，线上一定不变**。

---

## 1. 发布顺序 —— 其他窗口的 AI 照这个顺序做

以下是 2026-11-15 交付给用户、需要原样遵守的顺序：

```text
1. 只改 js/、css/、index.src.html，不要直接改 index.html（它是构建产物）
2. node build.js           ← 最关键，线上加载的是内联了全部 JS/CSS 的 index.html
3. sw.js 里 var CACHE = 'pokedex-checkin-vNN' 的 NN +1（漏了也有 ETag 兜底）
4. git add -A && git commit -m "..."
5. git pull --rebase origin main   ← App 会写 sync: saves/... commit，不同步会被拒
6. git push origin main
7. 查 pages/builds/latest 为 built 且 commit 一致；再确认线上 index.html 能搜到这次新代码
```

配套硬约束（同样必须遵守）：

- **改前备份**：本次要改的重要文件先复制到 `backups/<日期-主题>/<file>.pre`。
- **改后自检**：对改过的 `.js` 逐个 `node --check`，确保 0 语法错误；再跑一次本地预览/无头浏览器冒烟。
- **存档保护**：`accounts/`、`saves/` 是用户加密存档，任何推送都不得覆盖或删除；推送后要确认文件数不变。
- **凭据保护**：常规推送用已配置的 `origin` 凭据即可，**不要**把任何令牌值写进随仓库发布的文件、也不要输出到对话里。只有查 Pages 状态 / 远端文件内容时才需要额外凭据，届时向用户索取或使用 `gh`。
- **本轮已加的兜底**：`sw.js` 会用 `no-store` 绕过 Pages 的 10 分钟 HTTP 缓存、比对 ETag，发现新版会通知页面自动刷新一次；所以推送完成后，让用户手机/电脑各打开一次站点即可，**不需要手动清缓存**。

**最省事的等价做法**：双击项目根目录 `更新推送.bat`，它已串好「`node build.js` → `git add` → `commit` → `git pull --rebase` → `push`」。但第 1、3、7 步（不改产物、缓存版本 +1、上线核验）仍需自己做。

### 可直接复制给其他窗口 AI 的指令

```text
你在维护「宝可梦训练日记」静态站点，项目在 F:/宝可梦日常打卡工具。
先完整读 deploy-package/AI_继续开发交接卡.md，再按该文件「1. 发布顺序」执行。
铁律：只改 js/、css/、index.src.html；改完必须 node build.js；推送前
git pull --rebase origin main；不得覆盖 accounts/ 与 saves/；不得输出任何令牌值。
完成后告诉我：远端 commit、Pages 状态、线上 index.html 是否已含本次新代码。
```

---

## 2. 推送后核验清单

- [ ] 远端 `main` 最新 commit = 本次，且 `git status` 干净
- [ ] `https://api.github.com/repos/rickma11/pokemon-diary/pages/builds/latest` 的 `status=built`、`commit` 与上一条一致
- [ ] 线上 `index.html` 里能搜到这次新增的函数名 / 文案（源码里的新代码只有构建后才进得去）
- [ ] `accounts/`、`saves/` 文件数与推送前一致
- [ ] 手机 / 电脑各打开一次站点，确认自动切到新版、无运行时报错

---

## 3. 推送成功但页面还是旧的 —— 按顺序排查，不要反复推送

1. **远端有没有新代码**：看 `commits/main`，再打开仓库里的 `index.html` 搜本次新特征。搜不到 = 漏跑 `node build.js`（最常见）。
2. **Pages 构建完没有**：`pages/builds/latest` 要 `built` 且 commit 一致，推送后约 1 分钟。
3. **缓存**：v77 起已自动切换；想立刻看可 `Ctrl+Shift+R` 硬刷新、手机清站点数据、桌面图标关掉再开。
4. **数据层，不是缓存**：`APP.DEFAULT_TASKS` 只在新建存档 / 点「恢复默认任务」时写入。已有账号存档里的旧任务不会被代码改动覆盖；`store.migrate()` 只做一次性升级（任务与旧 5 项模板逐条一致才换成新版 8 项，用户自定义过则完全不动）。

---

## 4. 本次（2026-11-15 最后一轮）改动明细

**背景**：另一个窗口推送 `d2ba9f7`（默认任务改版：作业改打钩、新增吃饭/家务、调运动与就寝时间、任务管理加规则说明）与 `27d31e5`（照料屏内工具条：更换/设置按钮移位、对话文案改写、SW v76）后，用户看 `#/parent` 仍是旧界面。

**诊断结论：推送其实完全成功**，不是漏推。逐层核对：远端 `main` = `27d31e5`；Pages `built @ 27d31e58`；远端 `index.html` 1,347,354 字节且含全部新代码（`careTextShort`、`gba-screen__tools`、`t_lunch`、规则说明），旧的 `mode:'photo'` 已消失；`sw.js` = v76；线上 200 但 `Cache-Control: max-age=600`。根因是**离线缓存对首页「有缓存立即返回旧 HTML、后台拉新版」，后台请求又撞进 GitHub Pages 的 10 分钟 HTTP 缓存**，等于刷新也拿不到新版。

修复 4 项：

| # | 改动 | 文件 |
|---|---|---|
| 1 | SW v76→**v77** 发版自动切新版：后台请求 `no-store` 绕过 CDN 缓存、ETag 比对发现变化即通知页面自动刷新一次（同版本只刷一次）、`activate` 清旧缓存并强制重载已打开页面、注册加 `updateViaCache:'none'` | `sw.js`、`js/app.js` |
| 2 | 骨架文案「首次加载资源会稍慢一点，请稍等」→「**内容准备中，请稍等**」（每次更新都会出现，不该说「首次」） | `index.src.html` → `index.html` |
| 3 | 旧存档默认任务**一次性迁移**：`taskTemplateVersion` + `OLD_DEFAULT` 判据，任务与旧 5 项模板逐条一致时自动换成新版 8 项（作业打钩、运动 21:00、上床睡觉 22:00、新增吃饭/家务），打卡记录留在 `instances` 不丢；自定义过任务则绝不覆盖 | `js/models.js`、`js/store.js` |
| 4 | README 新增「推送成功，但页面还是旧的？」4 步排查 + 「给另一个窗口 / AI 助手的发布清单」；`parent.js`「还原为内置 5 项」→ 8 项 | `README.md`、`js/screens/parent.js` |

上线与验证：远端 `d84ef845`、Pages `built @ d84ef84577fb`、线上 200 / 1,341,249 字节；本地 `7862d2a`；全量 JS 语法 0 错、SW 五场景 + 迁移四场景模拟通过、真实 Chrome 二次导航 0 异常且 v77 缓存正常建立；备份在 `backups/20261115-sw-autorefresh/`。

---

## 5. 本会话更早的关键节点（倒序，理解架构用）

| commit | 内容 |
|---|---|
| `deebef9` | 未连仓库时隐藏登录/注册入口并改为「验证通过才保存配置」；4 张主角形象立绘 1.10 MB → 28.6 KB WebP 内联；修复新设备丢弃云端存档（`adoptExternal` 强制采纳、保留云端时间戳）；关键步骤（选宠/首登/形象重选/捕捉/战斗结算/打卡/解锁）固定立即上传 + 上传串行化；首登后询问「添加到桌面」（Android 可真安装、iOS 只能给图文指引） |
| `b573e19` | 35 个 JS + 2 个 CSS 内联进单个 `index.html`（首屏代码请求 37→1）；`index.src.html` + `build.js` 构建链路；10 只宝可梦小图 1.29 MB → 52.7 KB 内联、中文名内置；`sw.js` 移到根目录并修「把 HTML 当 JS 返回」；同步降频（静默 20 秒 / 最长 60 秒 / 最小间隔 30 秒 / 内容去重）；**补齐此前被 `data/` 规则误忽略、线上一直缺失的 7 个 `js/data/` 文件** |
| `8613b26` | 34 个脚本改并行预取 + 骨架屏 + 离线缓存 900ms 回退；精灵球桌面图标与「宝可梦训练日记」名称；登录页 README 直达说明、示例账号改虚构；选宠去「固定」标签、新增「换一批」3 次、皮卡丘 80% 概率出现 |
| 更早 | 纯静态化重构（去后端 `server.js`）、强制登录、客户端 AES-GCM 加密存档、GitHub Contents API 同步、首次流程门禁、登录/注册分页签、昵称/短码/完整账号码三段登录 |

**架构备忘**：`window.APP` 全局命名空间；`location.hash` + `APP.screens[id].render()`；`localStorage` 存 `pokedex-checkin-v1` / `pokedex-checkin-gh` / `slot:*` / `vaultKeyB64`；`APP.gh`（Contents API）、`APP.cipher`（PBKDF2 包裹 + AES-GCM）、`APP.auth`（注册/登录/会话）、`APP.sync`（上传下载/节流/去重/关键上传）、`APP.onboarding`（首登门禁）、`APP.pwaInstall`（桌面引导）。照片只存本机 IndexedDB，不进仓库。

---

## 6. 不要做的事

- 不要直接编辑 `index.html`（下次 `node build.js` 会被覆盖）。
- 不要忘记 `sw.js` 缓存版本 +1；不要注册 `js/sw.js`（旧的子目录 SW 作用域管不到首页，已废弃）。
- 不要把 `docs/`、`backups/`、`tools/`、任何凭据文件推到公开仓库（`.gitignore` 已排除，别手动 `git add -f`）。
- 不要覆盖 `accounts/`、`saves/`，不要用强推改写远端运行时写档 commit。
- 不要在公开仓库或对话里出现真实账号昵称 / 短码 / 令牌；示例一律用虚构信息。
- 不要在页面里对 iOS Safari 承诺「自动生成桌面图标」——浏览器不允许，只能给「分享 → 添加到主屏幕」指引。

---

## 7. 已知限制 / 未解决

1. **运行时账号与存档仍写在 `main`**：`更新推送.bat` 靠 `git pull --rebase` 兜住；根治需独立 `data` 分支或私有数据仓库，**用户未授权，不要擅自迁移**。
2. 本地 HEAD 与远端曾出现内容等价但 sha 分叉，首次在用户电脑双击 `更新推送.bat` 会自动 rebase 对齐。
3. 作业照片只存本机，换设备看不到（设计如此）。
4. 若首次打开仍偏慢，可把 `assets/pmd-sliced/manifest.js`（约 280 KB 动作切片清单）拆成进乐园时才加载 —— 未实施，等用户实测反馈。
5. 旧 App 预览 `wbapp_j2fuV7LZsuIdpqeODeu5PN` 仍是上一轮版本，待用户决定是否下线。

---

## 8. 2026-11-15 手机端体验轮（v78）

| # | 改动 | 文件 |
|---|---|---|
| 1 | 日程页下拉时进度卡只留「今日进度 + 进度条」，其余（打卡反馈 / 本月累计 / 连击阶梯 / 解锁入口）隐藏，回顶部自动展开；折叠 72px / 展开 24px 双阈值防抖 | `js/screens/schedule.js`、`css/app.css` |
| 2 | 任务卡由「图标 + 正文 + 80px 截止列 + 90px 按钮列」四列改三列：标题单行不换行、碎片与截止时间收进同一标签行、说明文字置底 | 同上 |
| 3 | 博士弹窗图 351×600 PNG 138 KB → 192px WebP **12 KB**，写进 `js/data/doctor-art.js` 常量并随构建内联，弹窗零网络请求；原图不动，常量已随源码提交，重新生成只需把 `assets/doctor-full.png` 缩到 192px 转 WebP 再 base64（本机脚本在 `tools/`，`tools/` 不发布） | `js/unlock.js`、`index.src.html` |
| 4 | 解锁讲解改「一行一个重点 + 虚线分隔」：首行讲解锁了什么，后两行只留必要信息；`docBody()` 同时兼容数组与旧的纯字符串调用（首登寄语） | `js/unlock.js` |
| 5 | T0「启程」删掉「完成 1 次每日打卡」：首登即开、奖励在 `onboarded` 时就发，这条纯展示且无关判定 | `js/unlock.js` |
| 6 | T1–T4 由「累计打卡 N 次」单条件改为 **双条件都要满足**：玩耍 2 次+2 天 / 训练 5 次+3 天 / 乐园 7 次+3 天 / 兑换 10 次+4 天。面板展开后各显示两行进度；`UNLOCK_REQ` / `reqText()` / `checkTasks()` 统一生成 | `js/unlock.js` |
| 7 | **家长密码可含英文**：`inputmode="numeric"` 会让小米安全键盘只弹数字，含字母的密码根本输不进去。所有大人 / 家长 / 管理密码框改为 `inputmode="text"`，登录表单加 `autocapitalize="off"` 防首字母自动大写；小孩密码仍保留数字键盘（设计上建议纯数字） | `js/app.js`、`js/screens/login.js`、`js/screens/parent.js` |

**「登录天数」口径（重要）**：`evalState()` 的 `loginDays` = `activeDays` = `instances` 里「当天至少有一条 done/submitted/approved」的不同日期数，**不是**「打开过 App 的天数」。所以「打卡 2 次 + 登录 2 天」意味着至少分两天各打一次卡，一天刷满 2 条仍不解锁。若以后要改成「只要打开就算一天」，需要在 store 里新增独立登录日期记录。已播讲解 / 已发奖励的档位有 `seen`/`claimed` 迁移保护，加条件不会把已解锁功能收回去。

**自检记录**：改动 JS 全部 `node --check` 0 错；`node build.js` 内联 38 个 JS + 2 CSS；VM 模拟 6 组打卡分布验证双条件（含「一天刷满 5 条不解锁」）；入口条文案确认为「累计打卡 5 次 · 登录 3 天」。备份在 `backups/20261115-mobile-schedule-unlock/`。

**第 8 节里「入口条文案为『累计打卡 5 次 · 登录 3 天』」已在 v79 改成「还差多少」，见下节。**

---

## 9. 2026-11-15 文案人性化轮（v79）

**用户确认的口径 A（后续改文案一律沿用）**：底部「提示」框 = 系统 / 博士口吻，只讲事实、给下一步；头顶气泡 = 宝可梦第一人称，负责撒娇和情绪。两者不混。用户明确要求「描述不要生硬，要像正常人说话」，所以**完整句 + 带主语 + 不用日志符号（冒号 / 箭头 / `·`）和后台词（生效中、获得、累计）**，但也不是冷冰冰的机器播报。

| # | 改动 | 文件 |
|---|---|---|
| 1 | 养成页「提示」框整批重写：`SYS_DEFAULT`、`careText()` 结算话术、`careTextShort()`（改为整句自带主语，不再 `name + 短句` 硬拼出「妙蛙种子 刚完成 99乘法表」这种主谓错位病句）、`buildFeed()` 轮播 | `js/screens/care.js` |
| 2 | **「还剩 N 项」**：训练读当天 `trainingPlays.games`（4 个小游戏）、玩耍读 `memoryPlays.packs`（拼音 / 英语），显示「今天还剩 3 项训练没做 / 还剩 1 项翻牌没玩」 | `js/screens/care.js` |
| 3 | **「还差几次 / 还差几天」**：`unlock.js` 新增 `remaining(id)` / `gapText(id)` / `lockMsg(id)`，复用 `evalState()` 的真实进度，不另建计数；未解锁轻提示、底部页签、探险子页签、日程页入口条、任务面板「下个目标」全部改成「再打卡 2 次、再来 2 天就能解锁了」；等级档显示「主力再升 6 级」 | `js/unlock.js`、`js/app.js`、`js/screens/catch.js` |
| 4 | 用户点名两条：饿肚子那句**补主语** → `宝可梦饿着肚子没法训练，先给它喂一颗树果吧。`；`用下面的按钮照顾我吧～` **整句删掉**（拿不到宝可梦时气泡不显示，`showBubble('')` 会顺手收掉上次残留气泡） | `js/screens/care.js` |
| 5 | 气泡/台词修正：`主人在吗？陪我嘛~` → `在吗在吗？陪我一会儿嘛~`；点「玩耍」瞬间 `好开心！再来一次嘛~` → `走！去玩翻牌～`（还没开始玩不能说「再来一次」） | `js/screens/care.js` |
| 6 | 博士解锁讲解由「提纲短句」改回自然句（仍保持一行一句 + 虚线分隔的版式），去掉 `【】`、`→`、`：`；规则弹窗删掉过时的「对战还没开放…最高 2 星」，换成 `外出战斗在主力 Lv.7 时开放` | `js/unlock.js`、`js/screens/care.js` |
| 7 | 抚摸提示：`今天抚摸计满 5 次啦` / `抚摸太快啦，约 N 分钟后` 改成口语；换宠演出 4 句命令口吻改陈述；`切换失败` → `这只暂时换不了，再试一次吧。` | `js/store.js`、`js/screens/care.js` |

**两个必须记住的依赖**：
- `js/store.js` 的 `petBond()` 冷却 `msg` **必须保留「抚摸太快」四字** —— `care.js` 用 `/抚摸太快/.test(r.msg)` 判断是不是冷却（连点第 2 次才播报），改词会静默失效。
- `SYS_DEFAULT` 现在是 `render()` 里 HTML 初始文案和 `careText()` 兜底共用的常量，改一处即可，别再写两遍。

**自检记录**：6 个改动 JS 全部 `node --check` 0 错；`node build.js` 内联 38 JS + 2 CSS / 1,365,539 字节；VM 探针插入 IIFE 内部取私有函数，验证 6 组打卡分布的 `gapText` / `lockMsg`、`buildFeed` 的「还剩 N 项」、饿肚子主语、结算主谓、8 个生硬词零残留，全部 PASS。备份在 `backups/20261115-care-copy-natural/`。

**用户仍未确认的口径**：「登录 N 天」= 有打卡记录的不同日期数（第 8 节口径），不是打开 App 就算一天；若要改需新增独立登录日期记录。

---

## 10. 2026-11-15 解锁修复轮（v80）：新账号「提前解锁 + 打钩不一致」

**现象**：当天注册的账号（马一一）第一天只打了 2 次卡，玩耍却显示「已解锁、奖励已领取」，但面板两个条件（打卡 2/2、登录 2/2）都是空心没打钩，顶部还显示打卡 0 次。

**根因**：`js/unlock.js` `evalState()` 里的迁移保护「`claimed`/`seen` 有标记就无条件强制已解锁」，对该账号 `claimed.play=true` 生效，把天数不够的账号硬撑成已解锁；而面板打钩读真实条件（0/2、0/2），两套逻辑打架。T1-T4 四档都有这个隐患（T5-T7 按等级判、不受影响）。「打卡显示 0」另因：该设备本地存档没有那 2 次打卡记录（同步层面，非本 bug）。

**用户选的方案**：用「注册是否满一天」（`meta.createdAt === APP.todayStr()`）区分——**今天新注册的账号按真实条件重判，老用户已解锁的一律不动**。

**实际改动（都在 `js/unlock.js`）**：
- `evalState()` 新增 `isFreshAccount`：今日新账号跳过迁移保护（`claimed`/`seen` 强制放行段整体包进 `if (!isFreshAccount)`）；`u.legacy` 放行段同理对新账号不生效。
- `check()` 新增孤儿标记清理：今日新账号且真实未解锁的前四档，删掉残留的 `seen[fk]`/`claimed[fk]`（树果不追回）——否则明天真达标时 `check()` 会因标记已占位而不再发奖、不再播讲解。清理后走已有的 `criticalPush()` 立刻上云，不会被云端旧标记拉回覆盖（`check()` 在每次 `render()` 时触发）。
- 已解锁档位与 T5-T7 一律不碰；老账号（注册≥1天）行为与之前完全一致。

**自检**：VM 验证脚本 15 项全过（新账号提前解锁被拦、老账号不回收、真达标正常解锁、孤儿标记被清理）。`node build.js` 后 `index.html` 含 `isFreshAccount`；SW 升 v80。备份 `backups/20261115-unlock-newaccount/`。

**遗留**：若用户以后要求「打开 App 就算登录一天」（当前口径=有打卡记录的不同日期数），需新增独立登录日期记录，会同时影响 v78/v79 的「还差几天」。

---

## 11. 2026-11-15 家长后台密码门收紧 + 夜间模式时间选择器修复（v81）

**问题 1（用户报）**：输对一次家长密码后，再点「家长」不再要密码，小孩能直接点进去。
**根因**：`app.js` 的 `promptParentPassword()` 调的是 `auth.login()`，它验证成功后会把**会话角色覆盖成 parent**（`store({role:'parent'...})`）——一次验证=永久免密。另外家长身份登录的账号本来就免密直进。
**修复（用户要求：每次进入都必须输密码）**：
- `js/auth.js` 新增 `verifyParent(accountId, pwd)`：只解开 `accounts/{id}.json` 的 **parent 包裹**验证密码，**不写会话、不切角色、不落本地存储**；已导出到 `APP.auth`。
- `js/app.js`：删除按角色放行的 `canParent()`；新增模块级 `parentUnlocked` 临时通行证——顶部「家长」按钮和长按图标 3 秒**两条入口都改为必弹密码框**；验证通过置 `parentUnlocked=true` 才放行 `#/parent`；离开后台（`lastTab` 切换）、退出登录、直接访问 `#/parent` 都立即作废。孩子密码解不开 parent 包裹，进不去。
- **注意**：以后任何进后台的代码路径都必须走 `promptParentPassword()`，不要直接 `hash='#/parent'`，也不要再用 `auth.login()` 验密码（会改会话角色）。

**问题 2（用户报）**：手机系统切「夜晚/深色模式」后，家长后台「截止时间」的原生时间选择器弹窗浅字浅底看不清，页面也被强制涂黑。
**根因**：全站三套皮肤（彩色/GBA/墨水）都是浅底，但没声明 `color-scheme`，浏览器强制深色（force dark）乱反色。
**修复**：`index.src.html` head 加 `<meta name="color-scheme" content="only light">`，`css/app.css` 末尾加 `:root { color-scheme: light; }`——浏览器不再强制反色，原生时间/日期选择器按浅色渲染，任何皮肤下清晰可读。**若未来真的要做深色皮肤，需同步把这两处改成 `light dark` 并配好深色变量。**

**自检**：VM 验证 `verifyParent` 5 项全过（正确密码放行/错误拒绝/孩子密码拒绝/空账号拒绝/**会话零改动**）；`node build.js` 后 `index.html` 含 `only light`、`verifyParent`、`parentUnlocked`；SW 升 v81。备份 `backups/20261115-parentpwd-colorscheme/`。

---

## 12. 2026-11-15 拆掉家长后台第二道密码门（v82）

**用户报**：v81 后进家长后台要输 2 次密码，且第二次输账号家长密码提示不对。
**根因**：家长屏（`js/screens/parent.js`）里还留着一套**老的本机密码门**——比对存档里的 `family.pin`（models 默认 `'1234'`，可在设置页「修改管理密码」改），和账号家长密码是两码事。以前它靠「login() 把会话切成 parent 角色」自动跳过（第 101-103 行的 role==='parent' 直通分支）；v81 改为 verifyParent 不切角色后，这道老门就露出来了，于是出现双密码 + 家长密码打不开本机 PIN。
**修复（用户口径：只留一道，用账号家长密码）**：
- 删除 `parent.js` 的 login 视图 / `renderLogin()` / `act==='login'` 比对 family.pin / `authed` 状态 / 回车提交 login 分支；`render()` 直接按 view 渲染各子页（密码门只剩 app.js 弹窗那一道）。
- 删除设置页「修改管理密码」卡片与 `setpin` 处理；`js/store.js` 删除 `setPin()` 及其导出（老存档里的 `family.pin` 字段仅保留不读）。
- **铁律**：家长后台的密码门全站只有一处 = `app.js promptParentPassword()`（每次进入必验、用账号家长密码）。不要再往 parent.js 或其他入口加任何本机 PIN / 额外密码比对。
- 后台里「退出登录」「重置小孩密码」等用账号体系的功能不受影响；models.js 的默认 `pin:'1234'` 仅为老存档字段兼容保留，无任何作用。

**自检**：4 个改动 JS `node --check` 0 错；`index.html` 中 `renderLogin`/`setpin` 零残留（仅两行废弃注释）；SW 升 v82。备份 `backups/20261115-parentpwd-colorscheme/`（含 parent.js.pre、store.js.pre）。

---

## 13. 2026-11-15 宝可梦头顶气泡超框截断修复（v83）

**用户报**：养成页头顶气泡（如「在吗在吗？陪我一会儿嘛~」）在部分手机上超出 GBA 屏右边被截断。
**根因（两层）**：
1. `@keyframes carePopfade` 的每个关键帧都写 `transform: translateY(...)`，**动画播放期间覆盖掉 `.care-bubble` 基础的 `transform: translateX(-50%)` 居中位移**——气泡从「left:50% 不回偏」的位置开始画，字一长就往右超框，被 `.care-stage` 的 `overflow:hidden` 剪掉。任何手机都存在，只是字够长/屏够窄才看得见。
2. 气泡 `white-space: nowrap` 不折行，长台词必然超出发光屏宽度。

**修复（`css/app.css`）**：carePopfade 每个关键帧自带 `translate(-50%, ...)`；气泡改 `white-space: normal` + `width: max-content` + `max-width: calc(100% - 24px)`（绝对定位百分比以舞台为基准）+ `text-align: center` + `line-height: 1.45`——任何字长都居中折行，不超框。
**教训**：以后给 `.care-bubble`（或任何 `left:50% + translateX(-50%)` 居中元素）写动画，关键帧必须自带 `translate(-50%, ...)`，否则动画一播就丢居中。

**自检**：`node build.js` 后 `index.html` 含新关键帧（`translate(-50%, 8px)` 等 3 处）；SW 升 v83。备份 `backups/20261115-parentpwd-colorscheme/app.css.bubble.pre`。

---

## 14. 2026-11-15 演示账号 OAOpkm（随仓库分发，SW 不变 v83）

**用户需求**：造一个通用测试账号随仓库分发，任何人部署后即可登录体验全部功能。
**账号**：`OAOpkm` / 小孩密码 `123456` / 家长密码 `pkm000000`。文件对已用 GitHub Contents API 直接写入仓库：`accounts/OAOpkm.json` + `saves/OAOpkm.json`。
**生成方式**（脚本已删，要点留档）：VM 加载项目自己的 `js/github.js`（cipher）+ `js/models.js`（defaultState），随机 vaultKey → 双密码 PBKDF2 包裹 → 账号文件；存档 = defaultState + 改造（`meta.createdAt='2026-11-01'` 防新账号重判、`unlock.seen/claimed` 全 7 档置 1、主力 Lv.15、wallet 碎片 260/树果 99/球 30/券各 20、`seen` 26 只图鉴、近 7 天每天 4 条 `approved` 打卡、streak 6）→ `cipher.seal(state, vaultKey)` 加密上传。
**验证**：脚本端到端读回仓库文件，parent/child 两个密码都能解开包裹并解密存档（shards=260、level=15、claimed 7 档）。
**注意**：
- 登录名 `OAOpkm` 命中 `resolveCandidates` 的「完整账号码直连」分支（`accounts/OAOpkm.json` 文件名即账号名）。
- 这是**共享账号**：所有使用者写同一个 `saves/OAOpkm.json`，存档会被互相覆盖——README 已注明「仅用于体验」。想恢复演示数据，重新生成覆盖 `saves/OAOpkm.json` 即可（密码在 wrap 里不变）。
- README 已加「### 演示账号（免注册，直接体验）」小节（第 5 步之后）+ 第四节文件清单补两行。
- 本轮只动 `README.md` 与账号数据文件，**页面代码无改动，SW 仍是 v83，无需重新构建**。

---

## 15. 2026-11-15 演示账号存档 v2 + 「登录后重走新手流程」根因（SW 仍 v83）

**用户报**：登录 OAOpkm 后要重走新手流程、功能未解锁、进度全 0。
**排查结论**（VM 全链路重放验证过）：云端演示数据本身是通的（孩子密码→vaultKey→存档解密成功），`sync.pull()` 的采纳逻辑也对；问题出在**时机**——该账号文件/密码在当晚被反复修复过（两个窗口重复生成 + 重裹，提交历史 34e328d/9c04b05/b1bf822），用户手机在修复期间登录过一次，本地 `slot:OAOpkm` 留下了较新的空档；等云端数据修好时，本地状态若已有 `onboarded=true` 或真实进度，LWW 规则下云端（savedAt=19:51，比本地旧）永远赢不回来。
**修复**：重造演示存档并上传（API 直写，commit 663ae98e，sha 17177a0e）：
- `savedAt = 上传时刻 + 10 分钟`：`store.save()` 是单调递增（max(now, prev+1)），所以略超前的云端时间戳能稳妥盖过所有旧本地状态；被采纳后本地时间戳从它继续单调增长，不会被回卷、不会互相覆盖。**以后重置演示数据都用这个手法（savedAt=当下+10min），不要用未来太远的时间**。
- 内容按用户要求升级：9 只宝可梦（队伍 5 只：皮卡丘 Lv.25/喷火龙 24/妙蛙花 23/水箭龟 22/卡比兽 20 + 仓库 4 只：快龙/拉普拉斯/耿鬼/风速狗）、碎片 520/树果 99/球 30/药水 20/双券各 20/心愿星 12、图鉴 30 只、7 天打卡历史（streak 7）、解锁 7 档全 claimed、`meta.createdAt='2026-11-01'`（避开新账号重判）。
- README 演示账号小节已同步新内容描述。
**验证**：VM 重放三场景（干净设备 / 先有马一一进度再切账号 / 槽位残留旧空档）全部正确采纳（lv25 shards520 onboarded=true）；端到端读回仓库解密一致。
**事实记录**：该账号孩子密码实测为 `123456`（README 口径）；家长密码 `jpw664458` 当前**解不开 parent 包裹**（生成脚本历史问题），家长身份登录此演示账号会报密码错误——用户表示密码问题自行处理，未动账号文件。若日后要修：用任一可用密码解开 vaultKey 后按 `auth.js changeParentPwd` 的 rewrap 逻辑重裹 parent 包裹并 PUT 账号文件即可，存档不受影响。

## 16. 2026-11-15 图片瘦身 + 后台预加载 + 演示账号无限体验（v85）

### 16.1 图片全部转 WebP（体积 -95%）
| 位置 | 数量 | 原 PNG | 现在 WebP | 说明 |
|---|---|---|---|---|
| `assets/catch/scenes/` | 7 | ~36MB | ~1.4MB | 捕捉场景背景，原始分辨率不缩 |
| `assets/catch/hides/` | 21 | ~18MB | ~1.1MB | 躲藏点，**保留 alpha 透明** |
| `assets/pic/` | 9 | ~32MB | ~1.6MB | 战斗擂台背景 |
| `assets/pokemon/` | 386 | ~50MB | ~7.4MB | 图鉴 / 状态栏 / 养成页立绘，**保留 alpha** |

- **原 PNG 全部保留在仓库里**（页面已不再引用），想回退只要把引用改回 `.png` 即可；
- 引用点共改 12 处：`js/data/catch-pools.js`（THEMES）、`js/screens/battle.js`（`bgFor()`）、`js/screens/dex.js`（3 处）、`js/events.js`、`js/onboarding.js`、`js/statusbar.js`、`js/screens/care.js`（`stillSrc`）、`js/screens/parent.js`（2 处）、`js/screens/ranch.js`（`stillSrc`）；
- **注意**：`assets/pokemon/animated/*.gif`（动图）没有转，仍是 GIF；`assets/npc-v6/` 战斗全身立绘也没转；
- 重新生成 WebP 的脚本本轮用完已删（用 sharp 批量转即可，需要时再写）。

### 16.2 后台静默预加载（`js/preload.js`，新增文件）
- 触发时机：`js/app.js` 的 `render()` 末尾调用 `APP.preload.maybeStart()`，**只有登录后 + 选好主力宝可梦（新手流程走完）+ 不在引导浮层**才启动；
- 延后 1.5 秒启动，用 `requestIdleCallback`（不支持时退化为 `setTimeout`）**一张一张**下载，绝不抢首屏；
- 预加载清单：7 张场景背景 + 21 张躲藏点 → 9 张战斗背景 → 最多 40 张自己已拥有的宝可梦立绘；
- 去重靠内存 `grabbed` Set + Service Worker 的 cache-first；页面再取同一张图零网络；
- `index.src.html` 里脚本顺序：`js/preload.js` 放在 `js/app.js` 前面（`build.js` 会自动内联进 `index.html`）。

### 16.3 演示账号 `OAOpkm` 无限体验
- 新增唯一判定入口：**`APP.auth.isDemo()`**（`js/auth.js`，内部比对 `session().accountId === 'OAOpkm'`）。
  **其他任何地方都调这个函数，不要自己写账号名比对**；
- 放开点（全部用 `APP.auth.isDemo()` 守卫，普通账号走原规则，一行没改）：
  | 位置 | 改动 |
  |---|---|
  | `js/unlock.js` `gate()` | 直接返回 true，全功能常开 |
  | `js/store.js` `canPlay()` | 返回 `{ok:true,left:0,demo:true}`，不写次数 |
  | `js/store.js` `spendTicket()` | `gate.demo` 时不扣球/券、不写存档 |
  | `js/screens/training.js` | `playedToday()` 恒 false；`canStart()` 跳过饱腹门槛；`tick()` 不再递减倒计时；`updateHud()` 显示「不限时」 |
  | `js/screens/memory.js` | `playedToday()` 恒 false（拼音/英语都能反复玩） |
  | `js/screens/catch.js` / `battle.js` | 显示「演示模式 · 不限次数」；不再拦「精灵球/战斗券不够」 |
  | `js/screens/care.js` | 提示语改成「演示模式，随时都能练」 |

- **道馆挑战没有放开**（用户没勾选），维持原来的每周次数与冷却。

### 16.4 本轮发布要点
- SW 版本 `pokedex-checkin-v84` → **v85**（清掉手机里旧 PNG 缓存，图片路径也变了必须升）；
- 重新 `node build.js` 生成 `index.html`；
- 临时脚本 `tools/_probe_img.js`、`tools/_probe_alpha.js`、`tools/_webp_*.js`、`tools/_patch_webp_refs.js` 已全部删除（`tools/_src/` 是既有素材目录，别删）。

## 17. 2026-11-15 立绘尺寸分级 + 全局兜底 + 选宠即下载（v87）

### 17.1 这轮解决的是「宝可梦图片加载不出来」
- **现象**：养成页舞台、状态栏头像、宝可梦中心卡片里的立绘全是空方块（露出容器背景色 `#F3E3BE`）。
- **排查结论**：线上 WebP 文件 200 且本机 Chrome 能正常渲染 → **用户设备解不出 WebP**（个别手机浏览器/定制 WebView 不支持 WebP）。
- **定案**：
  - **小图（128px）一律用 PNG**（`assets/pokemon/sm/NNN.png`，调色板压缩后约 9KB/张）。PNG 是所有浏览器都认的老格式，多几 KB 换来任何设备都能出图。
  - **大图（475px）继续用 WebP**（`assets/pokemon/NNN.webp`，约 23KB），只在养成页舞台、进化演出、图鉴详情头图用；加载失败自动退回同名 PNG（原图仍在仓库）。
  - 小图 386 张共 3.4MB，生成脚本 `tools/make_sm_art.js`（依赖 WorkBuddy 内置 sharp；tools/ 不进仓库，属本地工具）。

### 17.2 新增 `js/art.js`（所有立绘引用的唯一入口）
| API | 用途 |
|---|---|
| `APP.art.sm(dex)` | 128px 小图 PNG（状态栏 / 图鉴网格 / 宝可梦中心 / 选宠页 / 家长后台 / 乐园小图） |
| `APP.art.lg(dex)` | 475px 大图 WebP（养成页舞台 / 进化演出） |
| `APP.art.warm(dex, withLarge, withGif)` | 预热某只宝可梦的素材到浏览器缓存 |
| `APP.art.warmMain(dex)` | 小图 + 大图 + 养成页动图，一次备齐（用于主力） |
| `APP.art.imgTag(dex, opts)` | 生成带兜底链的 `<img>` |

- **三级兜底**：`js/art.js` 在 document 上用 capture 阶段监听 `error`：
  1. 读 `data-fb`（`|` 分隔的候选地址列表），逐个试；
  2. 仍失败则把 `.webp` 换成同名 `.png`；
  3. 再失败打 `[art] 图片加载失败：` 日志。
- **以后加图片一律走 `APP.art`**，不要再手写 `assets/pokemon/xxx.webp` 字符串。

### 17.3 首支宝可梦「选时就加载」
- `js/onboarding.js` 的选宠卡片改用真实小图（`assets/pokemon/sm/NNN.png`），**选的那一下就在下载**，不再等后面那轮后台预加载；
- 点中某只 → 立刻 `APP.art.warm()`；点「下一步」确定 → `APP.art.warmMain()`（小图 + 大图 + 动图全备齐）；
- 内联小图 `js/data/starter-art.js` 降级为最后兜底（`data-fb`），只在网络完全不通时用。
- `js/preload.js` 队列顺序改为：**主力宝可梦 → 自己的立绘（小图先、大图后）→ 捕捉场景 → 战斗背景**。

### 17.4 顺带确认的根因（另一个窗口在 c100486 里修的）
- `build.js` 内联 CSS 后，`css/app.css` 里的 `url('../assets/…')` 会解析到站点根之外 → **全部 404**（森林地面、道具贴图、乐园背景全丢）。
- 修法：内联时把 `url('../assets/` 统一改写成 `url('assets/`。**改 CSS 图片路径时别忘了这条**。

### 17.5 发布要点
- SW `v86 → v87`；
- `node build.js` 重建（`index.html` 是产物，勿手改）；
- 生成小图：`node tools/make_sm_art.js`（幂等，可重复跑）。

## 18. 2026-11-16 图片独立持久缓存 + 捕捉形象加载兜底（v93）

### 18.1 「昨天加载过今天又重下」的根因
- SW 旧逻辑：代码和图片共用**一个带版本号**的 cache（`pokedex-checkin-vNN`），
  `activate` 里把除当前版本外的所有 cache 全删。
- 结果：2026-11-16 一天内连发 v87→v92 共 5 版，每发一版就把图片缓存删光，
  玩家每次打开都要重下 ~80MB 素材 → 「今天素材加载特别慢」。
- 定案：**代码与素材分池**。
  | 池 | 名称 | 内容 | 升级时 |
  |---|---|---|---|
  | 代码池 | `pokedex-checkin-v93`（带版本号） | HTML / JS / CSS / JSON | 换号清空 |
  | 素材池 | `pokedex-assets-static`（**不带版本号**） | 图片 / GIF / 音效 | **永久保留** |

- `activate` 里只删 `pokedex-checkin-` 开头且非当前的缓存，`pokedex-assets-static` 跳过。
- 顺带加了 `migrateAssets()`：删旧代码缓存前，把里面的图片/GIF/音效**搬进素材池**
  （纯缓存 API 内部复制，不走网络），让本次从 v92 升 v93 的玩家不用重下。
- **以后改素材要它失效，靠改文件名或 URL 加查询串，不要靠升 SW 版本号清缓存。**

### 18.2 「外出捕捉不出现宝可梦形象」
- 排查：本机 Chrome 跑真实点击流程，6 次捕捉的形象 img 全部正常显示
  （`<img src=assets/pokemon/animated/NNN.gif>`，natural 尺寸有效，opacity=1）。
  GIF 文件本身没问题。
- 用户在手机上看到「有 No.185 标签但没形象」= **图还在下载时标签先显示了**，
  加上素材缓存被反复清空 → 每次都要重下 → 大部分时间看到空舞台。
- 修复（`js/screens/catch.js` 的 `showWild()`）：
  - 设 `im.style.opacity='0'`，`onload` 才淡入（CSS 加了 `transition: opacity .18s`）；
    缓存命中时 load 在同步代码之后触发，不会永久隐藏；
  - `onerror` 自动退到静态 PNG（`APP.art.lgPng(no)`），尺寸换算完全一致，
    专治个别 WebView 解不出 GIF / 缓存坏档。
- `js/preload.js` 新增 `wildGifList()`：捕捉池 59 只出场 GIF（共约 1.4MB）
  纳入后台预加载，队列顺序=主力→自己的立绘→场景→**野外GIF**→战斗背景。

### 18.3 验证
- Playwright 跑 6 次完整捕捉：形象全部显示、无报错；
- 缓存分区实测：代码池 1 项、素材池 107 项，互不干扰；
- 以后发版只清代码池，素材池不动 → 打开速度稳定。

## 19. 2026-11-16 洞窟躲藏点 cave-2 换成矿石堆（v94）
- 用户提供的矿石堆图是 JPG 白底（1658x1115）。用 flood-fill 只把「与四边连通」的白像素抠透明
  （抠掉 42.7%），矿石内部白色高光保留，存成 `assets/catch/hides/cave-2-ore.webp`（158KB）+ 同名 PNG 兜底。
- **换新文件名而不是覆盖旧 cave-2.webp**：第 18 节起素材池 `pokedex-assets-static` 永不清空，
  覆盖同名文件的话老用户缓存里还是旧洞口图；换 URL 才能让他们拿到新图。
  **以后凡是替换已有图片，一律换新文件名（或 URL 加查询串），不要直接覆盖。**
- 改动点：
  - `js/data/catch-pools.js` cave 主题 hides 第 2 项 → `cave-2-ore.webp`；
  - `css/app.css` 的矩形柔化遮罩选择器从 `[src*="cave-2"]` 收窄为 `[src*="cave-2.webp"]`，
    新矿石图已抠透明，不再套遮罩（套了反而削掉矿石边缘）；
  - SW v93 → v94（代码变了要刷新，但素材池不动）。
- Playwright 验证：洞窟场景 3 个躲藏点正确出现矿石堆，`mask: none`，无报错，视觉正常。
- 抠图脚本本轮用完已删（`tools/_ore_cut.js`）。
