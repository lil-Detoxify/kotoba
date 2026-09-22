# 微信小程序中国大陆静态资源迁移报告

更新时间：2026-09-22
状态：教材迁移工具和运行时隔离已完成；等待 COS Bucket 信息后执行首次教材上传

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
| 教材索引 | `apps/web/public/data/books/index.json` | `https://kotobud.com/data/books/index.json` | 1 | 13,139 | 第一阶段 |
| 六册教材正文 | `apps/web/public/data/books/*.json` | `https://kotobud.com/data/books/{bookId}.json?v=biaori-v2` | 6 | 1,264,573 | 第一阶段 |
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

两个资源变量当前都安全回退到 `https://kotobud.com`。首次上线只把教材变量改为已验证的 COS HTTPS 源站；音频变量保持 Cloudflare。教材读取仍通过 `uni.request`，音频缓存仍通过 `uni.downloadFile`，没有引入浏览器 API。

## 4. 可重复发布与校验

发布器位于 `apps/miniprogram/scripts/publish-cos-assets.mjs`，默认范围只有教材。它会：

1. 校验 6 册、104 课、9,117 词目录基线和各分册结构。
2. 生成本地 SHA-256 清单。
3. 通过签名 GET 读取远端真实内容并计算 SHA-256；只有内容、大小和响应头全部相同时才跳过。
4. 写入正确的 `Content-Type`、`Cache-Control` 和哈希元数据。
5. 上传后重新枚举远端对象，并逐个校验大小、真实内容 SHA-256、Content-Type 和 Cache-Control。
6. 通过公开 HTTPS 域名执行匿名 HEAD，确认小程序无需腾讯云密钥即可读取。
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

## 5. 尚待提供的外部信息

仓库中没有以下信息，因此尚未执行真实上传，也不能猜测微信合法域名：

- 完整 COS Bucket 名称（含腾讯云 APPID 后缀）
- COS 地域，例如 `ap-beijing`
- 对外访问方式：COS 默认域名或已备案并启用 HTTPS 的自定义域名
- Bucket 是否允许匿名公共读取

确定访问方式后，微信公众平台需要配置的第一阶段域名只有教材使用的 **request 合法域名**。必须填写确切的 HTTPS 主机名，不含路径。音频迁移后，再把同一已验证主机名加入 **downloadFile 合法域名**。当前没有 WebSocket 或小程序上传需求。

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
