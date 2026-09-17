# 导入格式
UTF-8 CSV 表头：lesson,term,reading,meaning,partOfSpeech。前三个词汇字段和 lesson 必填。支持引号、逗号、换行与 BOM。可选列 accent,example,exampleTranslation,audioUrl,note。
JSON 为相同字段的对象数组，或 {"words": [...]}。示例见 examples/。课次按首次出现顺序编号，单词按行顺序编号。未知列忽略；空必填项、重复的同课 term+reading、非法 JSON 或非 http(s) 音频地址拒绝导入并报告行号。上限 10000 词、5 MB 文件。
选择文件后只解析预览，点击确认才创建独立词书，不覆盖已有数据。

## 详细释义
CSV/JSON 新增可选 definitionJa、definitionZh、exampleReading。JSON 支持 senses 数组（最多30项），每项 meaning 必填，其余 definitionJa、partOfSpeech、example、exampleReading、exampleTranslation 可选。请参考 examples/detailed.json，原来格式完全兼容。
