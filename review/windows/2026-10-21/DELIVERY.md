# Windows 0.9.0-beta.2 本地交付 · 2026-10-21

后续发布：用户于同日批准生产发布后，这两份包以原字节上传并经 Pages `cebf09a0` 开放官网下载；见 [生产发布记录](production/DELIVERY.md)。下文保留本地打包与验收时的边界。

按用户要求，在扩展官网更新与 Edge 更新提审完成之后开始 Windows 打包。生成 Windows x64 安装版与便携版，桌面包版本 **0.9.0-beta.2**，内嵌正式 Web UI **0.9.0**。

## 文件

- [安装版](packages/KotoBud-0.9.0-beta.2-Windows-x64-Setup.exe)
- [便携版](packages/KotoBud-0.9.0-beta.2-Windows-x64-Portable.exe)
- [SHA256SUMS.txt](SHA256SUMS.txt)
- [归档核对](package-verification.json)

| 文件 | 字节数 | SHA-256 |
| --- | ---: | --- |
| 安装版 | 183,734,913 | `6fdec6db0451e3d46309343d70f3a6185e60ecc4cac68724d914a75d62c951aa` |
| 便携版 | 183,502,935 | `a92d310fc171128ad2cdf7f74f3c28c663e11ef61b95e1444af172a458d9080b` |

两份 EXE 文件头与成包资源检查通过；888 个 Web 文件与本轮阶段目录逐字节一致，ASAR 版本和桌面源码文件也与本次构建源一致。

可先打开便携版验收。安装版沿用原 NSIS 选项、应用身份和用户数据路径；本轮没有执行安装器覆盖现有安装，也没有更改官网下载的 Windows 0.7.3。

## 内容与构建

沿用已批准正式应用 `main-HbacATkW.js`，SHA-256 为 `b175c060f3e0bda7c6b74ad46cd2a1bc5cae148c045056d700849b7df7906295`，与本轮已核对的线上 Web 相同。完整学习、每日计划、场景 / 活用、个人词库、备份、原句、输入题型、提示音、统计与多词典对照随该 Web UI 提供。本轮没有重构建 Web 或混入工作树其他未发布功能。

采用独立 `electron-builder.yml`，明确 `extends: null`，Web 来源只有本轮 `web/`；输出在本日期专用目录，保留旧候选。沿用 Electron 44.3.0、electron-builder 26.15.3，产物由本机已准备好的运行时生成；`--publish never`。

源 Web 阶段目录为 **888 文件 / 282,957,177 B**，含旧词典数值分片及日文维基词典分片，入口 `index.html` 与批准的 `app.html` 相同。静态归档检查详见 [stage-verification.json](stage-verification.json) 和 [package-verification.json](package-verification.json)；它们分别记录源文件一致性、成包资源与 ASAR 内容以及两份 EXE 的哈希。

## 实际程序核对

以实际新生成的 `packages/win-unpacked/KotoBud.exe` 启动，使用独立临时用户目录，未打开日常用户配置。正常本机权限下通过：

- 桌面包版本 **0.9.0-beta.2**、设置页 UI **0.9.0**。
- 本地旧词典 `/dictionary/487.json` 与维基词典 `/data/dictionaries/wiktionary-ja/2026-10-12/231.json` 均返回 200 并包含“日本”。
- 页面显示 Tomoshi、JMdict、维基词典三来源，截图已目视查看。
- 没有评分操作或 GPU 启动失败。程序已关闭，临时用户目录已删除并核对不存在。

见 [实际程序报告](electron-packaged.json)、[词典截图](windows-dictionary.png)。该核对验证了新包内实际可执行程序；安装覆盖升级及用户日常资料仍由用户验收。本轮没有开展大规模回归或新增发布门禁。

## 重现

在仓库根目录运行：

```powershell
node review/windows/2026-10-21/prepare-stage.cjs
$env:CSC_IDENTITY_AUTO_DISCOVERY = 'false'
npx electron-builder --config review/windows/2026-10-21/electron-builder.yml --win --x64 --publish never
node review/windows/2026-10-21/verify-package.cjs
node review/windows/electron-acceptance.mjs --version=0.9.0-beta.2 --web-root=review/windows/2026-10-21/web --report=review/windows/2026-10-21/electron-packaged.json --executable=review/windows/2026-10-21/packages/win-unpacked/KotoBud.exe
```

原生程序核对需正常桌面进程权限；不要用沙箱启动失败代替真实程序结果。
