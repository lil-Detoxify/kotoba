# KotoBud Phase 1 ~ Phase 7: 账号体系与云同步全阶段技术实施报告

> **实施日期**：2026-09-18  
> **实施分支**：`main` (Production) & `dev` / `staging` (Staging)  
> **验证状态**：全部 9 个测试套件、97 项单元与远程 E2E 测试 100% 通过  
> **线上验证地址**：  
> - 生产正式地址：`https://kotobud.com`（绑定生产 D1 `kotobud-prod-db`，Live 验证 100% 通过）  
> - Staging 验收地址：`https://staging.kotoba-iuz.pages.dev`（绑定测试 D1 `kotobud-staging-db`，Live 验证 100% 通过）  

---

## 一、最终整体架构 (Final Architecture)

根据“**CloudBase 仅负责身份认证 Auth，用户业务数据 100% 存储于 Cloudflare D1 + Workers，离线优先、零数据丢失、零额外云开发套餐费用**”的核心原则，全链路架构如下：

```
KotoBud Web / Mobile Web / Windows (Electron)
        │
        ├── [1. 同源鉴权代理] Cloudflare Worker /api/v1/auth/*
        │      ├── POST /api/v1/auth/send-code  ──> 服务端调用 CloudBase Gateway
        │      ├── POST /api/v1/auth/verify-code ──> 服务端调用 CloudBase Gateway 校验并签发
        │      └── GET  /api/v1/session          ──> 服务端自省与 D1 用户会话映射
        │          (优势：免配 CloudBase WEB 安全域名，彻底避开 FreePackageDenied 报错，免交腾讯云套餐费)
        │
        ├── [2. 身份认证提供商] 腾讯 CloudBase Auth v2 Gateway
        │      └── 仅负责：
        │          - 环境 ID: kotobud-staging-d4femojn7def1c91
        │          - 邮箱验证码发送与校验（免密登录）
        │          - 发放短时 access_token 与 refresh_token
        │          - 提供用户 UID (provider_uid)
        │          - 严禁且未创建任何 CloudBase 业务数据库集合！
        │
        └── [3. 业务数据层] Cloudflare Workers + Cloudflare D1 (SQL)
               ├── Production 环境 (main / kotobud.com) -> kotobud-prod-db
               └── Staging 环境 (dev / staging.kotobud.com) -> kotobud-staging-db
                      └── 负责：
                          - 校验 Authorization: Bearer <cloudbase_token>
                          - 服务端用户映射与安全隔离 (kb_xxxxxxxxxxxxxxxx)
                          - 用户学习进度增量与字段级 LWW 同步 (user_progress)
                          - 不可变复习事件追加与幂等去重 (review_events)
                          - 全局偏好与设置同步 (user_settings: pronunciationVoice, currentBookId)
```

---

## 二、各阶段完成清单 (Phases 1 ~ 7 Completion)

### Phase 1: 核心认证与存储骨架搭建 (Completed)
- 创建 Cloudflare D1 数据库 `kotobud-staging-db` (`0e503489-31de-412d-ab5c-1f54ebc06589`)。
- 编写初始迁移脚本 `migrations/0001_initial_sync_schema.sql`，包含 `users`, `user_progress`, `review_events`, `user_settings` 四张核心表及索引。
- 扩展 `@jp/models` 与 `@jp/core`，引入 FSRS 卡片确定性重放算法 `reconcileFsrsFromEvents` 及字段级 LWW 合并。
- 扩展 `@jp/storage`，实现 `data` -> `data_guest` 游客升级保护，以及 `data_user_{id}` 命名空间隔离。
- 扩展 Cloudflare Worker，实现 `/api/v1/sync/bootstrap`, `/api/v1/sync/pull`, `/api/v1/sync/push`, `/api/v1/sync/status` 等路由。

### Phase 2: 本地存储层快照与回滚保护 (Completed)
- 在 `packages/storage/src/index.ts` 中实现：
  - `hasPreLoginSnapshot(): Promise<boolean>`：检测是否存在登录前本地快照。
  - `restorePreLoginSnapshot(): Promise<boolean>`：在发生极端合并异常或用户撤回时，安全将 `data_backup_pre_login` 无损回滚至当前命名空间。
- 确保任何登录、合并流程均无法破坏本地原有的离线与游客数据。

### Phase 3: 同步韧性、超时与离线出站队列 (Completed)
- 在 `packages/sync/src/index.ts` 中对 `WorkerSyncClient` 进行工业级健壮性加固：
  - **请求超时保护**：基于 `AbortController` 施加 10 秒超时中断，避免弱网悬挂。
  - **指数退避重试 (Exponential Backoff)**：遇到网络错误或 5xx 服务端暂时错误时，自动进行带随机抖动的退避重试（最多 3 次）。
  - **非阻塞式离线出站队列**：遇到离线或网络故障时，操作静默入队（IndexedDB `sync_queue`），不阻断前端任何学习交互，待网络恢复后无缝排空（Drain）。

### Phase 4: Web 端体验打磨与偏好设置云同步 (Completed)
- 在 `apps/web/src/store.ts` 中接入：
  - 发音偏好设置云同步：`localStorage['jp-vocab.pronunciation-voice']`（`female` / `male`）双向同步至 D1 `user_settings.pronunciation_voice`。
  - 当前词书进度同步：`currentBookId` 与各教材位置双向同步。
- 在 `apps/web/src/App.vue` 中接入：
  - 增加 `document.addEventListener('visibilitychange')` 监听：用户切换标签页返回或切回手机应用时，立即自动触发静默对齐刷新。
  - 完善 `SyncStatusBadge`（已同步、同步中、离线、重试），清晰直观展示同步状态。

### Phase 5: 真实环境多客户端端到端验证 (Completed)
- 编写 `tests/staging-live-e2e.test.ts`，模拟 Device 1 与 Device 2 两个完全独立的客户端：
  - Device 1 启动学习、评分、产生复习事件并推送到远端 D1。
  - Device 2 从远端 D1 拉取数据，完整复原 Device 1 进度与发音偏好。
  - Device 2 标记生词（`isDifficult: true`）并推送到 D1。
  - Device 1 再次拉取，基于字段级 LWW 判定 Device 2 的生词标记成功合并。
  - Device 1 随后取消生词标记（`isDifficult: false`），基于更高时间戳成功覆盖为非生词。
- 修复了 Worker 中 partial update 时 `undefined` 导致 Cloudflare D1 报错的问题，全部参数严格使用 `coalesce` 与默认值绑定。

### Phase 6: Windows 客户端桌面端适配 (Completed)
- 审查并排查 Electron 内容安全策略（CSP）：
  - 修改 `apps/windows/main.cjs` 中的 CSP 头：
    `connect-src 'self' https:;`
  - 解除了原先仅允许 `'self'` 导致桌面端被阻止访问 CloudBase Auth 与 Cloudflare Worker HTTPS 接口的限制。
  - 维持音频本地与 R2 混合播放架构不变，保证 Windows 端离线背词与联网云同步两者兼备。

### Phase 7: Production 正式上线与全量验证 (Completed)
- **生产数据库开通**：
  - 数据库名称：`kotobud-prod-db`
  - 数据库 UUID：`963afe70-1f53-4628-847b-0066bc232d56`
  - 迁移应用：`npx wrangler d1 migrations apply DB --remote`（成功将 `0001_initial_sync_schema.sql` 应用于生产数据库）。
- **Wrangler 环境隔离配置**：
  - 顶层环境（生产）：绑定 `kotobud-prod-db`。
  - `env.preview`（Staging）：绑定 `kotobud-staging-db`。
  - 环境变量与 `KOTOBA_R2` 资源在两套环境完整声明，无任何配置遗漏。
- **线上部署与验证**：
  - 构建静态产物并部署至 Cloudflare Pages：`node scripts/deploy_pages.cjs main`。
  - 生产端点健康探测：
    - `GET https://kotobud.com/api/v1/sync/status` -> `{"status":"ok","d1_bound":true}` (200 OK)
    - `GET https://kotobud.com/api/v1/capabilities` -> `{"version":"v1","enabled":true,"storage":"cloudflare_d1","auth":"cloudbase_auth_v2"}` (200 OK)
    - `GET https://kotobud.com/robots.txt` -> 搜索引擎正常抓取 (`Allow: /`, 200 OK)
    - `GET https://kotobud.com/` -> Canonical 统一指向 `https://kotobud.com/` (200 OK)
  - 真实双端数据同步验证：Device 1 生产推送 -> D1 存储 -> Device 2 生产拉取，数据一致性 100% 确认通过。

---

## 三、自动化测试全景表 (97/97 Tests Passing)

```bash
$ npm test

 ✓ tests/windows.test.ts (7 tests)
 ✓ tests/worker-routing.test.ts (8 tests)
 ✓ tests/sync.test.ts (6 tests)
 ✓ tests/cloudflare-functions.test.ts (7 tests)
 ✓ tests/cloud-sync.test.ts (17 tests)
 ✓ tests/quiz.test.ts (13 tests)
 ✓ tests/domain.test.ts (24 tests)
 ✓ tests/textbooks.test.ts (8 tests)
 ✓ tests/staging-live-e2e.test.ts (7 tests)

 Test Files  9 passed (9)
      Tests  97 passed (97)
```

---

## 四、生产与 Staging 环境配置对照

| 配置项 | Staging (预发布环境) | Production (生产正式环境) |
| :--- | :--- | :--- |
| **访问域名** | `https://staging.kotobud.com` / `https://staging.kotoba-iuz.pages.dev` | `https://kotobud.com` |
| **Git 分支** | `dev` / `staging` | `main` |
| **D1 数据库名** | `kotobud-staging-db` | `kotobud-prod-db` |
| **D1 数据库 UUID** | `0e503489-31de-412d-ab5c-1f54ebc06589` | `963afe70-1f53-4628-847b-0066bc232d56` |
| **D1 绑定名称** | `DB` | `DB` |
| **R2 资源桶** | `kotoba-assets` (只读共享) | `kotoba-assets` (只读共享) |
| **Auth 体系** | CloudBase Auth v2 (仅验证码与 UID) | CloudBase Auth v2 (仅验证码与 UID) |
| **SEO 策略** | `X-Robots-Tag: noindex, nofollow` | `robots.txt` 允许抓取，带 `canonical` |

---

## 五、零破坏性验证与安全承诺核对

1. ✅ **TTS 音频文件零触碰**：全量 18,072 个词条音频保持在 R2 存储桶未作任何二次上传或变更。
2. ✅ **词典与词条格式零破坏**：词书分片结构、单词 ID 格式与教材数据完全保持原始状态。
3. ✅ **游客模式完整可用**：新用户在不登录的状态下，所有学习进度完全正常保存在本地 IndexedDB（`data_guest`），体验流畅无阻。
4. ✅ **业务数据绝对不上 CloudBase**：用户所有的学习记录、复习历史、生词与偏好完全保存在 Cloudflare D1（SQL），杜绝数据外流。
