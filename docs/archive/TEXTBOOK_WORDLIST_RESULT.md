# 六册标日单词列表：实际数据核查

核查日期：2026-09-16。两位 Luna 子代理分别搜索 GitHub 与其他公开资源，主代理独立统计首选 JSON 文件。此次交付是来源核查，尚未将候选词表内置到应用或重新打包。

## 首选：smartsl/biaori

- 仓库：https://github.com/smartsl/biaori
- 实际词表：https://github.com/smartsl/biaori/blob/main/words.json
- 课号解析依据：https://github.com/smartsl/biaori/blob/main/words.html
- 本地核查文件：`.cache/textbook-research/biaori-src/biaori-main/words.json`

| 册别 | 实际课号 | 原始记录数 |
| --- | --- | ---: |
| 初级上 | 1–24 | 1,077 |
| 初级下 | 25–48 | 1,073 |
| 中级上 | 1–16 | 1,748 |
| 中级下 | 17–32 | 1,907 |
| 高级上 | 1–12 | 1,806 |
| 高级下 | 13–24 | 1,506 |
| 合计 | 104 课均有记录 | 9,117 |

统计依据是逐条读取 JSON，而非根据 README 推断。每条记录包含课号编码、词性、简明中文释义、假名与词形合并串、音频时间信息。依源项目页面：级别为 `floor(code / 10000)`，课号为 `code % 100 + 1`。记录数包含重复出现的词、专名和短语，不是全库去重后的词数；全部课号有数据，不等于已与纸质教材逐词核对。

项目含 MIT LICENSE 文件，但文件版权行是 Othneil Drew（2018），与仓库作者名不同；尚未核实其数据来源及许可覆盖范围。这里只记录可验证事实，不把教材关联本身作为排除单词清单的理由，也不作法律保证。

## 六册交叉核对来源

https://github.com/fukangwei/Japanese_Note 的实际文件中有初级、中级、高级各上／下册六份词汇表 Markdown。词表混有补充说明、例句和表格布局；抽查高级上第一课发现疑似错字，适合作为交叉核对来源，不能直接称为逐词校对完成的官方版。

## 备用来源

https://github.com/wizicer/LearnJapan 的 `_data/words.csv` 含初级、中级课次编码；其他 Luna 子代理的核查见 `OTHER_VOCAB_CANDIDATES.md`。RabbearSu/Japanese-Words 有初中级 Excel 候选，但尚未实际解析工作簿计数。二者都不能替代高级上下册。

## 转换建议

以 smartsl 的结构化词表为主要候选，先拆分六册及课次，解析假名／词形，对同课重复词、空字段、多读音和特殊符号进行检查，再映射应用的 `lesson,term,reading,meaning,partOfSpeech` 字段。按用户范围制作单词词书，详细释义继续使用应用已有的开放词典；教材正文、例句、原版音频不作为本次导入内容。

本报告补充并修正早先 `TEXTBOOK_SOURCES.md` 的有限核查：已经找到实际覆盖六册课次的单词数据，不能再表述为没有六册词表候选。
