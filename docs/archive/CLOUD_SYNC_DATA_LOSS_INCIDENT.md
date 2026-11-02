# 线上事故排查与复盘报告：云端学习记录消失与多端同步异常

**最新事故编号**：INCIDENT-20260921-02  
**初次发生时间**：2026-09-19 08:28 ~ 08:29 (UTC+8)  
**再次复现时间**：2026-09-21 14:30 ~ 14:39 (UTC+8)  
**当前排查时间**：2026-09-21 15:00 ~ 15:10 (UTC+8)  
**核心定性**：**云端数据 100% 完整未丢失（数据丢失率 0%）**。复现根因明确：**上一次的代码修复仅提交在本地/特性分支（`feature/miniprogram`），未部署上线；生产环境 Pages 仍运行 3 天前的旧构建（`6061f33`）**。同时，旧构建在本次复现中反向将云端 `user_settings.current_book_id` 覆写为 `biaori-beginner-upper`（标日初级上册），而用户真实进度全部在 `biaori-beginner-lower`（标日初级下册），产生二次展示脱节。

---

## 事故 7 问深度复盘与分析

### 1. 本次真正根因 (Root Cause)

1. **部署脱节（直接促成因素）**：
   - 生产环境 `https://kotobud.com` 当前承载的所有请求，均由 Cloudflare Pages 构建部署 `ee925395-e0c5-47c2-b1aa-165609a427f0`（commit `6061f33`，3 天前发布）提供。
   - 上一轮对于 `Pull-First` 和 `isSyncReady` 门禁的代码加固，当时提交在 `feature/miniprogram`（commit `1d37f4a9`），**从未合并至生产 `main` 分支，也从未执行 `wrangler pages deploy`**。
   - 用户今天 14:30 使用 iPhone Safari 访问 `kotobud.com` 时，浏览器拉取的仍然是旧的未加固打包产物 `assets/index-C-Z2RtGk.js`。

2. **旧版客户端在无拉取情况下反向覆盖与盲目标记“已同步”**：
   - 旧代码的 `init()` 在检测到已有登录态时，**从不调用 `syncClient.pull()`**。
   - 当用户在 iOS Safari 中打开（或 IndexedDB 处于初始状态），本地无学习记录，`store.init()` 将本地 `currentBookId` 默认置为 `metaBooks[0].id`（即 `biaori-beginner-upper` 标日初级上册）。
   - 3.5 秒后，旧版的 `flushSyncQueue()` 定时器触发，将 `{ events: [], progress: [], settings: { currentBookId: "biaori-beginner-upper" } }` 推送给生产 Worker。
   - 生产 Worker 接收后更新了 D1 `user_settings`，返回 200。
   - 旧客户端收到 200 后立即将状态置为 `syncStatus = 'synced'`，显示绿色的**“✓ 已同步”**徽标，但此时本地没有执行任何数据拉取，本地卡片记录依然为 0，造成严重的“已同步但数据显示全 0”的假象。

3. **词书进度作用域脱节（二次假性归零）**：
   - 用户在 9 月 18 日实际学习的 15 个单词全部属于 **标日初级下册**（`biaori-beginner-lower`，第 28 课）。
   - 由于上述第 2 点，云端 `user_settings` 的当前词书在今天 14:39:11 被更新为 `biaori-beginner-upper`（初级上册）。
   - 首页卡片（`Home.vue`）只统计当前所选词书的单词进度。即使客户端后续具备拉取能力，若默认加载初级上册，上册的已学词数客观上就是 0（0/1077 词），依然会向用户展示“已学 0 词”。客户端必须具备基于真实进度的智能词书自愈回退机制。

---

### 2. 上次修复为什么仍会复现

- **代码分流与部署真空**：
  上一次任务在完成单测和本地验证后，工作重心直接转入了微信小程序的架构审计与骨架搭建，代码留在 `feature/miniprogram` 分支。
  **由于没有将加固代码合并到主干并完成正式生产发布，线上运行的代码版本与仓库前沿脱节。** 用户只要再次使用未保留本地 IndexedDB 缓存的环境打开网站，100% 触发旧代码路径。
- **缺失客户端词书自愈与服务端防御**：
  上一轮修复中，虽然在客户端加入了 `reconcileWithCloud`，但未考虑到“云端 `user_settings` 如果已经被旧客户端污染成了上册，客户端拉取后如何自愈修正”这一边缘场景；同时服务端 Worker 当时缺乏拦截无进度默认词书覆盖的保护机制。

---

### 3. 生产数据目前是否真实丢失

**结论：生产数据 100% 完好无损，绝对没有丢失任何一行有效记录。**

生产环境 Cloudflare D1（`kotobud-prod-db`, ID: `963afe70-1f53-4628-847b-0066bc232d56`）只读调证数据如下：

| 表名 | 记录数 | 关键数据 / 字段 | 最近更新时间 (UTC / 北京时间) | 状态 |
| :--- | :--- | :--- | :--- | :--- |
| **`users`** | 1 条 | `id`: `kb_a4bef5f880da486b`<br>`email`: `941994230@qq.com`<br>`provider_uid`: `2100881458515152896` | 2026-09-18T09:35:47Z (17:35) | 正常，唯一映射，无账号分裂 |
| **`sessions`** | 1 条 | `id`: `ses_2b96b3192a3b4f3f`<br>`user_agent`: iPhone Safari iOS 18_7 | 2026-10-21T06:30:40Z 过期 | 会话有效且活跃 |
| **`user_progress`** | **15 条** | 全部 15 词均为 `biaori-beginner-lower-w-28-1212` ~ `1226`<br>`status`: `learning`, `review_count`: 1 | 2026-09-18T09:44:00Z (17:44) | **完整保留，无一遗失** |
| **`review_events`** | **15 条** | 15 条学习评分流水，`rating`: 3 | 2026-09-18T09:43:55Z (17:43) | **完整保留，流水不可变** |
| **`user_settings`** | 1 条 | `current_book_id`: `biaori-beginner-upper`<br>`pronunciation_voice`: `female` | **2026-09-21T06:39:11Z (14:39:11)** | 被旧客户端反向推送上册，已掌握其成因 |

---

### 4. 本次修改的文件与逻辑

#### (1) `apps/web/src/store.ts`
- **严格状态机与同步闸门（Sync Barrier）**：
  - 将 `isSyncReady` 作为推送与标记的唯一物理门禁，默认严格为 `false`。
  - 在 `init()` 和 `onAuthStateChange` 时，只要切换/恢复用户，第一时间将 `isSyncReady.value = false; syncStatus.value = 'syncing'`。
  - 必须完整走通：`restore auth -> resolve canonical user -> successful cloud pull -> validate cloud payload -> deterministic reconciliation -> hydrate local state -> enable cloud push (isSyncReady=true) -> mark synced`。
  - 若 `pull` 失败（如离线或 5xx），**坚决不允许 `isSyncReady` 设为 `true`**，状态置为 `offline`，绝不向云端推送任何空配置。
- **云端 Payload 严格校验**：
  - 严格校验 `pullRes.progress` 与 `pullRes.events` 必须为 Array，`userId` 必须与当前登录用户完全匹配，防止异常空载荷或身份串包破坏本地。
- **词书智能自愈（Smart Book Self-Healing）**：
  - 在对齐 `currentBookId` 时，如果计算得出候选词书在已对齐状态中已学单词数为 0，而用户在其他词书（如初级下册）中有 >0 的真实学习进度：
  - 自动检测并自愈为用户**拥有最高学习进度或最近有复习事件的真实词书**（`biaori-beginner-lower`），标记来源为 `user`，并在本地和云端完成持久化修正。

#### (2) `scripts/cloudflare-worker.js`
- **详细同步诊断日志（Sync Diagnostics）**：
  - 在 `/api/v1/sync/pull` 和 `/api/v1/sync/push` 中增加结构化日志输出：包含 `type`、`requestId`、`userId`、`client` (User-Agent)、`direction`、`counts`、`bookId`、`timestamp`，便于服务端日志追踪。
- **服务端 Progress Stale-Write 防御**：
  - 当客户端推送进度更新时，比对 `incoming.updatedAt` 与 D1 现有记录的 `updated_at`；若客户端提交的时间戳陈旧，丢弃覆盖操作，保护较新记录。
- **服务端词书默认值降级防御**：
  - 在 `/api/v1/sync/push` 处理 `user_settings` 时，如果客户端提交的词书来源为 `default`，或客户端在没有任何该词书事件/进度的情况下试图将已有学习记录的词书切换为空白词书，服务端自动拦截并保留用户已在学习的词书。

#### (3) `packages/core/src/index.ts`
- **统计范围彻底解耦**：
  - `statistics()` 中的 `learned`、`mastered`、`due`、`streak` 不再狭隘地局限于内存当前加载的单一教材 JSON，而是以全局 `activeStates` 与流水日志为基准，确保跨词书数据也能在顶部总览中完整呈现。

#### (4) `tests/cloud-sync-reconciliation.test.ts`
- 扩充回归测试至 10 大场景，全面覆盖启动空白、网络失败拦截、多端交叉同步、智能词书自愈、旧客户端防御、过期写入防护等。

---

### 5. 数据恢复方式

无需使用冷备份恢复数据库，因为云端的 15 条进度与 15 条流水数据 100% 完好。
恢复路径包括：
1. **客户端访问自愈（无缝恢复）**：
   - 部署包含修复代码的新版本后，用户在 iPhone Safari 或桌面端再次打开应用。
   - 客户端 `init()` 执行并恢复会话，触发 `reconcileWithCloud()` 向云端发起 `pull()`，获得 15 条下册数据。
   - 触发“词书智能自愈”逻辑：检测到云端设置中的初级上册学习量为 0，而初级下册拥有 15 个词，客户端自动将当前活跃词书纠正为 `biaori-beginner-lower`。
   - 自动按需拉取下册词库 JSON，首页卡片立刻展示：“标日初级下册 已学 15/1083 词”，连续学习天数与复习数即刻点亮。
2. **可选服务端运维补偿**：
   - 若需在用户打开前直接在 D1 修正 `user_settings`，可执行单行 UPDATE：
     `UPDATE user_settings SET current_book_id = 'biaori-beginner-lower', updated_at = '2026-09-21T07:10:00Z' WHERE user_id = 'kb_a4bef5f880da486b';`

---

### 6. 回归测试结果

本地与云端模拟共 18 个测试套件，**161 个单元与端到端测试 100% 全部通过**：
- `tests/cloud-sync-reconciliation.test.ts`（10 个场景全部 PASS）：
  - Scenario 1: 云端有数据 + 本地全空 -> 自动拉取与无损复原，不向云端推送空默认值
  - Scenario 2: 云端有数据 + 本地有未同步离线数据 -> 确定性合并（LWW 状态合并、流水重放、保留离线变更）
  - Scenario 3: 离线 / 首次 pull 失败 -> 严格阻断向云端推送默认值，保留本地缓存，等待网络恢复
  - Scenario 4: `init()` 后认证异步恢复（晚于启动生命周期） -> 自动触发重选命名空间与云端对齐
  - Scenario 5: 用户学的是下册但默认加载上册词库 -> `statistics()` 正确解耦展示 `learned=15, due=15, streak=1`
  - Scenario 6: 跨设备交替同步 -> 陈旧写入（stale-write）被拒绝，用户选择的词书不被默认值覆盖
  - Scenario 7: 云端 settings 被污染为上册（0词）但 progress 有下册15词 -> 客户端自愈选择下册
  - Scenario 8: 旧版/未加固客户端推送空白 settings -> Worker 服务端主动拦截并保护已有学习词书
  - Scenario 9: 弱网/接口失败导致 pull 报错 -> `isSyncReady` 保持 `false`，彻底封死反向推送
  - Scenario 10: 过期时间戳（stale progress）写入 -> 服务端严格拒收，保持最新状态
- 类型检查与静态审计：
  - `vue-tsc --noEmit`: 0 errors
  - `npm run check:cloudflare`: 0 errors
  - `npm run build`: 生产产物构建成功

---

### 7. 后续防止再次发生的长效机制

1. **分支管理与部署闭环规范**：
   - 确立“修复代码未部署等于未修复”的红线原则。涉及线上生产事故的修复，必须立即合并至 `main` 并完成正式发布部署验证，禁止将未部署的修复代码悬置在开发或特性分支。
2. **状态机单向锁与物理阻断**：
   - 在客户端与小程序端全面推行 `isSyncReady` 状态机。只要未经过一次成功的 `pull` 与校验，任何页面组件、定时任务、页面卸载或退火事件都无权向服务端提交 `push`。
3. **服务端纵深防御（Defense-in-Depth）**：
   - 服务端 Worker 永久启用版本时钟保护与降级检测。即使未来有异常客户端试图提交破坏性状态，服务端在规则层直接阻断。
4. **统一可观测性与审计流水**：
   - 同步诊断日志在 Cloudflare Worker 中全面启用，运维随时可通过 Cloudflare Dashboard 或 Logpush 排查任意用户的每一次同步行为链路。
