# 宝可梦训练师成长日记 —— AI 部署指南

> 本文件供 **AI 助手（WorkBuddy / 豆包 / 其他）** 阅读并执行部署。
> 目标：把本项目变成「纯静态站点」并发布到 **GitHub Pages**，让家人/孩子打开链接即可使用。
> 部署完成后，站点把账号与打卡记录以 AES-GCM 加密形式存进 GitHub 仓库；连接信息（owner/repo/branch/PAT）由最终用户在 App 内填写，源码里不含任何 token。

---

## 0. 部署操作员（AI）需要先向用户索要的信息

在执行前，**主动向用户询问并拿到以下 3 项**（不要自己编造）：

| 索要项 | 说明 | 示例 |
|---|---|---|
| **① GitHub PAT** | 用户在 GitHub 网页一次性生成的个人访问令牌，需含 `repo` 权限（classic token 勾 `repo` 全选即可；fine-grained 需 Contents:Read&Write + Pages:Read&Write + Administration）。**仅用于本次部署，部署后可随时在 GitHub 撤销。** | `ghp_xxxxxxxxxxxx` |
| **② 仓库名** | 新建的 GitHub 仓库名称（英文、短横线分隔）。 | `pokemon-diary` |
| **③ 公开/私有** | 是否让任何人都能打开链接。发给家人用 → 选 **public** 最省事；选 private 则 Pages 站点也仅仓库成员可见。 | `public` |

> 注意：**PAT 无法用 API 自动创建**，必须由用户在 GitHub 网页手动生成（约 2 分钟，一次性）。这是整条流程里唯一省不掉的人工步骤。
> 生成路径：GitHub → 右上角头像 → Settings → Developer settings → Personal access tokens → Tokens(classic) → Generate new token → 勾 `repo` → 复制保存。

---

## 1. 要发布的文件（白名单）

把**项目根目录**下的这些内容发布到仓库（其余忽略）：

```
index.html
manifest.json
.nojekyll        # 关键：防止 GitHub Pages 把 assets/ 里带下划线的文件当 Jekyll 处理而吞掉
css/
js/
assets/
README.md        # 部署规则 / 使用说明（给别人复制仓库用）
更新推送.bat      # 一键推送后续改动（纯 ASCII 内容，避免中文命令行乱码）
deploy-package/AI_DEPLOY_GUIDE.md  # 本文件，同样随仓库发布
```

**不要发布**（已在 `.gitignore` 中，发布操作员也应主动排除）：
- `server.js`（旧云端后端，**已删除**，纯静态站点不再需要）
- `data/` 运行时账号/存档/照片（用户隐私，存 GitHub 仓库由运行时 API 写入，不进源码）
- `config.js`、`tools/.deploy-auth.json`（含 token，绝不进仓库）
- `node_modules/`、`.tmp-*`、`.wbapp_*.genie`、`.workbuddy/`、`backups/`、`tests/`、`docs/`、`参考/`、`tools/`
- `deploy-package/` 里除 `AI_DEPLOY_GUIDE.md` 外的其它内容
- `一键部署.bat`、`启动预览.bat`、`启动预览.vbs`（本地预览脚本，非站点运行所需，可不发布）

> `.gitignore` 已配置好上述排除项，直接用 `git add -A` 即可只收白名单内容。

---

## 2. 部署步骤（AI 在本机/沙箱执行）

环境要求：有 `git` 且能访问 `github.com`（已验证可达）。

```bash
# 设变量（由用户提供的 PAT / 仓库名 / 可见性 填入）
PAT="<用户提供的 PAT>"
OWNER="<用户的 GitHub 用户名>"
REPO="<仓库名，如 pokemon-diary>"
VIS="public"   # 或 private

# ① 建仓库
curl -sS -X POST \
  -H "Authorization: Bearer $PAT" \
  -H "Accept: application/vnd.github+json" \
  https://api.github.com/user/repos \
  -d "{\"name\":\"$REPO\",\"private\":$([ "$VIS" = "private" ] && echo true || echo false),\"auto_init\":false}"

# ② 进入项目根目录，初始化并提交（排除 .gitignore 中的文件）
cd "<项目根目录>"
git init -q
git checkout -b main
git add -A
git -c user.name="deploy-bot" -c user.email="deploy@local" commit -q -m "deploy: pokemon diary static site"

# ③ 推送（用 PAT 作为密码）
git remote add origin "https://$OWNER:$PAT@github.com/$OWNER/$REPO.git"
git push -u origin main

# ④ 开启 GitHub Pages（main 分支根目录）
curl -sS -X POST \
  -H "Authorization: Bearer $PAT" \
  -H "Accept: application/vnd.github+json" \
  https://api.github.com/repos/$OWNER/$REPO/pages \
  -d '{"source":{"branch":"main","path":"/"}}'

# ⑤ 取站点地址（稍等约 30s 让 Pages 构建）
sleep 30
curl -sS -H "Authorization: Bearer $PAT" \
  https://api.github.com/repos/$OWNER/$REPO/pages | grep -o '"html_url":"[^"]*"'
```

执行完第 ⑤ 步会得到一个地址，形如 `https://<OWNER>.github.io/<REPO>/`。这就是发给家人的链接。

---

## 3. 部署后配置（运行时用）

重构已完成，站点**纯静态、无后端**。**不需要**把 token 写进 `config.js`。

账号 / 存档同步所需的 GitHub 连接信息（owner / repo / 分支 / PAT）由**最终用户在 App 内**填写：

- 打开站点 → **登录页顶部的「GitHub 同步设置」卡片**（未配置时自动置顶，这是首次使用的唯一入口）；
- 填入仓库所有者、仓库名、分支（默认 `main`）、访问令牌（需 `repo` 权限）；
- 点「**保存设置**」→ App **保存时自动验证连接**：成功提示「连接成功」并进入第二步（注册 / 登录），失败显示具体原因且保持展开；不需要单独点「测试连接」。
- 连接成功后卡片折叠为精简卡，仍保留「存档同步」按钮；**「我的数据」页对所有人（含小孩）只显示精简卡，不含 PAT**，完整设置只在**家长后台「设置」页**（家长密码可见）。

> 这台设备填一次即可；换设备（如家长手机）需再填一次。PAT 只存在本机浏览器，不会上传到任何地方。

---

## 4. 账号体系重构状态（已完成 ✅）

账号体系重构（P1–P3）**已完成**：`auth.js` / `sync.js` / `app.js` / `login.js` / `mine.js` / `parent.js` 已全部改为纯静态 + GitHub 仓库同步，旧后端 `server.js` 已删除。

- 强制登录：无会话即显示登录 / 注册页，不再有「本机模式」。登录与注册在**同一张卡的两个页签**（默认登录）。
- **三种登录名**：昵称、6 位短码、完整账号码（昵称-短码）都能登录；靠列 `accounts/` 目录 + 逐个验密码消歧，旧版账号无需数据迁移。注册成功后**直接进入应用**，不会要求二次登录。
- **首次顺序**：配置 GitHub（保存即验证）→ 注册 / 登录 → 云端首次拉取完成 → 才弹新手引导，防止未登录选择写脏本地存档。
- **本机旧记录**：不再弹「用哪份记录继续」二选一；旧记录只留独立槽，家长后台提供单向导入（仅当前账号全新时可用、导入前自动备份）。
- **客户端加密**：存档主密钥（vault key）随机生成，分别用小孩 / 家长密码经 PBKDF2-SHA256（10 万次）派生密钥包裹，存进 `accounts/{id}.json`；仓库里没有明文密码、没有哈希可撞库。
- 账号 id 用密码学安全随机数生成 6 位后缀 + 撞号重试；每个账号独占 `accounts/{id}.json` / `saves/{id}.json`，写入带 `sha`（乐观锁）。
- 存档 `saves/{id}.json` 只存 `{iv, ct}` 密文信封；本地 `localStorage` 仅作缓存与多账号槽位隔离。
- 改家长密码 / 重置小孩密码 = 用新密码重新包裹同一把主密钥，存档无需重新加密。
- 连接信息存本机 `localStorage`，绝不进源码 / 仓库。

因此本指南 §1 的白名单即完整站点，直接发布即可获得功能完整的站点。

> 已知限制（部署后应告知用户）：① 家长密码 + 账号码都丢失时数据无法恢复（加密密钥来自密码，无找回通道）；② v1 作业照片只存本机，不跨设备；③ 必须用 https 或 localhost 打开，Web Crypto 在 `file://` 下不可用。

---

## 4.1 存档唯一性（公开仓库场景）

仓库设为 public 时，靠这四层保证记录唯一、不串号、不被读取或覆盖：

1. **仓库隔离** — 每人 fork 自己的仓库 + 自己的 PAT，别人写不进你的仓库；
2. **随机账号码** — `crypto.getRandomValues` 生成 6 位 base36 后缀，注册时撞号重试；昵称 / 短码 / 完整账号码三种登录名靠密码消歧；
3. **一账号一文件 + sha 乐观锁** — 跨设备同一账号只有一份权威存档，并发写会冲突重试；
4. **AES-GCM 客户端加密** — 密文公开也读不出内容，别人也无法伪造记录。

---

## 4.2 后续修复 bug / 迭代功能怎么推送

部署完成后，用户改了本地文件想更新线上站点，有三条路（推荐前两条）：

1. **双击仓库根目录 `更新推送.bat`**：纯 ASCII 内容，自动 `git add -A` → `commit` → `git pull --rebase origin main` → `push origin main`。可带说明：`更新推送.bat "fix: 修复打卡计数"`。Pages 约 1 分钟后自动更新。
   > 中间的 `pull --rebase` 不能省：App 运行时会把加密存档写进同一个仓库，远端 `main` 常有额外的 `sync: saves/...` commit，不先同步会导致 push 被拒（non-fast-forward）。这些 commit 只动 `accounts/` `saves/`，与代码不冲突。
2. **让 AI 推**：用户把改动交给你，说「推送到 GitHub」，你用同一份 PAT 执行提交推送即可。
3. **手动 git**：
   ```bash
   git add -A
   git commit -m "fix: 说明"
   git push origin main
   ```

改完建议自测（本项目为原生 JS、无构建步骤）：

```bash
for f in js/*.js js/screens/*.js; do node --check "$f" || echo "FAIL $f"; done
python -m http.server 8800   # 本地预览，打开 http://localhost:8800
```

> 让 `origin` 的推送地址带凭据（首次部署时配置）即可免密推送；若 PAT 过期/撤销，重新生成 `repo` 权限令牌后更新凭据即可。

---

## 5. 常见问题

- **Pages 开启报 404 / 构建中**：首次构建需 30–60s，稍等再访问；确认仓库 main 分支已有内容。
- **PAT 报错 401**：token 权限不足或已过期，让用户重新生成带 `repo` 的 token。
- **私有仓库家人打不开**：私有仓库的 Pages 仅成员可见。发给家人请改用 **public** 仓库，或在仓库 Settings → Pages 里确认可见性。
- **推送被拒（remote already exists / 分支冲突）**：先 `git remote remove origin` 再 `git remote add`，或确保仓库为空仓库。

---

## 6. 给"发给豆包/其他 AI"用户的说明（人话版）

1. 把整个项目文件夹压缩成 zip；
2. 连同本文件 `AI_DEPLOY_GUIDE.md` 一起发给 AI，说一句："按里面的指南帮我部署到 GitHub Pages"；
3. AI 会找你要 **PAT、仓库名、公开还是私有** 这三样，照给即可；
4. 拿到链接后发给家人。
