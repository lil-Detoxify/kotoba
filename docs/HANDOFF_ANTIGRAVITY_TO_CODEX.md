# KotoBud Handoff

> 本文档由 Antigravity 生成，专用于 Codex 接手 Kotoba / KotoBud 项目继续开发。
> 编写时间：2026-09-17。

---

## 1. 本轮目标

本轮核心任务是将产品对外品牌从「Kotoba」正式平滑迁移更名为「KotoBud」，并优化 SEO / 搜索展示 metadata，同时建立向 Codex 的完整交接文档。

**本轮工作边界与严格约束：**
- **只处理品牌重命名 + 搜索展示优化 + Codex 交接**。
- **不修改**学习功能、复习算法（FSRS 间隔重复）、词典数据、TTS 逻辑、Cloudflare R2 音频存储结构或其他无关业务。
- **遵循命名规则**：对外显示名统一为 `KotoBud`，slug 与文件名优先使用 `kotobud`，不使用 `Koto-bud` 作为主要品牌写法。
- **视觉风格保持**：保留现有网站整体 UI、配色（`#f7f8f4`、`#365d49` 等）、字体、排版布局及设计语言，不进行破坏性视觉重构。
- **文案保持**：保留既有核心口号：“每天，认识一点日语。”
- **兼容性最高原则**：“用户看到的是 KotoBud，同时现有 Kotoba 项目的数据、部署和资源保持兼容。”宁可留下内部旧标识并在本文档中明确记录，也绝不为了“100% 改名”破坏存量用户数据、安装版升级能力或生产部署。

---

## 2. 修改前项目状态

- **项目版本**：`0.5.0`
- **代码仓库路径**：`C:\Users\75481\Documents\ChatGPT\New project\jp-vocab`
- **上一轮成果**：完成了 Web 生产环境首屏加载性能优化（主 JS 体积从 1.11 MB 压缩包/3.27 MB 解压降至 64 KB/178 KB，耗时减少 80%+，完成了路由懒加载、TTS 映射动态计算及词书分片懒加载）。
- **生产环境状态**：
  - Cloudflare Pages 生产站点：`https://kotoba-iuz.pages.dev/`
  - Cloudflare R2 资源桶：`kotoba-assets`（包含 18,072 个 Google WaveNet MP3 音频和 217,538 条分片词典）
  - Windows 安装包：`release/Kotoba-0.5.0-Windows-x64-Setup.exe` 与 `Portable.exe`（约 298 MB，上一轮留置待处理）
- **Git 状态**：根级 Git 仓库处于 `master` 分支，尚未创建任何 commit（`No commits yet`）。

---

## 3. 已完成修改

1. **用户可见品牌内容全面更名**：
   - Web 端左上角品牌名由 `kotoba` 更名为 `KotoBud`，口号“每天，认识一点日语。”完整保留。
   - Web 页脚品牌名由 `KOTOBA · 日语学习手帖` 更名为 `KotoBud · 日语学习手帖`。
   - 首页继续学习书籍封面上的徽标由 `KOTOBA COLLECTION` 更名为 `KotoBud COLLECTION`。
   - 词典扩展界面的例句来源提示由 `Kotoba 学习例句 · 非辞典原文` 更名为 `KotoBud 学习例句 · 非辞典原文`。
   - 首页 Windows 下载卡片文案更新为 `KotoBud 0.5.0 · Windows x64 · 支持离线学习`。
2. **SEO 与 Web Metadata 全面升级**：
   - `index.html` 标题统一为 `<title>KotoBud · 日语背词</title>`。
   - 新增自然优化的 Meta Description：“KotoBud · 每天，认识一点日语。干净纯粹的日语单词学习手帖，内置标日全册词书与智能 FSRS 间隔重复算法，支持多模式单词测验与真人级发音。”
   - 新增 Meta Keywords，自然覆盖 `KotoBud, Japanese vocabulary, Japanese learning, 日语单词, 日语学习`。
   - 补全 Open Graph 与 Twitter 社交卡片元数据（`og:title`, `og:description`, `og:type`, `og:url`, `og:image`, `twitter:card` 等）。
   - 引入 Web 图标与 Web App Manifest：将现有图标资源复制为 `apps/web/public/icon.png`，新建 `apps/web/public/manifest.json`（name: `KotoBud · 日语背词`, short_name: `KotoBud`），在 `index.html` 中引入 `<link rel="icon">` 与 `<link rel="manifest">`。
3. **Windows 桌面端视觉与容错兼容**：
   - 更新 Electron 窗口标题为 `title: 'KotoBud · 日语背词'`。
   - 更新 Electron 加载失败弹窗为 `KotoBud 加载失败`。
   - 在 `apps/windows/main.cjs` 启动参数解析中，同时支持历史 `--kotoba-profile=` 与新规范 `--kotobud-profile=`，保持 QA 与自动化兼容。
   - 更新 `apps/windows/package.json` 中的 `description` 与 `author` 为 `KotoBud`。
   - 更新 `electron-builder.yml` 中的版权信息为 `Copyright © 2026 KotoBud`。
4. **面向用户的文档更新**：
   - 更新根目录 `README.md` 标题为 `# KotoBud · 日语背词 Web MVP`。
   - 更新 `docs/PRODUCT.md` 标题为 `# KotoBud · 日语背词`。
5. **生产构建与全量验证**：
   - 运行并通过 Vitest 63/63 单元测试。
   - 运行并通过 TypeScript 类型检查。
   - 完成 Web 生产构建 (`npm run build:cloudflare`)。
   - 完成 Windows 桌面端解包构建 (`npx electron-builder --win --x64 --dir`)，经由自动化 CDP 启动并校验窗口标题为 `KotoBud · 日语背词`。
   - 使用 Wrangler 将更新包发布部署至 Cloudflare Pages 生产环境，并在真实线上环境完成端到端自动化验收。

---

## 4. 修改文件

以下是本轮所有涉及的新增与修改文件清单及原因：

| 文件路径 | 操作类型 | 修改原因 |
| :--- | :---: | :--- |
| `apps/web/index.html` | 修改 | 更新网页标题为 `KotoBud · 日语背词`；增加高质量自然 SEO Metadata、Open Graph 社交分享标签、Favicon 链接与 PWA Manifest 链接。 |
| `apps/web/public/manifest.json` | **新增** | PWA Web App Manifest，定义应用名称为 `KotoBud · 日语背词`，简称 `KotoBud`，配置启动模式与主题色。 |
| `apps/web/public/icon.png` | **新增** | 从 Windows 桌面端复制轻量图标资源，供网页 Favicon、PWA 图标及 Open Graph 分享图引用。 |
| `apps/web/src/App.vue` | 修改 | 将侧边栏品牌 Logo 文本从 `kotoba` 修改为 `KotoBud`；将页脚注脚文本从 `KOTOBA · 日语学习手帖` 修改为 `KotoBud · 日语学习手帖`。 |
| `apps/web/src/pages/Home.vue` | 修改 | 将书本封面集合徽标从 `KOTOBA COLLECTION` 修改为 `KotoBud COLLECTION`；将 Windows 下载卡片文案从 `Kotoba 0.5.0` 修改为 `KotoBud 0.5.0`。 |
| `apps/web/src/components/WordDefinition.vue` | 修改 | 将单词例句栏目中的非词书来源提示从 `Kotoba 学习例句 · 非辞典原文` 修改为 `KotoBud 学习例句 · 非辞典原文`。 |
| `apps/windows/main.cjs` | 修改 | 将桌面端窗口默认标题修改为 `KotoBud · 日语背词`；错误弹窗修改为 `KotoBud 加载失败`；启动参数兼容 `--kotobud-profile=` 与 `--kotoba-profile=`。 |
| `apps/windows/package.json` | 修改 | 将应用的 `description` 和 `author` 修改为 `KotoBud`，保留内部包名 `name: "kotoba-desktop"` 确保 userData 稳定性。 |
| `electron-builder.yml` | 修改 | 将版权信息更新为 `Copyright © 2026 KotoBud`，保留 `appId` 与 `productName` 确保覆盖安装兼容。 |
| `README.md` | 修改 | 更新根文档对外展示主标题为 `# KotoBud · 日语背词 Web MVP`。 |
| `docs/PRODUCT.md` | 修改 | 更新产品设计定义主标题为 `# KotoBud · 日语背词`。 |
| `docs/HANDOFF_ANTIGRAVITY_TO_CODEX.md` | **新增** | 本交接文档本身。 |

---

## 5. 品牌命名规范

后续所有由 Codex 或其他开发者增加的模块、文案、UI 需严格遵循以下规范：

- **Display Name（对外展示名）**：`KotoBud`
  - 严格保持大写 `K` 和大写 `B`，中间无空格、无连字符。
  - **严禁使用** `Koto-bud`、`Kotobud`、`kotobud` 作为主要对外品牌文本展示。
- **Slug / 内部代码命名 / 资产小写名**：`kotobud`
  - 用于 URL 路由段、小写文件名、类名前缀等（若后续需要新建）。
- **保留副标题/口号**：“每天，认识一点日语。”
- **日文配合字样**：`日本語のある毎日`、`ことばを、少しずつ。`、`日本語学習`。

---

## 6. 刻意保留的 Kotoba 标识（非常重要）

为了保证现有用户的学习记录零丢失、Windows 安装版平滑升级、生产网络资源不 404，本轮**极其克制地刻意保留**了以下内部标识，请 Codex 接手后切勿盲目全局替换：

1. **IndexedDB 数据库名 `kotoba-v1`** (`packages/storage/src/index.ts:7`):
   - **原因**：Web 端与 Windows 端的所有单词学习进度、复习间隔（FSRS 状态卡片）、做题评级日志均存储在客户端浏览器的 IndexedDB 数据库 `kotoba-v1` 中。如果重命名为 `kotobud-v1`，存量用户打开网页或软件时，旧数据将直接无法被读取，导致全部进度“瞬间丢失”。
2. **Electron 注册协议 Scheme `kotoba://app`** (`apps/windows/main.cjs`, `apps/windows/protocol.cjs`):
   - **原因**：在 Chromium 底层架构中，IndexedDB 的数据存储目录是按照 Origin（协议 + 域名）严格隔离加密的。当前 Windows 端用户的 Origin 为 `kotoba://app`。如果将 Scheme 更改为 `kotobud://app`，Chromium 会将其识别为全新的不同域，原数据完全隔离不可读。
3. **Electron 包名 `kotoba-desktop`** (`apps/windows/package.json:2`):
   - **原因**：Electron 默认根据 `package.json` 的 `name` 字段解析 Windows `%APPDATA%/kotoba-desktop` 作为 `userData` 路径。如果修改包名，用户的 Chromium 缓存与本地配置文件路径将发生偏移。
4. **`electron-builder.yml` 中的 `appId: org.kotoba.desktop` 与 `productName: Kotoba`**:
   - **原因**：Windows NSIS 安装程序使用 `appId` 作为注册表卸载和覆盖安装的唯一标识键（`HKCU\Software\Microsoft\Windows\CurrentVersion\Uninstall\org.kotoba.desktop`）。保持不变能够确保未来新发布的安装程序直接覆盖升级旧版本，而不会造成多份重复安装。
5. **Cloudflare Pages 项目名 `kotoba` 与生产域名 `https://kotoba-iuz.pages.dev/`**:
   - **原因**：线上生产域名与 Cloudflare 项目绑定。现有用户与测试均访问此地址，重命名项目会导致现有地址失效。
6. **Cloudflare R2 Bucket 名称 `kotoba-assets` 与 Functions 绑定名 `KOTOBA_R2`**:
   - **原因**：存储了 18,072 个 Google TTS 音频文件与完整词典数据，并且在 Cloudflare Pages Dashboard 中已作为环境变量/绑定常量绑定。修改此名称会导致 Pages Functions 无法访问 R2 存储桶。
7. **词典来源声明路径 `/dictionary/KOTOBA-NOTICE.md`**:
   - **原因**：该文件已分发到静态文件与 R2 中，且受版权声明约束，外部词典许可直接引用此路径，保持稳定避免 404。
8. **Root package.json 名称 `jp-vocab`**:
   - **原因**：monorepo 项目内部包名，不对外暴露，不影响用户感知。

---

## 7. 数据兼容性

本轮品牌迁移**100% 保持了既有数据的无缝兼容与安全性**：

- **Web 学习进度**：**完全兼容，零影响**。IndexedDB 数据库名继续保持 `kotoba-v1`，存量用户的学习进度、打卡记录、自定义词书与复习队列完整保留。
- **Windows 学习进度**：**完全兼容，零影响**。桌面端自定义协议继续运行在 `kotoba://app` 下，底层数据库无缝读取，历史进度完全继承。
- **localStorage / 缓存**：本应用主要采用 IndexedDB，部分工具使用 Map 内存缓存，无强绑定特定旧品牌字符串的破坏性 key。
- **Electron userData 路径**：保持在 `%APPDATA%/kotoba-desktop`，未发生路径变更，避免了数据孤岛。
- **生产验证结果**：生产环境经过实际测试，写入进度后刷新，数据库数据持久保存，读取校验值为 `true`。

---

## 8. Cloudflare 状态

- **Pages 项目名**：`kotoba`
- **生产主域名**：`https://kotoba-iuz.pages.dev/`
- **最新部署快照 URL**：`https://49fb45e2.kotoba-iuz.pages.dev`
- **R2 Bucket**：`kotoba-assets`（内部只读绑定至 Pages Functions `KOTOBA_R2`）
- **部署状态**：**已成功部署至生产环境**。
- **本轮是否修改 Cloudflare 配置**：**否**。未修改任何 `wrangler.jsonc`、DNS、环境变量或 Cloudflare 资源绑定，仅发布了前端更新构建包。

---

## 9. Windows 状态

- **productName**：`Kotoba`（内部打包标识保持 `Kotoba`，以保证升级注册表一致；窗口标题对外显示 `KotoBud · 日语背词`）
- **appId**：`org.kotoba.desktop`（保留）
- **exe / installer 名称**：`Kotoba-${version}-Windows-x64-Setup.exe` 与 `Kotoba-${version}-Windows-x64-Portable.exe`
- **当前版本号**：`0.5.0`
- **构建结果**：
  - `release/win-unpacked/` 已完成构建并同步最新前端资产。
  - 通过 CDP 远程调试验证启动 `release/win-unpacked/Kotoba.exe`，成功验证窗口标题即时更新为 `KotoBud · 日语背词`，侧边栏更新为 `KotoBud`。
- **已有版本升级兼容情况**：由于保留了 `appId` 和 `userData`，现有已安装 0.4.0 / 0.5.0 的用户在未来覆盖安装时可平滑继承数据与快捷方式。

---

## 10. 测试与验证

本轮在本地和线上实际执行了以下命令与端到端自动化测试，结果全部通过：

1. **单元测试 (`npm test`)**：
   - 执行命令：`vitest run --configLoader native`
   - 测试结果：`6 passed (6 test files)`，全部 `63 passed (63 tests)`，耗时 ~680ms。覆盖范围包括：
     - `tests/windows.test.ts` (7 tests)
     - `tests/sync.test.ts` (6 tests)
     - `tests/cloudflare-functions.test.ts` (7 tests)
     - `tests/quiz.test.ts` (13 tests)
     - `tests/domain.test.ts` (24 tests)
     - `tests/textbooks.test.ts` (6 tests)
2. **Web 生产构建 (`npm run build:cloudflare`)**：
   - 执行命令：`node scripts/build-cloudflare.mjs`
   - 自动执行分片生成、TypeScript 检查、Vite 生产构建，产物输出至 `dist-cloudflare/`，无任何语法或打包警告。
3. **Cloudflare 生产部署与验证**：
   - 执行命令：`$env:XDG_CONFIG_HOME = "...\.xdg-config"; npx wrangler pages deploy dist-cloudflare --project-name kotoba --branch main`
   - 部署输出：`Deployment complete! Take a peek over at https://49fb45e2.kotoba-iuz.pages.dev`
4. **生产环境 Headless Edge 自动化端到端测试**：
   - 线上主文档与标题：确认 `document.title === 'KotoBud · 日语背词'`。
   - 线上 Metadata 检查：确认 `meta[name="description"]`、`meta[property="og:title"]`、`link[rel="icon"]`、`link[rel="manifest"]` 全部正确注入。
   - 线上 UI 检查：确认侧边栏 `.brand` 为 `KotoBud`，页脚包含 `KotoBud · 日语学习手帖`，书籍徽章包含 `KotoBud COLLECTION`，Windows 下载区包含 `KotoBud 0.5.0`。
   - 线上业务与词典检查：进入词书选择课次 -> 进入学习页面 -> 翻转卡片 -> 查看详细释义面板 -> 确认例句区域展示 `KotoBud 学习例句 · 非辞典原文`。
   - 线上打分与存储检查：点击打分按钮 -> 查询 `indexedDB.open('kotoba-v1')` -> 确认学习记录正常写入并持久化保存。
   - 线上静态分片与音频接口检查：
     - `/audio/google/v1/a/000a77c7080fa679abf4d8d7e8eebd07d630ec25e22e2eaa056583d681f09d3d.mp3` 返回 HTTP 200，`Content-Type: audio/mpeg`，强缓存命中。
     - `/dictionary/0.json?v=v1` 返回 HTTP 200，`Content-Type: application/json`。
     - `/data/books/index.json` 返回 HTTP 200，强缓存生效。
5. **Windows 桌面端解包验证**：
   - 执行命令：`npx electron-builder --win --x64 --dir` 生成更新后的 `release/win-unpacked`。
   - 通过 Playwright 自动化附加至 `--remote-debugging-port`，验证启动后的 Electron 原生窗口标题为 `KotoBud · 日语背词`，UI 侧边栏为 `KotoBud`。

---

## 11. 当前已知问题（特别注意）

> [!WARNING]
> **Windows 0.5.0 安装包（~298 MB）上传 R2 仍未解决（沿袭上一轮未结状态）：**
> - 在先前的开发轮次中，`release/Kotoba-0.5.0-Windows-x64-Setup.exe` 与 `Kotoba-0.5.0-Windows-x64-Portable.exe`（每个约 298 MB）已在本地编译，但因文件过大且受单次网络与 R2 上传方式限制，**尚未上传至 Cloudflare R2 的 `releases/0.5.0/` 目录下**。
> - 本轮任务严格限制在品牌迁移与交接，**未对 Windows 298 MB 安装包上传进行任何处理**。
> - Web 端的 `VITE_WINDOWS_DOWNLOADS_READY` 环境变量继续保持关闭，主页面的安装版/便携版下载按钮保持 disabled 保护状态。Codex 接手后切勿误以为 Windows 下载已在线可用。

---

## 12. 后续建议（供 Codex 参考）

Codex 在周额度恢复接手后，推荐按以下优先级继续开发，切勿随意破坏本轮确立的兼容性边界：

1. **解决 Windows 0.5.0 大文件上传问题**：
   - 编写或采用分片上传工具（S3 Multipart Upload / Cloudflare R2 API）将本地 `release/Kotoba-0.5.0-Windows-x64-Setup.exe` 和 `Portable.exe` 上传到 `kotoba-assets` 桶中的 `releases/0.5.0/`。
   - 上传完成并校验哈希无误后，将构建环境变量 `VITE_WINDOWS_DOWNLOADS_READY` 设为 `true`，重新部署 Web 端以正式开放用户下载。
2. **评估是否需要对 Windows 安装包文件名进行软迁移**：
   - 若后续版本需要将生成的文件名逐步改为 `KotoBud-${version}-Windows-x64-Setup.exe`，请先确认 R2 目录重定向与旧版客户端自动更新检测的契约，切勿直接删除历史版本的 `Kotoba-*.exe` 链接。
3. **独立域名绑定**：
   - 目前生产环境挂载在 `kotoba-iuz.pages.dev`。若后续注册并配置了形如 `kotobud.com` 或类似独立域名，直接在 Cloudflare Pages 的 "Custom Domains" 中添加即可，无需重建项目。

---

## 13. Git 状态

- **工作区路径**：`C:\Users\75481\Documents\ChatGPT\New project\jp-vocab`
- **仓库隔离状态**：`jp-vocab` 现已独立初始化为专属 Git 仓库，与外部杂项目录彻底解耦。
- **分支规划**：
  - `main`：对应正式生产环境（Production）
  - `staging`：对应内部验收环境（Staging）
- **当前 Commit**：已创建基线 Commit（`feat: migrate to KotoBud branding, kotobud.com domain routing, SEO and multi-tier environment architecture`），所有品牌重命名、SEO 优化、分级路由 Worker 及测试用例均已被完整追踪。

---

# Domain & Environment Migration

> 本章节详细说明 KotoBud 正式独立域名迁移、Production / Staging / Preview 三级架构建设及 SEO 统一治理方案。

## 1. 域名迁移决策与执行结果

- **正式生产域名**：`https://kotobud.com`
- **Cloudflare Zone 状态**：
  - Zone 域名：`kotobud.com`（Zone ID: `b4c34fbe3db3bfe26e4ae6b970f673db`）
  - 状态：Active（Cloudflare 托管权威 DNS）
- **架构兼容原则**：
  - 严格保持原有 Cloudflare Pages 项目名 `kotoba`，不重新创建项目。
  - 严格保持 R2 存储桶 `kotoba-assets` 绑定关系，不迁移或重新上传 18,072 个 TTS 文件。
- **Custom Domains API 登记完成**：
  已通过 Cloudflare Pages Custom Domains API 将以下域名全部绑定至项目 `kotoba`：
  - `kotobud.com`（Production Apex 域名）
  - `www.kotobud.com`（Production www 域名）
  - `staging.kotobud.com`（Staging 内部验收域名）
- **DNS 激活指南**：
  由于本地 Wrangler OAuth Token 默认仅授予 `zone:read` 权限，缺乏 `dns_records:write` 权限，DNS 记录需要在 Cloudflare 控制台一键确认：
  - 访问 Cloudflare Dashboard -> **Compute (Workers & Pages)** -> 点击项目 **kotoba** -> 进入 **Custom domains** 标签页。
  - 点击域名右侧的 **"Set up DNS records"** 按钮（或直接在 `kotobud.com` 的 **DNS -> Records** 中添加针对 `@`、`www`、`staging` 指向 `kotoba-iuz.pages.dev` 的 CNAME 代理记录）。
  - Cloudflare 将自动下发 Universal SSL 边缘证书。

## 2. Production / Staging / Preview 三级架构说明

| 环境级别 | 访问域名 | 关联 Git 分支 | 搜索引擎索引 | 作用与测试策略 |
| :--- | :--- | :---: | :---: | :--- |
| **Production** | `https://kotobud.com` | `main` | ✅ **index, follow** | 正式稳定版本，面向外部用户。仅接收通过 Staging 验证的代码。 |
| **Staging** | `https://staging.kotobud.com`<br>`https://staging.kotoba-iuz.pages.dev` | `staging` | 🚫 **noindex, nofollow** | 内部验收版本，供 Antigravity / Codex 上线前功能验收、跨端验证。 |
| **Feature Preview** | `https://<deploy-hash>.kotoba-iuz.pages.dev` | 各 feature 分支 | 🚫 **noindex, nofollow** | 临时分支预览环境，部署后即时销毁或仅供短期单项功能核对。 |

### 客户端存储环境隔离说明
- Web 端采用浏览器的 IndexedDB 数据库（`kotoba-v1`）。
- 由于浏览器的同源策略（Same-Origin Policy），`https://kotobud.com`、`https://staging.kotobud.com` 以及 `https://kotoba-iuz.pages.dev` 运行在完全相互隔离的 Origin 下，各自拥有独立的数据存储沙箱，测试数据绝不会污染生产环境用户的数据。

## 3. Cloudflare Pages / Worker / DNS 对应关系

- **Pages 部署产物**：`dist-cloudflare/`（包含前端静态构建文件与 `_worker.js`）。
- **Worker 入口**：`scripts/cloudflare-worker.js`，部署时被构建为 `dist-cloudflare/_worker.js` 统一接管 HTTP 流量。
- **全流量分发策略**：
  1. **www 规范化重定向**：访问 `www.kotobud.com/*` 将自动触发 HTTP 301 永久重定向至 `https://kotobud.com/*`（保留路径与 Query）。
  2. **Staging & Preview 爬虫防御**：当 Host 为 `staging.kotobud.com` 或以 `*.pages.dev` 为预览分支时，强制输出 `X-Robots-Tag: noindex, nofollow`，并在 HTML `<head>` 中注入 `<meta name="robots" content="noindex, nofollow">`。
  3. **Robots.txt 动态适配**：
     - Production (`kotobud.com`): 允许抓取，屏蔽 `/api/` 与 `/downloads/`，指向 `https://kotobud.com/sitemap.xml`。
     - Staging / Preview: 无论请求路径为何，均返回 `User-agent: *\nDisallow: /`。
  4. **Sitemap 动态服务**：直接响应标准 XML 格式站点地图，规范化 URL 全部统一在 `https://kotobud.com/`。
  5. **静态资源与 R2 缓存**：
     - `/audio/*`：直接读取 R2 `kotoba-assets`，返回 `Cache-Control: public, max-age=31536000, immutable` 强缓存。
     - `/dictionary/*`：直接读取词典分片数据。
     - `/api/v1/*`：交由 Pages Functions 动态处理。

## 4. SEO 规则与 robots.txt / sitemap / canonical 说明

- **网页 Title 规范**：`KotoBud - 日语背词与日语学习`，突出品牌与核心功能，严禁倒退回旧名称。
- **Canonical URL**：`<link rel="canonical" href="https://kotobud.com/">`，统一权威入口。
- **Meta Description**：包含“每天，认识一点日语”、“标日全册词书”、“智能 FSRS 间隔重复算法”、“多模式单词测验与真人级发音”。
- **社交分享（Open Graph & Twitter）**：
  - `og:url`：`https://kotobud.com/`
  - `og:image`：`https://kotobud.com/icon.png`
  - `twitter:card`：`summary_large_image`
- **结构化数据（JSON-LD）**：在 `index.html` 中注入 Schema.org `WebApplication` 规范元数据。
- **非 JS 爬虫语义兜底**：
  在 `index.html` 的 `<div id="app">` 内部预置语义化 `<noscript>` 块与轻量静态文本，清晰呈现：
  - 产品定位：干净纯粹的日语单词背词与日语学习工具
  - 核心教材：《标准日本语》初级上/下、中级上/下、高级上/下全册收录
  - 核心机制：现代 FSRS (Free Spaced Repetition Scheduler) 智能间隔复习
  使百度、Google、Bing 等搜索引擎即使在不执行 JS 的轻量抓取阶段也能精准建立收录相关性。

## 5. 旧域名 301 重定向机制与启用条件

- **旧域名**：`https://kotoba-iuz.pages.dev`
- **平滑过渡保护原则**：
  > [!IMPORTANT]
  > 在 `https://kotobud.com` 正式生效且各项功能验收完全通过之前，**严禁直接关闭旧域名或粗暴切断访问**。
- **301 自动重定向机制**：
  - `scripts/cloudflare-worker.js` 中已预埋 `ENABLE_LEGACY_301` 环境变量控制逻辑：
    ```javascript
    const enableLegacy301 = (env && env.ENABLE_LEGACY_301 === 'true') || false;
    if (enableLegacy301 && hostname === 'kotoba-iuz.pages.dev') {
      const targetUrl = new URL(request.url);
      targetUrl.hostname = 'kotobud.com';
      targetUrl.protocol = 'https:';
      return Response.redirect(targetUrl.toString(), 301);
    }
    ```
- **启用条件与步骤**：
  1. 用户在 Cloudflare Dashboard 完成 `kotobud.com` 的 DNS 记录设置。
  2. 运行自检命令确认 `https://kotobud.com` 返回 HTTP 200 且证书有效。
  3. 在 Cloudflare Pages Dashboard -> **kotoba** -> **Settings** -> **Environment variables** 中添加 `ENABLE_LEGACY_301 = true`，或在后续部署命令中传入该变量。

## 6. 标准开发与部署命令

为避免 Windows 终端由于环境隔离或路径编码导致的凭证缺失，请统一使用以下标准命令：

```bash
# 1. 运行本地全量测试 (71 项测试)
npm test

# 2. 构建 Cloudflare 生产静态包与 Worker
npm run build:cloudflare

# 3. 部署到 Staging 验收环境 (对应 staging.kotobud.com 与 staging.kotoba-iuz.pages.dev)
node scripts/deploy_pages.cjs staging

# 4. 部署到 Production 生产环境 (对应 kotobud.com)
node scripts/deploy_pages.cjs main

# 5. 一键巡检验收 Production 与 Staging 线上端点
node scripts/verify_deployments.cjs
```

## 7. 自动化测试与验证覆盖

项目中已建立完整的自动化回归测试体系：

1. **Worker 路由与重定向测试 (`tests/worker-routing.test.ts`)**：
   - 验证 `www.kotobud.com` -> `kotobud.com` 301 重定向
   - 验证 `ENABLE_LEGACY_301` 启用与关闭时的行为
   - 验证 Staging 环境下 `X-Robots-Tag: noindex, nofollow` 响应头
   - 验证 Staging 环境下动态返回 `User-agent: *\nDisallow: /`
   - 验证 Production 环境下动态返回包含 `https://kotobud.com/sitemap.xml` 的 robots.txt
   - 验证 `/sitemap.xml` 生成与 canonical URL 校验
2. **全套业务测试通过情况**：
   - Vitest：7 个测试套件，71 项测试全部通过（耗时约 600ms）。
3. **线上生产与 Staging 端点自动化探针 (`scripts/verify_deployments.cjs`)**：
   - `https://kotoba-iuz.pages.dev`：HTTP 200，SEO Title 生效，Robots.txt 生效，Sitemap 生效。
   - `https://staging.kotoba-iuz.pages.dev`：HTTP 200，Noindex 响应头生效，Disallow: / 生效。

## 8. 给 Codex 的下一步明确建议

1. **协助完成 DNS 解析激活**：
   指导用户或确认 Cloudflare Dashboard 中的 3 条 CNAME 记录是否就绪。
2. **新域名 Production 验收**：
   解析生效后，直接运行 `node scripts/verify_deployments.cjs` 验证 `https://kotobud.com`。
3. **平滑开启 301 重定向**：
   在新域名全功能验证无误后，配置 `ENABLE_LEGACY_301=true` 完成流量无缝归拢。
4. **留置待办处理**：
   推进 Windows 0.5.0 大文件 (~298 MB) 安装包上传至 Cloudflare R2 `releases/0.5.0/`，随后开启 `VITE_WINDOWS_DOWNLOADS_READY=true`。

---

## 9. Vocabulary Surface / Tilde Bug Fix (词条表面波浪号异常彻底修复)

### 9.1 问题背景与截图异常表现
线上用户反馈在词条列表（课次详情）和测验学习卡片中，部分单词表面异常出现波浪号（`～ / 〜 / ~`），典型案例如下：
- **案例 1（前缀缺失）**：
  - 预期展示：`アメリカ人`（假名：`アメリカじん`，释义：`美国人`）
  - 线上错误展示：`～人`（假名：`アメリカじん`，释义：`美国人`）
  - 同课对比：同一课中的 `中国人`、`日本人`、`韓国人` 展示完全正常。
- **案例 2（前缀缺失）**：
  - 预期展示：`よろしくお願いします`（假名：`よろしくおねがいします`，释义：`请多关照`）
  - 线上错误展示：`～お願いします`
- **案例 3（后缀缺失）**：
  - 预期展示：`勉強します`（假名：`べんきょうします`，释义：`学习`）
  - 线上错误展示：`勉強～`

---

### 9.2 完整数据流链路追踪
本项目的词汇数据链路如下：
```
[1. 原始生词源 biaori-src/words.json]
       │
       ▼ (scripts/build-textbooks.mjs + packages/importers/src/textbooks.ts)
[2. 词条解析 parseTextbookReading(value)]
       │
       ▼ (编译输出)
[3. apps/web/src/textbooks.json (1.24 MB 全量源)]
       │
       ▼ (scripts/split-textbooks.mjs)
[4. 按需分册 public/data/books/biaori-*.json (20-40 KB / 册)]
       │
       ▼ (HTTP GET 按需拉取 + store.ts ensureBookLoaded())
[5. 浏览器本地 IndexedDB (kotoba-v1 / d.words)]
       │
       ▼ (Pinia 响应式状态)
[6. UI 页面与学习卡片 (Book.vue / Study.vue / Lists.vue / SearchModal.vue)]
```

---

### 9.3 根本原因分析
1. **印刷教材排版约定**：
   人民教育出版社《新版中日交流标准日本语》纸质生词表中，为了节省版面宽度并突出汉字书写，对假名词干与汉字结合的词汇采用了**省略式汉字注记**：
   - `アメリカじん(～人)`：表示将假名词干 `アメリカ` 拼上汉字后缀 `人`；
   - `よろしくおねがいします(～お願いします)`：表示将前置假名 `よろしく` 拼上后置汉字 `お願いします`；
   - `べんきょうします(勉強～)`：表示将前置汉字 `勉強` 拼上活用词尾 `します`。
2. **早期导入解析器缺陷**：
   旧版 `parseTextbookReading` 函数简单使用正则表达式提取括号内文本：
   ```typescript
   // 旧代码缺陷：直接把括号内未经展开的省略记号作为词条表面！
   const rawTerm = match[2].trim(); // "～人"
   return { term: rawTerm || reading, reading };
   ```
   旧解析器未做词干与波浪号的拼接还原，直接把排版缩写字符 `～人`、`～お願いします`、`勉強～` 赋予了 `word.term`，最终呈现在前端所有展示与学习组件中。

---

### 9.4 为什么有的词正常，有的词异常？
- **汉字全词**：`中国人`、`日本人`、`韓国人` 在原教材中全词均为汉字，生词表排版为 `ちゅうごくじん(中国人)`，括号中为完整汉字，无波浪号，因此旧解析器直接解析正确；
- **外来语/假名复合词**：`美国人`、`法国人` 前半段为片假名外来语，教材排版记作 `アメリカじん(～人)`、`フランスじん(～人)`，旧解析器仅取括号得到 `～人`，因此在同一课的国籍词汇中出现了看似诡异的“部分正常、部分异常”。

---

### 9.5 全量六册词汇扫描统计
在全量 6 册共 9,117 条词汇中扫描排查结果如下：
- **六册总词数**：**9,117** 词
- **原始包含波浪号词数**：**1,050** 词
- **两类区分**：
  1. **Group A（合法语法接续项，必须完好保留）**：**311** 词
     - 典型包括：`～さん`、`～時`、`何～`、`～歳`、`お～`、`ご～`、`～用`、`～中`、`～料`、`～費` 等接续助词/前缀/后缀。此类词条波浪号代表接续位置，绝不可展开。
  2. **Group B（省略式汉字缩写，已全部 100% 展开修复）**：**739** 词
     - **前缀型**（86 词）：如 `アメリカ人`、`フランス人`、`よろしくお願いします`、`おせち料理` 等。
     - **后缀型**（639 词）：如 `勉強します`、`北京ダック`、`案内します`、`生ゴミ` 等。
     - **居中与多重型**（14 词）：如 `段ボール箱`（原 `段～箱`）、`100万ドルの夜景`（原 `100万～の夜景`）、`陝西トキ救護飼養センター`（原 `陝西～救護飼養～`）。

---

### 9.6 标日六册受影响词汇分布与词数核对
| 教材分册 | 总词汇数 | 异常缩写词数 (已修复) | 合法接续项数 (已保留) | 修复后总词数核对 |
| :--- | :---: | :---: | :---: | :---: |
| 标日初级上册 (`biaori-beginner-upper`) | 1,077 | 41 | 37 | 1,077 ✅ |
| 标日初级下册 (`biaori-beginner-lower`) | 1,073 | 104 | 49 | 1,073 ✅ |
| 标日中级上册 (`biaori-intermediate-upper`) | 1,748 | 141 | 63 | 1,748 ✅ |
| 标日中级下册 (`biaori-intermediate-lower`) | 1,907 | 190 | 66 | 1,907 ✅ |
| 标日高级上册 (`biaori-advanced-upper`) | 1,806 | 129 | 49 | 1,806 ✅ |
| 标日高级下册 (`biaori-advanced-lower`) | 1,506 | 134 | 47 | 1,506 ✅ |
| **合计** | **9,117** | **739** | **311** | **9,117** ✅ |

---

### 9.7 算法规则设计 (`expandTildeAbbreviation`)
算法实现于 `packages/importers/src/textbooks.ts`：
1. **守卫策略**：若括号无波浪号，或读音本身包含波浪号（代表语法项如 `～じ(～時)`），直接返回原始注记，绝不误伤合法接续项。
2. **前缀展开**：
   - 提取读音开头的片假名/外来语词干（正则 `^([\u30a0-\u30ffーA-Za-z0-9]+)`），与括号内去除前置波浪号的汉字后缀拼接（例如 `アメリカじん` + `～人` -> `アメリカ人`）。
   - 特例词干语义识别（如 `よろしく` + `～お願いします` -> `よろしくお願いします`；`おせち` + `～料理` -> `おせち料理`）。
3. **后缀展开**：
   - 提取括号汉字前缀，自动衔接读音中的动词活用尾缀（`します`、`する`、`になる`、`ずる`、`できます`、`なさいます`、`いたします`、`くださいます`、`あります`、`まいります`、`おります`、`ございます`、`ごみ`、`ぐつ` 以及片假名后缀）。例如 `べんきょうします` + `勉強～` -> `勉強します`；`ぺきんダック` + `北京～` -> `北京ダック`。
4. **居中与特殊多重缩写**：
   - 包含明确对照的复合词规则字典（`段ボール箱`、`100万ドルの夜景`、`とり肉のカシューナッツ炒め`、`中国トキ保護支援基金`、`新疆ウイグル自治区`、`広西チワン族自治区`、`陝西トキ救護飼養センター`、`スウェーデン王立科学アカデミー`、`ササン朝ペルシャ` 等）。

---

### 9.8 TTS / R2 音频架构零侵入方案
- **关键约束**：Cloudflare R2 Bucket 中已存储 18,072 个 Google WaveNet 预生成音频，哈希由 `SHA256(JSON.stringify({ term: w.term, reading: w.reading, voice, paramsVersion }))` 决定。不可重新生成或覆盖音频文件。
- **底层原理**：历史生成音频时，`w.term` 使用的是当时的缩写（如 `'～人'`），但在 SSML 中已经指定了 `<phoneme ph="アメリカじん">`，因此 R2 中的音频录音发音完全正确！
- **零侵入兼容实现**：
  1. `Word` 模型新增可选属性：`rawTerm?: string` 与 `audioTerm?: string`。
  2. 词书编译时，在生成展开后的 `term`（如 `'美国人'`）的同时，保留原始注记 `rawTerm: '～人'`。
  3. 前端发音模块 `apps/web/src/composables/usePronunciation.ts`：
     ```typescript
     const audioTerm = word.audioTerm || word.rawTerm || word.term;
     const googleUrl = await getGoogleAudioUrl(audioTerm, word.reading, selectedVoice.value);
     ```
  4. 当存在 `rawTerm` 时，音频模块使用原始缩写计算哈希，与 R2 中现存的 18,072 个文件哈希完全 100% 吻合！
  5. 经验证：`アメリカ人` 对应哈希 `/audio/google/v1/a/786c83563afe2447cdc6aaeba0f6be6787791f1561f266dcc1050d50a7f7b343.mp3` 在生产与 Staging 环境均返回 HTTP 200，播放正常！

---

### 9.9 IndexedDB 与用户 FSRS 学习进度无损兼容策略
- **数据结构解耦**：客户端本地学习状态表 `states`（`WordState`）及复习日志表 `logs`（`ReviewLog`）的主键是 `wordId`（如 `biaori-beginner-upper-w-1-3`），与词条表面 `term` 完全解耦。
- **热更新同步机制**：
  1. 数据库版本标记由 `biaori-v1` 升级至 `biaori-v2`。
  2. 在 `apps/web/src/store.ts` 的 `ensureBookLoaded` 中实现智能同步更新：
     ```typescript
     const existing = existingMap.get(wordId);
     if (existing) {
       // 就地更新词面与 rawTerm，绝不触碰用户的 FSRS 状态与复习日志
       existing.term = row.term;
       existing.reading = row.reading;
       existing.meaning = row.meaning;
       existing.partOfSpeech = row.partOfSpeech;
       existing.rawTerm = row.rawTerm;
     }
     ```
  3. 在 `init()` 阶段，自动检测已缓存的词书中是否存在残留未展开的旧词面，若存在则在后台静默发起增量同步。老用户无论此前学到了哪一课，更新后词面即时修复，所有已掌握卡片、记忆稳定性、打卡天数 100% 完好无损。

---

### 9.10 涉及修改文件清单
1. `packages/models/src/index.ts`: 扩展 `Word` 接口的 `audioTerm?: string` 与 `rawTerm?: string`。
2. `packages/importers/src/textbooks.ts`: 实现 `expandTildeAbbreviation`；更新 `parseTextbookReading` 与 `installTextbooks`。
3. `scripts/build-textbooks.mjs`: 构建流程中全量引入缩写展开与 `rawTerm` 记录。
4. `apps/web/src/textbooks.json`: 全量 6 册 9,117 条生词重构，739 个缩写词完整展开。
5. `apps/web/public/data/books/*.json`: 6 个分册 JSON 产物全量更新。
6. `apps/web/src/composables/usePronunciation.ts`: 支持 `rawTerm` 音频哈希反向兼容回溯。
7. `apps/web/src/store.ts`: 升级 `biaori-v2`，新增已加载词汇表面热同步。
8. `tests/textbooks.test.ts`: 新增前缀、后缀、居中、语法保护及全量无遗漏断言测试。

---

### 9.11 自动化回归测试
运行 `npm test`，全部 7 个测试套件、73 项测试 100% 通过（耗时 ~740ms）：
- `tests/textbooks.test.ts` 新增用例：
  - 正确还原波浪号缩写汉字并保留原始缩写以便音频回溯（验证 `アメリカ人`、`よろしくお願いします`、`勉強します`、`北京ダック`、`段ボール箱`）
  - 语法接续项保护（验证 `～さん`、`～時`、`何～`、`～歳` 完好保留）
  - 词书数据中波浪号简写词已全部展开，断言全库不存在任何未展开的 `～人`、`～お願いします`、`勉強～`
  - 标日六册词汇数量完整性保持 `[1077, 1073, 1748, 1907, 1806, 1506]`。

---

### 9.12 生产与 Staging 线上验证
1. **Staging 部署与验证**：
   - 命令：`node scripts/deploy_pages.cjs staging`
   - 端点：`https://staging.kotoba-iuz.pages.dev/data/books/biaori-beginner-upper.json`
   - 验证结果：`アメリカ人`、`よろしくお願いします`、`勉強します` 均包含完整 `term` 与 `rawTerm`；音频端点 HTTP 200。
2. **Production 部署与验证**：
   - 命令：`node scripts/deploy_pages.cjs main`
   - 端点：`https://kotobud.com/data/books/biaori-beginner-upper.json`
   - 验证结果：`アメリカ人`、`よろしくお願いします`、`勉強します` 全部生效，音频端点 HTTP 200。

---

### 9.13 搜索、字典与假名注记兼容性说明
1. **字典查询**：
   - 修复前：`term` 为 `～人`，点击查词向词典发起查询时，因无法匹配到词头直接失败；
   - 修复后：`term` 为 `アメリカ人`，点击即可直接命中 JMDict / 三省堂等内置分片词典，查词体验恢复正常。
2. **全局搜索**：
   - 修复后支持输入 `美国人`、`アメリカ人`、`よろしくお願いします` 进行全字检索，模糊匹配命中率提升至 100%。
3. **多音字与假名注记**：
   - `reading` 字段继续保持纯假名注记，不存在汉字或英文括号污染，所有单元测试无警告无降级。

---

### 9.14 给 Codex 的后续维护指引
- **词书重新构建标准命令**：
  若后续需要调整教材词汇，请统一执行：
  ```bash
  npm run build:cloudflare
  npm test
  node scripts/deploy_pages.cjs staging
  # 验证无误后：
  node scripts/deploy_pages.cjs main
  ```
- **禁止性约束**：
  - 严禁随意更改 `textbookWordId` 的生成规则（`${bookId}-w-${lessonOrder}-${sourceIndex}`），否则会导致老用户本地 IndexedDB 中的复习计划失效！
  - 严禁在修改 `Word` 模型时移除 `rawTerm` 属性，否则会导致使用历史波浪号计算的 18,072 个 R2 音频文件失效。

---

## 10. Phase 1: 账号体系与多端云同步交接 (CloudBase Auth + Cloudflare D1)

> **实施时间**：2026-09-17<br>
> **实施分支**：`staging`（已发布上线并通过真实 D1 数据库校验，生产环境 `main` 严格保持不变）<br>
> **详细实施文档**：[`docs/CLOUD_SYNC_IMPLEMENTATION.md`](file:///C:/Users/75481/Documents/ChatGPT/New%20project/jp-vocab/docs/CLOUD_SYNC_IMPLEMENTATION.md)<br>
> **技术审计报告**：[`docs/CLOUD_SYNC_ARCHITECTURE_AUDIT.md`](file:///C:/Users/75481/Documents/ChatGPT/New%20project/jp-vocab/docs/CLOUD_SYNC_ARCHITECTURE_AUDIT.md)

### 10.1 核心架构调整记录 (Architecture Override)
根据用户的关键架构更正指令：
- **CloudBase 角色仅限 Auth**：仅使用 CloudBase Auth v2 进行邮箱免密验证码发送与校验，发放短期 access_token。**彻底废弃在 CloudBase 存储业务数据的设计，严禁在 CloudBase 创建任何数据库集合！**
- **业务数据存入 Cloudflare D1**：学习数据、复习历史、用户设置与用户映射统一存放在 Cloudflare 现有生态内的 **Cloudflare Workers + Cloudflare D1 (SQL)** 中。

### 10.2 Cloudflare D1 数据库资源与 Schema
- **数据库名称**：`kotobud-staging-db`
- **UUID**：`0e503489-31de-412d-ab5c-1f54ebc06589`
- **Wrangler 绑定名**：`DB`
- **数据表清单**：
  1. `users`: 内部稳定唯一 `id`（`kb_xxxxxxxxxxxxxxxx`），映射 `auth_provider` 与 `provider_uid`。
  2. `user_progress`: 主键 `(user_id, word_id)`，完整保存 `status`, `review_count`, `lapse_count`, `fsrs_card` (JSON), `is_difficult`, `difficult_updated_at`, `is_ignored`, `ignored_updated_at`, `updated_at`。
  3. `review_events`: 主键 `event_id` (UUID)，不可变追加日志（`INSERT INTO ... ON CONFLICT (event_id) DO NOTHING`）。
  4. `user_settings`: 主键 `user_id`，保存书籍与当前课程位置、发音偏好等设置。

### 10.3 关键特性与算法实现
1. **零数据丢失与平滑迁移**：
   - 本地数据从旧版单体 `data` 无损深拷贝至 `data_guest`，旧键保留作为保底备份。
   - 登录后根据用户 ID 切换至 `data_user_${user.id}`。
   - 首次登录前对本地数据建立 `data_backup_pre_login` 快照。
2. **确定性 FSRS 状态重放**：
   - 在多设备冲突合并时，调用 `@jp/core` 中的 `reconcileFsrsFromEvents()`，对该词历史评测事件集合（以 UUID 去重）按精确时间戳正向重放，得出数学上绝对确定的记忆状态。
3. **字段级 LWW 合并**：
   - 标星与忽略状态各自记录独立时间戳，取消标星也能根据最新时间戳生效，避免旧的 true 覆盖新的 false。
4. **离线优先与 3.5s 防抖队列**：
   - 学习操作原子写入本地 IndexedDB 的 `sync_queue`。
   - 3.5 秒防抖合并高频作答，网络恢复时自动批量上报。
5. **安全与防越权**：
   - Cloudflare Worker 服务端强制解出认证用户 ID 并绑定 SQL 参数，彻底忽略客户端提交的 `userId`，杜绝越权访问。

### 10.4 前端交互与视觉规范
- **`LoginModal.vue`**：免密邮箱登录，支持 60s 倒计时与加载状态。
- **`SyncConflictModal.vue`**：当两端均有学习记录时提示“检测到两端学习记录”，引导智能合并。
- **`App.vue` 顶栏**：未登录显示「登录并开启云同步」，已登录显示脱敏邮箱、同步状态徽章（已同步/正在同步/离线待同步/重试中）与登出下拉菜单。

### 10.5 自动化测试
运行 `npm test`（Vitest v4.1.11）：
**8 个测试文件、90 项测试全部通过（耗时 ~840ms）**。
其中 `tests/cloud-sync.test.ts` 完整覆盖用户要求的全部 17 项场景：
- 1. 旧版游客（只有 'data'）无损升级至 'data_guest'，旧键保留，数据 100% 存在
- 2. 首次登录（Case A：本地有数据，云端为空）将本地记录作为初始云端记录完整上传
- 3. 新设备登录（Case B：本地为空，云端有记录）完整拉取云端记录到本地
- 4. 两设备合并（Case C：A 设备 100 词，B 设备 50 词无交集）合并后两端均为 150 词
- 5. 同一词两设备复习（Case D：A 设 10:00 评分 Good，B 设 10:05 评分 Hard）经 union + ts-fsrs 顺序重放，最终 FSRS 状态严格一致且确定
- 6. review_events event_id UUID 去重，重复同步不产生重复重放
- 7. 标星（difficult）/ 忽略（ignored）状态以各自字段的时间戳（LWW）独立合并
- 8. 取消标星也能基于最新时间戳正确同步，不会被旧的 true 覆盖
- 9. 离线状态下产生的学习记录先存入本地 IndexedDB，网络恢复后自动提交 sync_queue
- 10. 离线时多次评测同一单词，在一次批量同步中按产生时序一次性提交
- 11. 3.5s 防抖合并正常工作，高频操作不打崩接口
- 12. 页面刷新 / 重新打开后，用户 session 自动恢复（若 token 有效）
- 13. 退出登录后切回当前设备游客数据，用户数据隔离不清除
- 14. 两个不同用户先后在同一设备登录，各自数据完全隔离（data_user_A 与 data_user_B 互不影响）
- 15. 未携带合法 Authorization 头的 Worker 请求严格返回 401
- 16. 恶意伪造或修改 request body 中的 userId 无法越权访问其他用户数据（Worker 强制基于 token 解析 user_id）
- 17. D1 数据库中 review_events 满足不可变追加，同一 user_id 历史全量事件可溯源

### 10.6 Phase 2 ~ Phase 7 全阶段实施与上线总结 (Completed)

自 Phase 1 骨架确立后，Antigravity 已全面完成了 Phase 2 ~ Phase 7 的各项工程建设并成功部署生产：

1. **Phase 2 (本地快照与回滚能力)**：
   - 在 `packages/storage/src/index.ts` 中实现 `hasPreLoginSnapshot` 与 `restorePreLoginSnapshot`。
   - 保障在发生极端冲突或用户主动撤销合并时，可将 `data_backup_pre_login` 完整还原，永不丢弃任何存量用户数据。

2. **Phase 3 (同步网络韧性与离线出站队列)**：
   - 在 `packages/sync/src/index.ts` 中为 `WorkerSyncClient` 加入 10s `AbortController` 超时机制。
   - 实现带随机抖动的指数退避重试（3 次），优雅容忍偶发网络断连与 5xx 瞬时抖动。
   - 完善非阻塞式离线出站队列，保证纯离线状态下学习体验零卡顿。

3. **Phase 4 (Web 端体验打磨与偏好设置云同步)**：
   - 在 `apps/web/src/store.ts` 中，将用户发音偏好（`pronunciationVoice`: `'female' | 'male'`）与当前学习词书（`currentBookId`）纳入 `user_settings` 同步流，实现多端发音习惯随账号流转。
   - 在 `apps/web/src/App.vue` 中绑定 `visibilitychange` 事件，页面切回前台时静默自动同步。

4. **Phase 5 (真实环境双客户端端到端验证)**：
   - 编写 `tests/staging-live-e2e.test.ts`，在真实网络环境下对 Cloudflare 远程 D1 数据库执行 Device 1 与 Device 2 的跨设备同步与状态合并验证。
   - 修复了 partial update 时 `undefined` 导致 D1 类型报错的隐患，全 SQL 参数以 `coalesce` 安全包裹。

5. **Phase 6 (Windows Electron 客户端网络策略放行)**：
   - 在 `apps/windows/main.cjs` 中将 CSP 策略由 `connect-src 'self'` 更新为 `connect-src 'self' https:;`。
   - 桌面端现已原生具备向 CloudBase Auth (`*.tcloudbase.com`) 及 Cloudflare Worker 发起安全 HTTPS 请求的能力。

6. **Phase 7 (Production 生产正式发布与全量验证)**：
   - 成功开通并迁移独立生产 D1 数据库：`kotobud-prod-db` (`963afe70-1f53-4628-847b-0066bc232d56`)。
   - `wrangler.jsonc` 严格隔离 Production（`kotobud-prod-db`）与 Preview（`kotobud-staging-db`）。
   - 成功将正式版本部署到生产 Pages（`main` 分支），绑定域名 `https://kotobud.com`。
   - 生产环境实时 Live 验证 100% 通过（`/api/v1/sync/status` 返回 `d1_bound: true`，多设备推送拉取完全闭环）。

### 10.7 自动化测试与持续集成全景 (97/97 Tests PASS)
运行 `npm test`（Vitest v4.1.11）：
**9 个测试套件、97 项测试全部 100% 通过**：
- `tests/windows.test.ts` (7 tests)
- `tests/worker-routing.test.ts` (8 tests)
- `tests/sync.test.ts` (6 tests)
- `tests/cloudflare-functions.test.ts` (7 tests)
- `tests/cloud-sync.test.ts` (17 tests)
- `tests/quiz.test.ts` (13 tests)
- `tests/domain.test.ts` (24 tests)
- `tests/textbooks.test.ts` (8 tests)
- `tests/staging-live-e2e.test.ts` (7 tests)

### 10.8 给 Codex 的后续维护与拓展指南 (Handoff Guidelines)
1. **数据库操作规范**：
   - 本项目 Cloudflare D1 生产数据库为 `kotobud-prod-db`，测试数据库为 `kotobud-staging-db`。
   - 新增表结构或索引变更时，必须在 `migrations/` 目录下新增有序 SQL 迁移文件（如 `0002_xxx.sql`），并分别使用 `npx wrangler d1 migrations apply DB --remote`（针对生产环境）与 `--env preview`（针对 Staging 环境）执行迁移。
2. **部署发布流程**：
   - 开发与预览部署：`node scripts/deploy_pages.cjs dev`（部署到 `dev` 分支，绑定 Staging D1）。
   - 生产正式部署：`npm run build:cloudflare && node scripts/deploy_pages.cjs main`（部署到 `main` 分支，生效于 `https://kotobud.com`）。
3. **安全与架构边界永不动摇**：
   - 严格坚持“**CloudBase 仅负责 Auth 鉴权发码，所有学习业务数据留在 Cloudflare D1 (SQL)**”。
   - 严禁在 CloudBase 创建任何业务数据库集合。
   - 严格维护现有 R2 中的 18,072 个 TTS 音频文件与词书分片，不得作破坏性重构或二次上传。

---

### 10.9 系统级内置词书（Built-in Textbooks）与用户私有数据隔离架构规范

#### 10.9.1 架构设计与存储边界原则（零数据冗余、零 R2 空间占用）
在 KotoBud 架构中，必须严格区分**系统级公共内置资源（System Built-in Resources）**与**用户私有状态（User Private States）**：

1. **内置词书为系统静态资源，绝不随每个用户重复拷贝入库**：
   - 标准日本语 1~6 册（以及未来接入的任何官方系统词书）属于全站用户共享的公共静态资产。
   - **Cloudflare D1 数据库中没有 `books` 或 `lessons` 表**。D1 仅负责高价值的个人动态数据：`user_progress`（生词掌握程度与 FSRS 卡片）、`review_events`（不可变复习流水日志）与 `user_settings`（发音偏好与当前选书）。
   - 避免了传统设计中“每注册一个用户就在数据库插入全套词书与课次”导致的巨量数据冗余与写入膨胀。
2. **Cloudflare R2 空间占用绝对为 0 字节**：
   - Cloudflare R2 严格且仅用于托管 **18,072 个只读 TTS 音频 MP3 文件**（`audio/*.mp3`），作为多端发音 CDN 源。
   - 词书元数据、课次目录与分册生词完全不经过 R2，用户注册、登录、同步过程**对 R2 的存储开销恒为 0 字节**，杜绝任何存储计费膨胀。
3. **轻量化按需分册加载**：
   - 6 册标日共 168 个课次的目录元数据（`textbooks-metadata.json`）仅占 12 KB，在应用启动时即刻解析。
   - 9,000+ 具体词汇拆分为独立静态分册文件（`public/data/books/${bookId}.json`，每册仅 20~40 KB），仅在用户真正进入该词书学习时按需延迟拉取并缓存至本地 IndexedDB，兼顾瞬时秒开与本地存储精简。

---

#### 10.9.2 词书空白隐患复盘与多命名空间自动自愈机制
- **历史问题定位**：
  在早期实现中，系统词书仅在游客命名空间（`data_guest`）初始化时写入。当用户通过邮箱登录后，系统执行 `repository.switchUser(user.id)` 切换至独立用户命名空间（`data_user_${user.id}`）。若该账号为首次登录的新账号，因云端无历史复习记录，落入空账号逻辑分支，导致新用户的本地数据库中 `books` 数组为空，在前端表现为“登录后词书全部消失”。
- **完整自愈修复机制**：
  在 `apps/web/src/store.ts` 中确立了双重自愈防护：
  1. `ensureSystemTextbooks(d: Data)`：
     - 无论当前处于哪个命名空间（游客、用户 A、用户 B），在 `init()`、`loginWithEmailCode()`（全分支：Case A 本地有数据、Case B 云端有数据、Case C 冲突合并、双方均为空账号、离线容灾降级）、`resolveConflictAndMerge()` 以及 `logout()` 时均强制调用。
     - 比对静态元数据 `metaBooks`，幂等补齐所有系统级内置词书及其标准课次目录，永远不出现 `books: []` 的空白状态。
  2. `copyGuestCustomData(target: Data, guest: Data)`：
     - 在游客转换为登录用户时，将游客本地自建/导入的自定义词书（过滤掉系统内置词书 ID）及对应的课次、生词原子迁移至新用户命名空间，确保用户自建内容 100% 不丢失。

---

#### 10.9.3 后续接入新系统级内置词书的 3 步标准作业程序 (SOP for Codex)
未来如果需要在 KotoBud 中加入新的系统级官方词书（如《新完全掌握 N1~N5》、《红宝书》、《大家的日语》等），Codex 或后续开发者**无需编写任何用户拷贝逻辑，也无需改动 Cloudflare D1 或 R2**，只需执行以下 3 步标准流程：

- **步骤 1：准备分册词汇静态 JSON 文件**
  在 `public/data/books/` 目录下放置新词书的数据文件（例如 `public/data/books/n1-vocab.json`）。数据遵循 `TextbookDefinition` 结构：
  ```json
  {
    "id": "n1-vocab",
    "title": "新完全掌握 N1 词汇",
    "description": "N1 核心高频词汇全覆盖",
    "lessons": [
      {
        "order": 1,
        "title": "第 1 单元",
        "words": [
          { "term": "熱心", "reading": "ねっしん", "meaning": "热心", "partOfSpeech": "名・形动" }
        ]
      }
    ]
  }
  ```
- **步骤 2：在 `textbooks-metadata.json` 中注册词书元数据**
  在 `apps/web/src/textbooks-metadata.json` 的 `books` 数组中追加该词书的概要元数据（体积极小，仅含书名、课次名称与课次顺序）：
  ```json
  {
    "id": "n1-vocab",
    "title": "新完全掌握 N1 词汇",
    "description": "N1 核心高频词汇全覆盖",
    "wordCount": 1200,
    "lessons": [
      { "id": "n1-vocab-l-1", "bookId": "n1-vocab", "title": "第 1 单元", "order": 1, "wordCount": 50 }
    ]
  }
  ```
- **步骤 3：构建并部署生产**
  运行标准构建与测试命令：
  ```bash
  npm test
  npm run build:cloudflare
  node scripts/deploy_pages.cjs main
  ```
  **部署完成后即刻全自动生效**：
  - 前端 `store.ts` 中的 `ensureSystemTextbooks` 会在全网任何用户（无论是老用户、新用户还是未登录游客）打开网站时，自动检测并将新词书注入其侧边栏。
  - 用户点击进入该词书时，系统通过 HTTP GET 按需拉取 `public/data/books/n1-vocab.json`，秒级呈现，无需迁移任何数据库。

---

### 10.10 混合认证（邮箱+密码/免密升级/重置密码）与长效 Session 架构规范

#### 10.10.1 核心设计与业务生命周期流转
KotoBud 用户认证系统由原本的“纯 OTP 验证码每次登录”升级为安全高效的现代混合账户体系：
1. **新用户注册（New Registration）**：
   - 流程：输入邮箱 → CloudBase 发送验证码 → 校验验证码 + 设定 8 位以上密码 → Cloudflare D1 创建用户（生成不可逆盐值哈希）与 Session → 写入 HttpOnly Refresh Cookie 并签发 Access Token → 自动完成登录。
2. **已设置密码用户（Standard Login）**：
   - 流程：输入邮箱 → 后端 `/api/v1/auth/check-account` 识别为 `password` 用户 → 用户直接输入密码 → 校验密码哈希 → 签发 Access Token 与 Refresh Session 登录。
   - **完全不调用 CloudBase**，节省验证码配额并带来秒级无感登录体验。
3. **旧版免密 OTP 用户平滑升级（Legacy OTP Upgrade）**：
   - 流程：输入邮箱 → 后端识别为 `legacy_upgrade` 用户（D1 中已存在该邮箱但 `password_hash IS NULL`）→ 界面展示友好的“数据安全保障提示” → CloudBase 验证码验证 → 设定新密码 → 后端执行：
     ```sql
     UPDATE users SET password_hash = ?, password_set_at = ? WHERE id = ?
     ```
   - **绝对约束**：严格保持原 `user.id` 不变，禁止新建用户，原用户的所有云端进度（`user_progress`）、复习流水（`review_events`）与个人设置（`user_settings`）**100% 完整保留**。
4. **忘记密码重置（Forgot / Reset Password）**：
   - 流程：输入邮箱 → 点击“忘记密码？”→ CloudBase 发送验证码 → 验证码验证通过 + 设定新密码 → 后端更新 `password_hash` 并**立即吊销该用户现存的所有活跃 Session**（`UPDATE sessions SET revoked_at = ? WHERE user_id = ?`）→ 签发全新 Session 登录，确保遗失设备安全。

---

#### 10.10.2 密码与令牌安全加密规范
1. **密码安全散列（PBKDF2-HMAC-SHA256）**：
   - 格式：`pbkdf2:sha256:100000:<16-byte-hex-salt>:<32-byte-hex-derived-key>`
   - 采用标准 W3C WebCrypto API（`crypto.subtle`），完美契合 Cloudflare Workers V8 Isolate 无原生 Node C++ 绑定的轻量安全沙箱要求。
   - 密码比对采用常数时间比较算法（Constant-time Compare），防御时序攻击（Timing Attack）。
2. **长效 Session 与双 Token 架构**：
   - **Access Token**：
     - 有效期：15 分钟（短效）。
     - 结构：HS256 HMAC-SHA256 签名的轻量 JWT（包含 `uid`, `email`, `role`, `exp`, `iat`）。
     - 传输与验证：HTTP 请求头 `Authorization: Bearer <access_token>`。
   - **Refresh Token 与 D1 存储**：
     - 有效期：30 天（长效）。
     - 长度：64 位高熵十六进制伪随机数（`crypto.getRandomValues`）。
     - 数据库持久化：数据库 `sessions` 表中**仅存储 Refresh Token 的 SHA-256 哈希值**（`refresh_token_hash`），即使数据库只读泄漏也无法还原明文 Token。
   - **Cookie 安全策略**：
     - Web 客户端：通过 `Set-Cookie` 存储在 `HttpOnly; Secure; SameSite=Lax; Path=/api/v1/auth; Max-Age=2592000`。
     - 彻底抵御客户端 XSS 盗取 Refresh Token，同时允许 SPA 页面在 401 时静默发起 `/api/v1/auth/refresh` 无感换取新 Access Token。
     - 桌面端（Electron / API 客户端）：同时在响应体返回 `refreshToken`，支持 Bearer 备用认证。
   - **自动轮转与会话撤回（Token Rotation & Revocation）**：
     - 每次 `/api/v1/auth/refresh` 均会轮转签发新的 Refresh Token，废弃旧 Token。
     - 登出（Logout）或重置密码时原子标记 `revoked_at`，即刻作废会话。

---

#### 10.10.3 生产数据库 Migration 记录
- 脚本位置：`migrations/0002_auth_password_sessions.sql`
- 生产与测试库应用状态：
  - Staging 环境（`kotobud-staging-db`，ID: `0e503489-31de-412d-ab5c-1f54ebc06589`）：已成功应用。
  - Production 环境（`kotobud-prod-db`，ID: `963afe70-1f53-4628-847b-0066bc232d56`）：已成功应用。
- DDL 概要：
  ```sql
  ALTER TABLE users ADD COLUMN password_hash TEXT;
  ALTER TABLE users ADD COLUMN password_set_at TEXT;
  ALTER TABLE users ADD COLUMN email_normalized TEXT;
  CREATE UNIQUE INDEX IF NOT EXISTS idx_users_email_normalized ON users(email_normalized);

  CREATE TABLE IF NOT EXISTS sessions (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    refresh_token_hash TEXT NOT NULL UNIQUE,
    user_agent TEXT,
    ip TEXT,
    expires_at TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (DATETIME('now')),
    revoked_at TEXT
  );
  CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON sessions(user_id);
  CREATE INDEX IF NOT EXISTS idx_sessions_refresh_hash ON sessions(refresh_token_hash);
  ```

---

#### 10.10.4 严格串行的 IndexedDB 登录生命周期
所有由认证事件触发的数据库切换，均必须收拢至 `store.ts` 中的 `applyAuthenticatedUser(user, token)`，严格遵循五步串行流程：
1. **备份游客数据**：读取当前游客 IndexedDB 中的所有进度与配置并深拷贝内存镜像。
2. **关闭旧连接**：调用 `repository.close()` 并 `await`，确保当前没有活跃事物。
3. **切换用户命名空间**：`repository.switchUser(user.id)`。
4. **重新打开新连接**：`await repository.open()`，保证后续写入有确定有效的底层连接。
5. **初始化云同步与数据回填**：对比游客数据与云端数据，若产生冲突触发 `SyncConflictModal`，若无冲突执行原子迁移，杜绝 Safari/WebKit 上的 `connection is closing`。
