# 微信登录开发预案（已封存）

更新：2026-09-30。用户已决定暂停微信登录接入。本页保留设计、代码位置、历史环境记录与未来验收清单，**不是当前发布待办**。在用户明确决定恢复前，后续 Web、Windows、小程序版本均不得显示微信登录或绑定入口，不得启用微信认证路由，也不得因已有 Preview 配置而自动启用。当前工作树的 Web 入口显示条件固定为 `false`，小程序两个入口固定隐藏，Worker 的 `/api/v1/auth/wechat/*` 统一返回 `feature_archived`（404）；原实现和回归场景留在源码中，`tests/wechat-auth.test.ts` 的原接入测试跳过，只运行封存路由测试。未来恢复须明确修改这些门禁，重新审阅账号归属、安全性、微信平台资质与真机/三端验收，不可仅设置环境变量或部署旧构建。

2026-09-29 Web v0.7.2 生产发布仅包含页面、版本与更新公告：生产构建隐藏微信扫码入口，使用 `scripts/prepare-web-only-production-worker.cjs` 准备并由 `deploy_pages.cjs main` 校验兼容 Worker。生产 D1 尚未执行微信迁移，Pages 生产环境尚无 `JWT_SECRET` 与微信凭据；此发布不代表三端微信登录已上线。Staging 的微信登录工作树与 Preview 环境继续保留。

2026-09-30 用户提供的微信开放平台客服回复确认：当前个人主体开放平台账号**没有创建过任何应用**；自 2026-09-14 起，该类账号不能新建应用。此前“已有网站应用且仅登记 `kotobud.com`”的口头前提已被客服核查结果推翻，不能再据此索取或配置 `WECHAT_WEB_APP_ID` / `WECHAT_WEB_APP_SECRET`。现有网站 OAuth 代码保留但不可联调或上线；须取得符合平台要求且已审核的网站应用及相应回调域名后才能启用。小程序属于另一账号/应用类型，仍需单独核对其 AppSecret、合法域名与真机能力；客服本次回复不证明小程序登录不可用。

## 远端环境进度（2026-09-28）

- Preview D1 已应用 `0003_wechat_identities.sql` 和 `0004_wechat_link_redeem.sql`；迁移列表显示无待应用项，已核对身份表、票据表、索引和新增的三列。生产 D1 尚未执行这两项迁移。
- Cloudflare Pages Preview 已设置 `JWT_SECRET`（新生成的随机值）、`WECHAT_MINIPROGRAM_APP_ID`（与小程序 manifest 一致）和 `WECHAT_WEB_REDIRECT_URI=https://staging.kotobud.com/api/v1/auth/wechat/callback`。Secret 值不写入仓库；新 JWT 密钥可能使旧 Preview 会话需要重新登录。
- Cloudflare Pages Preview 尚缺 `WECHAT_MINIPROGRAM_APP_SECRET`；当前个人主体开放平台账号没有网站应用，因此也无法提供 `WECHAT_WEB_APP_ID`、`WECHAT_WEB_APP_SECRET`。生产环境尚未设置这些微信变量或 `JWT_SECRET`。密钥应由持有人直接在 Cloudflare Pages 对应环境的 **Settings → Variables and Secrets** 中加密填写，不经聊天传递。
- 本轮工作树已构建并部署至 Pages `staging` 分支（部署 URL `https://b19d0215.kotoba-iuz.pages.dev`）。分支别名和 `staging.kotobud.com` 的 `/app/` 均加载 `/assets/main-DzoIYrhm.js`；生产 `/app/` 仍加载 `/assets/main-DS1OWsG2.js`。Staging `/api/v1/sync/status` 返回 D1 已绑定，微信网站与小程序登录接口因缺少对应应用密钥返回 `wechat_not_configured`。网站应用的 Staging 授权回调域名尚未获准，因此真实三端联调仍待进行。

## 登录与账号关系

### 2026-09-30 跨端登录缺口

当前小程序 `mini-login` 会为首次使用微信的用户创建没有邮箱的 KotoBud 账号。Web/Windows 的现有邮箱入口无法凭小程序 OpenID 登录该账号；用户随后直接用邮箱注册，会得到另一个 `users.id`，学习记录不会自动归并。因此“仅开通小程序微信登录”不满足无邮箱用户的三端登录需求。当前代码也没有在小程序微信会话中给同一账号绑定已验证邮箱的流程。不得让用户以重新注册或自动合并账号作为解决方法。

可行方向之一是让 Web/Windows 创建短时、一次性的登录请求，由已登录微信的小程序用户核对并显式确认，电脑端再凭私有校验值领取**同一 `users.id`** 的 KotoBud 会话。此方案是 KotoBud 自有的跨设备确认流程，不是微信开放平台网站 OAuth；需另行实现、防重放与误确认测试，并核实微信平台规则。另一方向是让小程序用户自愿验证并绑定邮箱，再用该邮箱登录 Web/Windows；不能要求不愿使用邮箱的用户靠重新注册迁移记录。两种方向目前都未实现。

- 微信小程序：用户同意隐私指引后，客户端调用 `uni.login({ provider: 'weixin' })` 获取一次性 `code`，发到 `/api/v1/auth/wechat/mini-login`。Worker 使用小程序 AppSecret 向微信换取 OpenID / UnionID，只给客户端 KotoBud 会话；微信 `session_key` 不下发。
- Web：登录弹窗从 `/api/v1/auth/wechat/attempt` 取得微信开放平台网站应用扫码地址。微信回调只在服务端记录认证结果；发起页凭私有 verifier 轮询 `/api/v1/auth/wechat/redeem`，一次性领取现有 KotoBud 会话。
- Windows：使用同一 Web 页面。扫码地址经 Electron 现有外链处理交由系统浏览器打开，桌面应用保留私有 verifier 并领取会话，因此无须把 token 放进 URL 或注册新的操作系统协议。
- 三端共享 D1 的 `users.id` 和原有学习数据。`auth_identities` 分开存小程序 OpenID、网站 OpenID、可用时的 UnionID；同一 UnionID 自动映射到同一用户。若微信没有返回 UnionID，不推断两个 OpenID 属于同一人。
- 已有邮箱账号先登录，在设置页显式绑定微信。已绑定其他 KotoBud 账号的微信返回冲突，不自动合并两份学习记录。绑定接受有效 KotoBud 会话，旧邮箱验证码会话必须经过 CloudBase 在线验真。

## 部署前配置

1. 在 **Preview D1** 先应用 `migrations/0003_wechat_identities.sql` 和 `migrations/0004_wechat_link_redeem.sql`，确认表、索引和列；生产发布时对生产 D1 再执行这两项迁移。旧 `users` 与学习数据表不改动。Preview 与生产的身份表彼此独立，不能跨库测试同一账号。
2. 为对应 Pages 环境设置 `JWT_SECRET` 为强随机服务端密钥。当前工作树移除了此前用环境 ID 或固定字符串签名的回退逻辑；没有独立 `JWT_SECRET` 时不能签发 KotoBud 会话。更换现有 JWT 签名密钥会使旧访问令牌失效，应在测试环境先验证刷新与重新登录。
3. 设置小程序服务端变量 `WECHAT_MINIPROGRAM_APP_ID`（须与 `apps/miniprogram/src/manifest.json` 的 AppID 一致）和密钥 `WECHAT_MINIPROGRAM_APP_SECRET`。密钥仅放 Cloudflare 服务端 Secret，不放 `VITE_`、仓库、构建产物或对话。
4. 网站 OAuth 仅在取得符合微信开放平台要求、已审核且允许对应回调域名的网站应用后，才能设置 `WECHAT_WEB_APP_ID`、`WECHAT_WEB_APP_SECRET` 与 `WECHAT_WEB_REDIRECT_URI`。当前个人主体账号没有此类应用，不能将小程序 AppID/Secret 代填。回调必须精确指向当前环境的 `https://<域名>/api/v1/auth/wechat/callback`，且该域名已在微信开放平台获准。Worker 当前只允许 `kotobud.com` 或 `staging.kotobud.com`。Staging 发起与回调必须落在同一域名、同一 D1；不能借生产回调操作 Preview D1。
5. 核对小程序后台的 `request` 合法域名包含本次使用的 API 域名，保持域名校验开启；按现有隐私指引完成主体和用途核对。

小程序 Staging 测试包须在构建时显式设置 `VITE_API_BASE_URL=https://staging.kotobud.com`；默认构建会指向生产 `kotobud.com`。Windows Staging 测试包也须设置同一构建变量，命令见 [Windows README](../../apps/windows/README.md)。两种测试包均需核实实际登录请求落在 Preview 域名；小程序使用无正式学习记录的测试设备或开发者工具数据，Windows 使用独立系统用户或虚拟机，再以测试账号操作，避免本地数据跨环境混用。

配置前，界面会给出明确的未配置错误，不会假装完成微信登录。应用程序不应记录微信 `code`、AppSecret、OAuth access token、`session_key`、KotoBud refresh token 或私有 verifier。
`MOCK_AUTH` 只能在隔离的自动化测试环境使用，不能设置在 Staging 或生产。

## 联调与发布门禁

- 用测试微信分别在小程序登录、Web 扫码、Windows 系统浏览器扫码，确认三个客户端返回相同 `users.id`，并在 Pull 完成前无 Push。三端自然复用同一账号以微信返回 UnionID 为前提；若任一接口未返回 UnionID，须先在同一 KotoBud 邮箱账号下分别显式绑定小程序和网站微信身份，再验收同一 `users.id`，不能按不同 OpenID 猜测归属。
- 先用已有邮箱账号登录并绑定，再在三端用同一微信登录；检查学习记录归属没有变化。用已绑定其他账号的微信重复绑定，应显示冲突且两账号数据保持分离。
- 测试扫码取消、错误 `state`、错误 verifier、二维码超时、回调重复、票据重放、网络中断及账号切换；观察是否仍能保持本地学习记录。
- Windows 需要用真实安装版与便携版各做系统浏览器往返和登录持久化验收。小程序需按发布清单做微信开发者工具与 iOS / Android 真机验收。
- 先在 Staging 完成迁移、配置、部署与真实微信联调；生产发布和 Windows 新包发布沿现有交接文档门禁办理。

微信接口参考：[小程序登录](https://developers.weixin.qq.com/miniprogram/dev/framework/open-ability/login.html)、[code2Session](https://developers.weixin.qq.com/miniprogram/dev/server/API/user-login/api_code2session.html)、[网站应用微信登录](https://developers.weixin.qq.com/doc/oplatform/Website_App/WeChat_Login/Wechat_Login.html)。
