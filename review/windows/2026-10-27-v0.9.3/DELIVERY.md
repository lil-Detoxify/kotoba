# KotoBud Windows 0.9.3 交付记录

## 包与基线

Web 与 Windows 版本均为 **0.9.3**。Web 冻结源为 `kotobud-review/round57-2026-10-27/site-release`；主文件 `assets/main-CPE7iE7W.js`，SHA-256 `22757b16c8c0a8af1c8d3a45e939586dc37d9784fa37b44d82f3de6d5f8a67e7`。

Windows x64 安装包为 195,479,540 B，SHA-256 `82fee2534a345468bc598707e01bc354634aae5e71a61dab1600fc7fa831ab12`；便携包为 195,247,574 B，SHA-256 `e89aa81a8f2f461f60c9b5d504ff520e1bca6d78a1d131fc23dbf8aaec4b11a5`。两包均有有效 MZ 文件头。安装版和便携版位于仓库 `release/`，版本校验清单为 `release/KotoBud-0.9.3-Windows-x64-verification.json`，SHA 清单为 `release/SHA256SUMS-0.9.3.txt`。

冻结 Web stage 和 unpacked package 各含 1,321 个文件、326,216,539 B，文件集合与内容逐字节一致；嵌入主文件 SHA-256 与冻结值一致。stage 补齐 512 个 legacy 词典分片，未包含 Google 音频库。`app.html` 与 `index.html` 都来自冻结源的 SPA `app.html`。

## ASAR 与实际启动核对

ASAR 中桌面版本为 `0.9.3`，入口 `main.cjs`；`main.cjs`、`protocol.cjs`、`preload.cjs` 与源码字节一致。应用身份 `app.kotobud.desktop`、ProductName `KotoBud` 和正式运行时的默认用户资料路径保持不变。

以独立临时 profile 启动 unpacked `KotoBud.exe`：桌面版本与设置页 Web 版本均显示 `0.9.3`；日本词条查询成功，三来源对照显示 Tomoshi、JMdict、维基词典。API 写入和评分操作均为 0，页面错误与 renderer crash 均为 0。截屏见 [windows-dictionary.png](windows-dictionary.png)；临时 profile 已清理。机器可读结果见 [electron-packaged.json](electron-packaged.json)、[package-verification.json](package-verification.json)、[stage-verification.json](stage-verification.json) 和 [SHA256SUMS.txt](SHA256SUMS.txt)。

## 正式上线与公网核验

Web 与 Windows 0.9.3 已正式上线；生产部署为 `ea975ec7`，测试站部署为 `164146d0`。生产页面的 6 项页面/应用资源与本地冻结文件逐字节匹配。隔离访客浏览器显示 Web 版本 `0.9.3`、两个新版下载链接正常，页面错误和账号写入均为 0。详见 [production-assets.json](../../../../kotobud-review/round57-2026-10-27/production-assets.json) 与 [browser-production.json](../../../../kotobud-review/round57-2026-10-27/browser-production.json)。

安装包、便携包和 207 B 的 `SHA256SUMS-0.9.3.txt` 均已上传；R2 对象大小和 MD5 与本地一致，记录见 [r2-upload.json](../../../../kotobud-review/round57-2026-10-27/r2-upload.json)。正式下载地址：[Windows 安装版](https://kotobud.com/downloads/KotoBud-0.9.3-Windows-x64-Setup.exe)、[Windows 便携版](https://kotobud.com/downloads/KotoBud-0.9.3-Windows-x64-Portable.exe)、[SHA256SUMS-0.9.3.txt](https://kotobud.com/downloads/SHA256SUMS-0.9.3.txt)。

公网有界 Range GET 对两份 EXE 均返回 `206`；各取前 65,536 B，与本地逐字节一致，MZ 文件头和附件名正确。校验清单与本地逐字节一致；[production-downloads-check.json](../../../../kotobud-review/round57-2026-10-27/production-downloads-check.json) 标记 `complete: true`。HEAD 核验也已完成，两份 EXE 返回 `200`，长度和附件名匹配；校验清单返回 `200` 且字节匹配，见 [production-downloads-head.json](../../../../kotobud-review/round57-2026-10-27/production-downloads-head.json)。未全量重新下载 EXE，因此不声明公网 EXE 全量 SHA-256 已验证。

旧发布包和数据未移除。用户现有安装未改动；更新网站下载文件不会自动安装。未运行安装器或覆盖用户安装。实际启动核对使用 `pack/win-unpacked/KotoBud.exe` 和一次性隔离 profile；`package-verification.json` 保留打包时的本地核验记录。
