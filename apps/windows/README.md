# KotoBud Windows

Windows 使用 Electron 承载 Web 的同一套学习界面。

## 当前候选：0.9.4（2026-11-02）

已生成安装版与便携版，同步 Web 0.9.4 的 UI 与动效更新。包内资源、版本和隔离启动日志已核对；尚未完成原生窗口视觉核验，未运行安装器，未上传或发布。官网 Windows 仍为 0.9.3。候选包与验证边界见[交付记录](../../review/windows/2026-11-02-v0.9.4/DELIVERY.md)。

## 历史发布状态：0.9.0-beta.2（Round43，2026-10-21）

安装版与便携版使用独立桌面版本 **0.9.0-beta.2**，内嵌 Web UI **0.9.0**。包内实际程序已在隔离临时 profile 下核对：版本显示、legacy / Wiki 本地 JSON、Tomoshi / JMdict / Wiki 三来源、未触发评分且无 GPU 启动失败；没有运行安装器覆盖现有安装。包与实际程序证据见[交付记录](../../review/windows/2026-10-21/DELIVERY.md)。

两个 EXE 的原字节已上传到 R2 `releases/0.9.0-beta.2/`，远端对象列表大小与本地报告相符：

| 文件 | 字节数 | SHA-256 |
| --- | ---: | --- |
| 安装版 | 183,734,913 | `6fdec6db0451e3d46309343d70f3a6185e60ecc4cac68724d914a75d62c951aa` |
| 便携版 | 183,502,935 | `a92d310fc171128ad2cdf7f74f3c28c663e11ef61b95e1444af172a458d9080b` |

官网已正式发布：Staging `40f3850a`，生产 Pages `cebf09a0`（[部署预览](https://cebf09a0.kotoba-iuz.pages.dev)）。[生产下载页](https://kotobud.com/download)提供[安装版](https://kotobud.com/downloads/KotoBud-0.9.0-beta.2-Windows-x64-Setup.exe)、[便携版](https://kotobud.com/downloads/KotoBud-0.9.0-beta.2-Windows-x64-Portable.exe)和[SHA-256 清单](https://kotobud.com/downloads/SHA256SUMS-0.9.0-beta.2.txt)。两份 EXE 的完整 GET 长度与 SHA-256 均匹配，HEAD 为 200 且附件名 / 长度正确；校验清单为 221 B，更新日志和下载入口已核对。生产核验见[交付记录](../../review/windows/2026-10-21/production/DELIVERY.md)与[公网报告](../../review/windows/2026-10-21/production/verify-kotobud.com.json)。

安装版为 183,734,913 B，SHA-256 `6fdec6db0451e3d46309343d70f3a6185e60ecc4cac68724d914a75d62c951aa`；便携版为 183,502,935 B，SHA-256 `a92d310fc171128ad2cdf7f74f3c28c663e11ef61b95e1444af172a458d9080b`。Windows 0.7.3 原包仍保留，旧固定 URL 继续提供原文件；其安装版 HEAD 为 200、301,212,951 B。

Web 主资源 SHA-256 保持 `b175c060f3e0bda7c6b74ad46cd2a1bc5cae148c045056d700849b7df7906295`；Worker 仅调整三条下载版本匹配规则以接受 prerelease，SHA-256 为 `e12624afe1473e1c5c89cd27f4ba57887e57b4d95b73151d12af6a05a4a31097`。源码 `Settings.vue` 中的 Windows 版本已更新供后续 Web 构建，但已编译公开 JS 仍显示 0.7.3 并链接原文件；本轮未重构建或替换该 JS。

Web / Windows 交接见[交接文档](../../docs/HANDOFF_WEB_WINDOWS.md)。

## 历史记录：0.9.0-beta.1 本地测试候选

从仓库根目录准备并构建测试候选：

```powershell
node review/windows/prepare-windows-web.mjs --source dist-cloudflare
npx electron-builder --config review/windows/electron-builder.yml --win
node review/windows/electron-acceptance.mjs
```

Web 资源仅复制到 `review/windows/web`，构建产物写入 `review/windows/packages`。准备脚本使用 `app.html` 生成本地 `index.html`，保留旧数值词典与 Wiktionary 词典数据，并排除 Cloudflare Worker、SEO 页面及 `audio/google`。不要将此候选包覆盖到 `release/`、上传到 R2 或替换正式下载。

验收脚本启动隐藏 Electron 窗口并使用 `review/windows` 下的一次性 userData，检查 Electron 安装包版本、Web 设置页版本，以及 Tomoshi/JMdict 与 Wiktionary 的实际本地读取。它只打开设置和查词页面，不会进入学习答题或更改复习记录。原有 `kotoba://app` Origin 与正式 userData 路径保持不变，因此已有 0.7.3 安装和学习数据不需要迁移。

六册内置词书来源见[教材来源](../../docs/reference/TEXTBOOK_SOURCES.md)。
