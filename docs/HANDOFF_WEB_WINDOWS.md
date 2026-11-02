# Web / Windows 开发交接

## Windows 0.9.4 验收候选（2026-11-02）

安装版与便携版已生成，复用 Round58 已上线的 Web 0.9.4 冻结资源，同步 UI 与动效更新。1,358 个包内 Web 文件与 stage 字节一致，ASAR 版本及入口核对通过；隔离启动日志完成加载、stderr 为空，未完成原生窗口视觉核验。未运行安装器，尚未上传或发布；官网 Windows 仍为 0.9.3。详见 [Windows 0.9.4 候选交付](../review/windows/2026-11-02-v0.9.4/DELIVERY.md)。

## 当前生产版本：Round58（2026-10-28）

Web **0.9.4** 已获用户批准并正式发布，部署 `53b7a908`（[正式站](https://kotobud.com/app/#/settings)）。本轮为 UI 与动效统一，正式构建与已验收测试版在去除版本 / 资源名称后 72 项一致；生产设置页版本、页面显示和更新日志已核对。12/12 项生产资源完整字节匹配；2026-11-02 已补核此前超时的主样式，其余 11 项沿用发布时核验记录。Windows 仍为 **0.9.3**，其余端候选与共享内容、Worker、下载保持。测试站保留 0.9.4-beta.1 / `fc90ccb2`。详见 [Round58 正式发布记录](../../kotobud-review/round58-2026-10-28/PRODUCTION.md)。

## 历史生产版本：Round57（2026-10-27）

Web / Windows 0.9.3 已正式发布：测试站部署 `164146d0`，正式部署 `ea975ec7`。Web 设置页、正式下载页与更新日志均显示 0.9.3；入口：[正式下载页](https://kotobud.com/download)。Windows Setup（195,479,540 B）、Portable（195,247,574 B）与 SHA 清单已上传生产；R2 大小 / MD5、下载 HEAD / Range GET 已核对，前 64 KB 与本地一致，未核验完整文件的公网 SHA-256。

Web 0.9.1 的正式站记录与部署 `864ec5ac` 保留在 Round55 历史记录中；0.9.2 按更新内容整理，未单独发布。

小程序 0.9.1 / versionCode 99 与扩展 0.3.1-beta.1 仍为验收候选，本轮不提升其版本号。版本梳理见[Round57交付文档](../../kotobud-review/round57-2026-10-27/DELIVERY.md)。

## 历史跨端状态：Round56（2026-10-27）

Web **0.9.1** 为正式站版本，最终部署 `864ec5ac`。Round56 共享索引测试站部署 `e0be4d0a`，其 Web 应用字节仍与正式 0.9.1 一致；生产未发布新索引。

Round56 将 2,151 条词级用法与缓存更新、JLPT 简短 / 完整释义、内置例句 WaveNet 正常 / 慢速朗读与停止 / 重试、个人原句复习和断点、完成页推荐、假名重试保留首答同步到其他端。扩展已有首答保留，小程序本轮补齐。小程序 `0.9.1 / versionCode 99`、扩展 `0.3.1-beta.1`、Windows `0.9.1-beta.1` 是本地验收候选，尚未上传或公开。

扩展最终 3 个文件 62 项定向测试、类型检查、构建及既有包核验通过，8 项隔离页面核对通过；普通词的指定个人原句可正常保存成绩，重试不重复记分。候选核对记录见[Round56交付文档](../../kotobud-review/round56-2026-10-27/DELIVERY.md)。无新增 TTS / R2 音频对象，WaveNet 朗读流式复用生产 MP3。

Windows 冻结正式 Web 0.9.1；打包、正常执行权限隔离启动、设置页版本和三来源词典核对通过。未运行安装器；详见[Windows Round56交付记录](../review/windows/2026-10-27/DELIVERY.md)。完整跨端记录见[Round56交付文档](../../kotobud-review/round56-2026-10-27/DELIVERY.md)。

## 历史平台状态：Round55 Web 0.9.1 正式发布（2026-10-27）

用户已批准发布。Web **0.9.1** 已上线[正式站](https://kotobud.com/app/#/books)，最终部署 `864ec5ac`（同一应用构建先部署 `b5892bdb`，随后对齐门户版本标签）。主文件 `assets/main-Bo62HrWV.js`，SHA-256 `a3029460d50cec5249f3a0a70544cd7548c27adcb418bd4a287906eb11c7d575`。测试站正式构建为 `2e42a906`。生产11项资源HTTP200并匹配候选，独立访客浏览器确认词书页与设置页0.9.1，页面错误/账号写入为0。Worker `e12624af`、8个提示音及既有Windows/扩展下载保持；未执行数据库迁移。Round54用法/例句与音频内容已随本次进入生产，原有音频对象复用，无新增TTS。

当时进入Round56跨端统一开发，目标为小程序/扩展的内容加载、缓存更新、例句朗读、原句复习和完成页推荐。原生端本轮尚未发布。详见[Round55生产记录](../../kotobud-review/round55-2026-10-27/DELIVERY.md)。

## 历史跨端状态：Round54（2026-10-27）

Web **0.9.1-beta.11** 已部署测试站 `f58766d7`，待用户验收（[书籍页](https://staging.kotobud.com/app/#/books)）。Round54 完成内容计划第 3 项的全目录分类续作：2,154 条候选编译去重为 2,151 条 active，按原词义应用于 2,676 个源词条位置，覆盖 11 册、16,926 个来源位置 / 13,398 个规范化词形。分类包括原例句不变 9,340、自动句式结构提示 4,466、既有例句用法 161、既有词级用法 108、Round51 首批内容 154 个位置、本轮新增 2,676 个位置和义项例句更正 21 个位置；自动结构提示与人工词级内容分开统计。

20 条义项更正精确绑定 21 个标日来源位置，并保留 JLPT N2「固まる」原本正确的「予定」例句。28 处原释义为“/”的词义已补齐；仅 3 册词书的 meaning 字段有变化，其他源字段、词条 ID 和顺序不变。40 个新增男女声 WaveNet MP3 已生成、上传并通过公网 SHA-256 / 大小及 ffprobe 核验，共 **1,051,200 B**；音频 Map 新增 20 条至 13,824 条，旧 13,804 条未变。

Web 专项类型检查、构建及 4 个定向测试文件（20/20）通过。真实 `WordDefinition` 组件 23 例核对了读音 / 译文 / 易混交互、仅请求当前词书用法资源以及资源失败时保留例句；390 / 320 px 无横向溢出，1280 / 320 px 截图已目视。公网 11 项资源均为 HTTP 200 并与候选内容一致；`changelog.html` 去除测试 Worker 注入的既有 `noindex` 标记后匹配，`public-verification.complete=true`。本轮仅交付 Web 与共享内容测试站，生产及原生包未发布。详见[Round54 交付记录](../../kotobud-review/round54-2026-10-27/DELIVERY.md)。

## 历史跨端状态：Round53（2026-10-26）

Web **0.9.1-beta.10** 已部署测试站 `aac28205`，待用户验收（[测试站生词本](https://staging.kotobud.com/app/#/difficult)）。本轮针对大词库生词本进入卡顿做了 Web 优化。隔离 Edge 使用 4 倍 CPU 降速和 2,800 词 / 2,800 状态、30 个生词、8 条原句：首访点击至前两帧 **4,990.7 → 201.9 ms**，热访问 **5,941.2 → 121 ms**；30 行和 8 条原句保留，日志 / API 写入 / 页面错误均为 0。SSR 800 词夹具中，状态 / 词 ID 读取次数由 **323,595 / 324,404** 降至 **1,600 / 3,207**，测量耗时 **137 / 17 ms**。

指定性能测试文件 3 项通过，Web 专项类型检查和构建通过。公网核验 4 项资源均为 HTTP 200 并与候选内容匹配；`changelog.html` 需去除测试 Worker 注入的一个既有 `noindex` 标记后比较。该验证不代表全仓回归或真机验收。未发布生产，也未制作或发布原生包。详见[Round53 交付记录](../../kotobud-review/round53-2026-10-26/DELIVERY.md)和[检查汇总](../../kotobud-review/round53-2026-10-26/checks.json)。

## 历史跨端状态：Round52（2026-10-26）

截至 Round52，第 1、2、4 项已完成 Web 测试站交付；第 3 项当时仅交付 Round51 首批 100 条（60 条新增精修 + 40 条既有内容），未覆盖全目录。第 3 项全目录分类续作于 Round54 完成。Round52 测试站 `0.9.1-beta.9` 部署 `36094b8c`（[测试站书籍页](https://staging.kotobud.com/app/#/books)，[部署预览](https://36094b8c.kotoba-iuz.pages.dev/app/#/books)），当时待用户验收。

Round52 为 13,662 条内置例句文本补齐双声：复用 224 条已有双声文本，新增 13,438 条、26,876 个文件，共 **894,045,888 B**。Map 与轻量索引各有 13,804 条，覆盖核验无缺项。生成和上传会话均已结束；目标 26,876 个 R2 对象逐项核对 size / manifest MD5，缺失 0、差异 0。完整 LIST 显示桶内 54,955 个对象、**2,897,873,191 B**，按 10 GB 十进制参考余量 **7,102,126,809 B**。月免费余额未确认。

15 项定向测试、Web 专用类型检查 / 构建、隔离 Edge 场景核验和首批 32 个音频文件（16 对）解码均通过；例句表后台请求最长 45 秒，朗读等待可取消，省流和 2G 不自动加载，切换场景会停止待播朗读。公网 7 项资源核验完成，`public-verification.complete=true`；`changelog.html` 原始响应含测试 Worker 注入的既有 `noindex` 标记，剔除后与候选一致。Worker `e12624af`、8 条提示 WAV 和旧下载保持不变。根目录全仓类型检查仍报告未改动的扩展、小程序及测试文件错误，Web 专用检查通过；未处理本范围外问题。未发布生产、未构建其他端包。详见[Round52 交付记录](../../kotobud-review/round52-2026-10-26/DELIVERY.md)、[续接说明](../../kotobud-review/round52-2026-10-26/RESUME.md)、[覆盖核验](../../kotobud-review/round52-2026-10-26/coverage-verification.json)及[对象核验](../../kotobud-review/round52-2026-10-26/audio-object-check.json)。

## 历史跨端状态：Round51（2026-10-26）

Web 根版本元数据为 **0.9.1-beta.8**。Round51 完成内容计划第 3 项的首批精修：N5 / N4 / N3 常用词各 20 个，合计 60 个，增加简短提示、搭配及可展开的易混对照。加上原有 40 条既有内容共 100 条，仅为首批，不代表全目录词级内容完成。気品、ストロー、すんなり 3 个指定系统 ID 的释义已修正；旧缓存读取时校正，词形、读音、ID、笔记和复习记录保持不变。详见[Round51 交付记录](../../kotobud-review/round51-2026-10-26/DELIVERY.md)及[源数据说明](../../kotobud-review/round51-2026-10-26/SOURCE_NOTES.md)。

共享例句导出按 Web 相同的义项优先级处理，60 条新内容与已有 40 条一并导出，154 个词条位置的例句有意变化；其余例句、Round50 的 3,568 条 canonical 例句及 3 个原始 Biaori 源文件哈希未变。全部 16,926 个词条位置仍可填空，但这不代表全目录词级内容均已精修。

5 个文件 17 项定向检查通过（compatibility 仅运行 1 项，另 8 项未运行），Web 类型检查和构建通过。隔离 Edge 验证 N5 / N4 / N3 内容、对照默认折叠与展开、假名填空、旧缓存释义更新、自定义词和个人笔记保留；日志 / API 写入 / pageErrors 均为 0，390 / 320 px 无横溢出，1440 / 320 px 截图已目视。测试站部署 59474ef1（[预览](https://59474ef1.kotoba-iuz.pages.dev)、[书籍页](https://staging.kotobud.com/app/#/books)）；13 项资源完整 GET 均为 HTTP 200，SHA-256 与候选一致，public-verification.complete=true。主文件 main-CW_ZUgys.js SHA-256 09ad84ebb27a43914efd5010485928a11f9319c31530d2cfb7dfeeebd951a571。

共享文本净增 2,164 B；无新增 TTS / R2 对象，Worker e12624af、8 条 WAV 和旧下载未变；未发布生产或打包其他端。生产 Web / Windows 版本沿用上一轮记录，本轮未重新核验。Round51 交付时测试站待用户验收、第 4 项尚未开始；第 4 项随后在 Round52 完成。

## 历史跨端状态：Round50（2026-10-26）


Web 根版本元数据为 **0.9.1-beta.7**。Round50 完成[内容与语音计划第 2 项](reference/CONTENT_VOICE_FOLLOWUP_PLAN_2026-10-25.md)，新增 3,568 条 JLPT 例句（N5 115 / N4 120 / N3 480 / N2 839 / N1 2,014）；五级 7,809 / 7,809 条词条可填空，标日 9,117 条既有覆盖保持。少数源释义疑点见[Round50 校订记录](../../kotobud-review/round50-2026-10-26/EDITORIAL_NOTES.md)。

3 个文件的 12 项定向测试、Web 类型检查与构建通过。隔离 Edge 五级抽样的例句展示、读音、译文、假名填空均通过；390 / 320 px 无横溢出，学习日志 / API 写入 / pageErrors 均为 0。测试站部署 `e59f2aa1`（[部署预览](https://e59f2aa1.kotoba-iuz.pages.dev)、[书籍页](https://staging.kotobud.com/app/#/books)）；普通 `/app/` 入口、主文件、5 个例句 JS、5 个共享 JSON 和 manifest 共 13 项 GET 均为 HTTP 200 且 SHA-256 与候选一致，`public-verification.complete=true`。主文件 `main-DDapvMPS.js` SHA-256 `170c97720a9b998d4fde1a969c9f69b9701d3c1dbcac8a66eee95d97dd8e0688`。详见[Round50 交付记录](../../kotobud-review/round50-2026-10-26/DELIVERY.md)。

新增共享文本 1,172,243 B；R2 新对象 0，不生成 TTS；Worker `e12624af` 与 8 条 WAV 未变。生产 Web 仍为 0.9.0，Windows 仍为 0.9.0-beta.2；未发布生产或打包其他端，也未验证已安装小程序缓存刷新。测试站待用户验收后再开始第 3 项；第 3、4 项尚未开始。

## 历史跨端状态：Round49（2026-10-25）

Web 根版本元数据为 **0.9.1-beta.6**。显式设置 `VITE_SENTENCE_WAVENET_ENABLED=true` 后，`tests/web-sentence-audio.test.ts` 9 项全部通过，Web 类型检查与构建通过。Cloudflare 测试站已部署 `d55c5e89`（[部署预览](https://d55c5e89.kotoba-iuz.pages.dev)，[测试站场景页](https://staging.kotobud.com/app/#/scenes/shopping)），待用户验收。生产 Web 仍为 0.9.0，Windows 仍为 0.9.0-beta.2。

本轮仅推进[内容与语音计划第 1 项](reference/CONTENT_VOICE_FOLLOWUP_PLAN_2026-10-25.md)：Web 恢复引用既有、已生成并上传的 Google WaveNet 语音，覆盖 270 句场景、任务与活用例句（174 句场景 / 任务 + 96 句动词活用），另有 96 个活用词形；男女声双声共 732 个 URL（48 个 URL 复用既有地址，684 个 URL 对应已上传文件，合计 11,584,512 B）。测试站 16 条代表性 MP3（六个场景各含男女声、一个活用词形男女声及一条例句男女声）均完整 GET 返回 HTTP 200，长度与桶对象清单的 size、MD5 一致。未生成 TTS 或新增 R2 音频对象，不改 Worker、数据库或其他端安装包；这是有限既有语音恢复，不代表全量 TTS 恢复。

隔离 Edge 使用候选 UI 和实际下载的 MP3 通过 AudioContext 解码全部16条；原生 HTMLAudio 验证男女声偏好、活用词形与例句、0.75 倍保音高慢速、离页停止及 404 后手动重试均通过。学习日志 / API 写入 / pageErrors 均为 0，390 / 320 px 无横溢出，截图已目视。尚不代表全语料人工听感审校或真实手机验收。设置说明同步为“单词与例句朗读使用同一个选择”。测试站普通 `/app/` 入口、主文件 `main-DDZrMmyQ.js`、资源 `Scenes-DZ7Dg6lF.js` / `Conjugation-CRn4eInW.js` / `usePronunciation-Clas_bNp.js` 共 5 项实际 GET 均为 HTTP 200，完整字节与 SHA-256 匹配候选；`public-verification.json` 的 `complete=true`。候选主文件 SHA-256 `b40efa9deb17b92cdc5b55c0b68485301222a9fd80d9c509523ebe0a4e966980`。详见 [Round49 交付记录](../../kotobud-review/round49-2026-10-25/DELIVERY.md)。

Worker `e12624af` 与 8 条 WAV 字节未变；未发布生产或制作 / 上传原生包。第 1–4 项已授权按序推进，第 2–4 项尚未开工；每轮先完成测试站验收，进入下一轮和生产发布均需用户确认。多例句功能不在本轮范围内。详见[内容与语音后续计划](reference/CONTENT_VOICE_FOLLOWUP_PLAN_2026-10-25.md)。

## 历史跨端状态：Round48（2026-10-24）

Web **0.9.1-beta.5** 已完成 Cloudflare 测试站上传，部署记录 `0fce3fd6-e5e0-45ba-8dcd-81b79cb599d4`（[测试站](https://staging.kotobud.com/app/#/)）；生产 Web 仍为 0.9.0，当前待用户验收。用户已授权推进[体验更新清单第 5、6 项](reference/UX_FOLLOWUP_PLAN_2026-10-24.md)。

本轮目标为 Web 与扩展针对当前词和后两词最多预取 3 条既有媒体，播放时消费预取结果；省流、离线或 2G 不新增预取，切换 voice、队列、页面隐藏和卸载时取消旧任务。不自动播放或生成 TTS / 音频，不写本地数据库；失败提供手动重试且保留题目、输入及成绩。Web 完成页依据本轮实际已评分词推荐原词书中词头与读音来源可核对的相关场景，不重复当前场景；无适合场景时才回退到精确匹配的动词活用。推荐只跳转，不自动评分或切书，不覆盖原主要下一步。

相关 6 个文件共 96 项定向检查通过（缓存 5、Web 发音 19、推荐 6、学习历史 22、扩展发音 13、扩展学习 31），Web / 扩展类型检查与 Web 构建通过。隔离合成访客以候选文件响应和模拟音频检查预取、播放复用、失败重试保留题目 / 输入且不评分、隐藏清理、省流不新增；完成页只为实际已评分词匹配同原书且词头 / 读音相符的场景，排除当前场景，无场景时精确回退动词活用，并核对无关词不推荐和推荐导航不切书 / 评分。1440 / 390 / 320px 无横溢出，截图已目视；pageErrors 与 API 写入为 0。

Cloudflare 测试站部署记录 `0fce3fd6-e5e0-45ba-8dcd-81b79cb599d4`。候选主文件 `main-DzxJt-q-.js`，SHA-256 `d6ec1ceeb32d349527e9a057c02f91cd42335f887c022b33c5cc4e8a396f15c1`；学习资源 `Study-BaFRKrkw.js` / `Study-DOrbgPiK.css`。公网入口 GET 单次 15 秒超时并返回 0 字节，因此未确认线上资源、真实发音或弱网加速验收；候选及服务端部署记录已核对。详见 [Round48 交付记录](../../kotobud-review/round48-2026-10-24/DELIVERY.md)。

生产 Web 仍为 0.9.0，Windows 仍为 0.9.0-beta.2；Worker SHA-256 `e12624afe1473e1c5c89cd27f4ba57887e57b4d95b73151d12af6a05a4a31097` 与 8 条提示音未变，TTS 继续暂停。未生产发布或制作 / 上传原生包；扩展只同步源码及定向检查，不打包、上传或改 manifest 版本。待用户验收后再推进。

## 历史跨端状态：Round47（2026-10-24）

Web **0.9.1-beta.4** 已部署[测试环境](https://staging.kotobud.com/app/#/difficult?view=contexts)，部署 `27f9106e`。按[原计划第3、4项](reference/UX_FOLLOWUP_PLAN_2026-10-24.md)精修首批40个N5 / N4常用动词，各20个；按词头、读音及当前释义匹配例句、搭配和简短助词 / 语体 / 易混提示。

生词本新增“我的原句”，直接展示句子、关联词和来源，支持词书 / 课次筛选、全文搜索、编辑与移除。普通复习优先个人语境，合适且目标词形唯一完整的句子可做填空；指定句子随本机断点与重练保留，不编造整句读音。

5个相关文件合计55项检查、Web类型与最终构建通过。隔离Edge使用合成访客和候选UI / 词库响应验证了原句入口、筛选、编辑移除持久化、指定句填空 / 重练 / 刷新续学、普通复习个人语境及N5 / N4内容展示；1440 / 390 / 320px截图已目视检查，窄屏筛选标签已修正，pageErrors 0、API写入0，仅显式评价一次产生1条日志。音频模拟，不代表实际账号或语音验收。

线上入口已返回本轮 `main-DuYsVCc-.js`；候选SHA-256 `68d73bc650ac201d72a183d0b09e5d661e00b1e892c8dd50e0f19c799de14246`。列表资源 `Lists-Bitvq9z_.js` / `Lists-DNL1hQES.css`，学习资源 `Study-CatrabQ9.js`。该入口的完整GET字节与候选一致；后续JS / CSS哈希复核受连接及TLS超时影响，未完成，不能称为全量线上验收。详细记录与边界见 [Round47交付](../../kotobud-review/round47-2026-10-24/DELIVERY.md)。

生产发布记录沿用Web0.9.0 / Windows0.9.0-beta.2。本轮只更新测试站，待用户验收；未制作其他端安装包，未更改Worker、8条提示音、D1 / 认证 / 同步协议或FSRS模型，TTS继续暂停。

## 历史跨端状态：Round46（2026-10-24）

Web **0.9.1-beta.3** 已部署测试站：查词将同词头、同读音合并成卡片，不同读音保持分开。每组保留来源原词条、词书 / 课次和释义，可展开选词，默认当前词书；收藏、忽略恢复、原句均绑定所选原词 ID，查询不评分。收齐匹配后按 40 个词展示，重复来源不占显示名额。

相关 4 个文件 31 项定向检查、Web 类型检查与构建通过。隔离 Edge 合成访客验证：同词同读音归并、异读分开；默认当前书、切换来源更新释义并将焦点带回摘要；忽略恢复 / 收藏及原句操作跟随所选原词条 ID，编辑原句期间不可切换来源，单来源词条不显示展开器。390px 无横溢出，日志 0、API 写入 0、pageErrors 0。UI、词库与词典请求来自本次候选文件响应，音频模拟；这不代表真实账号或完整媒体验收。

测试站部署 `d89c69a9`（[测试站](https://staging.kotobud.com/app/#/)），主文件 `main-CZCVmkf3.js`，SHA-256 `cc6d2a09e9b4cd337dc3eb43923beaf373c787f1656d9bf129ba00cefae6d4cd`；查词资源 `Search-CGdnJFxS.js` / `Search-CItV5teB.css`。线上入口、主 JS、查词 JS 和 CSS 完整 GET / 哈希匹配。证据 `../kotobud-review/round46-2026-10-24/browser-verification.json`、`public-verification.json`、`site-verification.json`。

生产 Web 仍为 0.9.0，主文件哈希 `b175c060f3e0bda7c6b74ad46cd2a1bc5cae148c045056d700849b7df7906295` 未变；Worker `e12624af` 与 8 个提示音未变，无 D1、auth 或 TTS 改动。本轮无生产发布或原生包制作 / 上传。状态为测试站检查通过，待用户验收。

## 历史跨端状态：Round45（2026-10-24）

Web 测试版为 **0.9.1-beta.2**，已完成测试站交互检查，待用户验收。首页对未完成会话优先续学，说明原词书 / 课次 / 剩余词数；续学卡片按课次 / 词书分层，移除重复的剩余词说明和“保留队列”小字；已有卡片复习按钮时不再重复展示下方提醒。review 开屏有到期词时以复习为主，同时提供今日计划；没有待学计划时提供选课或今日完成出口，不自动跳课。首页 9 项定向检查通过。

完成页优先按当前弱词 → 到期复习 → 未完成今日计划 → 今天结束推荐一个主操作，并保留结束 / 选课出口。输入纠错提示促音、小假名、清浊和长音符的假名差异；不因普通元音相邻而猜测长音。就地重听 / 重试只在组件内生效，不更改首次成绩；Round44 自动发音功能保留。

整轮原有 5 个文件 45 项定向检查通过；首页视觉精简后，本次首页既有 9 项检查、类型检查与构建通过。续学卡片按课次 16px / 600、词书 14px / 400 分层，删除重复剩余词说明、“保留原词书与剩余词队列”和按钮旁原队列小字；卡片已有复习按钮时不再重复显示下方入口，无卡片复习入口时保留唯一后备入口。独立合成访客线上验证：续学及 today / progress / review 展示均只有一个开始复习按钮，今日计划结束后仍可进入复习；390px 无横溢出，pageErrors 0、API 写入 0。证据 `../kotobud-review/round45-2026-10-24/home-refinement/browser-verification.json`、`site-verification.json`。

首页精简版测试站部署 `6752cc53`（[测试站](https://staging.kotobud.com/app/#/)），主文件 `main-COYjsiIh.js`，SHA-256 `94dd50dbbf6a89ad21abb153e538ca92da6cffba6e8ef8135cc2023c02d711ed`，替代此前的 `a086fea1`。测试站待用户验收；线上资源哈希核验通过，生产主资源保持不变（见 home-refinement/public-verification.json）。

生产 Web 仍为 0.9.0，主文件 `main-HbacATkW.js` SHA-256 `b175c060f3e0bda7c6b74ad46cd2a1bc5cae148c045056d700849b7df7906295` 未变。Worker `e12624af` 与 8 个提示音未变；无 D1、auth 或 TTS 改动。Windows 仍为 0.9.0-beta.2，本轮未制作或上传 Windows、扩展、小程序包。根版本元数据为 0.9.1-beta.2。

## 历史跨端状态：Round44（2026-10-24）

Web 本机候选版本为 **0.9.1-beta.1**，自动发音默认开启：进入首词 / 下一词读一次，回看不重播；键入、选读音、填空在揭晓后朗读；听写 / 听音继续使用原 `heard` 门控。快速切词、关闭开关、隐藏页面、切换发音声音会取消旧请求，并短暂避让答题提示音；手动发音保留。Web 学习页实现及定向测试 38 项通过。

Web 测试环境已部署 `678f322e`（[Settings](https://staging.kotobud.com/app/#/settings)），主文件 `main-DiriNKXV.js`，SHA-256 `007c6bafb09eefa9c0aa8a895b74a818955900885be929309602272c2ce74d54`。隔离合成访客 QA 通过：首词 / 下一词 / 复习首词自动朗读，揭晓与回看不重复，关闭偏好刷新保留，关闭时仍可手动发音；390px 无横溢出，pageErrors 0、apiWrites 0，桌面 / 手机设置截图已目视检查。Web 定向测试 38 项、类型检查与构建通过。Worker 沿用生产 `e12624af`，8 条答题音频字节未变。生产 Web 仍为 0.9.0，在线主文件 `main-HbacATkW` / `b175c060f3e0bda7c6b74ad46cd2a1bc5cae148c045056d700849b7df7906295`；Windows 仍为 0.9.0-beta.2，本轮不更新 Windows 包。扩展源码同步后 33 项定向测试及类型检查通过；小程序源码同步后 8 项定向检查通过，均未构建或上传。根 `package.json` 与 lockfile 根版本更新为 0.9.1-beta.1。

## 历史跨端状态：Round43（2026-10-21）

官网扩展测试下载已随 Pages 部署 f3ebc48a 更新为 [0.3.0-beta.7 ZIP](https://kotobud.com/downloads/KotoBud-Extension-0.3.0-beta.7.zip)，2,443,255 B，SHA-256 c947a667fa1d5bd3fc5d2dfe7ffa1f3d1ebd5f2785712c3d9dca18f89c4ef1c8；HEAD / GET、下载哈希和 SHA 文本均已核对。Web 主文件哈希仍为 b175c060f3e0bda7c6b74ad46cd2a1bc5cae148c045056d700849b7df7906295，该扩展独立发布时的 Worker 基线为 888964553e473fe77d4b64cbd626fec403de8e6a5c14196c33bbe8491d2cbc1b（当前生产值见下方 Windows 发布记录）。

Edge 商店仍公开 0.2.3 Live。同一 ID 的 version=0.3.0 / version_name=0.3.0-beta.7 上传包为 Complete，中英文资料和 permissions 保持不变；用户批准提交审核后状态为 In review，新版本尚未公开上架。详见[交付记录](../../kotobud-review/extension-release-2026-10-21/DELIVERY.md)、[JSON 回执](../../kotobud-review/extension-release-2026-10-21/submission-receipt.json)和[审核截图](../../kotobud-review/extension-release-2026-10-21/edge-in-review.png)。

Windows 0.9.0-beta.2 安装版 / 便携版承载已批准 Web UI 0.9.0。实际解压版程序在临时 profile 检查通过：版本、legacy / Wiki 本地 JSON、Tomoshi / JMdict / Wiki 三来源、0 评分和无 GPU 启动失败；没有覆盖已有安装，也没有运行安装器。两个 EXE 原字节已上传到 R2 `releases/0.9.0-beta.2/`，远端对象列表大小与本地报告一致：Setup 183,734,913 B，SHA-256 `6fdec6db0451e3d46309343d70f3a6185e60ecc4cac68724d914a75d62c951aa`；Portable 183,502,935 B，SHA-256 `a92d310fc171128ad2cdf7f74f3c28c663e11ef61b95e1444af172a458d9080b`。对应校验文件为 [SHA256SUMS-0.9.0-beta.2.txt](../review/windows/2026-10-21/production/SHA256SUMS-0.9.0-beta.2.txt)。

Windows 0.9.0-beta.2 已在生产发布。Staging 部署 `40f3850a`，生产 Pages 部署 `cebf09a0`（[部署预览](https://cebf09a0.kotoba-iuz.pages.dev)）。生产[下载页](https://kotobud.com/download)提供[安装版](https://kotobud.com/downloads/KotoBud-0.9.0-beta.2-Windows-x64-Setup.exe)、[便携版](https://kotobud.com/downloads/KotoBud-0.9.0-beta.2-Windows-x64-Portable.exe)和[SHA-256 清单](https://kotobud.com/downloads/SHA256SUMS-0.9.0-beta.2.txt)。两份 EXE 的公网完整 GET 长度与 SHA-256 匹配，HEAD 均为 200 且附件名 / 长度正确；221 B 校验清单、更新日志及下载入口已核对。安装版为 183,734,913 B / `6fdec6db0451e3d46309343d70f3a6185e60ecc4cac68724d914a75d62c951aa`，便携版为 183,502,935 B / `a92d310fc171128ad2cdf7f74f3c28c663e11ef61b95e1444af172a458d9080b`。原 Windows 0.7.3 安装版仍可从旧固定 URL 获取（HEAD 200，301,212,951 B）。

Web 主资源保持 SHA-256 `b175c060f3e0bda7c6b74ad46cd2a1bc5cae148c045056d700849b7df7906295`；Worker 仅调整三条下载版本正则以匹配 beta 版本，SHA-256 `e12624afe1473e1c5c89cd27f4ba57887e57b4d95b73151d12af6a05a4a31097`。源码 `Settings.vue` 中的 Windows 版本已更新供后续 Web 构建，但已编译公开 JS 仍显示 0.7.3 并链接原文件；本轮未重构建或替换该 JS，旧版固定 URL 继续提供原包。详见 [Windows 交付](../review/windows/2026-10-21/DELIVERY.md)、[生产交付记录](../review/windows/2026-10-21/production/DELIVERY.md) 和 [公网核验报告](../review/windows/2026-10-21/production/verify-kotobud.com.json)。

小程序方面，用户报告 2026-10-21 已自行打包上传；上传批次版本、审核和发布状态未独立核对。Round41 beta.9 的“未上传”是截至 2026-10-18 的历史记录。TTS 继续暂停，本轮没有音频、D1 或登录功能改动。

## 历史记录：Round41（2026-10-18）

微信小程序本地候选为 **0.9.0-beta.9 / versionCode 98**。统计面板按所选词书展示近 7 / 30 天分题型客观答题表现，自我评价另行统计；未载入的历史词明确提供载入入口。重练保留原题型 / 原词条 ID，启动时读取最新报表与队列，已答对 / 已忽略词不会进入建议；checkpoint 保留历史上下文并只继续剩余待练词。当前学习书和难词标记保持原值。

5 个文件 28 项定向检查通过；Mini 类型检查、原生 / H5 构建及既有 verify 检查通过。原生包 232 个文件、1,940,534 B（1.851 MiB），8 条 WAV / 197,152 B 保持不变。隔离 Edge H5 合成访客核对 390 / 320 布局和历史错词流程，页面错误为 0；不代表微信真机验收。候选 ZIP：[KotoBud-MiniProgram-0.9.0-beta.9-practice-feedback-20261018.zip](../../kotobud-review/round41-2026-10-18/mini/KotoBud-MiniProgram-0.9.0-beta.9-practice-feedback-20261018.zip)，交付证据见 [Round41 DELIVERY](../../kotobud-review/round41-2026-10-18/mini/DELIVERY.md)。

截至 Round41 记录，beta.9 尚未微信上传、提审或发布；beta.8 由用户于 2026-10-15 自行上传的历史事实保留在小程序交接。此轮没有修改生产 Web、Windows、扩展或公开下载，TTS 继续暂停。浏览器扩展维持 Round40 的本地候选 **0.3.0-beta.7**；Web / Windows 生产状态没有改变。

## 历史记录：Round40（2026-10-16）

浏览器扩展本地候选 **0.3.0-beta.7**。已忽略词可按词书、课次和搜索筛选并恢复；恢复只清除忽略标记，保留 FSRS 进度与难词标记。恢复某书 / 课筛选中的最后一个词后，筛选仍停留原选项并显示空结果和恢复反馈。统计页用近 7 / 30 天范围按统计面板所选词书展示题型次数 / 正确率，自我评价单独展示；历史错词以原题型重练，启动前重新读取最新报表和队列。

7 个测试文件共 53 项定向检查通过；扩展类型检查、构建及既有 verify-worker 检查通过。dist 为 43 个文件 / 9,710,659 B / 16,926 词，界面资源为 `ui-DcGQVg_j.js` / `ui-CDsuUk5Q.css`，已有 8 条提示音 / 197,152 B 未变，TTS 继续暂停。隔离 Edge MV3 合成访客 QA 通过：390 / 320 px 无横向溢出，忽略词恢复保留筛选、FSRS 进度和难词标记并经刷新验证持久化；7 / 30 天统计按词书区分客观题表现与自主评分；历史错词以原题型 / 原词条 ID 重练并评分后移出最新错词。统一测试 ZIP 共 43 个文件、2,443,255 B，SHA-256 `c947a667fa1d5bd3fc5d2dfe7ffa1f3d1ebd5f2785712c3d9dca18f89c4ef1c8`；详见[Round40 交付](../../kotobud-review/round40-2026-10-16/extension/DELIVERY.md)。

扩展主要学习功能目前已基本对齐 Web；真实账号跨端、原生 Chrome 和实际侧栏仍待用户验收。本轮未更新生产 Web、公开下载、小程序上传 / 云端状态或扩展商店。个人词库正文仍不自动同步，学习记录沿用既有同步流程。详见[扩展 README](../apps/extension/README.md)。

## 历史记录：Round39（2026-10-16）

浏览器扩展本地候选 **0.3.0-beta.6** 完成学习总结与弱词建议。总结以本轮新保存的复习 `log ID` 和评分前 `reviewCount` 基线区分新学 / 温习；客观题的答对、未答对、正确率仅在有客观题记录时显示，翻卡自评另列「记得 / 模糊 / 没记住」。忽略 / 跳过另列，不计入学习结果。完成后可重练待巩固词，保留原词条 ID 并重新运行 FSRS 更新复习安排，不标记难词；未完成会话需先继续剩余队列，完成后开放重练。checkpoint 兼容 `feedbackPractice` 重练状态。首页弱词建议限定当前词书，依据近 30 天记录最多展示 5 词并附原因。

6 个测试文件共 43 项针对性检查通过；扩展类型检查、构建及既有 verify / Worker 检查通过。dist 为 43 个文件 / 9,650,648 B / 16,926 词，界面资源为 `ui-CxC1Q4Wq.js` / `ui-Br5_IC10.css`，没有新增音频或 TTS。刚评分记录未即时参与推荐的时间问题已修复，并有 Vue setup 回归检查。真实账号跨设备和实际浏览器侧栏仍待验收。

本轮未生成 ZIP、未部署、未更新官网下载或商店。Web v0.9.0 仍为生产版；小程序 v0.9.0-beta.8 / versionCode 97 的上传仍为用户于 2026-10-15 自行完成，本轮没有新的发布状态。个人词库正文仍不自动同步，学习记录沿用既有同步流程。下一组补忽略词事后恢复、统计页分题型表现和历史错词重练；当前尚未与 Web 基本完全同步。扩展细节见[扩展 README](../apps/extension/README.md)和[本轮交付](../../kotobud-review/round39-2026-10-16/extension/DELIVERY.md)。

## 历史记录：Round38（2026-10-16）

浏览器扩展本地候选 **0.3.0-beta.5** 加入个人词书 / 课次 / 词条 CRUD、内置词与个人词原句管理、Web 兼容可移植包预览与 `keep-local` / `use-package` 合并选择，以及手动账号备份读取、保存、合并。编辑词库正文保留学习进度；个人词库正文仍不自动同步，学习记录沿用既有同步流程。

8 个测试文件的 55 项定向检查通过；扩展类型检查、构建及既有 verify / Worker 检查通过。dist 为 43 个文件 / 9,625,494 B / 16,926 词，界面资源为 `ui-BqTHG7Dn.js` / `ui-BWoAFIl2.css`，本轮未新增音频。

隔离 Edge MV3 合成游客完成个人内容创建与编辑、评分后编辑保留进度、原句去重及重载保留、导出与导入预览策略核对；390 / 320 px 无横溢出，pageErrors 0、HTTP(S) 0。游客备份仅显示登录提示，未真实云端读写。UI 未应用导入，实际合并由单元 / repository 覆盖；真实账号跨设备和实际浏览器侧栏仍待验收。未生成 ZIP、未更新官网 / 商店、未新增部署；TTS 继续暂停。Round38 当时后续计划为推进学习完成反馈与弱词建议，再完成基本同步清单核对。[Round38 交付](../../kotobud-review/round38-2026-10-16/extension/DELIVERY.md)。

Web v0.9.0 仍为生产版；小程序 beta.8 的打包上传由用户于 2026-10-15 自行完成，提审和发布状态未据此改变。

## Web v0.9.0正式发布 / Windows0.9.0-beta.1候选（2026-10-13至14）

生产`adb64894`、同一正式构建测试站`7e08fb45`，主文件`/assets/main-HbacATkW.js`，SHA-256 `b175c060f3e0bda7c6b74ad46cd2a1bc5cae148c045056d700849b7df7906295`。Worker为88896455已验收版本，生产仅执行0005备份表迁移；既有发布脚本的生产Worker校验值按用户批准更新。root版本0.9.0，正式日期2026-10-13，显式关闭新增WaveNet例句配音。26项相关资源在线一致，正式站隔离界面通过；真实账号备份写入未重验。[生产交付](../../kotobud-review/production-2026-10-13/DELIVERY.md)。

Windows候选在`review/windows/packages`，原0.7.3公开下载未变。Web资源来自正式dist-cloudflare，以app.html作为根index，补入512个旧词典及256个Wiki分片，未复制冗余Google音频。独立builder配置`extends:null`和唯一extraResources web源修复旧页面覆盖；打包Web与源888文件内容一致，实际win-unpacked程序显示包0.9.0-beta.1/UI0.9.0，两类本地词典与三来源面板通过，无评分及GPU失败。[Windows交付](../review/windows/DELIVERY.md)。

受限测试环境的GPU子进程启动失败已通过正常本机权限差异核对定位；客户端正常GPU/用户资料配置不改。隐藏测试窗口临时关闭后台帧节流并使用capturePage(stayHidden:true)，不会显示窗口或长期修改设置。测试脚本支持实际候选exe，提前核对打包index与批准app.html一致。不得仅凭dev页面或静态打包通过就宣称实际包通过。

当前跨端首轮及后续功能队列见[总交付](../../kotobud-review/round27-2026-10-13/DELIVERY.md)。下文为历史记录。

## 第二十六轮多词典对照（2026-10-12，已并入v0.9.0正式版）

Web `0.9.0-beta.4` / Staging `f2c5788c` / `/assets/main-BqPqxQCs.js`。dictionary-comparison 服务提供三个来源独立查询，共享 Tomoshi / JMdict 上游查找，并按已知词性原形查找；Wiki分片读取有界缓存及并发去重，取消某个查看者不会取消其他查看者的共同请求。useDictionaryComparison在关闭、切词、切账号和卸载后忽略旧结果，失败按来源重试。DictionaryComparisonPanel共用于WordDefinition和Search，桌面620px侧栏 / 手机整屏，阻断学习页快捷键、恢复焦点与滚动；旧日文补充默认折叠，原Kotobank外链保留。DictionaryPreferences在Settings及侧栏管理默认展开、显示与排序，本机持久化。

`scripts/build-wiktionary-ja.mjs`从固定SHA的jawiktionary JSONL筛选133,931条原记录 / 125,732词头，输出`apps/web/public/data/dictionaries/wiktionary-ja/2026-10-12/{0..255}.json`（NFKC hash31 %256词头对象），共49,416,226字节。每条保留来源；纯假名且transliteration / hiragana / katakana标记才记为读音，不从gloss猜音，多读音页不把sense分配到某读音。16,926词原词形覆盖基线及格式样例见本轮review目录，不能宣称三源全覆盖。

20项相关检查、Web / Worker类型与构建、隔离Edge1440 / 390定向流程通过；21项线上相关资源哈希一致，测试Worker仍`888964553e473fe77d4b64cbd626fec403de8e6a5c14196c33bbe8491d2cbc1b`，生产仍下述v0.8.0基线。本轮无新SQL / R2 / 依赖 / 其他客户端发包；语音准备已按用户要求暂停，构建显式关闭`VITE_SENTENCE_WAVENET_ENABLED`。等待用户验收后再推进；详见[交付记录](../../kotobud-review/round26-2026-10-12/DELIVERY.md)。

## 第二十四轮内容与练习深化（2026-10-12，已并入第二十六轮候选）

Web `0.9.0-beta.2` / Staging `abc50151` / `main-gKdyBXh-.js`。用法服务合并原库与 foundation / everyday 两份新内容，共 30 组双向 / 60 条；词形与读音精确匹配，未改原词库。新增 conjugation 服务、learning-verbs 目录与 `/conjugation`：24 个指定词型、四形、96 条模板，完整输入判答 / IME / 特例 / 原有音效 / 错题重练。Books 与 WordDefinition 接入，词卡进入可返回原学习。SceneTaskPractice 在六场景提供四步任务、显式确认、原因、首次统计与错步重练 / 前文；active 事件控制旧场景动作显示，宠物空间修订仅局部布局。两种练习不调用词条评分或同步。

19 项定向服务检查、类型 / 构建、最终 Edge 1440 / 390 实际流程与截图复查通过，12 个相关资源线上哈希匹配；8 个 WAV 未变，Worker 仍上一轮 `88896455`，无新迁移 / R2 / 依赖。生产入口及主文件哈希仍 v0.8.0 基线。版本号与更新日志已补齐；详细范围、已核对与未核对边界见[本轮交付](../../kotobud-review/round24-2026-10-12/DELIVERY.md)。当前三项待用户验收，其他平台未打包。

## 第二十三轮个人词库账号备份（2026-10-12，已并入第二十四轮候选）

Web `0.9.0-beta.1` / Staging `30143406` / `main-Wtdvk78h.js`，入口 https://staging.kotobud.com/app/#/settings 。Settings 嵌入 PersonalLibraryCloudBackup，store 通过捕获账户与本机数据归属调用新备份 client，恢复沿用个人词库 merge；默认 keep-local，显式 use-package，保留学习记录与本机额外内容。云备份手动管理、每账号最新快照上限 1 MiB，GET / PUT 使用已有认证并以 expectedRevision 处理冲突。个人词库空读音 / 空释义可往返。

只给测试库应用 `0005_personal_library_backup.sql`。兼容 Worker 通过本轮 `prepare-library-backup-worker.cjs` 在已发布 `27f189` 上添加一个路由与 self-contained 模块，候选 SHA 为 `888964553e473fe77d4b64cbd626fec403de8e6a5c14196c33bbe8491d2cbc1b`；不直接发布其他认证改动。23 项相关测试、类型 / 构建、隔离 Edge 双设备流程、真实测试接口样本与 8 个资源哈希核对通过，生产主文件哈希确认不变。真实邮箱登录沿用现有流程，未重验；样本已清理。完整记录与后续正式发布步骤见[本轮交付](../../kotobud-review/round23-2026-10-12/DELIVERY.md)。生产与其他客户端版本仍如下所示。

## 历史生产基线（截至 2026-10-12）

Web v0.8.0 已发布 Pages 正式站部署 `bac2d234`，入口 `https://kotobud.com/app/#/`，主文件 `/assets/main-BdCmY4E6.js`；与 Staging 部署 `d08cd7f6` 使用同一构建。沿用兼容 Worker（SHA-256 `27f189e1621c6e8c398a54b077eb8c280524b5931366056dd93b527ddf46543a`）。23 个指定 JS／CSS／WAV 资源（含 8 个提示音）SHA-256 均与本地 `dist-cloudflare` 一致；官网首页、应用入口和更新日志均 HTTP 200。Windows 仍为 v0.7.3，小程序 v0.7.4 为候选，扩展 v0.2.3 为测试版，本次未对其他平台重新打包。

生产验收见[交付记录](../../kotobud-review/production-2026-10-12/DELIVERY.md)、[资源基线](../../kotobud-review/production-2026-10-12/production-resources.json)和[版本浏览器检查](../../kotobud-review/production-2026-10-12/production-browser-verification.json)。

## 2026-10-11 第二十二轮场景入口／提示音试听（Staging 验收记录，已并入 Web v0.8.0）

Books用现有learningScenes.length生成分类上方的常驻入口，保留原词书网格和导入。Settings调用既有previewAnswerSound／stopAnswerSound，新增正误试听、当前音量／静音解释、取消代次与失败反馈；选择音色不自动试听，卸载时取消播放。没有改学习身份、数据模型、音频资产、其他客户端或Worker。

Staging `edf2991f`／`main-CIYsXkOz.js`，https://staging.kotobud.com/app/#/books 与 https://staging.kotobud.com/app/#/settings 。Web／Worker类型和构建、隔离Edge1440／390界面与试听定向检查通过，原状态／日志／当前书不变，截图已复查。7个相关资源线上哈希匹配，八个音效与27f189输入兼容Worker沿用，生产 `main-Cjg17Pae.js` 哈希不变。[第二十二轮交付](../../kotobud-review/round22-2026-10-11/DELIVERY.md)。该 Staging 构建于 2026-10-12 作为 Web v0.8.0 发布正式站；当前生产基线见本文首节及[生产交付](../../kotobud-review/production-2026-10-12/DELIVERY.md)。

## 2026-10-11 第二十一轮内容深化／答题提示音（Staging 验收记录，已并入 Web v0.8.0）

新增住宿入住、约定见面、天气与出行三专题、24条原词场景例句／填空、12轮对话，六场景均补2条表达小贴士，累计48词／22轮对话／12条表达。新增存在、给予／接受、开关电器、去／来四组搭配与双向易混对照，累计12组。原词ID、进度和原用例不变。设置提供木芽、风铃、林木、溪石四种提示音，默认木芽45%，开关／音色／音量本机持久；没有独立试听入口或自动试播。客观题判答反馈，自评仅在成功保存记得／忘记时反馈，模糊不播放；回看／重复提交无额外声音。

当前Staging `251aa594`，主文件 `main-B2r8n1zY.js`，https://staging.kotobud.com/app/#/settings 与 https://staging.kotobud.com/app/#/scenes 。13项定向检查及Web／Worker类型和构建通过，桌面／390内容设置截图复查；最终隔离Edge三个fresh guest上下文核对冷开场景、真实源词、正误音／切换与音量／静音／双击，仅对照未评分。17个线上资源（含8个WAV）完整哈希匹配，生产仍为 `ea8a4235`／`main-Cjg17Pae.js`。[第二十一轮交付](../../kotobud-review/round21-2026-10-11/DELIVERY.md)。

修复词书并发读取被误报失败及与后台本机提交相撞：共享同账户同书的待完成请求，读取提交前等待现有写入。8个静态音效合计197,152字节，无新增R2占用；Worker仍为27f189输入题兼容版，无新依赖／SQL迁移／门禁／其他客户端发包。该轮先在Staging验收；功能随后连同兼容Worker随Web v0.8.0于2026-10-12发布正式站，详见[生产交付](../../kotobud-review/production-2026-10-12/DELIVERY.md)。

## 2026-10-11 第二十轮 Web 输入练习 / 通用词典（Staging 验收记录，已并入 Web v0.8.0）

Models保持旧ExerciseType，扩QuizType为Choice / Input；core.choiceQuestion只生成旧选择题，Web prefs / session允许kana-input / dictation。KanaInputQuestion与规范化服务处理IME、实际输入评分，Study保存options[]真实attempt，原FSRS / 断点 / 完成 / Stats / 重练接入；完成页客观区称答题结果。词典service有限分片 / 缓存 / 词形读音配对，Search独立结果 / 来源，按pair收藏personal-dictionary、保留senses和用户编辑，不写学习记录；短义整理分号，全文折叠，空读音可收藏学卡片、空释义不伪造。

Staging `823b600d`，主文件 `main-Dae8b5rD.js`，https://staging.kotobud.com/app/#/search 。37项检查 + 最后5项预览、Web / Worker类型与构建通过；最终隔离Edge输入 / 成败音频桩 / 续学 / 统计重练、实际词典与收藏 / 原入口通过，1440 / 390无溢出或页面错误。12个资源与305词典分片线上哈希匹配，生产保持 `ea8a4235` / `main-Cjg17Pae.js`。[第二十轮交付](../../kotobud-review/round20-2026-10-11/DELIVERY.md)。

WorkerSyncClient第四参数默认false、Webtrue发送includeInputQuizzes；准备脚本先生成e874再仅改pull.quiz序列化，不改auth / SQL / 资产路由，Worker SHA `27f189e1621c6e8c398a54b077eb8c280524b5931366056dd93b527ddf46543a`。旧Mini仅接受3种非空选项，通过默认pull省略新quiz明细保持评分 / FSRS；完整新元数据仅给支持客户端。Helper与请求体合成验证通过，未做认证线上同步实测。该轮先在Staging验收；Web v0.8.0于2026-10-12沿用该兼容Worker发布正式站，无新增依赖、音频、SQL迁移或门禁。其他端未发包，个人内容仍本机与文件迁移。详见[生产交付](../../kotobud-review/production-2026-10-12/DELIVERY.md)。

## 2026-10-11 Web 品牌更新（Staging 验收记录，已并入 Web v0.8.0）

已将认可的“言 × 芽”图标与 Kotobud 字标整理为固定轮廓 SVG，并更新 Web 学习应用、公共网页页头／页脚、图章及 favicon／安装图标。字标仅 K 大写，沿用小写 b 芽叶。共用 BrandLogo.vue 与 brand.css，品牌轮廓不依赖系统字体。

当时 Staging 为 1061e20b，入口 https://staging.kotobud.com/ 与 https://staging.kotobud.com/app/#/ 。独立 Web／Worker 类型和构建、24 项静态导航检查通过；桌面及 320／375／390px 品牌布局检查通过，320px 导航溢出已修正。67 项线上资源与最终构建核对一致（HTML 的既有 noindex 插入已规范化）。Worker 保持原审核版本，不更新其他客户端或学习／同步数据；该品牌更新已并入 Web v0.8.0 并于 2026-10-12 发布正式站。详见[品牌交付](../../kotobud-review/web-brand-update-2026-10-11/DELIVERY.md)及[生产交付](../../kotobud-review/production-2026-10-12/DELIVERY.md)。



## 2026-10-11 第十九轮 Web 学习入口（Staging 验收记录）

BookStudyEntry复用dailyStudyPlan真实目标与study-plan-preference，显示计划 / 本书resume / 完成 / 无新词四态；Book仅本书bookIds包含于未完成checkpoint时调用continueLearning，改pace不会重写checkpoint。nextUnlearnedLesson以实际课程顺序与当前 / 本机状态找到有未学且未忽略词的课次，不修改输入；定位只选中目标、滚动并聚焦复选框。原批量工具移入native details，手动学习和例句填空仍保留，启动动作有本地busy反馈和路由守卫。

当前Staging `00a06241`，入口 https://staging.kotobud.com/app/#/books/biaori-beginner-upper ，主文件 `main-CIifNm8T.js`。4项新helper检查 / 3项旧daily-plan检查、Web / Worker类型及Web构建通过；最终隔离Edge核对半 / 全课实际计数、原队列续接、他书scope、仅选课无写入、全 / 反 / 范围 / 手选、当日锚点、空自建书、44px目标和1440 / 390无溢出或页面错误，手机定位不与sticky底栏相交。6个不重复资源（JS / CSS及工作区已有字标SVG）线上完整哈希匹配，生产仍为 `ea8a4235` / `main-Cjg17Pae.js`。详见[第十九轮交付](../../kotobud-review/round19-2026-10-11/DELIVERY.md)。

复用独立Web构建及兼容Worker e874，只发布Staging，等待用户验收；没有新增音频、同步协议、依赖或门禁。构建沿用已有品牌文件，本轮未覆盖这些工作区改动。编号pages.dev现有301跳生产，验收使用Staging域名，未发布其他客户端。

## 2026-10-11 第十八轮 Web 完成页反馈（Staging 验收记录）

SessionSummary从本次已处理队列 / 起始reviewCounts / 最新有效保存日志聚合，增加完整newWords / reviewWords，以及分别统计的quiz / self。同时间日志按更高reviewCount取最新，重复事件 / 词和无效日期不多算；原recap与weakPracticeSuggestions保留。practiceWords移除5词上限，并包含有效客观false结果。组件分组预览 / 原生details展开，单独显示选择题与自主评分，完整源词ID重练沿用现有startFocusedPractice和题型。跳过词不计学习收获，不修改Data / 日志或云同步格式。

当前Staging `800a38f9`，入口 https://staging.kotobud.com/app/#/ ，主文件 `main-DuMh65ib.js`。5项新服务检查、4项既有相关检查、Web / Worker类型及Web构建通过；隔离Edge完成 / 展开 / 7词重练 / 双击守卫 / 纯卡片 / 回到今日通过，1440px / 390px无横溢出 / 页面错误。6个不重复相关资源线上完整哈希与构建匹配，生产仍为 `ea8a4235` / `main-Cjg17Pae.js`。详见[第十八轮交付](../../kotobud-review/round18-2026-10-11/DELIVERY.md)。

复用独立Web构建及兼容Worker e874，仅Staging，用户已授权继续第十九轮。部署编号pages.dev域名沿用301跳生产，使用Staging域名验收。没有新增音频、依赖、同步协议或门禁，未发布其他客户端。

## 2026-10-10 第十七轮 Web 用法内容（Staging 验收记录）

新增独立learning-usage目录 / 精确词形读音服务与UsageNotes组件，16条正反用法、32个实际目录forms。WordDefinition揭晓后短搭配和折叠对照，开关读音 / 翻译；没有例句及show-example=false的填空揭晓也显示用法，提供独立控件。未匹配仍保留原context搭配和tip。Word / 例句 / cloze答案 / 私句 / 笔记 / FSRS或云同步不写改，匹配区分同形异读；控件有scroll-margin，原sticky评分结构保留。

当前 Staging `c3ff11d0`，入口 https://staging.kotobud.com/app/#/books/biaori-beginner-upper ，主文件 `main-DXq95EPN.js`。4项实际词形 / 互指 / 规范化 / 区分 / 只读内容检查、Web / Worker类型和Web打包通过；隔离Edge经典卡片正反 / 开关 / 折叠 / 旧内容及唯一原ID评分通过，最终独立显示修订补N5入る无例句与借词填空用法，1440px / 390px布局、原生控件可用且无页面错误；8个线上相关资源完整哈希与构建匹配，生产保持 `ea8a4235` / `main-Cjg17Pae.js`。详见[第十七轮交付](../../kotobud-review/round17-2026-10-10/DELIVERY.md)。

继续使用独立Web构建和兼容Worker，仅Staging，用户已授权继续第十八轮，未更新其他客户端或音频资产。发布曾因OAuth续期连接超时失败，临时CLI继承既有Windows本机代理后成功；后续连接问题先检查运行时是否沿用用户已启用的代理，不改认证权限或系统配置。

## 2026-10-10 第十六轮 Web 题型反馈（Staging 验收记录）

Stats的近7 / 30天开关与新PracticeFeedback组件联动，限定当前词书 / 当前账户 / 当地日历窗口，去重有效日志；客观正确率按quiz.isCorrect，猜对但rating2不计作错误，无quiz的自主评分单独分类。每词每题型最新false且未忽略才可重练，使用已有startFocusedPractice和明确QuizType，不改原词 / 书选择 / 标记；未载入内置原词先ensureBookLoaded后重新取候选，不可定位的历史词给出说明及词书入口。原有统计图表 / 弱词 / 抽屉保留。

当前 Staging `9285bd9b`，入口 https://staging.kotobud.com/app/#/stats ，主文件 `main-DeuZOnBX.js`。8项服务检查、Web / Worker类型和Web打包通过；隔离Edge7/30 / 候选过滤 / 源词题型 / 评分前无数据变动 / 刷新接续 / 保存一次后候选退出及自评独立 / 空状态通过，1440px / 390px无横溢出、页面错误、重练控件与宠物碰撞。8个线上相关资源完整哈希与最终构建一致，生产保持 `ea8a4235` / `main-Cjg17Pae.js`。详见[第十六轮交付](../../kotobud-review/round16-2026-10-10/DELIVERY.md)。

只更新Web Staging，沿用独立Web构建和兼容Worker，无Data或同步协议改动、新依赖或音频上传。用户已授权继续第十七轮，进度见上文；第十六轮未发布生产或其他客户端。

## 2026-10-10 第十五轮 Web 学习起点（Staging 验收记录）

新增 `/start`，Home为无学习记录 / 无未完成会话用户显示可跳过轻提示，常驻链接与Settings“学习起点”可再次进入。起点服务复用内置book IDs / 元数据，教材和JLPT选择按每书半课 / 一课（组）节奏，开始复用 `startDailyLearning`，既有进度接续每日计划；选择本身不改当前书 / 进度 / 会话。日常用语链接现有专题和搜索；旧会话可 `continueLearning`。引导偏好按当前账户存本机，不改Data或同步协议。

当前 Staging `25277521`，入口 https://staging.kotobud.com/app/#/start ，主文件 `main-BL4jkcwv.js`。8项服务检查、Web / Worker类型和构建通过；隔离Edge跳过 / 刷新 / 重开 / 元数据对应的半课29与N5整组50 / 原词ID / 续学 / 既有进度显隐通过，无页面错误。最后模板 / CSS修订避免全局mobile nav样式作用于方向控件、把CTA和节奏控件移离宠物；最终1440px / 390px位置 / 导航 / 无遮挡 / 无横溢出检查通过。11个线上资源完整哈希与最终构建一致，生产仍为 `ea8a4235` / `main-Cjg17Pae.js`。详见[第十五轮交付](../../kotobud-review/round15-2026-10-10/DELIVERY.md)。

仅更新Web Staging，沿用独立Web打包和兼容Worker，无新依赖或音频上传；用户已授权继续第十六轮，进度见上文；第十五轮未生产发布或其他客户端打包。

## 2026-10-10 第十四轮 Web 个人词库文件迁移（Staging 验收记录）

设置数据面板导出个人词库包，合并入口指向现有 `/import?mode=file`。格式包含自建Book / Lesson / Word及原句、内置词原句源ID引用；不包含states / logs / userSettings。文件模式区分普通CSV / JSON词表和词库包，提供新增 / 已有数量预览、保留本机或采用文件的明确选择及完成反馈。当前账户事务合并，稳定源ID、重复无复制，原句合并不覆盖教材用例，本机额外内容、学习记录及当前书保留。

当前 Staging `95ec258b`，入口 https://staging.kotobud.com/app/#/settings ，主文件 `main-R88ChHZv.js`。9项定向检查、Web / Worker类型及Web打包通过；双独立临时Edge和合成guest数据验证下载 / 两种合并 / 重复 / CSV兼容 / 记录与内置例句保留，设置和预览1440px / 390px无文档级横溢出、无页面错误；10个线上相关资源完整哈希与构建匹配，生产保持 `ea8a4235` / `main-Cjg17Pae.js`。详见[第十四轮交付](../../kotobud-review/round14-2026-10-10/DELIVERY.md)。

本轮为文件迁移，未扩展自动云同步协议；复用独立Web构建和兼容Worker，无新依赖或迁移。用户已授权继续第十五轮，进度见上文；第十四轮未发布生产或其他客户端。

## 2026-10-10 第十三轮 Web 生活场景专题（Staging 验收记录）

从词书页“生活场景”进入三组购物 / 点餐 / 问路专题，各8个原词、原创场景例句及小对话。专题练习复用源词ID和评分，专题例句只作为当前显示 / 填空上下文，不写入原词例句。Web study-session增加可选sceneId，刷新 / 首页续接保留场景和游标，完成页返回更多场景；忽略词不进入队列，普通学习保持原样。

当前Staging `f2ef3a2e`，入口 https://staging.kotobud.com/app/#/scenes ，主文件 `main-Cmd0Pp94.js`。9项相关检查、Web / Worker类型及Web打包通过；隔离Edge三专题 / 整轮购物 / 刷新首页续接 / 完成页 / 普通学习 / 忽略词流程通过，1440px / 390px专题详情无横溢出，无页面错误；12个相关线上JS / CSS与最终构建完整哈希匹配，生产仍为 `ea8a4235` / `main-Cjg17Pae.js`。详见[第十三轮交付](../../kotobud-review/round13-2026-10-10/DELIVERY.md)。

沿用独立Web构建与兼容Worker，不更新其他客户端。原句收藏按用户要求保持现状；设备朗读不上传音频，日计划无新增固定词数限制。用户已授权继续第十四轮，进度见上文；第十三轮未生产发布。

## 2026-10-10 第十二轮 Web 阅读原句收藏（Staging 验收记录）

查词结果增加原句收藏，保存句子、选填译文及来源，绑定源词条ID并原子设置生词标记；教材例句 / 已有笔记 / 学习记录保留。同句同来源去重，重复收藏保留未填写的选填项；查词及生词本可修改 / 移除，学习详情只读回看原句，继续显示“用例展示”。源词书重载保留Word的可选readingContexts字段。

Staging `8aab8d85`，入口 https://staging.kotobud.com/app/#/search ，主文件 `main-Cnvb-jg-.js`。8项相关检查、Web / Worker类型及Web构建通过；最终构建隔离Edge保存 / 刷新 / 去重 / 内容保留 / 编辑 / 学习评分 / 移除留进度流程通过，Search / Lists / Study在1440px / 390px均无横向溢出，无页面错误。13个相关线上JS / CSS与最终构建完整哈希匹配，生产仍为 `ea8a4235` / `main-Cjg17Pae.js`。详见[第十二轮交付](../../kotobud-review/round12-2026-10-10/DELIVERY.md)。

只更新Web；原句保存在本机账号词条，不包含自动网页采集、跨设备原句同步或私句填空。复用上一轮review中的Web专用构建流程，不修改其他客户端。用户已要求原句入口先保持现状并授权继续第十三轮；第十二轮未生产发布或其他端打包。

## 2026-10-10 第十一轮 Web 词形识别（Staging 验收记录）

查词补充已有词条的基础活用匹配，兼容标日ます形 / JLPT辞书形；直接精确结果优先，活用结果显示原形候选和形式，保留读音及词书身份。源词的汉字 / 片假名写法保持，收藏保存原词条 ID。搜索增加「食べました」「行った」「高くなかった」例子入口。

Staging `3a33c0b7`，入口 https://staging.kotobud.com/app/#/search ，主文件 `main-D3389qPC.js`。20项相关检查、独立Web类型 / Worker类型及Web打包通过；隔离Edge查询 / 同音候选 / 经典日中检索 / 原词收藏 / 查询不写学习记录通过，1440px / 390px无横向溢出，无页面错误。8个相关线上JS / CSS与最终构建完整哈希匹配，生产仍为 `ea8a4235` / `main-Cjg17Pae.js`。详见[第十一轮交付](../../kotobud-review/round11-2026-10-10/DELIVERY.md)。

首次通用构建被工作区的小程序类型错误打断；本轮使用 `../kotobud-review/round11-2026-10-10/build-web-preview.mjs` 和 `tsconfig.web.json` 独立检查Web与依赖并复用既有打包步骤，没有修改其他客户端。范围限已有词条的基础活用；用户已授权继续第十二轮，阅读原句收藏进度见上文。第十一轮未生产发布或其他端打包。

## 2026-10-09 第十轮个人词库编辑（Staging 验收记录）

按最初计划的“个人词库资产”阶段推进，自建词书详情提供“编辑词表”：逐词添加 / 修改、Excel / CSV 多行粘贴、已有或新建课次、预览及重复 / 行级错误反馈。修改保留词条 ID、学习状态、评分日志和续学位置；空词书直接打开添加入口，手机编辑时不显示选课底栏。

入口反馈修订：词书页“带上你的词书”与顶部“添加词书”统一进入 `/import`，默认“自己整理”。创建后同页复用个人词库编辑器，模式切换保留内容和输入；“文件导入”保留 CSV / JSON 预览及导入流程。现有词书详情仍可修改词表。

当前 Staging `d4a0bbbc`，入口 https://staging.kotobud.com/app/#/ ，主文件 `main-DMAfheWN.js`。主体编辑7项检查已通过；本次 Vue / Worker 类型、Cloudflare 构建及隔离 Edge 添加 / 粘贴 / 模式切换 / 书页编辑学习 / CSV 导入流程通过。初始及已创建界面在1440px / 390px无横向溢出，手机创建按钮不被底栏遮挡；13个相关线上 JS / CSS 完整哈希与最终构建匹配，生产仍为 `ea8a4235` / `main-Cjg17Pae.js`。详见[入口整合交付](../../kotobud-review/round10-entry-2026-10-09/DELIVERY.md)；[主体功能验收](../../kotobud-review/round10-2026-10-09/DELIVERY.md)。

词条内容仍保存在当前设备的账号分区，未新增个人词库内容跨设备同步。用户已授权继续第十一轮，词形识别进度见上文。第十轮未发布生产、Windows、小程序或扩展。

## 2026-10-09 第九轮词书校正（Staging 验收记录）

已发布 Staging `90580c5d`，主文件 `main-DvYEb2ue.js`。14 处源词形/读音/释义差异定点校正，旧缓存读取和保存后的显示同步校正，新旧例句键兼容。词条 ID、课次位置、学习历史不变；六册仍为 9,117 / 9,117 可填空。8 项对应检查、类型/构建及旧缓存受控浏览器场景通过，14 个线上资源与14个正文修正位置匹配。详见[第九轮交付](../../kotobud-review/round9-2026-10-09/DELIVERY.md)。

第九轮校正已并入第十轮当前测试版本。没有增加音频资产或整库迁移，未发布其他客户端。

## 历史记录：2026-10-09 Web 更新已发布生产

用户已明确批准生产发布，直接将已验收的 Staging 构建发布至生产 `ea8a4235`，入口 https://kotobud.com/app/#/ ，主文件 `main-Cjg17Pae.js`。20 个关键资源与验收版本逐项匹配，正式站首页/应用/下载/日志 HTTP 200；独立匿名 Edge 单册学习与刷新续接检查通过，无页面错误。未重新构建、未改应用代码或重复整轮回归。标日六册 9,117 词例句/填空与前续 Web 更新均已上线，用例朗读新增音频桶占用为零。详见[生产交付](../../kotobud-review/production-2026-10-09/DELIVERY.md)。

本次只发布 Web；其他客户端未重新打包发布。下一轮可优先校正已记录的源词书表记/读音/释义差异，后续仍先测试环境、按用户批准推进。

## 2026-10-09 第八轮标日例句完整覆盖（Staging 验收记录）

已发布 Staging `891486d8`，主文件 `main-Cjg17Pae.js`。新增 8,132 个用例键，标日六册实际填空覆盖为 9,117 / 9,117（初级上 1077、初级下 1073、中级上 1748、中级下 1907、高级上 1806、高级下 1506）。新增内容按当前词书加载，首页不预载；原有五组例句逐项保留。25 项针对性检查、类型/构建、本地与真实 Staging 六册浏览器流程通过，20 项线上资源匹配，生产未变。用例朗读使用设备声音，新增音频桶占用为零。详见[第八轮交付](../../kotobud-review/round8-2026-10-09/DELIVERY.md)。

标日全量任务已完成，三个作者及独立尾片已合并；不再续派例句生成。源词书少量表记/读音/释义差异已记录，建议下一轮优先校正。下一产品轮次等待用户验收，不发布生产或其他客户端。

## 2026-10-09 第七轮用例朗读（历史状态快照）

已部署 Staging `3207472b`，主文件 `main-BdQWJwu3.js`。揭晓后的用例与填空原句可正常、慢速朗读和停止，使用设备日语语音，新增音频存储桶占用为零。20 项相关检查、类型/构建和隔离 Edge 操作验证通过，9 项线上资源匹配，生产未变；真实设备音色未试听。详见[第七轮交付](../../kotobud-review/round7-2026-10-09/DELIVERY.md)。

用户明确允许主代理在三个 Luna 补写标日例句的同时继续推进工作。标日草稿尚未接入应用，上线覆盖仍为 915/9117 词位置；正在准备分书加载，全部完成后逐册核对真实填空覆盖再发布测试环境。

## 2026-10-09 第六轮 UI 与标日全量补写（历史状态快照）

UI已部署Staging 0e0c38d4，main-ChbdaSPK.js。新增本机默认学习方式，新开始采用、继续保留原题型，完成页重练保持当前题型；15项相关检查、类型/构建及真实Edge流程通过，7项线上资源匹配，生产未变。详见[第六轮交付](../../kotobud-review/round6-2026-10-09/DELIVERY.md)。

用户已明确允许最大并发补齐标日六册：目前上线覆盖915/9117词位置，缺8202，去重8132键。三个Luna分片（2711/2711/2710）独立写 learning-examples-biaori-part1/2/3.json，按200键子回合持续推进；新文件尚未进入应用。全量完成后必须集成并逐册核对真实可出题覆盖，不能把局部或仅文件存在称为全量覆盖。

## 历史记录：2026-10-08 第五轮 Web Staging

用户已批准第五轮，仅补齐 N1–N5 第四至第六组例句缺口，不增加功能。新增 693 条（N5 112、N4 135、N3 148、N2 150、N1 148），共匹配 1,705 个词键；各级前六组均为 50/50，合计覆盖 1,500 个词位置，旧例句值逐项一致。

类型检查和 Cloudflare 构建通过。Staging 部署 115a6360，入口 https://staging.kotobud.com/app/#/ ，主文件 main-Dk2iYR6p.js。隔离 Edge 的真实 N1 第四组队列、一次评分、刷新续接及“无题目覆盖”说明正常；1440px / 390px 检查正常，pageerror 为 0。尚未生产或其他端发布；未改功能、未加门禁，也未跑全量回归。语料为原创模型内容并经部分抽查，非全库/全量人工审校。语料包 513.89KB（gzip 158KB），首页未加载全包，后续可评估分包优化。证据见[第五轮交付](../../kotobud-review/round5-2026-10-08/DELIVERY.md)。

## 2026-10-08 第四轮 Web Staging（历史状态快照）

用户已批准第四轮；因进度反馈，本轮仅补齐例句，不增加功能。新增 579 条（N5 96、N4 127、N3 127、N2 100、N1 129），合计匹配 1,012 个词键，旧例句字段保持不变；N1–N5 每本书前三组各 50/50 个词有例句，共 750 个词位置。

Cloudflare 构建含类型检查通过。隔离 Edge 真实 N1 第一组的 50 词练习队列、一次评分及刷新续接，以及 390px / 1440px 检查均通过，`pageerror` 为 0。Staging 部署 `276f0ac0`，入口 https://staging.kotobud.com/app/#/ ，主文件 `main-tLE1d_Ew.js`。Web 0.7.4 仍为候选；没有生产或其他客户端发布、额外门禁或全量回归。少数例句经主代理抽查，非全量人工审校；“あんまり”改为自然副词用法，参考[小学馆数字辞泉](https://kotobank.jp/word/%E4%BD%99%E3%82%8A-427212)。证据见[第四轮交付](../../kotobud-review/round4-2026-10-08/DELIVERY.md)。第五轮等待用户批准。

## 2026-10-08 第三轮 Web Staging（历史状态快照）

用户已批准继续第三轮并授权 Luna 原创例句。N1–N5 每级新增 60 组，共 300 组；现有匹配键总数为 433（原有 133）。当前 Staging 部署 `89187940`，入口 https://staging.kotobud.com/app/#/ ，主文件 `main-CUoOZl8a.js`，独立 Pages 地址 https://89187940.kotoba-iuz.pages.dev。各书覆盖数和隔离 Edge 验收记录见[第三轮交付](../../kotobud-review/round3-2026-10-08/DELIVERY.md)。

Book 仅将所选课次中有例句的词加入新练习，并显示可练词数及无例句说明；完整自带例句只有在原词直现时才可填空，读音身份保持。Study 展示覆盖数，答案区移除重复例句，手机长句按自然行宽显示。17项定向功能检查、类型与 Cloudflare 构建通过；未发布生产或其他客户端，第四轮须用户批准后启动。

## 2026-10-08 第二轮 Web Staging（历史状态快照）

第一轮已由用户查看并确认，用户明确授权继续第二轮。当前 Staging 部署 `35c7c793`，入口 https://staging.kotobud.com/app/#/ ，主文件 `main-CuCT7_hQ.js`。例句填空仍限于原有 133 个 `term|reading` 匹配词键，未扩充语料、不支持全量词条；具体功能与原验收记录见[第二轮主体交付](../../kotobud-review/round2-2026-10-08/DELIVERY.md)。统计页依据当前词书近 30 天评分和已有生词标记，提供直接巩固入口；巩固可包含尚未到期词，刷新保留选词与模式，不会自动新增生词标记。Web 0.7.4 仍是候选版本。

本轮验收反馈将词典释义入口改为整行展开，标题与说明分层，右侧采用深绿下划线文字及 Lucide ChevronDown，并保留原生展开 / 收起行为；完成页不再提供“上一个”，学习中的上一词回看仍可用。构建含类型检查通过。隔离 Edge UI 检查覆盖原生词典展开 / 收起、桌面 / 390px、完成页无回看按钮以及学习中保留回看，`pageErrors` 为空；结果和截图见[反馈修订交付](../../kotobud-review/round2-feedback-2026-10-08/DELIVERY.md)。这次视觉修订的交付与截图见[词典释义入口视觉修订交付](../../kotobud-review/dictionary-entry-2026-10-08/DELIVERY.md)。当前 Staging 主入口及 5 项学习页相关资源 GET 字节 / SHA-256 与构建匹配，生产主入口及原哈希未变。没有生产发布，也没有 Windows、小程序或扩展发布；生产主文件仍为 `main-B8wcAEg9.js`。用户本轮是验收反馈，第三轮需用户批准后再启动。

## 2026-10-08 第一轮产品更新（历史状态快照）

测试部署c195d9de：https://staging.kotobud.com/app/#/ ，主文件main-bxwMzBwd.js。首页改回数字主视觉，设置可选今日待学／待复习／词书进度；每本词书可选半课或1课/天（JLPT对应分组），今日待学按计划和当天进度计算，固定10词停顿已取消。新增108组例句/搭配和28条提示，用例展示及简明JLPT释义优先，完整义项可展开。

32项相关检查、类型、Cloudflare构建通过；线上9项关键资源匹配，首页已实际查看，最终使用原Vite7.3.6构建。生产仍为main-B8wcAEg9.js，没有生产发布、迁移或其他客户端打包。本机显示和计划偏好不进入云同步。按用户要求，确认本轮Staging之前不开始第二轮。详见[第一轮预览说明](../../kotobud-review/round1-2026-10-08/DELIVERY.md)。


## 历史记录：2026-10-07 已发布 Web 生产与门户分端入口

按用户明确批准，最终续学与封面 Staging 构建已提升到 Web 生产，部署 `84e96024`，https://kotobud.com/app/#/ ，主文件 `main-B8wcAEg9.js`，SHA-256 `de31f30dbe22807bc483a5f6654187a41cbb448692ced1a837ecd471463eb5e9`。首页准确恢复本机词级会话，下方词书仍为选课入口；首次升级按最近课次回退，完整会话位置不跨设备同步。旧词条 / 评分 / 日志 / 数据库与同步结构保留，使用原兼容 Worker，没有迁移或微信登录启用。

补齐 `CHANGELOG.md` 与官网 `/changelog`，按 Web / Windows / 微信小程序 / 浏览器扩展区分状态。Web 当前 0.7.4；Windows 下载维持 0.7.3、未打包新版本。门户增加 `/download#extension` 的 0.2.3 手动安装测试 ZIP 与校验码（原包 1,027,042 bytes / SHA-256 `15f2b2b3a3a611909254ea825f357fb6f6224355a10730229ccba498973c1194`），不是商店发布。`/guide#extension` 提供安装与保留原扩展 ID 升级步骤；`/guide#miniprogram` 说明本地候选 / 未上传提审状态和待开放使用步骤。

门户 45 项回归、本地及生产三种宽度检查通过；35 项应用 / 数据文件与原验收构建一致，43 项线上 GET 完整内容匹配，ZIP HEAD 的长度 / 附件 / 类型、原 Windows 下载与 sync status 均正常。生产隔离游客续学 / 刷新 / 下方选课 / 同一封面通过，不操作真实账号，API 写请求为 0；其他端 107 源文件哈希不变。详细报告、脚本与截图：`../kotobud-review/web-production-changelog-2026-10-07/DELIVERY.md`。以下为历史状态。

## 历史记录：2026-10-07 首页续学位置与封面（Staging）

首页主按钮直接恢复上次本机未完成词与原范围/模式/方式，刷新后能继续；下方词书入口保留 `/books/:id` 选课，封面使用列表同一 BookCover 和内容主题，按首页小尺寸排版。旧版本没有游标，首次按最近课次可学词直接开始；以后新会话按账号保存本机位置，不作为云同步字段。恢复不写评分/日志，跳过已处理/忽略词，重置进度清旧游标，账号和过期操作隔离。词书已完整加载时直接启动，失败留选课页，不误进入旧队列。

14 文件 / 122 项、根 Vue/Worker 类型、构建/diff 通过；实际本地/Staging隔离游客中国人→日本人、导航/刷新/方式恢复、下方选第二课为本、共享 SVG 和 390/320px 验证通过，记录不重复、无 API 写/pageerror。其他客户端/共享包 107 源文件哈希不变，无其他端构建或数据迁移。

最终 Staging `cdfeac1a`，入口 https://staging.kotobud.com/app/#/ ，主 `main-B8wcAEg9.js` / SHA-256 `de31f30dbe22807bc483a5f6654187a41cbb448692ced1a837ecd471463eb5e9`；33 资源匹配，HTML包含精确验证的测试 noindex 注入。生产仍旧主文件 `main-kjEk8pMM.js` / SHA-256 `196370ba92b63458ecc5663cb5dbdf052f12b7efc729126af382f9f0355918d0`，没有生产发布。证据 `../kotobud-review/web-home-resume-2026-10-07/DELIVERY.md`。以下保留历史交付状态。

## 2026-10-06 扩展 0.2.3 候选（本轮新增）

扩展已按用户授权加入 11 册 / 16,926 词、JLPT 稳定 ID / 双声、完整书名/原创封面、只读上一词和三种统计图/当前书进度。导航为“今日 / 词书 / 生词本 / 统计”，复习在生词本快捷入口，右上角设置及既有账号/队列合同保留。14 文件 / 100 项、类型/构建/无 DOM 后台门禁通过；原生隔离 Edge 加载/消息/IndexedDB、评分/回看/刷新、三图/抽屉、窄屏和减少动态验收通过。没有读取真实账号；Chrome、实际侧栏窗口/右键菜单与原用户升级仍待验收。

ZIP `apps/extension/release/KotoBud-Extension-0.2.3.zip`，1,027,042 bytes，SHA-256 `15f2b2b3a3a611909254ea825f357fb6f6224355a10730229ccba498973c1194`；覆盖原目录再重载，保留原扩展 ID / 数据。具体功能、实际原生校验中修复的评分兼容问题及证据见 `../kotobud-review/extension-update-2026-10-06/DELIVERY.md`。未商店提交或更改 Web/Windows 生产，其他客户端与共享包 134 源文件哈希保持。

## 历史记录：2026-10-06 Web 生产发布

用户已明确批准 Web 生产。既有 Staging 构建成功提升为 Pages 部署 `81e53f13`（https://81e53f13.kotoba-iuz.pages.dev），正式域 https://kotobud.com/app/ 与 Staging 同为 `main-kjEk8pMM.js`，SHA-256 `196370ba92b63458ecc5663cb5dbdf052f12b7efc729126af382f9f0355918d0`。33 项引用资源/11 册教材/目录/来源页面完整 GET 字节与哈希匹配；`/api/v1/sync/status` 200、D1 bound。独立 Edge 游客五册新增词双声 10/10 完整 GET、哈希、解码与播放；实际学习页 10/10 播放切声及 5 册慢速通过，无 pageerror。技术验收不能当作全部词语听感审校或真实账号同步验收。

发布复用原静态产物与共享 R2，未新增音频上传。`prepare-web-only-production-worker.cjs` 得到兼容生产 Worker SHA-256 `e874e52bf2564210b767dd01dfcac0c4aaa6f2388ea75e80d96f30f3867b4806`，保持旧认证/同步合同及 Windows 下载路由；未 D1 迁移或启用封存微信登录。Staging 未重部署。Web 已包含上一词、原创封面/GSAP反馈/全称、三种图表/抽屉/当前书阶段及五册 JLPT 双声。

小程序已准备本地 Staging API 候选，见小程序交接；Windows/扩展未构建发布，Git 未提交/推送。最新证据和候选 ZIP 见 `../kotobud-review/web-production-mini-2026-10-06/DELIVERY.md`。下文的生产未发布等表述为各日期历史快照。

## 2026-10-05 JLPT 发音补齐（历史 Staging；全量验收通过）

复用此前 Google WaveNet 女声 A、男声 C 和 SSML 读音参数。JLPT五册7809词均有双声：原有3433词复用，缺失4376词补生成8752个MP3（59297088bytes）。Luna子代理完成8752/8752增量对象上传或内容一致复用。本地映射13412对，旧9036条映射保持一致；新计划与旧键重合0。

全量R2对象26824个/198059712bytes与本地逐个MD5/长度一致。旧18072本地音频SHA256/长度、旧18072远端对象ETag/长度及旧映射未变；15618/15618条JLPT公网音频地址通过，问题0。初次HEAD长度检查异常项4578条均经HEAD复验和GET完整内容SHA256/长度确认，原始失败与复验结果保留于审计目录；验收脚本已处理缺失HEAD长度信息。隔离Edge五册新增词双声10/10解码与播放；实际学习页10/10发音/切声与五册慢速通过，实际来源标签正确、无pageerror。UI测试关闭该全新游客上下文的宠物；技术验收不等于全词人工听感审校。

Web Google→词书/旧打包音频→设备日语语音失败回退，以及取消、声线切换、超时、实际来源标签保护已验证。6文件/70回归、Vue/Worker类型检查和Cloudflare构建通过。部署9a41ef32，main-kjEk8pMM.js；旧六册9117词本地及Staging JSON与基线字节一致，其他客户端/共享模块86个源文件哈希不变。没有词条ID、学习进度或同步格式迁移，没有读取真实用户学习状态。

测试站：https://staging.kotobud.com/app/#/books 。新资源新增到原有共用R2桶；生产前端仍main-BU6POw0t.js且主JS SHA256与操作前一致，没有生产部署、其他端构建或Git提交推送。等待用户试听、验收并明确批准Web生产发布，再推进其他版本。审计与交付：`../kotobud-review/jlpt-audio-2026-10-05/DELIVERY.md`；全量报告 `audio-public-verification.json`、`audio-browser-verification.json`、`pronunciation-ui-verification.json`。

## 2026-10-05 JLPT 词书第一阶段（历史 Staging）

Web Staging 已加入 JLPT N5→N1 五册，共 7809 条，按50词分组；新增教材 / JLPT / 我的词书分类、等级封面和来源下载页，搜索目录接入全部11册，搜索仍只读缓存。新词条使用稳定来源编号，旧六册9117词 ID及公开JSON字节均与操作前一致，原迁移标记不变；独立进度，不自动合并跨书同形词。其他客户端及共享模块86个已记录源文件哈希相同，本轮未构建其他端。

OpenJLPT v0.3.0 固定 commit 0d1d3410bec90bd4098a7c72de820543cb4f707c；ToMoShi 中文来自固定v2026-09-02只读数据库并校验SHA256。41条代理校订，2条N1冲突项隔离；729条仍采用词典首义项且明确记录，不声称全量人类审校。社区等级非官方考纲，数据来源与CC BY-SA4.0归属在 /data/books/jlpt-sources.html 。新增JSON总1188516bytes，gzip6合计337300bytes；按需加载，云端状态/日志结构未改。

11文件/108测试、Vue/Worker类型检查、Cloudflare构建、diff检查通过；隔离Edge验证学习/切书/刷新/搜索不写额外词条、三图及当前书抽屉；1440/390/320px检查无横溢。实际Staging隔离游客学习后1/674刷新保持、无pageerror和API写请求；真实账号云写入本轮未额外验收。

部署 c02cfbb1，main-WRX_SKmm.js；https://staging.kotobud.com/app/#/books 与 staging Pages域名一致。线上目录与十一份JSON逐字节匹配本地。生产仍 main-BU6POw0t.js，没有生产/Git推送/其他端发布。

大家的日本语四册尚未上架：初级Ⅰ/Ⅱ按用户确认第三版，中级Ⅰ/ⅡISBN已锁定于data/wordbooks/minna-targets.json；完整词表和可分发来源/授权未就绪。禁止用第二版冒充第三版或显示空壳。取得数据后再接入Web测试，生产与其他端待用户批准。

交付及证据：../kotobud-review/wordbook-implementation-2026-10-05/DELIVERY.md。依赖曾被误用pnpm搬移，20个包已恢复原目录；部署沙箱目录权限阻止在获批沙箱外staging重试后成功。

## 历史记录：2026-10-05 Web 图表显示修复与当前词书阶段（Staging）

用户反馈统计页只有折线图，实际在其 Edge 浏览器复现：环形图完整内容已渲染，但浏览器的社交分享隐藏规则命中 `.share-panel`，以 `display:none !important` 隐藏整个面板。通过 CSS matched styles 确认来自 user-agent 规则；没有确定是哪个扩展注入，未调整用户的拦截设置。图表改用 `book-composition-panel` 及组件专用类名，在同一 Edge 页面恢复显示。

上一轮没有保留独立条形图，本轮补齐三个带类型标签的面板：折线图展示每日去重词数；水平条形图比较期间「新词学习 / 常规复习 / 难词强化」的评价次数；环形饼图展示期间按词书去重的词汇占比。三图共用 7 / 30 天范围，条形图与总评价使用同一批账号、日期及事件去重过滤后的日志。按 `ui-ux-pro-max` 的趋势 / 分类比较 / 占比建议实现，保留数字列表、键盘操作与折线每日表格；桌面三列、窄屏单列。

按用户补充要求，「记忆的不同阶段」仅显示 `currentBookId` 对应词书的四阶段数量及比例，并展示完整书名与已学 / 总词数。词书阶段按课次、当前账号状态和目录真实词数计算，排除忽略词；切换当前词书或账号后响应更新，没有当前词书时提示先选择。累计指标及三个时间范围图表保留总体统计范围。其 Edge 实际显示日语测试词书：已学 8 / 48，未学习 40（83%）、学习中 8（17%）；本地从初级上册切换到测试词书确认阶段、总词数与默认展开抽屉同步改变。

**11 文件 / 122 项** 相关回归、Vue / Worker 类型检查、Cloudflare 构建及 `git diff --check` 通过。新的回归涵盖学习方式计数、事件过滤、各书阶段及切书 / 切账号更新；环形图拦截发生在用户浏览器的外部样式层，用实际 Edge 的面板可见性检查从失败到通过验证，不把单元测试当成此问题的浏览器验收。实际检查 Edge 2040px、IAB 本地 1440px / 320px 及测试站实际 347px 均无横向溢出；7 / 30 天切换三图可见，30 个日期点，Edge 未捕获控制台 error。

仅发布 Pages **staging**，部署 `965d246f`，入口 [学习统计](https://staging.kotobud.com/app/#/stats)，备用 `staging.kotoba-iuz.pages.dev/app/#/stats`。两个测试域名 HTTP 200、加载 `main-Cuvh0AEy.js`；统计模块 `Stats-DzJ8HvqU.js` / `Stats-BmZM8OJU.css`。应用 noindex meta、测试首页 noindex 响应头及独立 `kotobud-staging-db` 已只读核验。生产仍是 `d8c292a2-d152-4f56-bf2c-c9e7631cf503` / `main-BU6POw0t.js`；其他客户端 131 个源码文件哈希保持一致。没有生产部署、其他客户端重打包或 Git 提交推送。

当前截图与诊断证据在仓库同级 `kotobud-review/charts-fix-2026-10-05/`，其中 `stats-edge-fixed.jpg` 为用户 Edge 的真实页面，`edge-before.json` 含隐藏规则与失败检查，`ui-verification.json` / `staging-mobile.json` 为修复后的可见性及切书证据。仍须用户验收并明确批准 Web 生产发布，之后再推进其他版本。

## 2026-10-05 Web 词书封面与学习统计（Staging 待验收）

沿用用户「先 Web 测试环境，批准 Web 生产发布后再推进其他版本」的范围。本轮六册教材显示全称，如「新版标准日本语初级上册」；Web 的目录初始化、词书详情、首页及查词结果使用一致的名称，教材 ID、词条 ID、评分与同步协议不变。新增原创 SVG 封面：初级上为日常街屋、初级下为电车、中级上为阅读茶桌、中级下为桥梁、高级上为饮食文化、高级下为博物馆；测试词书为书本与嫩芽，自建词书由书名、简介和已载入内容选择主题。插画为 KotoBud 原创封面，未复制参考截图的出版物封面。

应用 `gsap-core` / `gsap-frameworks` 技能，悬浮与键盘聚焦使书本上抬 8px、旋转 -2°；动作可打断并在离开时恢复，matchMedia 上下文在卸载时清理。系统减少动态与应用的「减少动态」均跳过动效，保留边框和焦点反馈。实际核对悬浮后的 transform，以及减少动态时聚焦没有动画样式。

统计 UI 使用 `ui-ux-pro-max` 的时间序列与整体占比建议：7 / 30 天折线图展示每天去重后的学习词数（含复习），并单独显示评价次数；环形图展示期间按词书去重的词汇占比，最多五段，较多词书合并为「其他词书」，同时提供名称、词数与百分比；四阶段记忆分布用堆叠条及数字列表。每天图表点可键盘查看，另有每日数据表，空数据不使用模拟数值。所有新统计只读现有当前账号数据，不新建云表或事件。

课次进度改为原生 details 抽屉，仅 `currentBookId` 对应词书默认展开；用户可独立打开其他词书，换账号或当前词书时重置默认展开。未载入教材使用目录中的真实课次词数，结合账号状态计算已学与忽略数，不再显示 0 / 0，也不为打开统计页批量载入所有教材。桌面 1440px、手机 390px / 320px 核对无横向溢出；320px 的摘要行内部溢出已修复。

本轮 **11 文件 / 119 项** 相关回归、Vue / Worker 类型检查、`build:cloudflare` 与正常仓库配置下 `git diff --check` 通过。浏览器用游客本地记录核对两本书的 2 / 1 词占比为 67% / 33%、时间范围切换、当前书独占默认展开与其他抽屉开关。真实账号跨端与原生其他版本未在本轮验收。

最终部署短标识 **`5d12bded`**，验收入口：[词书](https://staging.kotobud.com/app/#/books) / [学习统计](https://staging.kotobud.com/app/#/stats)，备用域名 `staging.kotoba-iuz.pages.dev`。两处 `/app/` HTTP 200，引用 `main-YAxYZwrb.js`；词书模块 `Books-Bw1WgYY5.js` / `Books-GK4Tcuyi.css`，统计模块 `Stats-BtwLTNfw.js` / `Stats-xSTrubBM.css`。应用含 noindex meta、测试首页有 noindex 响应头，Preview DB 仍为独立 `kotobud-staging-db`。生产部署 `d8c292a2-d152-4f56-bf2c-c9e7631cf503` 和 `main-BU6POw0t.js` 保持不变，其他客户端 131 个源码文件与开始前哈希一致。没有生产部署、其他客户端构建或 Git 提交推送；下载保留已发布 Windows 0.7.3。

实际截图、技能查询依据、验收步骤及公网核验存于仓库同级 `kotobud-review/library-stats-2026-10-05/`；当前测试构建包含上一节的「上一个」回看能力。

## 2026-10-05 Web「上一个」回看（Staging 待用户验收）

用户批准先修改 Web 测试环境；只有用户验收并明确批准 Web 生产发布后，才推进 Windows、小程序与扩展。当前仅更新 Web 源码、相关测试和交接记录，没有生产部署或其他客户端构建。本轮前后的其他客户端 131 个源码文件哈希一致；Web 为 Windows 共用渲染层，后续重打包时会包含该能力，当前已交付的 Windows 包仍保持原版本。

学习卡片下新增「上一个」。首次无历史时禁用；评分或忽略成功后可连续回看本轮已处理词，直接显示释义并可播放发音，回看不再次评分、推进学习队列或计入统计。通过「返回当前词」恢复原卡片揭晓状态、测验选项、已选答案与「不确定」状态，回看时间从当前题计时中排除。完成页也能回看最后一词并返回完成页。历史仅在本次页面会话保存；换队列、换账号、离页或刷新时清空。保存中禁用导航；迟到评分和音频回包均有会话保护。手机回看导航保持在可视区域，按钮高 44px。

相关回归 **8 文件 / 100 项通过**，根 Vue 类型检查、`build:cloudflare`（含 Worker 类型检查）和 `git diff --check` 通过。浏览器实测首次禁用、评分后回看、测验答案与不确定状态恢复、刷新清空，桌面 1440px 和手机 390px / 320px 无横向溢出；最终测试页面未捕获控制台 error。真实账号跨端同步与设备发音仍需用户验收，本轮没有执行包含 Staging 合成凭据的全仓实网套件。

已部署 Pages **staging**，部署短标识为 `ea550658`；以测试域名实际资源为准：[Web 测试入口](https://staging.kotobud.com/app/) / [备用入口](https://staging.kotoba-iuz.pages.dev/app/)。两处 `/app/` 均 HTTP 200，加载 `main-DWW0njNU.js`，学习模块 `Study-YSQ-9FYQ.js` / `Study-CuBEBHxG.css`，应用含 `noindex` meta，测试站首页含 `X-Robots-Tag: noindex, nofollow`。Preview D1 确认绑定 `kotobud-staging-db`，与生产数据库隔离。由于既有域名重定向配置，验收使用上述测试域名，不使用不可变部署 URL。

生产仍为部署 `d8c292a2-d152-4f56-bf2c-c9e7631cf503`，`/app/` 加载 `main-BU6POw0t.js`，与本轮修改前一致。实际截图和验收步骤见仓库同级 `kotobud-review/previous-word-2026-10-05/web-staging-delivery.md`。未改生产公告、版本号或下载入口；Windows 链接沿用已发布的 0.7.3。

## 2026-10-03 扩展侧栏整合（0.2.2）

底部统一为「查词 / 学习 / 生词本 / 复习」四入口，词书课次、翻卡、测验、评分、统计和导入全部在侧边栏内完成。移除「完整学习」新标签页入口；旧 learning.html 入口保留兼容，直接进入相同界面的学习标签。账号登录与云同步统一移到右上角设置，底部账号快捷入口也打开设置。

使用 KeepAlive 保留当前轮次、卡片及揭晓状态；离开学习时停止发音、快捷键和计时，返回时刷新当前账号快照。同账号刷新与延迟评分响应增加读取代次保护，账号切换清空旧轮次并隔离过期响应；GSAP 上下文在停用时清理。修复学习初始计时为零的闪动；词书与课次默认折叠，减少窄侧栏滚动。

本轮 **13 文件 / 83 项** 扩展与共享检索回归通过（新增 5 项导航、缓存、账号切换和迟到响应用例）；扩展及根类型检查通过。构建 **16 文件 / 3,072,009 bytes / 9,117 条教材**，静态后台依赖图、CSP 和实际 bundle 无 DOM Worker 的 read / authStatus / 设置 / 收藏 / 评分 / 重读门禁通过。ZIP **633,281 bytes**，SHA-256 `a5da5b6f084809a08873cd1194df2cff9b7bb0b71bd50f470b95225b3f7bb45f`。

H5 开发预览核对侧栏开始学习、翻卡评分推进至 2/10、查词往返以及设置返回继续当前卡片；账号面板只在设置中展示。390px / 320px 无横向溢出，预览无控制台 error。截图 `kotobud-extension-022-settings.png` 是 H5 预览，不能作为原生扩展或真实账号云同步验收。更新时覆盖原解压安装目录后重新加载，保留扩展 ID 与数据；原生 Chrome / Edge 与真实账号跨端往返仍待验收。没有生产部署、Windows 打包、微信上传或商店发布。


## 2026-10-02 Web 查词（0.7.4 待验收候选）

顶栏新增搜索框与 `/search?q=` 页面，支持日文、假名、中文释义；六册教材查询缓存与本账户自定义词书合并，结果提供发音、教材课次与加入生词本。收藏使用原有难词 / 忽略标记和同步队列，被忽略的词需明确恢复。查询不修改当前词书或进度；显式收藏才载入对应教材。页面隐藏 / 切账号停止发音，并守卫过期结果。

搜索收藏复核发现 Web 原有事务的账号切换竞态，本轮针对 `flag`、`rate`、显式 `ensureBookLoaded` 增加捕获账号和固定数据 key。提交成功的修改以捕获 userId 写入现有全局 outbox，旧操作不覆盖新账号 UI；队列 Push / Dequeue 只处理捕获账号，重复同词进度使用 UUID 防止旧确认删除新修改。没有新增云协议或第二套数据库。

最终相关回归 **48 文件 / 320 项通过**（扩展、小程序、共享检索、Web 搜索 / 账号护栏、云对齐模拟）；根类型、Cloudflare 类型与构建通过。未运行包含真实 Staging 合成凭据的全量实网套件，不能记为全仓测试通过。

已部署 **Staging**：`da291ae4.kotoba-iuz.pages.dev`，别名 `staging.kotoba-iuz.pages.dev`。2026-10-02 两个测试域名 `/app/` HTTP 200 / noindex，加载 `main-CnHSL8L2.js`；搜索资源 `Search-CXMcaxCj.js` HTTP 200。测试站同步状态只读检查 HTTP 200 / `d1_bound: true`。浏览器核对 9,117 条教材检索、日文 / 片假名 / 中文、匿名收藏进入原有生词本及清空；320px 无横向溢出，页面无控制台 error。截图为 `kotobud-web-074-search-staging.png` 与 `kotobud-web-074-search-mobile.png`。账号切换的回归使用合成数据；真实邮箱跨端往返仍待用户验收。

生产 `/app/` 同日只读核对仍加载 `main-BU6POw0t.js`。Windows 下载保持 **0.7.3**；本轮未构建或上传 Windows，必须用户在 Web 验收并明确批准后再打包。根包 0.7.4 仅为候选，官网发布公告与下载入口仍保留已发布版本。

更新时间：2026-10-02。本文聚焦 Web 与 Windows 当前状态及接续步骤；全项目概览以 `HANDOFF_OVERVIEW.md` 为入口。下文未包含本日的版本与部署记录按各自日期理解。

2026-09-29 补充：Web/Windows 共用 Vue 渲染层加入 `gsap`，并优化首页、导航、学习卡片、登录弹窗及设置页交互；支持系统减少动态效果。Staging `/app/` 加载 `main-BAITigCF.js`，Web-only v0.7.2 已发布生产，生产 `/app/` 加载 `main-CvV7Bt47.js`（HTTP 200）；首页与 `/changelog/` 有更新公告。生产构建隐藏未配置的微信扫码入口，生产 Worker 沿用原认证路径并补足 KotoBud 下载路由。Windows 独立安装包仍为 v0.7.1，未重打包；微信登录配置门禁不变。

## 历史状态快照（2026-09-30）

2026-09-30 用户验收后，官网、下载页与设置布局先发布生产 **Web v0.7.3**（`099b7b6f.kotoba-iuz.pages.dev`）；随后按用户要求交付 **Windows v0.7.3** 并更新生产下载入口。当前 Pages `main` 部署为 `d8c292a2.kotoba-iuz.pages.dev`。正式域名 `/` 引用 `landing-wfKjCtBA.js` / `landing-BJpOEX31.css`，`/app/` 加载 `main-BU6POw0t.js`，设置模块为 `Settings-Cjst4WYu.js`；官网、下载页、更新日志、学习入口均 HTTP 200，响应正文与本地发布构建一致。官网、下载页与设置入口均引用 Windows 0.7.3，`/changelog` 已补充 Windows 更新公告，保留 v0.7.2 历史记录。生产继续使用经 SHA-256 门禁校验的 Web-only Worker `e874e52bf2564210b767dd01dfcac0c4aaa6f2388ea75e80d96f30f3867b4806`；同步状态 `d1_bound: true`。Windows 文件交付证据见下方发布入口。

本次发布构建与 diff 检查通过。最新 `npm test`：43 文件通过、1 个 Staging 实网文件失败；373 项通过、9 项封存的微信测试跳过、6 项实网失败。实网文件使用合成测试令牌，在当前 Staging 被拒绝（401，其中一次超时），不能记作全量通过。生产浏览器核对学习首页、设置页版本与紧凑布局，无控制台错误；登录后同步仍需真实账号验收。

2026-09-30 官网介绍首页重新设计：保留原绿色纸感、产品信息与 Web/Windows 入口，增加 GSAP 标题入场、叠放词卡视差、六册词书展开、滚动联动的三种学习演示、字带移动与植物线条绘制。演示明确标注为示意，测验模式切换与收藏可交互；支持减少动态效果和无脚本阅读。源文件为 `scripts/landing-page.mjs`、`apps/web/src/landing.ts` 与 `landing.css`，静态生成器从 Vite manifest 引用本地打包资源，不依赖外部 CDN。

2026-09-30 验收修正：词带改为按视口宽度补齐的双组无缝循环，静止时缓慢移动、滚动时轻微加速，离屏/后台暂停，减少动态效果时静态展示；超宽 3840px 屏幕核对两组均宽于视口。设置页改为两列独立堆叠，下载卡片紧接宠物设置，稳定间距 18px，消除跨行布局造成的空白。客户端下载页使用 `design-taste-frontend`，保留绿色纸感与版本/系统/文件/校验信息，改为非对称主次布局、单行下载按钮、轻微按压反馈与原生 FAQ 展开；无新增动画运行时。实现为 `scripts/download-page.mjs` / `download-page.css`。

下载页桌面 1440px 与手机 390px 无横向溢出；`#portable` 锚点、原下载路径与不可用门禁保留（关闭时无下载 href）。Staging 安装版/便携版公网 HEAD 为 200、附件名正确，实测大小分别 301,156,635 / 300,924,732 字节，页面已纠正为约 301.2 / 300.9 MB；校验清单 200。

本轮 `build:cloudflare`（含 Vue/Worker 类型检查）和首页导航 24 项回归通过；浏览器核验桌面/手机布局、滚动章节切换、模式/收藏反馈、减少动效与关闭脚本的可读性，并确认 Staging 学习首页与设置页可加载、无控制台错误。已部署 Pages `staging`，部署为 `884a05e0.kotoba-iuz.pages.dev`；两处测试域名首页均引用 `landing-wfKjCtBA.js` / `landing-BJpOEX31.css`，HTTP 200 且 noindex，`/app/` 加载 `main-cRebzg6v.js`。该 Staging v0.7.2 构建已获用户验收，随后以 Web v0.7.3 发布生产（见上）；Staging 仍保留此验收构建。微信封存与学习数据契约未由本轮修改。

当前工作树保留网站应用扫码 OAuth 和 Windows 系统浏览器返回的预案代码；2026-09-30 用户决定暂停接入。Web/Windows 的微信入口已固定隐藏，Worker 微信认证路由关闭，后续版本不得恢复入口，现有邮箱登录继续可用。个人主体开放平台账号没有历史网站应用且不能新建。历史操作和未来恢复门禁见[封存预案](reference/WECHAT_LOGIN_INTEGRATION.md)。

| 范围 | 已完成 / 已核验 | 尚未完成或需要留意 |
| --- | --- | --- |
| 版本 | 根 `package.json`、生产 Web、`apps/windows/package.json` 与可下载安装包均为 `0.7.3`。 | 当前工作区仍有大量未提交变更；开始新工作先查看 `git status --short` 与 `git diff`，不要重置或覆盖已有修改。当前 Git 分支为 `feature/miniprogram`，它不是 Cloudflare Pages 的部署分支参数。 |
| Web 生产 | Web `0.7.3` 已发布至公网；`/app/` 加载 `main-BU6POw0t.js`，设置模块为 `Settings-Cjst4WYu.js`，下载页及设置入口指向 Windows 0.7.3。生产状态接口返回 D1 已绑定。 | 生产发布包使用 Web-only 兼容 Worker；在微信生产变量、迁移与真实联调完成前，不得直接把当前源码 Worker 构建部署到 `main`。 |
| Web Staging | 2026-09-30 官网介绍页重建并部署至 Pages `staging` 分支；两处测试域名首页引用 `landing-wfKjCtBA.js` / `landing-BJpOEX31.css`，`/app/` 加载 `main-cRebzg6v.js`，HTTP 200。 | 此 v0.7.2 验收构建已获用户确认；本轮 Windows 发布未更新 Staging 页面，其版本文案仍为当时状态。后续部署须重新核对哈希。 |
| Windows 交付 | Windows `0.7.3` 的安装版、便携版和 SHA-256 清单均已上传 R2；对象大小与本地一致，公网 `HEAD` 为 200、EXE Range `GET` 为 206，下载页链接已开放。 | 本轮未执行便携版启动或人工安装/覆盖升级、桌面快捷方式及宠物动画验收。不可把“下载已核验”描述成“用户设备安装已核验”。 |
| 构建与测试 | 最新 Web 发布构建通过；`npm test` 为 373 通过、9 跳过、6 Staging 实网失败（合成令牌 401 / 超时）。此前 387/387 为历史记录。 | 这不替代微信真机扫码、Windows 用户设备安装及账号数据归属验收。 |
| 多词典 | 现有 Web 仍使用单一 dictionary provider；当前实现按词头加载分片，最多缓存 8 个。 | 多词典接入方案仍是未实施、未发布的计划。下一步先按计划做词头＋读音覆盖矩阵和误命中抽样，再决定来源适配器与聚合面板范围。方案见[多词典方案](reference/WEB_MULTI_DICTIONARY_PLAN_2026-09-27.md)。 |

## 下一步

1. 新对话先阅读本文和下列部署、版本及多词典参考，再查看当前 diff，确认哪些未提交变更属于本次开发。
2. Web 改动在本地验收后，先按下方命令重新构建当前工作树，再部署 Pages `staging` 分支；核对自定义域名与分支别名资源 hash 相同、HTTP 200、`noindex`，并确认 Preview D1 绑定 `kotobud-staging-db`。Cloudflare Pages Preview 与生产共享 R2，避免更改已有对象 key。
3. Staging 验收完成后，只有用户明确确认发布时才部署 Pages `main`。发布参数 `staging` / `main` 指 Cloudflare Pages 分支，和本地 Git 分支名称无关。
4. Windows `0.7.3` 已交付，不要重复上传或重打包该版本。优先补做真实安装与升级验收；若后续有代码改动，按 Windows 版本策略同步版本、构建包、上传并逐项核对 R2 与公网响应后，才开放对应下载链接。
5. 若继续推进多词典，先执行覆盖评估；计划建议首期保留现有 JMdict/Tomoshi 数据并评估新增日语版 Wiktionary。不得把 Kotobank 外链、机器辅助释义或 JMdict 衍生内容计作已接入的独立出版社词典，也不得声称三省堂内容已获授权或已内置。

## Web 构建与 Staging 部署

在仓库根目录 PowerShell 执行。部署脚本只上传现成的 `dist-cloudflare`，不会自行构建；每次部署前先构建当前工作树。

构建前**显式**设置 `VITE_WINDOWS_DOWNLOADS_READY`：目前已核验的 0.7.3 下载可设为 `true`；如果页面指向尚未上传和公网核验的新包，必须设为 `false`。当前构建脚本对未设置值默认向 Web 应用传 `true`，而静态下载页直接读取环境变量、未设置时按 `false` 处理，可能造成两个入口状态不一致。

```powershell
$env:VITE_WINDOWS_DOWNLOADS_READY = 'true' # 仅在沿用已核验的 0.7.3 下载链接时
npm test
npm run build:cloudflare
node scripts/deploy_pages.cjs staging
```

验收入口：

- `https://staging.kotobud.com`
- `https://staging.kotoba-iuz.pages.dev`
- 比较两者实际引用的静态资源 hash，并确认 Staging 的 `noindex` 响应头与页面 robots meta。
- Web-only 生产发布须在构建后执行 `node scripts/prepare-web-only-production-worker.cjs`，再执行 `node scripts/deploy_pages.cjs main`；后者已对生产 Worker 设置哈希门禁。后续启用微信登录须先完成生产迁移、密钥与测试，再有意更新该门禁。

若 Wrangler 尚未认证，可先按[部署说明](reference/CLOUDFLARE_DEPLOYMENT.md)中的 Windows 登录步骤完成 `npx wrangler login`。不要直接部署旧的 `dist-cloudflare` 目录。

## Windows 发布入口

Windows 新版发布流程以[Windows 版本策略](reference/WINDOWS_VERSIONING_POLICY.md)为准，包含版本号同步、`npm run build:windows`、生成校验和、R2 上传及下载页更新。当前上传脚本接受版本参数；对已交付版本不要重复上传或重打包。

发布新版本时，先从 R2 对象列表核对三个对象及字节数，再检查公网下载的 `HEAD`、Range `GET`、附件文件名和 SHA-256 清单；全部通过后才在 Web 中启用下载。浏览器下载可用性与 Windows 安装验收是两项独立状态。

### 2026-09-30 Windows 0.7.3 交付证据

- `npm run build:windows` 通过；构建明确使用生产 API `https://kotobud.com`。解包核对 EXE 版本 `0.7.3.0`、asar 包版本 `0.7.3`、preload 和本地词书资源；打包 JS 无 Staging API 地址。Windows 品牌/启动/协议 13 项检查通过；官网导航与平台检查 27 项通过；后续 Cloudflare 构建及 `git diff --check` 通过。
- R2 `kotoba-assets/releases/0.7.3/` 中三个对象的键与精确大小均已独立核对；本地两个 EXE 重新计算 SHA-256 并与清单一致。公网 EXE `HEAD` 为 200、Range `bytes=0-511` 为 206、文件头为 `MZ`，附件文件名正确；清单 `HEAD`/`GET` 为 200，207 字节正文与本地一致。文本清单按既有 Worker 以 `inline` 返回；精确长度检查使用 `Accept-Encoding: identity`。

| 文件 | 字节数 | SHA-256 |
| --- | ---: | --- |
| `KotoBud-0.7.3-Windows-x64-Setup.exe` | 301,212,951 | `35288ac5a17a58daf9a488f313c361a5c7970b5d43e8fd20418055d0a1ef5748` |
| `KotoBud-0.7.3-Windows-x64-Portable.exe` | 300,981,034 | `52d1b88f475da0960695e240751cf2f4e3ee0d893c3a5c790c26e01d46de22b1` |
| `SHA256SUMS-0.7.3.txt` | 207 | 清单中的两行分别对应上方 EXE。 |

下载入口：`https://kotobud.com/download`；文件路径为 `/downloads/<上表文件名>`。两个 EXE 保持当前无数字签名状态；本轮只完成构建与交付，人工安装、覆盖升级和用户设备启动仍待验收。

## 必须保留的数据与部署边界

- 保持 IndexedDB 名称 `kotoba-v1`、Electron Origin `kotoba://app`、稳定的应用标识与 userData 路径，避免存量进度变成不可见的数据孤岛。
- 保持 Cloudflare Pages 项目 `kotoba`、R2 bucket `kotoba-assets` 和 Pages 绑定 `KOTOBA_R2`；词典与音频通过现有 Worker/R2 路径提供。
- Windows 下载仅在该版本二进制和校验文件完成 R2 与公网核验后启用。
- 部署测试构建时先运行 `npm run build:cloudflare`，再将当前生成物部署到 Pages `staging`。生产环境只通过 `main` 发布；在微信生产环境就绪前，先准备并校验 Web-only Worker。

## 参考文档

- [Cloudflare Pages 与 R2 部署说明](reference/CLOUDFLARE_DEPLOYMENT.md)：环境、构建、分支发布与验收门禁。
- [Windows 版本演进策略](reference/WINDOWS_VERSIONING_POLICY.md)：SemVer 与正式打包流程。
- [Web 多词典接入方案](reference/WEB_MULTI_DICTIONARY_PLAN_2026-09-27.md)：仅为待实施方案。
- [历史主交接](archive/HANDOFF_ANTIGRAVITY_TO_CODEX.md)：Windows `0.7.1` 公网交付证据见第 17 节；第 16 节中“延后上传”的状态已被第 17 节更新覆盖。
