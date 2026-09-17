# 架构
采用 npm workspaces、Vue 3、TypeScript strict、Vite、Pinia、Vue Router、ts-fsrs、idb、Papa Parse。
packages/models 定义实体；core 提供纯 TypeScript 队列、FSRS 和统计；importers 接受字符串而不选择文件；storage 定义统一 Repository 和 IndexedDB Adapter；shared 提供日期工具。apps/web 负责 UI、路由、文件选择与注入 Repository。
Repository 提供读取快照及原子事务修改：词书级联删除、状态与复习日志一起提交；多标签页写入基于事务内最新数据。结构化克隆保留 FSRS Date。数据库 version 1，后续迁移在 adapter upgrade 内实现。
未来小程序只替换 UI 和 Repository，先验证 ts-fsrs 的包体积和运行时；Windows 可用 Tauri + SQLite；iOS 使用 Native UI/跨端 UI + SQLite。无核心 DOM/Window/Router 依赖。userId 已预留，本地用户为 local；同步需增加版本、删除标记、冲突处理。
参考：https://github.com/open-spaced-repetition/ts-fsrs （MIT）；https://vite.dev/guide/ 。不克隆其他学习产品代码。

## V0.2
packages/core/quiz.ts 负责可测试题型、选项消歧和评分；packages/dictionary 提供无浏览器依赖的 DictionaryProvider，Web 静态 adapter 独立。音频能力在 Web composable 内，核心出题不调用 Audio/SpeechSynthesis。详见 DICTIONARY_AND_REVIEW.md。

## Windows 初版交付选择
当前机器没有 Rust 工具链；为交付可直接运行、无需本地网页服务的 Windows 包，本阶段使用 Electron + electron-builder，暂不要求用户安装 Rust/C++ 开发工具。Electron 自带 Chromium，代价是包体比 Tauri 大。未来可将同一 Web dist 与 Repository 接到 Tauri，领域层未变化。
应用通过受限制的 kotoba://app 自定义安全协议读取包内资源，无监听端口；关闭 Node integration，启用 contextIsolation 和 renderer sandbox。IndexedDB 保存在独立的桌面用户目录。完整词典与演示音频打入包内，无需在线下载。桌面与浏览器存储属于不同origin，数据不会自动共享。
