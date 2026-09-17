# 详细释义与多题型复习（2026-09-15）

## 用户操作

学习页顶部「学习方式」支持经典卡片、混合复习、假名选中文、汉字选假名、听音选中文。新词默认经典卡片，到期复习和生词练习默认混合。每个词完成一种题型；混合按顺序轮换可用题型，不重复同一词的 FSRS 事件。经典卡片保留自主评级。

选择题第一次点击锁定答案，立即显示正确/错误、完整单词和详细解析；点击「保存并继续」才原子写入 WordState 与 ReviewLog。答错/不认识 → Again，答对 → Good，勾选「猜对」→ Hard。保存前退出会放弃尚未提交的当前题，界面明确提示保存操作。写入失败保留本题并可重试，不跳词。ReviewLog.quiz 保存题型、提示、所有选项、选择、正确答案和正确性。已有日志兼容，不迁移或清空旧数据。

干扰项取自已有未忽略词库，最多四选一。排除重复答案、相同词形、同音异义、相同汉字的其他读音以及中文简义交叠项。少于两个有效选项不出题；没有汉字不出汉字题。无法出题时给出原因并可改用经典卡片。人工词书错误和未标注同义词无法全部自动识别；没有声称语义判题完全消歧。

## 词典

内置 217,538 个词条，来自 Tomoshi open-data v2026-09-02；基础词条为 JMdict / EDRDG，日中译释含 Tomoshi 机器辅助扩展，部分日文来自日本维基词典。**不是出版社授权的权威日中辞典**。词书中文始终是学习判题依据，扩展词典不自动覆盖词书，避免改变教材含义。

详细区显示：原词书简义、多义项、可选日文解释、词典中文分义、英文原义、日文解释、原词书或 Kotoba 学习例句与读音、来源。日文定义与中文分义并非逐条对齐，分区展示。原始学习例句明确标注「非辞典原文」。精确匹配词形与假名，未命中不猜词条；加载失败可以重试，不阻断评级。

通过「コトバンク」外链在原网站查阅出版社辞典，**外链不是 API 接入，也不复制商业辞典正文**。如果后续需要出版社审定的日中释义，需获得对应内容授权/API 后新增 DictionaryProvider adapter。

### 文件、许可与体积

- packages/dictionary：DictionaryProvider 接口、词条类型、hash/精确匹配，无 Browser API。
- apps/web/src/services/dictionary.ts：按需 fetch 一个本地静态分片，12秒超时、8分片内存 LRU。
- apps/web/public/dictionary：512 个 JSON 分片，总计约 212 MiB，单片最高约 491 KiB。不会随初始 JS 一次加载全量数据；生产静态产物包含完整词典，打包部署需考虑体积。
- dictionary/KOTOBA-NOTICE.md、LICENSE.md、NOTICE.md、table-licenses.json：许可和修改声明。派生词典数据保持 CC BY-SA 4.0；不改变业务代码的许可选择。
- scripts/download-dictionary.mjs → scripts/build-dictionary.mjs：可复现提取，下载上游压缩 SQLite，核对 SHA256 后按分片输出。构建工具使用 Node 24 的 node:sqlite/zstd；Web 运行不依赖 SQLite。
- .cache/ 下原始数据库和 Python 工具依赖不入版本管理。

后续小程序需用平台文件/存储/远端按需服务替换静态词典 adapter，不能把 212 MiB 直接塞入小程序代码包。

## 发音

已有 audioUrl 优先；演示词和两条详细示例具备预生成 ja-JP-NanamiNeural 合成 MP3，共50段，明确标注合成发音。其他词可使用设备提供的 ja-JP SpeechSynthesisVoice。没有日语语音时明确不可用，不使用错误语种。支持正常/慢速、切词取消、播放异常/超时提示。听音题播放成功前禁用答案，不自动播放。播放失败不会产生学习日志，可重试或切换题型。

生成脚本 scripts/generate-audio.py 使用 edge-tts，已预生成音频不需要用户再安装 Python。生成仅向合成服务发送样本日语读音，不发送学习记录。

## 数据格式扩展

Word 可选 definitionJa、definitionZh、exampleReading、senses。senses 为最多30项的 JSON 数组，每项含 meaning（必填）、definitionJa、partOfSpeech、example、exampleReading、exampleTranslation。原 CSV/JSON 格式仍兼容；CSV 可用新增扁平列，多义项使用 JSON。examples/detailed.json 可直接导入，含「中国人」「船便」等四词。
