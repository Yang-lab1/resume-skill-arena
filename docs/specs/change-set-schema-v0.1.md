# ChangeSet Schema v0.1

状态：ACCEPTED  
版本：0.1.0  
机器规范：`schemas/change-set.schema.json`

## 1. 目标

ChangeSet 是简历专家与 Resume Studio 之间的唯一候选修改交换格式。它描述“建议修改什么、为什么、依据是什么、风险在哪里”，但不代表用户已经采用。

ChangeSet 必须满足：

- 可横向比较：所有候选绑定同一冻结基线。
- 可追溯：每条修改绑定 Skill、Adapter、证据和调用 ID。
- 可验证：机器可以检查结构、事实影响和门禁状态。
- 可组合：用户采用后可以确定性地生成工作草稿。
- 可扩展：v0.1 未识别的附加信息只能放入 `extensions`。

## 2. 顶层对象

| 字段 | 必填 | 说明 |
|---|---|---|
| `schemaVersion` | 是 | 固定为 `0.1` |
| `changeSetId` | 是 | ChangeSet 唯一 ID |
| `runId` | 是 | 本次申请运行 ID |
| `baseline` | 是 | 简历与 JD 的冻结哈希和版本 |
| `producer` | 是 | 实际产生结果的 Skill 与 Adapter |
| `status` | 是 | `VALID`、`PARTIAL` 或 `REJECTED` |
| `createdAt` | 是 | ISO 8601 时间 |
| `changes` | 是 | 逐条候选修改 |
| `validation` | 是 | 结构、基线、事实、长度、格式门禁 |
| `summary` | 否 | 面向 UI 的短摘要，不用于决策 |
| `extensions` | 否 | 向后兼容扩展 |

## 3. 基线

`baseline` 必须同时包含源简历和 JD 的 SHA-256 哈希。UI 只能把哈希相同的 ChangeSet 放入同一横向比较组。

段落定位不能只使用“第 15 段”。每个 `sourceBlockRef` 必须包含：

- `blockId`：解析时生成的稳定业务 ID。
- `structuralPath`：例如 `experience[0].achievements[0]`。
- `contentHash`：原始块文本的 SHA-256。

三者用于防止段落移动或编辑后误应用到错误位置。

## 4. 修改操作

| 操作 | 语义 | 必要文本 |
|---|---|---|
| `REPLACE` | 用新文本替换源块 | `originalText`、`proposedText` |
| `INSERT` | 在锚点前后新增块 | `proposedText`、`insertPosition` |
| `DELETE` | 建议删除源块 | `originalText` |
| `MOVE` | 调整源块位置 | `originalText`、`targetBlockRef` |
| `KEEP` | 明确建议保留源块 | `originalText` |

融合不是基础操作。融合结果必须创建新的派生 ChangeSet，并在 `producer.parentChangeSetIds` 中记录来源。

## 5. 理由与证据

每条修改必须包含：

- `rationale.summary`：简短修改理由。
- `rationale.category`：例如 `JD_ALIGNMENT`、`CLARITY`、`STAR`、`ATS`。
- `resumeEvidence`：至少一条源简历或用户事实证据。
- `jobEvidence`：涉及岗位匹配时至少一条 JD 证据；纯格式压缩可为空。

证据必须引用已有 ID 和原文摘录。仅写“更专业”“更匹配”不构成有效证据。

## 6. 事实影响和五个默认值

### 6.1 锁定事实

默认锁定：姓名、联系方式、公司、学校、职位、日期、学历、奖项、工具使用事实、量化数字和成果归属。

若建议可能改变锁定事实，必须：

- 在 `factImpacts` 中逐项记录原值和建议值。
- 将 `risk.level` 设为 `REVIEW_REQUIRED` 或 `BLOCKED`。
- 将 `adoptionPolicy` 设为 `EXPLICIT_USER_APPROVAL` 或 `PROHIBITED`。
- 在用户确认前禁止进入工作草稿。

### 6.2 自动融合

系统可以提出融合候选，但融合 ChangeSet 的 `adoptionPolicy` 固定为 `EXPLICIT_USER_APPROVAL`。

### 6.3 第三方权限

权限不写入 ChangeSet，由 Skill Manifest 和执行审计记录。ChangeSet 必须记录实际 Adapter 和调用 ID。

### 6.4 评分

v0.1 不定义全局总分或唯一冠军。允许分别给出证据完整性、JD 覆盖、清晰度和风险等维度，但任何维度都不能自动替代用户选择。

### 6.5 事实库沉淀

用户在编辑器中新补充的事实默认只属于当前运行。只有显式执行“保存到个人事实库”后，才能成为后续 ChangeSet 的证据。

## 7. 风险与采用策略

`risk.level`：

- `SAFE`：证据完整，未影响锁定事实。
- `REVIEW_REQUIRED`：存在语义强化、缺少证据或事实影响，需要用户确认。
- `BLOCKED`：虚构、基线不一致、安全失败或违反硬门禁。

`adoptionPolicy`：

- `USER_SELECTABLE`
- `EXPLICIT_USER_APPROVAL`
- `PROHIBITED`

任何 `BLOCKED` 修改的采用策略必须是 `PROHIBITED`。

## 8. 验证门禁

顶层 `validation` 固定包含：

- `schema`
- `baseline`
- `facts`
- `evidence`
- `length`
- `format`

每项状态为 `PASS`、`WARN`、`FAIL` 或 `NOT_RUN`。规则：

- `schema` 或 `baseline` 为 `FAIL`：整个 ChangeSet `REJECTED`。
- `facts` 为 `FAIL`：受影响修改必须 `BLOCKED`。
- `evidence` 为 `FAIL`：受影响修改不得采用。
- `length` 或 `format` 在候选阶段可为 `WARN`；最终导出阶段必须 `PASS`。

## 9. 用户决策不写回候选

ChangeSet 是不可变候选记录。用户的采用、拒绝、编辑、撤销和融合必须写入单独的 Decision Log。禁止修改原 ChangeSet 来伪装用户已经选择。

## 10. 错误语义

如果 Provider 只生成部分有效修改，ChangeSet 可以为 `PARTIAL`，但必须保留已失败项的错误或审计信息。不得因为一个块失败而伪造该块的建议。

## 11. 兼容性

v0.x 期间允许调整字段，但每次变更必须同步更新 Schema、示例和迁移说明。进入 v1.0 后：

- 新字段优先作为可选字段添加。
- 不直接删除或改变已有字段语义。
- 破坏性变化使用新 `schemaVersion`。

## 12. 验收条件

- 有效样例通过 JSON Schema。
- 缺少简历证据的内容修改不能通过语义门禁。
- 基线哈希不同的 ChangeSet 不能横向比较。
- `BLOCKED` 修改不能被 UI 标记为可采用。
- 任一修改都能追溯到原始块、Skill、Adapter 和证据。
