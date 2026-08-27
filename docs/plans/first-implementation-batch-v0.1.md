# Resume Studio 首批实现任务 v0.1

批次目标：完成“读取标准 ChangeSet → Schema 校验 → 事实证据门禁 → 清晰输出”的最小闭环。  
批次边界：不解析 DOCX、不调用真实专家 Skill、不制作 UI、不联网、不导出简历。

## 可演示结果

完成后，本地运行一条验证命令：

- 输入 `examples/valid-changeset.json` 时，显示“验证通过”。
- 输入 `examples/invalid-ungrounded-change.json` 时，显示具体哪项修改缺少简历证据并阻止继续。
- 机器调用可依据稳定退出码区分成功、格式错误和事实门禁错误。

## 任务依赖

```text
B01 项目骨架
 ├─→ B02 Schema 校验器 ─┐
 └─→ B03 错误模型       ├─→ B04 事实门禁 ─→ B05 CLI ─→ B06 自动验收
                         └───────────────────────────────┘
```

## B01：建立最小 TypeScript 工程

规模：S  
计划文件：`package.json`、`package-lock.json`、`tsconfig.json`、`vitest.config.ts`

工作内容：

- 配置 TypeScript、Ajv 和 Vitest。
- 定义 `build`、`test`、`validate:changeset` 脚本。
- 固定 Node.js 支持范围，避免依赖未声明的全局包。

验收标准：

- `npm install` 可复现安装。
- 空测试集和 TypeScript 类型检查可以正常启动。
- 不修改既有规范、Schema 和样例内容。

验证：`npm run typecheck`、`npm test`。

## B02：实现 Schema 加载与基础校验

规模：M  
计划文件：`src/contracts/schema-loader.ts`、`src/contracts/validate-schema.ts`、`src/contracts/types.ts`

工作内容：

- 从仓库内加载 Draft 2020-12 Schema。
- 校验 ChangeSet，并把 Ajv 原始错误转换成稳定的内部结构。
- 为以后校验 Skill Manifest 保留同一入口，但本批只打通 ChangeSet。

验收标准：

- 有效样例通过 Schema 校验。
- 字段缺失、类型错误、未知结构返回字段路径和规则代码。
- 校验器不修改输入对象。

验证：单元测试覆盖有效与结构无效输入。

## B03：定义用户可读的门禁结果

规模：S  
计划文件：`src/gates/result.ts`、`src/gates/messages.zh-CN.ts`

工作内容：

- 定义通过、警告、阻断三种结果。
- 定义稳定错误代码、中文摘要和高级技术详情。
- 保证普通输出不要求用户理解 JSON Schema 或堆栈信息。

验收标准：

- 每个阻断项都有“发生了什么、位于哪里、下一步怎么办”。
- 技术详情可以单独展开或由 `--json` 输出。

验证：消息快照测试与类型检查。

## B04：实现事实证据门禁

规模：M  
计划文件：`src/gates/fact-evidence-gate.ts`、`src/gates/run-gates.ts`、`src/gates/fact-evidence-gate.test.ts`

工作内容：

- 对每个事实性改动检查 `resumeEvidence`。
- 缺少证据的新增事实返回阻断，而不是静默删除或自动补造。
- 保持表达优化与事实新增的边界来自已确认 ChangeSet 规则。

验收标准：

- 现有无证据反例被阻断。
- 有证据的改写通过。
- 多个问题一次性返回，用户无需逐次重跑才看到下一个问题。

验证：表驱动测试覆盖有证据、无证据、空证据和多项错误。

## B05：提供本地验证命令

规模：M  
计划文件：`src/cli/validate-changeset.ts`、`src/cli/format-result.ts`、`src/index.ts`

工作内容：

- 接受一个 ChangeSet JSON 文件路径。
- 默认输出简洁中文结果，`--json` 输出稳定机器格式。
- 区分文件读取失败、JSON 解析失败、Schema 失败和事实门禁失败。

验收标准：

- 有效输入退出码为 0。
- 所有阻断情况退出码非 0，且不同错误类别可区分。
- 路径含中文或空格时仍可使用。

验证：对仓库现有两个 ChangeSet 样例执行 CLI 集成测试。

## B06：建立首批自动验收与使用说明

规模：S  
计划文件：`tests/validate-changeset.e2e.test.ts`、`README.md`

工作内容：

- 把两条可演示路径写成端到端测试。
- README 只写本批已实现能力，不提前宣称 UI、DOCX 或多专家已经可用。
- 记录普通用法和机器调用用法。

验收标准：

- `npm test` 一次验证全部首批标准。
- README 中的命令可复制运行。
- 文档清楚标识“当前阶段”和“尚未实现”。

验证：在项目根目录按 README 从安装到两条样例命令完整走通。

## 批次验收清单

- [x] 类型检查通过。
- [x] 单元测试和端到端测试通过。
- [x] 有效 ChangeSet 返回成功。
- [x] 无证据 ChangeSet 被事实门禁阻断。
- [x] 错误信息包含位置、原因和修复方向。
- [x] JSON 输出与退出码稳定，可供未来 UI 和编排器复用。
- [x] 没有引入联网、Shell 执行或读取用户简历的权限。
- [x] `agent_memory/` 已记录实施结果和未解决风险。

## 批次完成后的检查点

首批验收通过后才进入 P2“冻结简历基线”。如果现有 Schema 无法稳定表达事实证据，先回到规范做最小修订，不并行推进 UI 或真实 Provider。
