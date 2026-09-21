# Kotobud · 日语背词与复习工具

> **Kotobud** — A Japanese vocabulary learning and review app.  
> 官方网站 (Official Website): [https://kotobud.com/](https://kotobud.com/)

一个专注自律、干净纯粹的日语单词学习与复习手帖。完整内置《新版中日交流标准日本语》初中高全六册词书，全面应用前沿 FSRS 科学间隔重复调度算法，支持 Web 在线使用与 Windows 桌面客户端（安装版与绿色便携版）。Vue 3 + TypeScript strict，基于 Local-First 本地优先架构，支持多设备增量云同步。

## Windows 桌面版

安装版和免安装版在 `release/`，直接运行 EXE，不再需要启动网页服务。目标为 Windows 10/11 x64，未签名。详见 [Windows交付说明](docs/WINDOWS_DELIVERY.md)。

**六册标准日本语教材尚未内置**：暂未找到可确认完整且允许再分发的数据；见 [来源核查](docs/TEXTBOOK_SOURCES.md)。现有导入功能仍可使用。

## 日常打开（推荐）

在本目录运行 `npm start`，会在后台启动固定地址 http://127.0.0.1:5174 ，关闭启动终端不会结束网站。重复运行会检测并复用已运行的服务，不清除学习数据。电脑重启后需再次运行。日志在 `.cache/server.log` 和 `.cache/server-error.log`。

## 快速启动

需要 Node.js **22.18+ 或 24+**（native 配置加载使用 Node TypeScript 支持）。在此目录运行：

```powershell
npm install --cache .npm-cache --registry https://registry.npmjs.org
npm run dev
```

打开终端显示的地址，默认为 http://127.0.0.1:5173 。当前交付会话的开发预览使用 http://127.0.0.1:5174 。始终使用同一个浏览器与地址（包括端口）；不同 origin 的本地数据库互相独立。

```powershell
npm test             # 核心、导入、事务回归
npm run build        # TypeScript 检查与生产构建，输出 dist/
npm run preview      # 生产预览 5173
npm run test:e2e     # Edge 浏览器端到端测试；需先 build
```

端到端测试默认使用本机 Microsoft Edge。其他系统修改 playwright.config.ts 的 channel，或安装 Playwright Chromium。不要将测试运行在存有真实学习数据的浏览器上下文中；自动化使用独立上下文。

Windows Codex 的受限沙箱可能阻止 esbuild 读取父目录；在普通终端运行 dev 即可，或授权本地开发服务器进程。生产构建与测试已经在当前环境验证。

## 已实现

- 首页：今日到期、新学/复习、累计学习、连续天数、当前词书、7 日图表。
- 词书创建、修改、删除及 CSV/JSON 预览导入。
- 单课、多课、全选、反选、连续范围；每课词汇与进度可查看。
- 学习卡片：揭示释义、词性、可选例句/音频；忘记/模糊/记得映射 FSRS Again/Hard/Good。
- 生词标记、词书/课次筛选、直接练习；忽略与恢复。
- 到期复习独立队列，学习状态和每次评价日志原子保存。
- IndexedDB 持久化；桌面和移动布局、键盘快捷键、基础统计。

快捷键：Space 揭示，1/2/3 评价，S 标记生词，I 忽略。输入框编辑时不触发。

## 立即验收

首次进入自动添加「日语测试词书」，4 课 × 12 词，共 48 词，学习状态全部为新词。删除演示词书后不会在下次启动时自动重建。

1. 从「导入词书」选择 examples/demo.csv 或 examples/demo.json。
2. 确认预览中的 4 课 / 48 词并导入。
3. 选择第 2、4 课，开始后仅出现这两课的 24 词。
4. 标记生词、忽略一个词、显示释义并评价。
5. 首页和统计页更新；刷新仍保留。FSRS 到期后可从首页复习。

示例也可在导入页直接下载。格式详情见 [IMPORT_FORMAT](docs/IMPORT_FORMAT.md)。演示为自行整理的常用词，并非商业教材内容，配套合成发音；带 audioUrl 的导入单词优先播放其音频。

## 目录与边界

```text
apps/web/       Vue 页面、Pinia、路由、浏览器交互
apps/miniapp/   后续小程序入口说明
apps/windows/  后续桌面入口说明
apps/ios/       后续 iOS 入口说明
packages/models/     共享实体
packages/core/       学习队列、FSRS、进度、统计（无 UI/DOM）
packages/storage/    Repository、IndexedDB adapter、级联删除
packages/importers/  CSV/JSON 字符串解析与词书组装
packages/shared/     本地日期工具
examples/            CSV/JSON 样本
tests/               核心回归与浏览器验收
docs/                产品、架构、数据模型、路线与验收记录
```

从 [PRODUCT](docs/PRODUCT.md)、[ARCHITECTURE](docs/ARCHITECTURE.md)、[DATA_MODEL](docs/DATA_MODEL.md) 开始理解项目。后续 Agent 应保持 core 的纯 TypeScript 边界；导入页面只选择文件，解析在 importers；所有数据写入走 Repository。修改学习逻辑需运行核心回归，修改交互需补充对应浏览器验收。

## 新增：详细释义与选择题复习

学习页的「学习方式」可切换 **假名选中文 / 汉字选假名 / 听音选中文 / 混合复习 / 经典卡片**。答题后看解析，点击「保存并继续」记录 FSRS；答对但不确定可勾选「猜对」。支持 1–4 选答案、Space 继续。听音题先点击播放再答题。

释义区现在支持词性、多个义项、日文解释、学习例句、假名及中文翻译。内置 217,538 条 JMdict/Tomoshi 衍生词条，日中扩展含机器辅助内容，页面明确标明来源；另提供コトバンク权威辞典外链，尚未获得商业出版社辞典授权。50条演示读音为 Nanami 日语合成 MP3，其他词可用已有 audioUrl 或设备日语语音。

多义项示例：`examples/detailed.json`，也可从导入页下载。原词书与学习进度保持兼容。

词典静态分片总计约212 MiB（按需读取，非首屏全量下载），数据许可为 CC BY-SA 4.0。详见 [详细设计与来源](docs/DICTIONARY_AND_REVIEW.md)。

## 当前边界与后续工作

- 数据仅在当前浏览器站点存储，清除站点数据会丢失；当前无云同步或完整备份导出。
- Repository V1 采用单份结构化快照，事务内读取最新值并原子修改。适合个人 MVP；长期大量复习日志将使写入成本增长，后续应迁移到按实体 object stores/索引并做规模测试。
- 学习 session 刷新后结束，已经评价的词不丢失。忘记的词按 FSRS 时间重新到期，不在本次队列中立即重复插入。
- 「已掌握」为 FSRS Review 且 stability ≥ 30 天的展示阈值，仍参与复习。累计评价包含新学与复习事件；忽略词不计入有效学习进度分母。
- 未验证 iOS Safari/微信真机；音频依赖导入的有效远程资源，演示提供合成发音，不包含真人录音。
- 不实现登录、云端、社区、AI、OCR、PDF/APKG 导入及其他端客户端。
- 小程序开始前：验证 ts-fsrs 包与运行时、Date 序列化、Storage 配额和分实体存储、平台文件与音频能力；再实现 Repository 和 UI 适配。同步需另行设计 user/device/version、冲突与删除标记。

参考与依赖：FSRS 使用 [ts-fsrs](https://github.com/open-spaced-repetition/ts-fsrs)（MIT）；开发工具参考 [Vite 官方指南](https://vite.dev/guide/)。未复制第三方 App 的实现或教材。
