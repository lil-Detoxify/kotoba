# KotoBud 微信小程序发布验收清单

更新时间：2026-09-28。此清单区分自动化结果、开发者工具结果和真机结果；未填写证据的项目不得标记为通过。当前状态摘要见[小程序交接](../HANDOFF_MINIPROGRAM.md)。

## 1. 当前自动化基线

- 分支：`feature/miniprogram`
- 构建目录：`apps/miniprogram/dist/build/mp-weixin`
- 本地验收命令（2026-09-28 的实跑结果见下条；`verify:build` 属于历史验收记录）：
  - `npm test`
  - `npm run check:cloudflare`
  - `npm run type-check --workspace=apps/miniprogram`
  - `npm run build:miniprogram`
  - `npm run verify:build --workspace=apps/miniprogram`
- 当前工作树构建（2026-09-28）：`npm test` 42 个文件、367 项通过；Cloudflare 与小程序类型检查通过；`build:miniprogram` 通过；`verify:release` 报告 70 个文件、1,041,433 bytes（0.993 MiB）、0 个音频文件，AppID 格式检查通过。仅为本地待验收产物，尚无正式上传、审核或发布记录。
- 源码已配置正式 AppID `wx63a1b41c7c7e9de2`；是否属于可上传发布产物，仍取决于对应账号权限、后台域名、隐私配置和真机验收。

## 2. 正式账号与服务端前置

- [x] 源码配置正式小程序 AppID：`wx63a1b41c7c7e9de2`。
- [ ] 在微信公众平台确认当前开发者工具账号具备该小程序的开发与上传权限。
- [ ] 在本机微信开发者工具登录该小程序账号。
- [ ] 将 `https://kotobud.com` 登记为 `request` 与 `downloadFile` 合法域名；教材和音频默认分别从该域名的 `/data/books/` 与 `/audio/` 提供，源码已开启合法域名校验，必须在后台登记后复测。
- [ ] 若教材基址覆盖为 COS，需登记 COS 为 `request` 合法域名；若音频对象迁移至 COS 并覆盖音频基址，需登记 COS 为 `downloadFile` 合法域名。不得关闭域名校验。
- [ ] 在微信后台配置《小程序用户隐私保护指引》的真实运营主体、联系方式、数据种类、用途和第三方服务说明。
- [ ] AppSecret 只配置在 Cloudflare Worker Secret；不得写入源码、环境文件、构建产物或聊天记录。
- [ ] 若启用微信快速登录，先在 Worker 新增安全的 `code` 换取统一 KotoBud session 接口，再接客户端。当前生产后端没有此端点，客户端不得伪造 OpenID 或 session。

## 3. 正式构建

当前源码已包含正式 AppID，可直接构建：

```powershell
npm run build:miniprogram
npm run verify:release --workspace=apps/miniprogram
```

`verify:release` 必须同时满足：真实格式 AppID、合法域名校验开启、代码包小于 2 MiB、无音频文件入包、源码无浏览器专属 API，并验证编译后的隐私页、隐私检查和竖屏配置。`VITE_WX_APPID` / `WX_APPID` 仍可用于受控构建环境覆盖 AppID。

## 4. 微信开发者工具验收

- [ ] 导入 `apps/miniprogram/dist/build/mp-weixin`，确认项目 AppID 与后台一致。
- [ ] 清除缓存后冷启动；未同意隐私说明时只允许离线学习，不恢复账号、不 Pull、不 Push。
- [ ] 同意隐私说明后按 `local hydrate → restore auth → cloud pull → validate payload → deterministic reconciliation → hydrate local → isSyncReady → allow push` 完成恢复。
- [ ] 开启合法域名校验，验证六册教材按需下载、当前构建来源的女声/男声发音、音频缓存命中和清理；仅在显式配置 COS 音频基址的构建中验证 COS 播放及 Cloudflare 失败回退。
- [ ] 使用代码依赖分析确认教材正文、词典分片和批量音频未进入主包。
- [ ] 验证隐私说明页、微信平台隐私指引入口、拒绝后的离线降级和撤回同意后的立即停同步。

## 5. 真机矩阵

每一项记录设备型号、系统版本、微信版本、构建提交和结果。

| 场景 | iPhone | Android | 证据 |
| --- | --- | --- | --- |
| 刘海/灵动岛与底部安全区 | [ ] | [ ] | 截图/录屏 |
| 320px 级窄屏与系统大字体 | [ ] | [ ] | 截图/录屏 |
| 竖屏锁定及旋转后布局 | [ ] | [ ] | 录屏 |
| 点击/左右滑动翻卡、多指取消 | [ ] | [ ] | 录屏 |
| 与 Web 一致的三档评分只保存一次 | [ ] | [ ] | 操作记录 |
| 卡片、听音题、慢速发音 | [ ] | [ ] | 录屏 |
| 多页面音频焦点互斥、离页即停 | [ ] | [ ] | 录屏 |
| iOS 物理静音开关开/关 | [ ] | 不适用 | 录屏 |
| 缓存命中、清理、断网回退 | [ ] | [ ] | 操作记录 |
| 断网启动与恢复联网 | [ ] | [ ] | 同步日志 |
| 空本地/非空云端、账号切换 | [ ] | [ ] | D1 只读核对 |

## 6. 提审与交付

- [ ] 将本清单、正式 commit SHA、构建时间、AppID 后四位和主包统计一起归档。
- [ ] 上传前再次运行全部五道自动化门禁，确保工作区中的构建与待提交 commit 一致。
- [ ] 微信开发者工具上传后记录版本号与上传时间；审核反馈必须回写到本清单。
- [ ] 只有审核通过并由用户明确授权发布后才能发布正式版；当前开发完成不等于已上线。
