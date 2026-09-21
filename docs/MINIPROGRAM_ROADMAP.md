# KotoBud 小程序 Phase 3–7 执行路线

2026-09-21，按用户最新阶段划分推进。此路线替代早期迁移审计的阶段编号，技术边界仍然有效。Phase 2 卡片学习闭环已提交：`e8bcc72d`。

## 不可退让的开发门禁

- 保持 `feature/miniprogram`；不修改 `packages/` FSRS 算法及 Cloudflare 后端同步契约。
- 页面只使用小程序原生组件与 Uni API。存储经 `UniStorageAdapter` / `MiniProgramRepository`，发音经 `UniAudioPlayer`；导航只使用 `uni.navigateTo` / `uni.switchTab`。
- 不使用浏览器专属 API，不创建 CloudBase 业务数据库；业务数据后端唯一落点为 Cloudflare D1。
- 每阶段运行 `npm test`、`npm run check:cloudflare`、`npm run type-check --workspace=apps/miniprogram`、`npm run build:miniprogram`，并检查改动范围和构建包体积。验证结果必须区分模拟测试、编译验证和原生真机验收。

## 生产同步硬门禁

后续 Phase 5 必须按以下顺序实现，不得以定时器或页面卸载绕过：

`local hydrate → restore auth → cloud pull → validate payload → deterministic reconciliation → hydrate local → isSyncReady = true → allow push`

- 首次有效 Pull 成功并完成 payload 校验、确定性对齐、本地持久化之前，`isSyncReady` 始终为 `false`。
- Pull 失败、格式错误、账号切换、登录恢复期间，物理阻止全部 Push，包括自动重试、网络恢复、定时器、隐藏/卸载页面。
- 不允许用空本地快照或启动默认选书覆盖已有云端数据；区分 `currentBookIdSource: default | user`。
- 验收必须覆盖断网启动、无效 Pull、空本地/非空云端、账号切换、乱序返回、重复事件和过期写入。
- Phase 3/4 仅本地学习与教材读取，不提前接入 Push。

## 分阶段交付

| 阶段 | 范围 | 验收重点 |
| --- | --- | --- |
| Phase 3（本次执行） | 六册轻量目录、按需教材下载与离线缓存；词书切换、生词本；假名选意、汉字选假名、听音辨意、混合测验 | 保留稳定 wordId/rawTerm；坏响应不入库；已有进度不变；断网可用缓存；题目不泄露答案；评分与日志一次保存 |
| Phase 4 | 到期/困难词复习闭环、首页统计与各书进度 | 统计与当前加载词书解耦；今日新学/复习、Streak 与日志一致；空队列不假报完成 |
| Phase 5 | 微信登录、既有邮箱账号绑定、D1 双向同步、离线出站队列 | 复用实际后端支持的认证路径；若缺少微信 code 交换契约，先列出并解决服务端前置依赖，不能伪造 session；通过全部同步硬门禁 |
| Phase 6 | R2 音频、LRU 缓存、并发焦点控制与主包优化 | 不将批量 MP3 打进主包；主包小于 2MB；清理缓存不删除学习记录；页面退出即停与 iOS 静音验证 |
| Phase 7 | 微信工具与真机视觉/功能验收、隐私协议、发布构建与产物交付 | 安全区、大字体、横竖屏、手势、权限与隐私指引；正式 AppID/合法域名配置；真实验收证据与构建产物对应 |

Phase 7 的审核规则需以当时官方文档核验；开发构建通过不等于审核通过或已上线。缺少账号权限、备案域名、真机或正式 AppID 时明确记录前置条件，持续完成不受影响的开发。

## Phase 3 实施结果（2026-09-21）

- 六册目录共 104 课、9117 词，仅轻量目录进入主包；教材正文从 `/data/books/{bookId}.json?v=biaori-v2` 按需下载，并在写入前校验书号、课次、词数、稳定 `sourceIndex` 和必填字段。
- 大型 `data_*` 快照使用小程序文件系统的临时文件、原子改名和 revision pointer 持久化，避开单个 Storage key 容量限制；失败读取不会回退旧 inline 快照。
- 词书切换、生词本和困难词状态贯通。测验支持卡片、假名选义、汉字选音、听音选义与混合模式，复用 `@jp/core` 出题、答题和评分；错题固定 Again，答对按确定程度映射 Good/Hard，并把题目快照写入学习日志。
- `npm test`：21 个文件、199 项通过；小程序类型检查、`check:cloudflare`、`build:miniprogram` 通过。构建产物 43 个文件，共 174,942 bytes（约 0.17 MiB），不含六册教材正文和批量音频。
- 已扫描 `apps/miniprogram/src`，未引入浏览器专属 API 或 `vue-router`；本阶段没有改动核心 FSRS 算法、Cloudflare 同步契约或创建 CloudBase 数据集合。
