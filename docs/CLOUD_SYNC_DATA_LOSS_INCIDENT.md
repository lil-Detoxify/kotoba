# 线上事故排查报告：云端学习记录消失与多端同步表现异常

**事故编号**：INCIDENT-20260919-01  
**发生时间**：2026-09-19 08:28 ~ 08:29 (UTC+8)  
**排查时间**：2026-09-19 11:45 ~ 11:55 (UTC+8)  
**当前结论**：**云端数据 100% 完整未丢失**，为前端客户端启动拉取机制缺陷与词书作用域计算偏差导致的“假性展示归零”。

---

## 1. 云端数据是否真实丢失

**结论：完全没有丢失。**

经直接只读查询生产环境 Cloudflare D1 数据库（`kotobud-prod-db`, ID: `963afe70-1f53-4628-847b-0066bc232d56`）：
- **`user_progress`（用户学习进度表）**：完整保留 **15 个单词** 的 FSRS 卡片状态与学习记录，状态均为 `learning`，`review_count = 1`。
- **`review_events`（复习事件流水表）**：完整保留 **15 条评价事件日志**（时间戳介于 `2026-09-18T09:36:20.794Z` 至 `2026-09-18T09:43:55.935Z`）。
- **`users`（账户表）**：用户信息、密码哈希与认证绑定完好。
- **`sessions`（会话表）**：有效登录态维持至 `2026-10-19T00:27:53.756Z`。

云端数据库未发生任何数据删除、截断或覆盖。

---

## 2. 受影响 user_id

- **受影响用户 Canonical User ID**：`kb_a4bef5f880da486b`
- **绑定邮箱**：`941994230@qq.com`（`email_normalized`: `941994230@qq.com`）
- **认证提供商**：`cloudbase`（Provider UID: `2100881458515152896`）
- **账户创建时间**：`2026-09-18T09:35:47.397Z` (UTC) / `2026-09-18 17:35:47` (北京时间)
- **活跃会话**：`ses_2b96b3192a3b4f3f`（User-Agent: `Mozilla/5.0 (iPhone; CPU iPhone OS 18_7 like Mac OS X) AppleWebKit/605.1.15`，IP: `114.102.224.5`）

---

## 3. 是否存在重复账户

**结论：不存在重复账户。**

在生产 D1 `users` 表中按 `email`、`email_normalized`、`provider_uid` 检索，该邮箱仅对应唯一一条记录 `kb_a4bef5f880da486b`。当前 iPhone 会话绑定的 `user_id` 与该记录完全一致，不存在账号分裂或映射到新账户的情况。

---

## 4. 最后一次正常数据

- **学习行为时间段**：
  北京时间 `2026-09-18 17:36:20` ~ `17:43:55`（UTC `2026-09-18T09:36:20.794Z` ~ `09:43:55.935Z`）。
- **学习内容**：
  标日初级下册第 28 课（`biaori-beginner-lower-w-28-1212` 至 `biaori-beginner-lower-w-28-1226` 共 15 个词）。
- **最后一次正常上报数据**：
  北京时间 `2026-09-18 17:44:00`（UTC `2026-09-18T09:44:00.143Z`），第 15 个词 `biaori-beginner-lower-w-28-1226` 上报成功，D1 更新状态为 `learning`，下次复习安排在 `2026-09-18T09:53:55.935Z`。

---

## 5. 最后一次异常写入

- **发生时间**：
  北京时间 `2026-09-19 08:29:03`（UTC `2026-09-19T00:29:03.372Z`，与用户截图时间 08:28 ~ 08:29 精确吻合）。
- **写入表与字段**：
  `user_settings` 表中的 `current_book_id` 字段被更新为 `"biaori-beginner-upper"`（标日初级上册）。
- **写入路径与原因**：
  用户在移动端打开应用触发 `init()`，由于本地 IndexedDB 为空，前端默认执行了 `if (!existing && metaBooks[0]) d.currentBookId = metaBooks[0].id;`（即默认设为初级上册），并在启动 3.5 秒后触发了 `flushSyncQueue()`，将此默认值推送到云端 `user_settings`。
- **幸免之处**：
  云端 Worker `/api/v1/sync/push` 实现中，对 `user_progress` 与 `review_events` 采用循环迭代更新（`for (const p of incomingProgress)`），空数组不会执行任何删除操作，因此云端的 15 个单词状态与事件未受破坏。

---

## 6. 事故根因分析 (Root Cause)

本次故障的直接表现是用户看到“已学 0 词、今日待复习 0 词、最近 7 天学习量为 0”，由以下三个环节串联引发：

### 根因 1：前端生命周期中缺失“启动自愈拉取 (Pull-on-Init)”
- **代码位置**：`apps/web/src/store.ts` 中的 `init()`。
- **逻辑缺陷**：全项目中调用 `syncClient.pull()` 的地方**仅有两处**：一是在登录弹窗中用户手动提交登录表单的 `applyAuthenticatedUser()`；二是冲突模态框手动合并。
- **后果**：当用户第二天重新打开网页、Safari 刷新页面、或在独立 PWA / 新标签页中启动时，虽然 `authClient.init()` 顺利恢复了登录态，但 `init()` **只执行了 `await repository.read()` 从本地读取**，根本没有向云端发出 `pull()` 请求。
- 当遇到以下任何情况时，本地 IndexedDB 将为空：
  1. iOS Safari 7 天 ITP 机制清理或无痕浏览模式退出；
  2. 用户在不同设备（如电脑与手机）之间切换；
  3. 用户从 Safari 切换到“添加到主屏幕 (PWA / WebClip)”运行（iOS 下 Safari 与 WebClip 不共享 IndexedDB 沙箱）；
  4. 浏览器缓存或网站数据被重置。
  本地为空且不从云端拉取，导致内存中的 `data.states` 与 `data.logs` 始终为空数组。

### 根因 2：统计范围强依赖已加载词书与本地 `data.words`
- **代码位置**：`packages/core/src/index.ts`（`statistics()`、`progress()`）以及 `apps/web/src/pages/Home.vue`、`Stats.vue`。
- **逻辑缺陷**：
  1. `statistics()` 中计算已学单词：`progress(data, data.words, userId)` 是通过遍历 `data.words` 来匹配已学状态的。
  2. 用户实际学的是 **标日初级下册**（`biaori-beginner-lower`）。
  3. 词书 JSON 词库数据是按需通过 `ensureBookLoaded()` 动态加载的。在本地为空时，未加载过下册的 JSON 文件，`data.words` 中根本没有下册的那 15 个单词。
  4. 首页选中的当前词书又被默认回退成了 **标日初级上册**（`biaori-beginner-upper`）。首页卡片只统计上册单词，因此初级上册已学词数自然为 0。

### 根因 3：空本地状态未经拉取即反向推送配置
- **代码位置**：`apps/web/src/store.ts` 第 200~202 行。
- **逻辑缺陷**：
  ```ts
  if (currentUser.value) {
    scheduleDebouncedSync();
  }
  ```
  在应用刚启动、尚未完成与云端的 Pull 对齐之前，就启动了 3.5 秒的定时 Push。将未与云端对齐过的本地默认设置（`currentBookId: 'biaori-beginner-upper'`）覆盖到了云端。

---

## 7. 是否可以恢复

**结论：100% 可以立即恢复。**

- 云端数据没有任何丢失，不需要从离线备份或 D1 快照恢复数据库。
- 只要在客户端补齐 `pull()` 对齐链路并按需预加载词书，客户端获取到 D1 的 15 条进度后，首页、词书页、统计页将立刻恢复正常显示。

---

## 8. 修复方案

在确认根因后，建议按以下清晰步骤实施修复（在修复前不改动生产 D1 数据）：

### 修复步骤 1：补齐 `store.init()` 的启动与前台自愈拉取 (Pull-First on Startup)
在 `apps/web/src/store.ts` 的 `init()` 中：
```ts
if (currentUser.value) {
  const token = await authClient.getAccessToken();
  if (token) {
    try {
      syncStatus.value = 'syncing';
      const pullRes = await syncClient.pull(token);
      // 将云端 progress 与 events 合并到当前用户本地 IndexedDB
      await applyCloudPullData(pullRes);
      syncStatus.value = 'synced';
    } catch (err) {
      console.warn('Initial cloud pull failed, running on local cache:', err);
    }
  }
}
```
同时在 `document.addEventListener('visibilitychange')`（用户切回应用）时，也执行轻量增量对齐。

### 修复步骤 2：禁止未经 Pull 对齐的空本地状态覆盖云端
修改 `flushSyncQueue()` 与 `scheduleDebouncedSync()`：
- 增加标志位 `hasPerformedInitialPull`。
- 在用户刚启动、尚未完成与云端的初次数据拉取前，**坚决不执行 Push 操作**，杜绝默认空配置反向覆盖云端。

### 修复步骤 3：根据已学单词所属词书，自动装载必要词库
在拉取到云端数据后，检查 `pullRes.progress` 中出现的词书 ID（例如 `biaori-beginner-lower`）：
- 如果该词书尚未装载进 `data.words`，自动静默触发 `ensureBookLoaded(bookId)`。
- 若云端 `settings.currentBookId` 存在，以云端设定的词书为最高优先级，不再被本地默认的上册覆盖。

---

## 9. 如何防止再次发生

1. **协议层防御（防空写）**：
   在 Worker 的 `/api/v1/sync/push` 接口中，增加时间戳校验（LWW）与空值保护：如果客户端提交的 `settings.updatedAt` 明显早于云端记录，或者本地 settings 缺少核心字段，拒绝更新云端 settings。
2. **自动化测试防护**：
   在 `tests/cloud-sync.test.ts` 中补充极端场景用例：
   - *用例：用户在 Device A 登录并学习，在 Device B 首次以已有会话启动（本地 IndexedDB 全空），断言 Device B 必须能自动从云端 pull 并正确计算 statistics 统计数据与当前词书。*
   - *用例：本地状态为空时启动应用，断言不得向云端推送覆盖默认设置。*
3. **多端架构一致性**：
   在即将进行的微信小程序同步接入中，必须贯彻该规则：**本地存储只是缓存，启动时必须首先 Pull 对齐，确认无冲突后再开始学习与 Push。**
