# KotoBud Windows 客户端版本号演进与发布规范 (SemVer Policy)

> 以下 `0.6.x` 示例仅用于说明 SemVer 规则。2026-09-30 根包、生产 Web、Windows 包版本与已交付的安装版/便携版均为 `0.7.3`；三份发布文件已完成 R2 与公网核验，人工安装和升级仍待验收。具体大小与哈希见 [Web / Windows 交接](../HANDOFF_WEB_WINDOWS.md)。

本文档明确定义 KotoBud Windows 端（Portable 便携版 与 Installer 安装版）的版本号判定与递增规则。以后所有关于 Windows 客户端的改动与更新，均严格按照改动规模自动判定版本号。

---

## 1. 版本号格式与判定准则 (MAJOR.MINOR.PATCH)

KotoBud Windows 端遵循语义化版本规范（Semantic Versioning 2.0.0）：

$$\text{Version} = \text{MAJOR} . \text{MINOR} . \text{PATCH}$$

### 1.1 小改动 / Bug 修复：增加 PATCH 位（例如：`0.6.1` $\to$ `0.6.2`）
适用于**向后兼容的小型改动、缺陷修复与日常优化**，包括但不限于：
1. **Bug 修复**：如解决特定场景下的白屏、空状态错误、网络报错、连接超时等。
2. **性能与启动优化**：如启动链路微调、本地缓存加载加速、非阻塞并发调整。
3. **UI / 文案与细节微调**：如按钮样式、图标显示优化、状态提示文案修改、菜单位置微调。
4. **系统配置与构建修补**：如 Windows 快捷方式参数调整、NSIS 安装向导小调整、依赖库安全补丁升级。
5. **网络与协议超时参数调整**：如超时时间从 10s 调整至 30s。

> **示例**：下一次若对 Windows 端修补了某个快捷键失灵或微调了快捷方式逻辑，版本号自动升级为 **`0.6.2`**。

---

### 1.2 大改动 / 功能性升级：增加 MINOR 位（例如：`0.6.x` $\to$ `0.7.0`）
适用于**引入全新功能模块、重大交互重构或系统级能力拓展**（向下兼容），包括但不限于：
1. **全新学习或背词模块**：如新增桌面全局迷你背词悬浮窗、锁屏背词或系统托盘常驻提醒。
2. **底层引擎或运行时大升级**：如 Electron 主版本升级、Tauri/Native 运行时迁移、全量内置离线语音包引擎。
3. **多端架构跨代升级**：如全新本地数据库引擎引入、大版本同步协议变更、全新单词导入/导出器支持。
4. **重大交互体验变革**：如深色模式全面支持、全局自定义按键映射系统、全新的统计可视化报表引擎。

> **示例**：当 Windows 端引入全新的托盘定时提醒与全局悬浮窗时，版本号自动跳升为 **`0.7.0`**（PATCH 位归零）。

---

### 1.3 里程碑正式版：增加 MAJOR 位（例如：`0.x.x` $\to$ `1.0.0`）
适用于**全平台功能全面对齐、生产稳定性经长期检验的正式发布里程碑**：
1. Web、Windows 桌面、微信小程序三端功能与数据同步 100% 闭环。
2. 架构长期稳定，无需破坏性迁移。

---

## 2. 自动化发版清单与操作流程

每次触发 Windows 版本发布时，按以下标准执行：

1. **版本号同步更新**：
   - `package.json`: `"version": "x.y.z"`
   - `apps/windows/package.json`: `"version": "x.y.z"`
2. **构建发布文件**：
   - 运行 `npm run build:windows` 生成：
     - `release/KotoBud-{version}-Windows-x64-Setup.exe`
     - `release/KotoBud-{version}-Windows-x64-Portable.exe`
3. **生成哈希校验和**：
   - 计算 SHA-256 并生成 `release/SHA256SUMS-{version}.txt`。
4. **上传至 Cloudflare R2**：
   - 运行 `node scripts/upload-windows-releases.mjs {version}` 自动推送二进制包至 `kotoba-assets/releases/{version}/`。
5. **更新官网下载与更新日志**：
   - 在 `scripts/generate-seo-pages.mjs` 中更新下载链接及 `/changelog` 记录。
   - 在 `CHANGELOG.md` 中记录更新点。
   - 显式设置 `VITE_WINDOWS_DOWNLOADS_READY`；新包完成 R2 和公网核验后才使用 `true`。
   - 按现有 Staging 验收与用户发布授权执行 `npm run build:cloudflare`，随后运行 `node scripts/prepare-web-only-production-worker.cjs`，最后以 `node scripts/deploy_pages.cjs main` 发布生产。生产部署脚本会校验兼容 Worker 的哈希，不能跳过准备步骤。
