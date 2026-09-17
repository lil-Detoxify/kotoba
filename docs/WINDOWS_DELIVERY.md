# Windows 0.5.0 交付

## 下载与运行

- release/Kotoba-0.5.0-Windows-x64-Setup.exe：安装版，按向导选择安装位置，创建桌面/开始菜单快捷方式。
- release/Kotoba-0.5.0-Windows-x64-Portable.exe：免安装版，双击解压到临时目录并运行。首次启动需要等待解压；学习数据不放在临时目录。
- Windows 10/11 x64；应用自带 Chromium，不需要 Node、Python、Vite 或 localhost 服务。
- 二进制未签名，Authenticode 检查为 NotSigned。没有声称拥有商业签名证书。

包内包含 Web 学习闭环、选择题复习、217538条词典、六册教材 9117 词，以及 9036 个词条各两种声音的 18072 个本地 MP3。辞典来源/许可证随静态资源打包。用户界面和业务代码共享；Windows壳仅负责资源协议与窗口。

## 六册教材状态

0.5.0 内置六册教材词书，共 9117 词：初级上 1077、初级下 1073、中级上 1748、中级下 1907、高级上 1806、高级下 1506。课次范围使用教材真实序号：初级下 25–48、中级下 17–32、高级下 13–24。词书页面按实际课次序号选择范围，不以册内数组长度截断。

教材来源、清洗规则和再分发边界见 `TEXTBOOK_SOURCES.md` 与 `六册教材来源核查.md`。已有 CSV/JSON 仍可通过词书导入页预览并导入。

## 数据与升级

桌面使用稳定自定义origin kotoba://app 与独立userData下的IndexedDB。关闭程序或升级同一appId不清除进度。卸载配置保留用户数据。浏览器localhost下的学习记录不会自动迁入桌面。本版没有全量学习记录迁移工具，不要把网页词书导入等同于学习状态迁移。

## 构建与测试

`npm run build:windows`：校验/准备Electron → TypeScript/Vite构建 → NSIS与portable。

首次准备Electron使用公开镜像下载，与npm安装包提供的官方SHA256校验后才解压；`scripts/prepare-electron.cjs`已记录逻辑。版本锁定于package-lock.json。

63 项核心/协议边界测试通过；TypeScript strict 与 Vite 生产构建通过。Windows 打包使用 Electron 44.3.0，生成安装版和便携版。管理员批准的隔离 profile 下，`release/win-unpacked/Kotoba.exe` 最终 EXE 验收已通过：词典、MP3 播放、评价保存、关闭重启持久化、renderer 隔离均已验证。Portable 自解压包装器未暴露测试脚本需要的本地 CDP 端口，未将该包装器标记为 CDP 验收通过；其解压内容与已验收的 `win-unpacked` 资源相同。

没有执行安装向导向本机正式安装；已生成安装器。未验证其他Windows电脑、ARM或32位系统。

## 最终产物复核（2026-09-17）

已重新构建并核对最终 0.5.0 EXE。SHA-256 见 `release/SHA256SUMS-0.5.0.txt`。Setup 为 298,114,735 bytes，Portable 为 297,895,426 bytes。历史 0.4.0 及更早安装版和便携版仍保留在 `release/`，不作为本版下载项。

本版内置六册教材词书（以应用内教材清单为准），词典与音频仍从本地
`kotoba://app` 资源读取；断网时不依赖网络资源。学习进度仍只写入当前
设备的 IndexedDB，账号登录和云同步接口仅保留契约，未创建账号、未上传
数据。安装版与免安装版均未签名。

0.5.0 新增发音偏好：默认女声 A，学习页可选女声 A/男声 C，选择持久化于
localStorage；慢速播放使用降低的 playbackRate。最终 EXE 专项验收确认女声 A
duration 1.176s、男声 C duration 1.080s，切换会停止旧音频，刷新/重启保持 male。
完整音频映射与生成核验见
`GOOGLE_TTS_FULL.md`。本次构建未包含 ADC、Cloudflare 或其他密钥。
