# 其他《新版中日交流标准日本语》词表候选核查

核查日期：2026-09-16。范围：避开已由主线核查的 `smartsl/biaori` 与 `fukangwei/Japanese_Note`，只记录本次实际打开文件内容的候选。目标字段是词形、假名、课次；不复制教材全文、音频或例句到本项目。

## 结论

目前最有用的备用来源是 `wizicer/LearnJapan`：其 `gh-pages/_data/words.csv` 是可直接解析的 CSV，含初级 48 课和中级 32 课的课次编码，共 5,751 条数据行；未发现高级上下册数据。仓库根部声明 MIT，但该声明是软件仓库许可，未看到教材词表／中文翻译的独立授权，不能据此当作教材内容可再分发授权。

`RabbearSu/Japanese-Words` 提供一个实际存在的 `data/jp_zhongji.xlsx`（GitHub 页面标注 287 KB），README 说明其表格字段和处理逻辑，覆盖目标是“新标准日本语初级和中级”；它没有高级内容，也没有在仓库根目录文件列表中看到 LICENSE 或数据许可声明。该文件可作为人工导入、字段映射和去重的候选，授权仍需向作者确认。

`Eished/wfyyyf_notes` 是学习笔记而不是干净词表：已打开的 `新标准日本语学习笔记-ミカ先生.md` 页面标注 2,653 行／82.5 KB，原文开头为“新标日初级上”，实际可见“第 1–4 课”词语表格与语法笔记。仓库根目录列表没有 LICENSE。它适合人工校勘初级上，不能按“词形／假名／课次”直接导入，也没有证据覆盖六册。

## 1. wizicer/LearnJapan（首选备用）

### 实际文件与字段

- 仓库：[wizicer/LearnJapan](https://github.com/wizicer/LearnJapan)；工作分支为 `gh-pages`。
- 词表文件：[\_data/words.csv](https://github.com/wizicer/LearnJapan/blob/gh-pages/_data/words.csv)；GitHub 页面标注 **5,752 行（含表头）、997 KB**。已打开原始 CSV：[raw words.csv](https://raw.githubusercontent.com/wizicer/LearnJapan/gh-pages/_data/words.csv)。首行字段实际为：`kana,kanji,pos,desc,word,lesson,idx`。
- CSV 前几行实际含 `ちゅうごくじん`、`にほんじん` 等词，`kana` 为带重音标记的假名字符串，`kanji` 为书写，`pos` 为词类，`desc` 为中文义项，`word` 为带假名／重音标记的展示串，`lesson` 为课号，`idx` 为原始序号。项目若只需要词形／假名／课次，应过滤为 `word`（或 `kanji`）、`kana`、`lesson`，不要带入 `desc`。
- 课次证据：初级课号在 CSV 中从 `001` 延续到 `048`（原始文件中 `047`、`048` 行可见）；中级条目使用 `m011`、`m012` … 等编码，原始文件末尾可见 `m323`。这里的编码形态是“`m` + 两位课号 + 分段号”（例如 `m011` 是中级第 1 课的第 1 段，`m323` 是第 32 课的第 3 段），应在导入时拆为 `册=中级`、`课次=1..32`，并保留分段号以免排序丢失。
- 课次文件：[\_data/lessons.yml](https://github.com/wizicer/LearnJapan/blob/gh-pages/_data/lessons.yml) 页面标注 3,654 行，开头键为 `l1`，末尾可见 `l48`；中级课次文件：[\_data/mlessons.yml](https://github.com/wizicer/LearnJapan/blob/gh-pages/_data/mlessons.yml) 页面标注 3,422 行（原始文件 825 行），开头键为 `m1`，末尾可见 `m32`。这些文件含课文／对话，应用中只应使用课次元数据，不能复制正文。

### 覆盖判断

| 册别 | 证据与判断 |
| --- | --- |
| 初级上 | CSV 课号 `001`–`024`；初级课文数据 `l1`–`l24`，可确认有覆盖 |
| 初级下 | CSV 课号 `025`–`048`；初级课文数据末尾 `l48`，可确认有覆盖 |
| 中级上／下 | `mlessons.yml` 有 `m1`–`m32`；词表编码从 `m011` 延伸到 `m323`，可确认有 32 课覆盖（上／下册分界需按教材连续课号解释） |
| 高级上／下 | 未在仓库列出的 `words.csv`、`lessons.yml`、`mlessons.yml` 中发现高级数据；判定为未覆盖 |

这是“仓库数据结构和课次编码覆盖”的核验，不等于逐课与正版纸书新出词完全一致；CSV 还含专有名词、惯用语和中文译释，需按产品字段和来源政策另行筛选。

### 许可与风险

仓库根目录有 [LICENSE](https://github.com/wizicer/LearnJapan/blob/gh-pages/LICENSE)，实际文本是 MIT License，版权行署名 Icer Liang（2016）。README 也将项目描述为“以《新版中日交流标准日本语》教材为参考制作”，并明确展示单词中文翻译。MIT 文本可以覆盖作者自己的软件代码，但当前证据没有把教材选词、中文译释、课文或图片逐项声明为可再分发数据；因此只能记录为“代码许可明确、教材数据许可未明”。

## 2. RabbearSu/Japanese-Words（初／中级 Excel）

- 仓库：[RabbearSu/Japanese-Words](https://github.com/RabbearSu/Japanese-Words)。README 的 About 写明“整理日语 N2 单词（新标准日本语初级和中级）”。
- 实际数据文件：[data/jp_zhongji.xlsx](https://github.com/RabbearSu/Japanese-Words/blob/master/data/jp_zhongji.xlsx)，GitHub 文件页标注 **287 KB**；同目录另有 `ABAB.txt`。Excel 文件本身不是文本预览格式，但页面确认文件存在，README 的代码说明确认其被 pandas 读取。
- README 的字段说明实际写明读取每行的 `假名`、`日文`、`汉字意思`，内部词条结构为 `{'假名': ..., '日文': ..., '意思': ...}`；生成的 DataFrame 还会加 `类型`，并在处理步骤中排除专有名词。README 示例输出列为“假名、日文、意思、类型”。这些字段足以映射项目的词形／假名字段，但 README 没有课号列说明。
- 覆盖：作者只声称初级和中级，未声称高级；没有可核验的六册课次清单。该来源不能标作高级或六册完整词书。
- 许可：仓库根目录 GitHub 文件列表显示 `.gitignore`、代码、`README.md` 等，没有 `LICENSE` 文件；README 也未给出数据许可或教材权利方授权。代码能被查看不代表 Excel 内容可复制或随应用分发。

## 3. Eished/wfyyyf_notes（学习笔记，低优先级）

- 仓库：[Eished/wfyyyf_notes](https://github.com/Eished/wfyyyf_notes)。根目录实际包含两份“新标准日本语学习笔记”Markdown 及其图片资源目录，另有英语笔记。
- 重点文件：[新标准日本语学习笔记-ミカ先生.md](https://github.com/Eished/wfyyyf_notes/blob/master/%E6%96%B0%E6%A0%87%E5%87%86%E6%97%A5%E8%AF%AD%E5%AD%A6%E4%B9%A0%E7%AC%94%E8%AE%B0-%E3%83%9F%E3%82%AB%E5%85%88%E7%94%9F.md)；页面标注 **2,653 行、82.5 KB**。已打开原始内容，开头标题为“新标日初级上”，实际出现“第一课”“第二课”“第三课”“第四课”及词语表／语法说明；示例中的词语表是 Markdown 表格或行内项目，没有统一 CSV/JSON 记录。
- 课次：已确认至少初级上第 1–4 课内容；该文件本身不能证明初级下、中级或高级覆盖，也没有稳定的机器字段。需要人工提取时只能作为校勘参考，禁止整篇复制。
- 许可：仓库根目录文件列表未显示 LICENSE；没有针对笔记、词表或图片的独立授权声明。不能把它作为可直接内置的数据源。

## 采纳建议

1. 若只需备用导入样本，优先研究 LearnJapan 的 `words.csv`；仅抽取 `word`／`kanji`、`kana`、拆解后的 `lesson`，并丢弃课文与中文释义，保留原始来源链接和版本哈希。
2. RabbearSu 的 Excel 可作为初／中级人工比对候选；先由用户确认作者允许个人词书使用，再检查工作表名、实际行数、是否有课号及重复项。
3. Eished 仅作初级上人工校勘，不作为结构化导入源。
4. 三个来源都不能替代权利方授权，也没有一个能证明六册（初／中／高上下）完整且可随安装包再分发。代码 MIT（LearnJapan）与仓库可见性不能被解释为教材数据出版授权。

