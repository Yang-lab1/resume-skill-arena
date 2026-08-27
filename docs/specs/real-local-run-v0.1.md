# Spec: 真实本地简历 Skill 运行链路 v0.1

状态：APPROVED BY USER DIRECTION  
日期：2026-08-21

## Objective

把现有 UI 原型接到真实运行链路。用户上传 DOCX、粘贴岗位文字并选择 Skill 后，系统必须解析真实原稿、冻结同一基线、实际调用每个已安装 Skill、校验 ChangeSet，并只展示可追溯结果。任何失败都显式呈现，不得用静态文案、样例候选或“看起来像成功”的降级结果代替。

## Tech Stack

- Node.js 20+ / TypeScript
- React 19 / Vite 6
- 现有 DOCX parser、baseline freeze、Provider registry、orchestrator、ChangeSet gates
- `@openai/codex-sdk` 作为首个真实宿主桥接

## Commands

- Root build: `npm run build`
- Root tests: `npm test`
- UI build: `cd ui && npm run build`
- UI Sites tests: `cd ui && npm run test:sites`
- Local app: `npm run dev:local`

## Project Structure

- `src/local/`：本地 HTTP 服务、运行服务、Codex Skill invoker
- `src/baseline/`：真实 DOCX/JD 解析与冻结
- `src/orchestration/`：多 Provider 编排
- `ui/src/`：只消费 API 返回的真实状态和 ChangeSet
- `.resume-studio/runs/`：本地运行产物，不进入版本库

## Contract

`POST /api/runs` 输入：DOCX 文件、非空岗位文字、1–5 个已安装 Skill id。  
输出：运行 id、真实解析区块、每个 Provider 的状态、通过门禁的 ChangeSet、失败原因和审计元数据。

比较页中的每条结果必须包含：

- `sourceBlockRef.blockId`
- 与原稿完全一致的 `originalText`
- Skill 返回的 `proposedText`
- Skill id、版本、invocation id
- 修改理由、证据、风险和验证状态

## Testing Strategy

- 单元测试：请求校验、Skill 发现、ChangeSet 到 UI 模型转换。
- 集成测试：真实 DOCX 被解析；页面原文逐字来自 DOCX；无真实 Provider 输出时无候选。
- 宿主测试：Codex SDK 缺失、未登录、超时、无效 JSON 都必须失败关闭。
- 浏览器验证：运行时生成匿名 DOCX 并输入岗位文字后，页面内容可回溯到该文件的原稿区块；个人简历只允许本机临时验证，不进入仓库或 QA 产物。

## Boundaries

- Always：同一冻结基线；实际执行；失败关闭；事实门禁；运行可追溯。
- Ask first：新增对外网络宿主、改变权限范围、上传到非用户选择的服务。
- Never：静态候选、伪造调用、用参考 Provider 冒充正式 Skill、把未解析内容显示为成功。

## Success Criteria

1. `ui/src` 不再包含简历业务候选或原文的静态演示数据。
2. 上传文件中的一个真实段落必须原样出现在“当前原文”。
3. 每个候选均能定位到一次真实 Codex SDK invocation 和本地 Skill 文件。
4. Provider 未运行或失败时，候选数必须为 0。
5. 比较标记由 `sourceBlockRef` 驱动，不由章节百分比或演示索引驱动。
6. 根测试、UI 构建、浏览器真实文件流程全部通过后才可称为完成。
7. GitHub 发布包为白纸状态：不包含用户简历、岗位、运行结果、截图、缓存、绝对路径或个人信息。

## Current Scope

- v0.1：DOCX + 岗位纯文本 + Codex host。
- 后续：PDF 文本坐标、PNG/JPG OCR、WorkBuddy adapter、最终文件回写与导出。

## Release Privacy

- 首次启动必须为空状态，只能从当前用户本次导入的数据创建任务。
- `.resume-studio/`、`ui/qa-artifacts/`、`runs/` 与 `coverage/` 永不进入发布包。
- 发布前必须运行 `npm run verify:release`；隐私扫描失败时禁止发布。
