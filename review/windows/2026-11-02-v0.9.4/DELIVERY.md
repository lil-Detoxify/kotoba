# Windows 0.9.4 本地验收包（2026-11-02）

安装版与便携版已生成，尚未上传或发布。Windows 桌面版本与内嵌 Web 均为 **0.9.4**，同步已上线 Round58 的卡片、控件、窄屏布局与动效调整。Web 正式部署仍为 `53b7a908`；官网 Windows 下载仍为 0.9.3。

## 包与校验

| 文件 | 字节数 | SHA-256 |
| --- | ---: | --- |
| 安装版 `KotoBud-0.9.4-Windows-x64-Setup.exe` | 196,137,807 | `c22a70fb27b7551db3a0a9328f402b1eb2ce7b2b7ca6b698e73c6fc640859a31` |
| 便携版 `KotoBud-0.9.4-Windows-x64-Portable.exe` | 195,905,900 | `9e80e6a69e3c3cedcfe834190567121da5a6d9d7bbd2938f7394d5c67b29b45e` |

两份 EXE 位于本机交付目录的 `pack/`，不纳入 Git 源码；GitHub 保留本记录、构建脚本与校验清单。

SHA 清单见 [SHA256SUMS.txt](SHA256SUMS.txt)，完整包核验见 [package-verification.json](package-verification.json)。两个文件具有 MZ 头；ASAR 版本与主进程、协议和 preload 均与当前来源一致。

## 来源与范围

复用 `../kotobud-review/round58-2026-10-28/site-production` 的冻结生产资源，没有重新构建 Web，也没有引入测试站独有内容。`app.html` 与 `index.html` 同为冻结的应用入口；补入既有 512 个本地词典分片，未打入 Google 音频。

包内 Web 共 **1,358 文件 / 328,782,879 字节**，与 stage 逐项字节一致。主文件 `assets/main-C65jg20q.js`，SHA-256 `386736f737b228a8f8323bdd7b4d07a612e303a1421538ebb09615e87a4c12ac`。来源核验见 [stage-verification.json](stage-verification.json)。桌面身份 `app.kotobud.desktop` 与现有用户数据路径规则保持。

## 验证边界

直接启动包内 `pack/win-unpacked/KotoBud.exe`，使用本候选目录下独立 `.runtime/profile`。启动日志记录页面完成加载 **418 ms**，进程有响应，stderr 为空；测试进程已关闭，隔离目录与日志保留。见 [runtime-verification.json](runtime-verification.json)。

此次隐藏启动未取得可操作窗口，**未完成原生窗口的视觉核验**。没有运行安装器或便携封装程序，未验证覆盖安装、升级或真实账户流程，也未开展全仓回归。界面来源是此前已验收并正式发布的 Web 0.9.4。

## 同轮补核

补完 Web 0.9.4 发布时超时的主样式独立完整 GET：HTTP 200，69,252 字节，SHA-256 与正式候选一致。生产资源记录现为 **12/12**；其余 11 项沿用 2026-10-28 的核验。本次没有重新部署或变更 R2 对象。
