# Windows 0.10.1-beta.2 本地验收候选

2026-11-04。复用 Round67 已验收测试站 `8f6a6d58` 的冻结 Web 0.10.1-beta.2，未取用正在独立开发的工作区 Web 正式构建。本轮未上传、替换公开下载或发布。

## 安装包

- [安装版](pack/KotoBud-0.10.1-beta.2-Windows-x64-Setup.exe)：204,917,110 B。
- [便携版](pack/KotoBud-0.10.1-beta.2-Windows-x64-Portable.exe)：204,685,167 B。
- [SHA-256 清单](SHA256SUMS.txt)及[逐文件核对](package-verification.json)。

五十音覆盖 104 项清音、浊音、半浊音、拗音，包含平假名 / 片假名、既有 WaveNet 录音、笔顺与逐笔查看。同步 11 个纠音词条的既有男女声录音，保留 48 课语法与新词完成后的本课语法入口。语法进度仍按账号保存在本机，未新增云同步。

## 验证

1,856 个包内 Web 文件与 stage 全部字节匹配；ASAR 版本、主进程、协议与预加载入口与源码一致。123 份既有 MP3 随资源打包，未生成语音，未打包整套远程单词音频库。

独立测试资料、隐藏窗口、阻断 HTTP(S)：设置版本、1280 / 1740 CSS 像素宽屏展示及三种侧边模式通过；下册目录和第 48 课可离线答题；完全退出并重启后恢复已提交答案与题目。五十音音频从 `kotoba://app/assets/` 实际解码播放，片假名、半浊音与逐笔查看通过，截图已目视。[交互记录](grammar-acceptance.json)、[截图](kana-1280.png)。

实际便携 EXE 在隔离 TEMP / 用户目录中成功启动并打开离线第 1 课，见[便携验收](portable-acceptance.json)。安装器未执行，真实安装 / 覆盖升级、真实账户跨端仍待人工验收。

## 重现

从仓库根目录执行 `node review/windows/2026-11-04-v0.10.1-beta.2/prepare-stage.cjs --frozen-web <绝对冻结资源目录> --main-sha256 7b0b078af9954ac58cde5098250db95e90893e4c3ed32fc470967ba00944e133`，再用本目录 `electron-builder.yml` 打包并运行 `verify-package.cjs`。冻结目录记录在 [stage-verification.json](stage-verification.json)。校验脚本拒绝覆盖内容不同的既有候选文件。
