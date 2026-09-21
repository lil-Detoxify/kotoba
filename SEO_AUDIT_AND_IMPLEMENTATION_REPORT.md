# Kotobud 搜索引擎收录与技术 SEO 完整修复报告
`SEO_AUDIT_AND_IMPLEMENTATION_REPORT.md`

- **项目名称**：Kotobud（原开发代码名 Kotoba）
- **正式生产域名**：`https://kotobud.com`
- **Canonical 域名**：`https://kotobud.com`
- **Cloudflare Pages 部署项目**：`kotoba` (`kotoba-iuz.pages.dev`)
- **审计与部署时间**：2026-09-21
- **Git 提交版本**：`a5051b4e` (`feat: improve technical SEO and search indexing`)

---

## 1. 原始问题审计与根因分析

此前，在百度、Bing 等搜索引擎中搜索 “Kotobud”、“Kotobud 日语”、“Kotobud 日语背词” 或站点域名几乎无法找到官方网站，其根本原因并非域名上线时间短，而是存在多个影响爬虫抓取与实体识别的技术硬伤：

### Critical 级别
1. **纯客户端单页应用（SPA）空壳，首屏无语义 HTML 内容**
   - **现象**：浏览器与爬虫初次访问 `https://kotobud.com/` 时，服务器返回的原始 HTML 中正文仅有 `<div id="app"><noscript>...</noscript></div>`。
   - **影响**：Baiduspider 等国内主流搜索引擎爬虫几乎不执行客户端 JavaScript；Bingbot 虽有渲染队列，但在首次抓取与低算力评估阶段严重依赖静态语义 HTML。因此，搜索引擎抓取到的实质是一个“空白网页”，无法提取产品名称、H1 标题、核心功能与教材信息。
2. **缺乏品牌实体关联（Entity Association）**
   - **现象**：搜索引擎无法建立 `Kotobud = 日语背词与复习工具` 的实体映射。搜索时被算法误判为拼写错误（如混淆为波兰采暖设备公司 Kotłobud、或误认为是日语单词 Kotoba / Kotobuki 的打错字）。

### High 级别
3. **全局 Soft 404（软 404）严重稀释站点信任权重**
   - **现象**：Cloudflare Pages 默认的 SPA 回退机制导致任意不存在的路径（例如 `/non-existent-xyz`）全部返回 HTTP `200 OK` 并渲染首页模板。
   - **影响**：搜索引擎爬虫将成百上千个无效 URL 识别为与首页内容完全相同的重复页面，触发搜索引擎的降权、去重和防爬虫陷阱过滤。
4. **缺失核心营销与公信力页面**
   - **现象**：缺少 `/features`、`/download`、`/about`、`/guide`、`/changelog` 等独立静态页面。用户与爬虫均无法获取版本下载说明、教材收录明细与算法原理解析。

### Medium 级别
5. **Sitemap 包含无价值与重复页面**
   - **现象**：旧版 `sitemap.xml` 包含了 `/books`、`/stats`、`/import`，这些属于客户端应用内部的个人统计与导入工具，不仅无公开 SEO 价值，且直接访问时均返回重复的首页空模板。
6. **未接入主动推送机制（IndexNow / 百度 API）**
   - **现象**：未配置 IndexNow 协议验证密钥与推送通道，完全依赖蜘蛛被动发现，新站收录周期被动拉长数周至数月。
7. **历史代码中 Kotoba 与 Kotobud 品牌名偶有混用**
   - **现象**：部分元数据、标题及协议描述未做统一规范，分散了品牌词的聚合权重。

### Low 级别
8. **结构化数据（JSON-LD）不完整**
   - **现象**：仅有简易的 `WebApplication` 标记，缺失操作系统支持（Windows 10/11）、软件版本号（v0.6.0）、下载链接与组织（Organization）实体标记。

---

## 2. 已完成修复与技术实施

针对上述问题，在**不破坏现有业务功能（CloudBase 认证、D1 云同步、IndexedDB 本地存储、学习记录、背词流程）**的前提下，完成了以下修复：

| 序号 | 问题分类 | 修复方案 | 修改/新增文件 | 预期作用 | 生产验证结果 |
| :--- | :--- | :--- | :--- | :--- | :--- |
| 1 | **SPA 空壳与 SEO 渲染** | 实施动静分离架构：<br>1. 公开营销页面（`/`、`/features`、`/download`、`/about`、`/guide`、`/changelog`）构建为纯静态语义 HTML，内置完整标题、H1、正文与教材列表；<br>2. 交互式背词学习应用独立保留在 `/app`（原 SPA 应用完好无损）；<br>3. 首页内联路由探测，若检测到旧版书签 Hash（如 `/#/study`）或 Electron 环境，无缝秒级转发至应用。 | - `scripts/generate-seo-pages.mjs`<br>- `apps/web/app.html`<br>- `scripts/build-cloudflare.mjs`<br>- `vite.config.ts` | 爬虫直接获取完整中文正文与 H1；首屏 LCP 降至 300ms 以内；老用户与书签不受任何影响。 | **已验证**：`curl` 获取服务器 HTML 直接包含 `<h1>Kotobud：日语背词与复习工具</h1>` 及全套标日词书介绍。 |
| 2 | **Soft 404 漏洞** | 在 Cloudflare Worker 边缘拦截非已知营销路径、非 App 路径且无静态扩展名的请求，返回自定义 `404.html` 并严格输出 HTTP `404 Not Found` 状态码。 | - `scripts/cloudflare-worker.js`<br>- `scripts/generate-seo-pages.mjs` (404.html) | 杜绝软 404 惩罚，保护整站索引信誉。 | **已验证**：访问 `/non-existent-xyz-page-12345` 正确返回 HTTP `404 Not Found`。 |
| 3 | **Robots.txt 优化** | 1. 显式配置 `User-agent: Baiduspider` 与 `User-agent: Bingbot`；<br>2. 允许抓取所有公开营销页；<br>3. 屏蔽 `/api/`、`/downloads/`（避免蜘蛛抓取大二进制文件）与 `/app/`（保护客户端私有逻辑）；<br>4. 明确指出正式 Sitemap 地址。 | - `apps/web/public/robots.txt`<br>- `scripts/cloudflare-worker.js` | 引导蜘蛛高效抓取高价值页面，避免资源浪费与死循环。 | **已验证**：`curl https://kotobud.com/robots.txt` 输出规范的允许与禁止指令。 |
| 4 | **Sitemap 重构** | 移出 `/books`、`/stats`、`/import` 等私有与重复路径；仅保留 6 个高价值公开规范页面，并附带准确的更新时间与优先级。 | - `apps/web/public/sitemap.xml`<br>- `scripts/cloudflare-worker.js` | 确保进入 Sitemap 的 100% 为可收录精品页面。 | **已验证**：`curl https://kotobud.com/sitemap.xml` 包含 6 个核心规范 URL。 |
| 5 | **核心营销页面补全** | 建立 5 个深度内容页面：<br>- `/features`（功能与 FSRS 记忆算法）<br>- `/download`（Windows 安装版与便携版下载、SHA256 校验）<br>- `/about`（产品初心、Kotoba 到 Kotobud 品牌演进、开源辞书协议致谢）<br>- `/guide`（标日六册学习路径、FSRS 打分指南）<br>- `/changelog`（v0.1.0 到 v0.6.0 发布历史） | - `scripts/generate-seo-pages.mjs` | 丰富站点信息架构，形成强内链闭环，夯实品牌词与长尾词语义。 | **已验证**：6 个页面在生产环境全部返回 HTTP `200 OK`。 |
| 6 | **IndexNow 接入** | 1. 生成唯一 IndexNow 校验密钥：`4b68e91c784e4b5bb8972cae6c7104f2`；<br>2. 部署密钥验证文件至 `/{key}.txt`；<br>3. 编写自动推送脚本 `scripts/submit-indexnow.mjs`；<br>4. 首次推送全部 6 个核心 URL 至 IndexNow API。 | - `apps/web/public/4b68e91c784e4b5bb8972cae6c7104f2.txt`<br>- `scripts/submit-indexnow.mjs`<br>- `scripts/cloudflare-worker.js` | 实时通知 Bing、Yandex 等搜索引擎更新索引，加速收录。 | **已验证**：IndexNow 接口返回 HTTP `202 Accepted`，验证文件访问正常。 |
| 7 | **结构化数据与社交标签** | 为全部页面注入规范的 JSON-LD：<br>- `@type: SoftwareApplication` (操作系统、版本、价格为0、下载链接)<br>- `@type: Organization` (机构信息与品牌 Logo)<br>- `@type: WebSite` (站点定义)<br>完善 Open Graph 与 Twitter Card。 | - `scripts/generate-seo-pages.mjs` | 在搜索结果中展现富文本摘要（Rich Snippets），统一品牌展示。 | **已验证**：源码中 JSON-LD 语法结构校验完全通过。 |
| 8 | **域名规范化 (301 Redirect)** | 统一将 `www.kotobud.com` 及非 Staging 的 `*.pages.dev`（包括 `kotoba-iuz.pages.dev`）301 永久重定向到 `https://kotobud.com`。 | - `scripts/cloudflare-worker.js` | 汇聚外链权重，消除分流与镜像惩罚。 | **已验证**：`curl -I https://www.kotobud.com/` 返回 301 重定向至正式域名。 |

---

## 3. URL 索引体系与规划

```
正式 Canonical 域名：https://kotobud.com
```

### 希望搜索引擎收录的公共页面 (Indexable URLs)
1. `https://kotobud.com/` (优先级 1.0，首页营销 Landing Page)
2. `https://kotobud.com/features` (优先级 0.9，核心功能与 FSRS 算法)
3. `https://kotobud.com/download` (优先级 0.9，Windows 客户端下载与说明)
4. `https://kotobud.com/guide` (优先级 0.8，标日学习路径与复习指南)
5. `https://kotobud.com/about` (优先级 0.7，品牌演进与开源致谢)
6. `https://kotobud.com/changelog` (优先级 0.6，版本更新历史)

### 禁止搜索引擎索引的私有/动态页面 (Noindex / Disallow)
- `/app` 及 `/app/*`（学习交互客户端，标有 `<meta name="robots" content="noindex, follow">`，robots.txt 中 `Disallow: /app/`）
- `/api/*`（Cloudflare Worker D1 同步与认证接口，robots.txt 中 `Disallow: /api/`）
- `/downloads/*`（客户端可执行二进制大文件，robots.txt 中 `Disallow: /downloads/`）
- `staging.kotobud.com` 与 `staging.kotoba-iuz.pages.dev`（测试环境，默认返回 `X-Robots-Tag: noindex, nofollow` 与全局 `Disallow: /`）

### 外部域名重定向规则
- `https://www.kotobud.com/*` $\xrightarrow{301}$ `https://kotobud.com/*`
- `https://kotoba-iuz.pages.dev/*` $\xrightarrow{301}$ `https://kotobud.com/*`
- `http://kotobud.com/*` $\xrightarrow{301}$ `https://kotobud.com/*`

---

## 4. 搜索引擎提交状态清单

### Microsoft Bing

| 检查项 | 当前状态 | 详细说明 |
| :--- | :--- | :--- |
| **IndexNow Key 生成与托管** | `DONE` | 密钥 `4b68e91c784e4b5bb8972cae6c7104f2.txt` 已部署并线上可访问。 |
| **IndexNow 主动推送** | `DONE` | 首次主动推送 6 个公开页面至 `api.indexnow.org`，API 返回 `202 Accepted`。 |
| **Sitemap 规范化** | `DONE` | 仅包含 6 个高质量公开 URL，robots.txt 正确指向。 |
| **Bingbot 访问模拟** | `DONE` | 模拟 `bingbot/2.0` UA 访问全部页面，HTTP 状态码为 200，内容完整。 |
| **Bing Webmaster Tools 验证** | `NEEDS USER ACTION` | 需由您登录 Bing 站长后台完成所有权确认（见第 5 节）。 |
| **Bing URL Inspection** | `NEEDS USER ACTION` | 需由您在后台手动对 `https://kotobud.com/` 发起初次抓取请求（见第 5 节）。 |
| **Bing Site Scan** | `NEEDS USER ACTION` | 需由您在后台手动启动全站 SEO 扫描。 |

### 百度搜索资源平台 (Baidu)

| 检查项 | 当前状态 | 详细说明 |
| :--- | :--- | :--- |
| **Baiduspider 抓取适配** | `DONE` | 彻底解决 SPA 无法抓取问题，服务端直接下发包含完整 H1、正文的纯静态 HTML。 |
| **Baiduspider 访问模拟** | `DONE` | 模拟 `Baiduspider/2.0` UA 访问，状态码 200，无 403 拦截，无验证码。 |
| **Sitemap 准备** | `DONE` | 符合百度规范的 XML 格式 Sitemap 已就绪。 |
| **API 提交脚本** | `DONE` | `scripts/submit-baidu.mjs` 准备就绪，获取 Token 后即可直接执行推送。 |
| **百度搜索资源平台添加站点** | `NEEDS USER ACTION` | 需百度账号登录并添加 `https://kotobud.com`（见第 5 节）。 |
| **百度站点所有权验证** | `NEEDS USER ACTION` | 推荐使用 CNAME 或 HTML 标签验证方式完成所有权确认。 |
| **获取准入 Token 并运行推送** | `NEEDS USER ACTION` | 获取 Token 后在终端执行推送脚本。 |

---

## 5. 需要您手动完成的操作步骤（非常具体）

由于站长平台涉及个人账号登录、手机短信验证码与官方权限授权，请按以下步骤操作：

### 任务 A：完成 Bing Webmaster Tools 配置（预计用时 3 分钟）

1. 打开浏览器，访问 **Bing Webmaster Tools** 官方后台：  
   `https://www.bing.com/webmasters`
2. 点击“登录”，使用您的微软账号登录。
3. 点击左上角的“添加站点 (Add a site)”：
   - **方式一（最快）**：如果您之前用 Google Search Console 验证过该域名，直接点击“从 Google Search Console 导入”，一键同步。
   - **方式二（手动添加）**：在右侧输入框输入 `https://kotobud.com`，点击添加。
     - **站点所有权验证已就绪**：
       - 生产环境已部署 `BingSiteAuth.xml` 验证文件（访问 `https://kotobud.com/BingSiteAuth.xml` 验证通过）。
       - 生产环境全站 HTML `<head>` 中已注入 `<meta name="msvalidate.01" content="B54034535F2BC5D891C5E32773794D82">` 双重保障。
       - 您只需在页面上直接点击 **“Verify”** 按钮即可通过验证！
4. 验证通过后，在左侧导航栏点击 **“站点地图 (Sitemaps)”**：
   - 在输入框填入：`https://kotobud.com/sitemap.xml`，点击提交。
5. 在左侧导航栏点击 **“URL 检查 (URL Inspection)”**：
   - 输入 `https://kotobud.com/`，按回车。
   - 检查结果出来后，点击右上角的 **“请求索引 (Request Indexing)”**。
6. 在左侧导航栏点击 **“站点扫描 (Site Scan)”**：
   - 点击“启动新扫描 (Start Scan)”，检查全站状态。

---

### 任务 B：完成百度搜索资源平台配置（预计用时 5 分钟）

1. 打开浏览器，访问 **百度搜索资源平台**：  
   `https://ziyuan.baidu.com/`
2. 使用百度账号登录。
3. 进入 **“用户中心” $\rightarrow$ “站点管理”**，点击“添加网站”。
4. 第一步输入：`https://kotobud.com`，站点属性选择对应分类（教育/学习）。
5. 第二步进行验证：
   - **推荐选择“CNAME 验证”或“文件验证”**：
     - 如果选文件验证，下载百度的 `baidu_verify_xxx.html` 发给我，我帮您提交部署到网站根目录；
     - 如果选 CNAME 验证，登录 Cloudflare 后台在 kotobud.com 的 DNS 中添加对应解析即可，通常 10 秒内即可完成。
6. 验证成功后，点击左侧 **“搜索服务” $\rightarrow$ “资源提交” $\rightarrow$ “普通收录”**：
   - 切换到 **“sitemap”** 标签页，填入 `https://kotobud.com/sitemap.xml` 并提交。
   - 切换到 **“API 提交”** 标签页，在下方接口地址中找到形如 `token=xxxxxxxx` 的密钥串。
7. 获取到 Token 后，在项目根目录下打开终端运行命令：
   ```powershell
   $env:BAIDU_TOKEN = "你的Token"
   node scripts/submit-baidu.mjs
   ```
   即可一键完成全量核心页面的主动推送。

---

## 6. 搜索测试关键词监控规划

后续建议分阶段观察和监控以下关键词的收录与排名变化：

### 1. 核心品牌词（短期最优先，目标 7–14 天内独占第一位）
- `Kotobud`
- `kotobud`
- `"Kotobud"`
- `Kotobud 日语`
- `Kotobud 日语背词`
- `Kotobud 背单词`
- `kotobud.com`

> **检验标准**：在百度/Bing 搜索上述关键词时，首页首位直接展现 `Kotobud – 日语背词与复习工具 | Web & Windows`，且带有正确的副标题与官网简介。

### 2. 产品与功能词（中期重点，目标 30–60 天建立展示）
- `标日词汇背词软件`
- `新标准日本语背词工具`
- `FSRS 日语背词`
- `标日初级生词本`
- `标准日本语课次背单词`
- `日语背词 Windows 桌面端`

### 3. 高竞争行业泛词（长期持续观察，结合内容沉淀）
- `日语背词软件`
- `日语背单词网站`
- `日语单词复习工具`
- `JLPT 背词`

---

## 7. 后续 30 / 60 / 90 天维护与增长方案

### 0–30 天：收录攻坚与品牌确权阶段
- **核心重点**：完成各大平台（Bing、Baidu、Google Search Console）验证，确保核心 6 个页面被完整抓取建库。
- **日常动作**：
  1. 每次发布新版本（如 v0.7.0）时，在 `scripts/generate-seo-pages.mjs` 中更新 Changelog 和版本号，重新执行 `node scripts/submit-indexnow.mjs`。
  2. 观察 Bing Webmaster Tools 的“搜索性能”与“索引覆盖率”，确保无“发现但未编入索引”的报错。
  3. 检查百度搜索资源平台的“抓取频次”曲线，确认 Baiduspider 抓取耗时稳定在 500ms 以内。

### 30–60 天：高质量内容沉淀与外部引用建立
- **核心重点**：消除搜索引擎算法对“新造词/生僻词”的置疑，在互联网公开索引库中建立“Kotobud 与日语学习”的共现关系。
- **推荐策略**：
  1. **开源与项目主页同步**：在项目的 GitHub / Gitee Readme、Release 页面中附带官网 `https://kotobud.com` 与产品介绍锚文本（如 `Kotobud 日语背词工具`）。
  2. **知识分享与学习笔记（自然外链）**：在知乎、V2EX、少数派、掘金等平台发表类似《为什么我用 FSRS 算法背标日单词》、《如何纯粹干净地学习新标准日本语》的工具实践分享，自然引用官网。
  3. **评估开设 `/blog` 或 `/learn` 专栏**：围绕“标日各课重点词汇辨析”、“日语动词三类分类记忆法”、“FSRS 与艾宾浩斯对比”等实用内容，每月发布 1–2 篇深度干货，吸引自发长尾搜索流量。

### 60–90 天：长尾关键词收割与跨平台扩展
- **核心重点**：通过特定教材课次与语法难点词汇吸纳长尾精准用户。
- **推荐策略**：
  1. 根据真实用户反馈，将高频搜索的“标日初级上第 1 课词汇”、“标日中级副词汇总”等静态词表整理成可索引的学习向导。
  2. 持续优化移动端触控与加载性能（保持 CWV Core Web Vitals 指标全绿）。
  3. 绝不采用低质量 AI 批量拼凑文章或黑帽垃圾外链，保持“纯粹、安静、高质”的产品调性。
