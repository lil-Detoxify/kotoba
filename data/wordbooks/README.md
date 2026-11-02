# JLPT 词书数据

本目录保存可追溯的 OpenJLPT 输入、代理审校记录和生成的中间文件。Web 词书由固定版本的来源数据生成；不改动原有六册标日词书。

## 文件与构建顺序

输入文件：

- `openjlpt-0.3.0.json`：OpenJLPT v0.3.0 的固定来源快照。
- `jlpt-overrides.json`：41 条明确记录的校订或中文覆盖。
- `jlpt-exclusions.json`：2 条隔离记录；当前是 N1 词形与读音冲突项，留待审校，不进入词书。

准备或更新 Tomoshi 中文释义时，先运行：

```sh
node scripts/prepare-jlpt-data.mjs
```

该脚本从 `.cache/tomoshi.db` **只读**生成 `jlpt-vocabulary.json`。随后构建分级词书，再合并公开目录：

```sh
node scripts/build-jlpt-textbooks.mjs
node scripts/split-textbooks.mjs
```

`build-jlpt-textbooks.mjs` 读取已准备的词条快照，生成 `jlpt-textbooks.json`；`split-textbooks.mjs` 将它与现有标日来源合并，写出 `apps/web/public/data/books/index.json`、各册 JSON 与 Web 元数据。后两步只需已生成的中间文件，不读取数据库；日常重建静态词书时直接运行 `split-textbooks.mjs` 即可。

## 词条身份与进度

每条 JLPT 记录保留稳定的原始 `sourceId`，词条 ID 为 `jlpt-nX-w-sourceId`。排序或调整课次时，稳定 ID 不随数组位置改变。JLPT 每 50 条组织为一组，学习者按组使用。

原有六册标日的 book ID、词条 ID 和迁移标记保持不变。学习进度按 book 独立保存；不会因为同一个词也出现在另一册，就自动合并或迁移进度。

各级参考条数为 N5 674、N4 630、N3 1,659、N2 1,778、N1 3,068，合计 7,809 条。来源的 7,811 条中，2 条 N1 词形与读音冲突记录隔离待审。参考等级可能重叠，计数按词书计算。

## 来源、许可与范围

OpenJLPT 来源固定到 commit `0d1d3410bec90bd4098a7c72de820543cb4f707c`。JLPT 等级及英文短释义参考 Jonathan Waller 的 Tanos 词表（CC BY）；日语词条、读音与词性参考 JMdict / EDRDG（CC BY-SA 4.0）；中文取自 Tomoshi-dict-data `v2026-09-02` 的 `entries.data.senses[].glosses[lang=zho]` 义项，为 Y1Z 的 JMdict 衍生、LLM 辅助翻译内容（CC BY-SA 4.0）。少量短语的中文经项目主代理与 Luna 审校并保留审计记录；不打包 Tatoeba 例句。

词表派生数据按 CC BY-SA 4.0 分发，许可与应用代码分开。详见 [词典数据 LICENSE](../../apps/web/public/dictionary/LICENSE.md)、[NOTICE](../../apps/web/public/dictionary/NOTICE.md)、[OpenJLPT 固定版本 NOTICE](https://github.com/evanclan/OpenJLPT/blob/0d1d3410bec90bd4098a7c72de820543cb4f707c/NOTICE.md)、[Tomoshi-dict-data v2026-09-02](https://github.com/tomoshi-app/tomoshi-dict-data/releases/tag/v2026-09-02) 与 [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/)。

本轮范围为 Web Staging 验收；生产发布需用户验收并批准后推进，其他客户端暂不接入。Minna 初级第三版 I / II 与中级 I / II 暂不注册：待取得版本完整的词表并核清明确许可后再准备，不以空壳词书或旧版代替。
