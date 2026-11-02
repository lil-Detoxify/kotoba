# 小程序界面开发与验收

微信原生包是交付目标，H5 入口仅用于同一份页面源码的本地排版检查。

## 更新日志

- **2026-10-18 · Round41 · 0.9.0-beta.9 / versionCode 98**：增加按统计面板所选词书筛选的近 7 / 30 天分题型反馈，客观答题与自我评价分开；历史错词可载入词书后按原题型 / 原词 ID 继续练习。

## 当前候选：2026-10-18 小程序 0.9.0-beta.9（Round41）

统计面板可按所选词书查看近 7 / 30 天各题型的答对数、答错次数、正确率和待重练词，自我评价单独统计。未载入的历史词会明确提供载入入口；重练沿用原题型和原词条 ID，启动时读取最新报表与队列，已答对或已忽略的词会从建议中排除。checkpoint 保留历史练习上下文，继续时只剩余待练词；当前学习书和难词标记保持不变。

5 个文件 28 项定向检查通过；Mini 类型检查、原生 / H5 构建及既有 verify 检查通过。原生包为 232 个文件、1,940,534 B（1.851 MiB）；8 条 WAV 共 197,152 B，保持不变。隔离 Edge H5 合成访客在 390 / 320 宽度核对统计选书不切换学习书、原题型 / 原 ID 评分与断点续学、最新正确结果移除建议且陈旧入口不写入、未载入词书使用本机 fixture 载入；页面错误为 0。以上不代表微信真机验收。

候选 ZIP：[KotoBud-MiniProgram-0.9.0-beta.9-practice-feedback-20261018.zip](../../../kotobud-review/round41-2026-10-18/mini/KotoBud-MiniProgram-0.9.0-beta.9-practice-feedback-20261018.zip)；详细交付记录见 [Round41 DELIVERY](../../../kotobud-review/round41-2026-10-18/mini/DELIVERY.md)。beta.9 尚未微信上传、提审或发布；此前 beta.8 由用户于 2026-10-15 自行上传的事实保留在历史记录中。本轮未改生产 Web、Windows、浏览器扩展或公开下载，TTS 继续暂停。

## 历史候选：2026-10-14 小程序 0.9.0-beta.3（Round29）

本轮突出“场景学习”入口：六个场景各四步，共 24 步连续回应。词书活动入口和相关词卡可进入动词活用，含 24 个动词、四种形态、96 条例句、12 题短练习与错题重练。沿用 Web 的 30 组易混对照和 60 条用法记录，在词卡揭晓、填空揭晓及只读回看中展示。场景与活用短练习不写入词书 FSRS；场景词汇只有进入原词条学习时才按原评分记录，已接入原词条评分流程。

版本与资源为本地测试候选，API 保持 `https://staging.kotobud.com`；本轮没有额外 Web 部署，Staging 沿用原部署，词条与例句沿用 Web 已批准内容。本轮未新增语音或音效文件，语音扩展暂停。答题提示音与试听、每日课次计划、原句及个人词库备份留待后续分轮推进，并经用户批准后继续。

16 项相关内容与原生解析检查、Mini 类型检查、原生 / H5 构建及既有产物检查通过。隔离 H5 390 / 320 核对确认场景流程与错步 / 前文回看、场景填空原 ID 单次评分且不切书、活用四形与只重练错题、短任务不写学习数据、用法与词典展示 / 换词复位 / 只读回看，`pageErrors` 为 0。候选 ZIP `KotoBud-MiniProgram-0.9.0-beta.3-content-20261014.zip` 已生成，CRC 与 171 个文件逐一匹配；哈希及体积见[交付说明](../../../kotobud-review/round29-2026-10-14/mini/DELIVERY.md)。微信开发者工具和真机验收待完成；尚未上传、提审或发布。扩展待小程序全部对齐后推进。

## 2026-10-14 小程序 0.9.0-beta.2 候选（Round28）

新增假名键入、听写和例句填空，以及仅保存在本机的默认练习方式；词书页可跟随偏好或手动切换。例句沿用 Web 已批准内容，按词书缓存读取，不打入原生主包。当前候选连接 `https://staging.kotobud.com`；最终包与检查结果见[交付说明](../../../kotobud-review/round28-2026-10-14/mini/DELIVERY.md)。

最终原生 / H5 构建、Mini 类型检查和 19 项相关检查（含 1 项真实 11 书 JSON 集成检查）已通过；完成页已隐藏“上一个”，同源 H5 的关键交互与 390/320 布局核对已通过。候选 ZIP 已生成，交互结果、检查和包信息见[交付说明](../../../kotobud-review/round28-2026-10-14/mini/DELIVERY.md)。未完成微信开发者工具 / 真机验收，也未上传、提审或发布。

## 构建微信验收包

在仓库根目录执行：

```powershell
$env:VITE_API_BASE_URL = 'https://staging.kotobud.com'
npm run type-check --workspace=apps/miniprogram
npm run build:miniprogram
npm run verify:release --workspace=apps/miniprogram
```

在微信开发者工具中导入 `apps/miniprogram/dist/build/mp-weixin`。保持域名校验开启；上传、提审和发布属于单独的交付步骤。

## 本地手机排版预览

```powershell
$env:VITE_API_BASE_URL = 'https://staging.kotobud.com'
npm run dev:preview --workspace=apps/miniprogram
```

打开 `http://127.0.0.1:5191`，以手机尺寸检查页面。预览使用独立本地 Origin；请选择离线模式，不使用真实账号。H5 预览关闭 uni 统计，其 Vue runtime 与 SFC compiler 解析限定在 H5，不改变微信构建解析。

教材请求受浏览器 CORS 约束，不能用预览下载失败推断微信原生请求不可用，也不能把 H5 截图当作真机验证。触控滑动、评分、吉祥物位置、安全区及音频必须在微信内验收。

## 呈现层入口

- `src/ui-polish.css`：标题、编号分区、状态提示、骨架与短动效。
- `src/components/MiniPage.vue`：动效模式、后台暂停与页面根布局。
- `src/components/MiniHeader.vue` / `MiniPanel.vue`：共享品牌横幅、编号设置卡片及视口入场。
- `src/services/mini-motion.ts`：GSAP core 普通对象时序，原生 transform/opacity 输出、限频与清理。
- `src/services/page-motion.ts`：页面级 show/hide/unload 生命周期与动效状态注入。
- `src/services/ui-preferences.ts`：仅设备本地保存的动效偏好，独立于学习快照。
- `scripts/generate-navigation-icons.py`：可复现的四项原生导航图标源。
- `scripts/generate-settings-icons.py`：可复现的五项设置分区线条图标源。

设置页版本读取工作区 `package.json`，当前本地候选为 0.9.0-beta.9（manifest versionCode 98）；同步更新 manifest 和工作区锁文件，不能据此推断微信已发布。

## 通用词典与来源对照

查词页同时显示教材与通用词典结果；学习页在揭晓答案或回看后可打开“更多释义 · 词典对照”。底部面板按需读取 Tomoshi 中文译释、JMdict 英文原义、日语版维基词典。中文与英文共享 JMdict 上游，维基词典是独立来源。

词典 JSON 按词形读取分片，仅保留少量内存缓存，不打进小程序主包。当前候选使用 `https://staging.kotobud.com`，可通过 `VITE_MINIPROGRAM_DICTIONARY_ASSET_BASE_URL` 配置已验收的生产资源域名；微信 request 合法域名需要包含实际构建使用的域名。

设置页“词典与查阅”可选择默认展开来源、显示开关和顺序，只保存在本机。词典查询遵循现有隐私同意选择；查阅和排序不写入学习快照，不改变学习进度或词条 ID。已知词性可用于教材礼貌式的原形查询；缺失或不匹配的读音明确区分。

当前构建、验证结果及待完成验收见 `docs/HANDOFF_MINIPROGRAM.md`。
