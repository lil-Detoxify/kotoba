# Google TTS 10 词测试报告

日期：2026-09-16  
范围：独立 `tests/tts-google` 测试资产；未修改正式发音、教材、R2、部署或发行包。

## Selected Words

样本见 [`selected-words.json`](./selected-words.json)，共 10 个、无重复稳定词 ID。覆盖汉字多读音（今日／きょう、今日／こんにち）、音读、训读复合词、促音、拗音、长音、片假名外来语、正式语域和较长多拍词。五册教材实际参与选样：初级上、初级下、中级上、高级上、高级下；六册词书中的“六册”数据源保持原样未改动。逐项回查教材数据后 10/10 stableWordId、term、reading 匹配。

## Voices

请求的四个实际名称：`ja-JP-Wavenet-A`、`ja-JP-Wavenet-B`、`ja-JP-Wavenet-C`、`ja-JP-Wavenet-D`。官方研究记录 A/B 为女声、C/D 为男声，但本报告不替用户选择最终 voice。

## Pronunciation Control

`generate.mjs` 对每个词发送 `<speak><phoneme alphabet="yomigana" ph="教材reading">词面</phoneme></speak>`，并 XML 转义词面和 reading。未加入未经权威来源确认的 `^` 或 `!` 重音标记。Google 官方说明支持日语 `yomigana`，详见 [`RESEARCH.md`](./RESEARCH.md)。

## Authentication and Generation Results

认证历史需分开记录：曾有 API-key 探测 HTTP 401（API keys are not supported）、旧项目 quota 请求 HTTP 403（项目为 `kotoba`），以及本次用户明确项目 `gen-lang-client-0118344750` 的只读 voices 探测 HTTP 200。历史认证调用没有完整累计日志，不能据此编造总请求数。本次合成请求精确为 40 个：

| 项目 | 结果 |
|---|---:|
| 合成请求（精确） | 40 |
| 非合成认证 | 历史：API key 401、旧项目 `kotoba` quota 403；本次：`gen-lang-client-0118344750` voices 200 |
| 合成请求 | 40 |
| 音频文件 | 40 / 40 |
| 非零 MP3 | 40 |
| API 字符数 | 2,736 |
| 失败 | 0 |
| MP3 总大小 | 321,408 bytes（约 313.88 KiB） |
| 单文件平均 | 8,035.2 bytes |

脚本会在认证成功后自动生成 10×4 文件，写入 `manifest.json`。续跑必须同时匹配 selected-words source hash、完整请求 payload hash 和非零文件，避免源数据或参数变化时跳过旧 MP3；每次请求有 30 秒超时，HTTP/网络失败会先将脱敏结果写入 manifest。优先尝试 ADC，只有 ADC 不可用时才使用运行时 `GOOGLE_TTS_API_KEY`。API key 不写入任何文件、日志或前端。

## Cost / Quota Estimate

本次实际合成字符数为 **2,736**。按当前脚本的真实模板逐词统计全部 9,117 条教材数据（Unicode code points，SSML 标签计入，未加入重音标记）结果为：单个 voice **615,911** 字符，四个 voice **2,463,644** 字符；平均每词每 voice **67.56** 字符。对应 UTF-8 **SSML input** 字节数分别约 **753,427** / **3,013,708**，不是整个 JSON 请求体（请求仍须按官方 5,000-byte 限制拆分）。本次 40 个 MP3 实测总大小 **321,408 bytes（313.88 KiB）**，平均 **8,035.2 bytes**。若把这 10 词×4 voice 小样本的实测平均值作线性估计，9,117 条全量单 voice 约 **73.256918 MB（69.863242 MiB）**，四 voice 约 **293.027674 MB（279.452966 MiB）**。这只是按 10 词小样本的线性体积估计，实际大小会随词长、音素、静音和编码分布变化。

费用按官方 WaveNet US$0.000016/字符：若本月剩余完整 1,000,000 免费字符，四 voice 超额 1,463,644 字符，约 **US$23.42**；若剩余免费额度为 0，则约 **US$39.42**；单 voice 615,911 字符在剩余完整额度时约 **US$0**。四 voice 总量超过 1M，因此不可能全部免费。此为估算，不是费用保证；不会执行全量生成。

## Issues and Recommendation

历史 API key 请求返回 401、旧项目 `kotoba` quota 请求返回 403；本次项目 `gen-lang-client-0118344750` voices 探测返回 HTTP 200。历史认证调用没有完整累计日志，因此不声称“全任务只有 41 次”：本次可核对的是 voices 探测 **1 次** + 合成 **40 次** = **41 次**，历史额外认证调用次数未完整统计。四个 voice 均生成成功且 ffprobe 解码检查 40/40 通过，详细文件级结果见 [`validation.json`](./validation.json)。试听页为纯静态 HTML，可直接打开，不依赖 fetch；音频存在时可直接播放，缺失时按钮会显示尚未生成。最终 voice 由用户试听后决定。

官方来源与细节见 [`RESEARCH.md`](./RESEARCH.md)：支持 voices、日语 yomigana/重音、5,000 字节请求限制、WaveNet 计费与免费额度。
