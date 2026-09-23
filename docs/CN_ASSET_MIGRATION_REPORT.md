# 微信小程序中国大陆静态资源迁移报告

更新时间：2026-09-23
状态：教材 COS 迁移、完整远端校验和小程序教材地址切换已完成；等待微信后台配置 `request` 合法域名及中国大陆真机验收

## 本次执行结果

- Bucket：`kotobud-assets-1490543304`
- Region：`ap-beijing`
- 公开 HTTPS 基址：`https://kotobud-assets-1490543304.cos.ap-beijing.myqcloud.com`
- 凭据：从用户指定的 CSV 在内存中解析成功，只注入上传进程；未复制、记录或提交凭据。
- 教材 dry-run：7 个 JSON，1,277,712 字节；不包含音频。
- 真实上传：7 个教材对象上传成功，0 个跳过。首次校验因 CAM `GetBucket` 授权资源范围不匹配返回 403；仅将该操作的资源从桶根 `.../` 修正为同一桶的 `.../*` 后，签名校验通过。
- 匿名公网 GET：7/7 返回 HTTP 200；实收字节数、SHA-256、`Content-Type` 和 `Cache-Control` 均与本地清单一致。
- 完整远端校验：`data/books/` 恰有 7 个对象、1,277,712 字节，签名读取与匿名公网下载的内容哈希及响应头均通过；`audio/` 列目录返回 0 个对象，未迁移音频。
- 小程序教材默认基址已切换到 `https://kotobud-assets-1490543304.cos.ap-beijing.myqcloud.com`；音频、API、认证和同步仍为 `https://kotobud.com`。未改变 Web、Windows、Worker、D1 或同步协议。
- 验证结果：280 项测试全部通过；小程序 `type-check`、`check:cloudflare`、`build:miniprogram`、`verify:build` 和 `verify:release` 全部通过。构建产物为 255,915 字节，0 个音频文件，AppID 为 `wx63a1b41c7c7e9de2`。

下一步在微信公众平台添加 COS 源站为 **request 合法域名**，然后用中国大陆真机验证六册教材切换、课程进入、离线缓存和 Cloudflare 同步门禁。音频尚未迁移，不需要为本阶段的 COS 源站配置 `downloadFile` 合法域名。

## 1. 范围与不可变边界

本次只迁移微信小程序直接读取的教材 JSON 和音频静态文件。以下服务继续保留在 Cloudflare，代码和协议均不改动：

- Web 和 Windows 客户端资源链路
- Worker、D1、认证、邮箱登录和同步 API
- FSRS 算法、学习状态结构和同步状态机
- `https://kotobud.com/api/v1/*` 后端地址

腾讯云只使用 COS 对象存储，不创建 CloudBase 业务数据库集合。

## 2. 审计结果

| 资源 | 本地来源 | 当前小程序地址 | 数量 | 字节 | 迁移阶段 |
| --- | --- | --- | ---: | ---: | --- |
| 内置轻量目录 | `apps/miniprogram/src/services/textbooks-catalog.json` | 小程序主包 | 1 | 21,601 | 不迁移 |
| 教材索引 | `apps/web/public/data/books/index.json` | `https://kotobud-assets-1490543304.cos.ap-beijing.myqcloud.com/data/books/index.json` | 1 | 13,139 | 第一阶段已完成 |
| 六册教材正文 | `apps/web/public/data/books/*.json` | `https://kotobud-assets-1490543304.cos.ap-beijing.myqcloud.com/data/books/{bookId}.json?v=biaori-v2` | 6 | 1,264,573 | 第一阶段已完成 |
| Google TTS 音频 | `apps/web/public/audio/google/v1/{a,c}` | `https://kotobud.com/audio/google/v1/{a,c}/{hash}.mp3` | 18,072 | 138,762,624 | 第二阶段 |
| 旧种子音频 | `apps/web/public/audio/{0..49}.mp3` | `https://kotobud.com/audio/{n}.mp3` | 50 | 445,680 | 第二阶段 |

教材基线为 6 册、104 课、9,117 词。迁移过程中必须原样保留 `bookId`、课次顺序和 `sourceIndex`；现有稳定词条 ID 仍为 `${bookId}-w-${lessonOrder}-${sourceIndex}`。

第一阶段 COS 清单共 7 个对象、1,277,712 字节：

| COS Key | SHA-256 |
| --- | --- |
| `data/books/biaori-advanced-lower.json` | `ffd42f4b28cf337f5892a0439fe6f28fb26ccbdd91c876915637bc787d4c1cd3` |
| `data/books/biaori-advanced-upper.json` | `46e76474d43c35045bf1fc2690017aebb122a2639934bacc5670623d1806a4f2` |
| `data/books/biaori-beginner-lower.json` | `9becf8d1972a69a8a9fe348351623aa93edfb9fcfcee6ed658764c8ec5ec1dea` |
| `data/books/biaori-beginner-upper.json` | `aac035efef8c7ad2ad541e31dfead377b138a6d485730bb6e08058adb0f464d4` |
| `data/books/biaori-intermediate-lower.json` | `b699d4034c5be15af247e9c5a315d8da3494e5737127004c2331f466b82d0013` |
| `data/books/biaori-intermediate-upper.json` | `57e2ac9b279774d7cab03d21a20130cbeefce74ba4ac8969929e862bade1f2dc` |
| `data/books/index.json` | `464c5c1c04cff9a398918d59132f42268d85f40539221b09057998918e2e00fc` |

## 3. 迁移后的运行时结构

小程序现在使用相互独立的地址：

- API、认证、同步：固定 `https://kotobud.com`
- 教材 JSON：`VITE_MINIPROGRAM_TEXTBOOK_ASSET_BASE_URL`
- 音频：`VITE_MINIPROGRAM_AUDIO_ASSET_BASE_URL`

教材变量默认使用已验证的 COS HTTPS 源站，音频变量仍默认使用 `https://kotobud.com`；需要回滚时可在构建时显式将教材变量设回 `https://kotobud.com`。教材读取仍通过 `uni.request`，音频缓存仍通过 `uni.downloadFile`，没有引入浏览器 API。

## 4. 可重复发布与校验

发布器位于 `apps/miniprogram/scripts/publish-cos-assets.mjs`，默认范围只有教材。它会：

1. 校验 6 册、104 课、9,117 词目录基线和各分册结构。
2. 生成本地 SHA-256 清单。
3. 通过签名 GET 读取远端真实内容并计算 SHA-256；只有内容、大小和响应头全部相同时才跳过。
4. 写入正确的 `Content-Type`、`Cache-Control` 和哈希元数据。
5. 上传后重新枚举远端对象，并逐个校验大小、真实内容 SHA-256、Content-Type 和 Cache-Control。
6. 通过公开 HTTPS 域名执行匿名 GET，再次计算实际下载内容的 SHA-256，确认小程序无需腾讯云密钥即可读取。
7. 发现缺失、多余、私有或不一致对象时返回失败。

命令从仓库根目录执行：

```powershell
npm run assets:cos:dry-run --workspace=apps/miniprogram
npm run assets:cos:publish --workspace=apps/miniprogram
npm run assets:cos:verify --workspace=apps/miniprogram
```

真实上传前在本机环境中设置，不要把密钥写入仓库或聊天：

```text
TENCENT_COS_SECRET_ID
TENCENT_COS_SECRET_KEY
TENCENT_COS_SESSION_TOKEN（使用临时密钥时）
TENCENT_COS_BUCKET（必须包含 APPID 后缀）
TENCENT_COS_REGION
TENCENT_COS_PUBLIC_BASE_URL（公开 HTTPS 源站，仅域名、无路径）
```

教材 JSON 缓存策略为 `public, max-age=300, s-maxage=3600, must-revalidate`。内容哈希音频计划使用一年不可变缓存，旧编号音频计划使用一天缓存。

## 5. 微信合法域名

完整清单校验和小程序教材地址切换已完成。现在需要在微信公众平台的 **request 合法域名** 添加：

`https://kotobud-assets-1490543304.cos.ap-beijing.myqcloud.com`

教材正文由 `uni.request` 获取。本阶段不需要把 COS 域名加入 `downloadFile` 合法域名；音频仍使用原 Cloudflare 链路。音频迁移后，再根据最终播放和缓存请求配置 COS 的 `downloadFile` 合法域名。当前没有 WebSocket 或小程序上传需求。

## 6. 分阶段验收与回滚

第一阶段验收：

1. 发布 7 个教材对象并通过远端清单校验。
2. 用公开 HTTPS 地址访问每个教材 JSON，确认状态码、长度和内容。
3. 配置微信 `request` 合法域名并用该域名构建小程序。
4. 中国大陆真机切换六册词书，打开课次并进入学习页。
5. 关闭网络后重新打开已缓存词书，确认本地缓存仍可用。
6. 确认登录、Pull、合并、`isSyncReady` 门禁和 Push 仍走 Cloudflare。

若教材读取异常，只需把 `VITE_MINIPROGRAM_TEXTBOOK_ASSET_BASE_URL` 恢复为 `https://kotobud.com` 并重新构建，不需要变更本地数据或同步协议。

只有第一阶段在中国大陆真机通过后才执行音频阶段。音频阶段使用 `--scope=audio` 生成并上传 18,122 个对象，随后配置 `downloadFile` 合法域名，验证双声线播放、缓存命中、并发互斥、离页停止和 iOS 静音开关行为。
