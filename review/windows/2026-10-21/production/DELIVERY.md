# Windows 0.9.0-beta.2 生产下载发布 · 2026-10-21

用户明确要求将本轮 Windows 版推送生产；沿用此前已核对的 beta.2 安装版和便携版原字节，没有重新打包或改成另一个版本号。程序内 Web UI 为 0.9.0。

## 正式入口

- [官网下载](https://kotobud.com/download)
- [Windows x64 安装版](https://kotobud.com/downloads/KotoBud-0.9.0-beta.2-Windows-x64-Setup.exe)
- [Windows x64 便携版](https://kotobud.com/downloads/KotoBud-0.9.0-beta.2-Windows-x64-Portable.exe)
- [公开 SHA-256 清单](https://kotobud.com/downloads/SHA256SUMS-0.9.0-beta.2.txt)
- [官网更新日志](https://kotobud.com/changelog#windows)

| 文件 | 字节数 | SHA-256 |
| --- | ---: | --- |
| 安装版 | 183,734,913 | `6fdec6db0451e3d46309343d70f3a6185e60ecc4cac68724d914a75d62c951aa` |
| 便携版 | 183,502,935 | `a92d310fc171128ad2cdf7f74f3c28c663e11ef61b95e1444af172a458d9080b` |

## 部署与核对

R2 bucket `kotoba-assets` 新增 `releases/0.9.0-beta.2/` 下两个 EXE 及 221 字节的公开校验清单。远端对象列表与本地报告的文件名、大小一致，见 [远端列表](objects-kotobud.com.json)。校验清单采用下载后的文件名，不含本机 `packages/` 前缀。

测试站部署 `40f3850a`，在 [staging.kotobud.com](https://staging.kotobud.com/download) 核对新版下载页、两个 EXE 的 HEAD / 长度 / attachment 文件名、校验文本及更新日志通过。最初的分支预览 `48cc75f0` 按现有域名规则跳回正式站，未将该跳转误算为测试通过。有效测试站记录见 [测试站报告](preview-staging.kotobud.com.json)。

正式 Pages 部署 **`cebf09a0`**，与测试站使用同一份候选。官网入口和日志已更新；正式站完整下载与哈希核对结果见 [正式核对报告](verify-kotobud.com.json)。程序本身的启动、本地词典与成包检查沿用 [本地交付](../DELIVERY.md)，本轮没有重复回归测试或执行安装器。

## 改动范围

从上一轮已发布站点候选复制 412 个文件，仅修改下载页、首页 / 功能页 / 指南中的当前 Windows 版本提示、Windows 更新日志及 Worker 的三条下载版本正则，共 10 个文件；两种 HTML 路径副本保持一致。Worker 新增对 `-beta.2` 格式的匹配，现有 GET / HEAD、R2 key 和旧版路径行为保持。

- 当前 Worker SHA-256：`e12624afe1473e1c5c89cd27f4ba57887e57b4d95b73151d12af6a05a4a31097`
- Web 主资源 SHA-256：`b175c060f3e0bda7c6b74ad46cd2a1bc5cae148c045056d700849b7df7906295`，保持已批准版本。
- 官网扩展 beta.7 ZIP SHA-256：`c947a667fa1d5bd3fc5d2dfe7ffa1f3d1ebd5f2785712c3d9dca18f89c4ef1c8`，保持不变。
- 旧 0.7.3 安装包路径 HEAD 仍为 200、301,212,951 B，文件名不变，没有用新版字节覆盖旧包。

现有 Web 已编译 Settings 卡片仍显示并链接 0.7.3；源码的版本常量已更新为 beta.2，待下一次 Web 构建同步。这次使用官网下载页提供新版本，没有替换已批准的 Web 功能 bundle。生产候选与差异见 [site-verification.json](site-verification.json)。没有修改登录、D1 或 TTS。

## 重现

上传对象使用 `wrangler r2 object put --remote`，本轮两个大文件各单次顺序上传。Pages 使用 `wrangler pages deploy review/windows/2026-10-21/production/site-release --project-name kotoba --branch staging` 验证后，同一目录以 `--branch main` 发布。此次没有从整个工作树重新构建 Web。

`inspect-live.mjs` 的 `objects` 模式检查 R2 目录；`preview https://staging.kotobud.com` 检查小流量下载路由；`verify https://kotobud.com` 完整流式读取两个 EXE 并计算 SHA-256。
