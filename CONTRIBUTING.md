# 贡献指南 (Contributing to Kotobud)

感谢你对 **Kotobud**（旧称 Kotoba）项目的关注与支持！

Kotobud 是一个专注自律、干净纯粹的现代化开源日语背词与科学复习工具。我们非常欢迎来自社区的学习者和开发者参与建设，无论是报告 Bug、改进词书、优化 FSRS 复习算法还是贡献新功能。

---

## 一、行为准则 (Code of Conduct)

在参与项目交流与代码贡献时，请始终保持友好、尊重与开放的态度。

## 二、开发环境准备 (Development Setup)

项目采用 Monorepo 架构组织：
- **Node.js**: 建议使用 **Node.js 22.18+ 或 24+**
- **包管理器**: `npm`

### 1. 克隆与安装依赖

```bash
git clone https://github.com/lil-Detoxify/kotoba.git
cd kotoba
npm install
```

### 2. 本地开发调试

启动本地 Web 预览开发服务器：
```bash
npm run dev
# 默认开发地址: http://127.0.0.1:5173
```

启动 Windows 桌面版调试（需在 Windows 环境下）：
```bash
npm run desktop
```

### 3. 运行自动化测试

在提交任何修改前，请务必确保本地自动化测试全部通过：
```bash
# 运行全部 Vitest 单元测试
npm test

# 运行 TypeScript 严格类型检查与生产构建
npm run build

# 运行 Playwright 端到端验收（需先执行 npm run build）
npm run test:e2e
```

---

## 三、代码规范与架构边界 (Architecture & Standards)

1. **核心业务与 UI 严格分离**：
   - 学习队列、FSRS 状态流转、统计逻辑存放在 `packages/core/`，必须保持纯 TypeScript，不得引用任何 DOM、浏览器特定 API 或 UI 组件。
   - 数据持久化统一经由 `packages/storage/` 中的 Repository 处理。
   - 文件解析统一经由 `packages/importers/` 处理。
2. **TypeScript 严格模式**：
   - 保持严格类型检查，避免使用 `any`，确保 `vue-tsc --noEmit` 零报错。
3. **Local-First 优先原则**：
   - 确保核心学习流程在断网离线状态下可完整使用。
   - 所有的存储与云同步状态变更必须保持幂等与原子性。

---

## 四、提交 Pull Request

1. Fork 官方仓库并基于最新代码切出功能分支（例如 `feature/custom-quiz-mode` 或 `fix/fsrs-interval-calc`）。
2. 在本地完成编码与测试验证。
3. 遵循清晰的 Git Commit Message 规范（如 `feat(...)`, `fix(...)`, `docs(...)`, `refactor(...)`）。
4. 推送分支并发起 Pull Request，按照模板详细填写修改内容。

感谢你的每一行代码与每一次反馈！
