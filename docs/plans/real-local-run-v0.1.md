# Implementation Plan: 真实本地运行链路 v0.1

## Phase 1: Contract and guardrails

- [x] 删除 UI 静态业务结果，未运行时保持空状态。
- [x] 定义本地 API 请求/响应与错误信封。
- [x] 添加真实性守卫测试。

## Phase 2: Real execution slice

- [x] 接收 DOCX 与岗位文字并创建冻结基线。
- [x] 发现并校验本机 Skill 路径。
- [x] 使用 Codex SDK 逐个执行 Skill，输出 ChangeSet v0.1。
- [x] 复用现有 schema、事实和基线门禁。

## Phase 3: UI integration

- [x] 导入页调用本地 API 并显示每个 Skill 的真实状态。
- [x] 比较页从 ChangeSet 建立区块列表、候选和证据。
- [x] 原稿标记按 source block 绑定。

## Phase 4: Verification

- [x] 匿名运行时 DOCX 端到端运行；个人简历不进入仓库。
- [x] 根测试与 UI 测试通过。
- [x] 构建通过、浏览器控制台无错误。
- [x] 发布隐私扫描通过，首次启动为空状态。

## Stop Conditions

- Codex 宿主不可执行或未认证：阻断并显示具体错误，不生成候选。
- Skill 输出无法转换或过门禁：标记失败/拒绝，不生成可采用候选。
- 原文无法映射到 source block：不进入比较页。
