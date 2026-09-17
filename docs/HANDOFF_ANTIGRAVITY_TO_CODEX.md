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
- **当前 Git 分支**：`master`（位于上级目录 `C:\Users\75481\Documents\ChatGPT\New project`）
- **最新 Commit**：`No commits yet`（仓库当前尚未创建首次 commit）
- **当前 `git status` 输出**：
  ```text
  On branch master
  No commits yet
  Untracked files:
    (use "git add <file>..." to include in what will be committed)
          "../DesktopOrganizer - v1.12发行版/"
          ./
          ../social-media-os/
  nothing added to commit but untracked files present (use "git add" to track)
  ```
- **工作区文件保护**：所有本轮优化、品牌修改、构建输出与交接文档均安全保留在本地磁盘上，随时可供 Codex 继续使用或执行首次 commit。
