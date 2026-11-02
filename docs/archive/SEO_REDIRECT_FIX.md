# 官网锚点跳转修复（2026-09-26）

Google Search Console 2026-09-23 邮件报告的原因是“网页会自动重定向”（Page with redirect），不是“重定向错误”。尚未取得该报告的受影响网址清单，因此不能将本次修复认定为邮件原因的最终解决。

## 修复行为

官网共用页面脚本原先将所有非空 hash 重定向到 `/app/`，导致直接打开 `/guide#fsrs`、`/guide#sync`、`/download#portable`、`/about#brand` 等网址时离开官网内容页。

修复后普通锚点保留浏览器默认定位行为。只有首页 `/` 或 `/index.html` 上的已知旧应用路由（`#/`、`#/books`、`#/books/:id`、`#/import`、`#/study`、`#/difficult`、`#/ignored`、`#/stats`、`#/settings`）迁移到 `/app/`，并保留原 hash 中的参数。Electron 与 `kotoba:` 入口保持原有行为。

正常的 HTTP 到 HTTPS、www 到主域名、旧 pages.dev 到主域名、`.html` 到无扩展名网址的永久跳转继续保留；官网规范地址和站点地图不变。

## 验证与发布

- 页面生成脚本语法检查、差异空白检查通过。
- `tests/seo-page-navigation.test.ts` 与 `tests/worker-routing.test.ts` 共 45 项测试通过，覆盖官网锚点、旧学习书签、无关片段和桌面端入口。
- 发布采用已部署的 `dist-cloudflare` 产物副本，仅替换 11 份公开页面 HTML 中的锚点判断，其余 56 个文件保持字节一致，不重建工作区内其他功能改动。
- 发布前对照生产站，64 个可访问静态文件确认一致（HTML 忽略 Cloudflare 自动加入的统计脚本，robots.txt 与 sitemap.xml 比较有效内容）；既有 404 模板不纳入本次发布改动。
- 发布前生产部署：`4ec3f596-6796-4340-a6d5-dd8803cd1f3a`。
- 修复生产部署：`83572719-ad89-4dd2-894e-4c8084bbe58a`，Cloudflare 状态为 success，主域名已指向该部署。
- 线上六个规范官网页面均返回 200，无 HTTP 跳转或 noindex，去除 Cloudflare 自动统计脚本后内容与修复产物一致。学习应用内容保持一致，仍带 noindex；HTTP、www、旧 pages.dev 和 `.html` 的预期永久跳转正常。
- 下载线上 HTML 后实际执行其中的页面脚本，9 项行为检查通过：指南、下载、关于及首页普通锚点不跳转；旧首页学习书签继续迁移到应用并保留查询参数。

## Search Console 后续验收

在 kotobud.com 资源的“网页索引编制 → 网页会自动重定向”中导出示例网址，并分别检查跳转来源与最终目标。正常跳转来源无需取消跳转。重点确认 `/`、`/features`、`/download`、`/guide`、`/about`、`/changelog` 的规范版本返回 200、允许索引，并核对 Google 选择的规范网址。仅在确实修复误跳转后提交“验证修复”；索引结果须由 Search Console 后续抓取确认。
