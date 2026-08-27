# Frozen Baseline Contract v0.1

状态：ACCEPTED FOR P2  
版本：0.1.0  
日期：2026-08-20

## 1. 目标

把一份源简历和一份目标 JD 冻结成所有专家共享的只读基线。相同输入必须生成相同的文件哈希、区块 ID 和基线 ID；输入变化必须生成不同的基线 ID。任何专家不得直接读取或修改用户最初选择的源文件。

## 2. V0.1 输入

- 简历：`.docx`。
- JD：UTF-8 `.txt` 或 `.md`。
- 约束：语言、最大页数和可选模板 ID。
- 输出目录：由调用方显式提供；测试使用系统临时目录。

截图 OCR、PDF 简历解析、旧版 `.doc` 和云端文件不属于 P2。

## 3. 输出目录

```text
<output>/<runId>/
├─ input/
│  ├─ <原简历文件名>.docx
│  └─ <原JD文件名>.<txt|md>
└─ baseline/
   ├─ baseline.json
   └─ baseline.lock.json
```

- `input/` 保存冻结副本，不覆盖已有运行。
- `baseline.json` 包含 Resume AST、JD Snapshot、Fact Snapshot 和约束。
- `baseline.lock.json` 保存 `baseline.json` 与两个冻结输入的 SHA-256，用于篡改校验。

## 4. 数据模型

### 4.1 Resume AST

- `resumeId`：由简历文件哈希生成。
- `resumeHash`：冻结 DOCX 原始字节的 SHA-256。
- `astVersion`：固定为 `0.1`。
- `blocks`：按 OOXML 正文顺序排列的非空段落。

每个区块包含：

- `blockId`：由结构路径和规范化文本共同生成。
- `structuralPath`：例如 `word/document.xml#paragraph[12]`。
- `contentHash`：规范化文本 SHA-256。
- `text`：规范化后的可读文本。
- `styleName`：DOCX 中存在时保留。

### 4.2 JD Snapshot

- `jobId`、`jobHash`、`astVersion`。
- 每个非空文本行成为一个稳定区块，保留顺序、结构路径和内容哈希。

### 4.3 Fact Snapshot

P2 不使用生成式模型猜测姓名、公司或成果类型。每个 Resume AST 区块被保存为一个锁定证据单元：

- `evidenceId`
- `sourceBlockId`
- `sourceRef`
- `quote`
- `lockStatus: LOCKED`

后续可以增加语义化事实，但不得删改 P2 的原始证据单元。

### 4.4 Baseline ID

`baselineId` 由以下稳定字段计算：

- resume file hash
- job file hash
- Resume AST version
- JD AST version
- Fact Snapshot version
- locale、maxPages、templateId

时间戳、运行目录和文件名不参与 `baselineId`，确保相同内容可复现。

## 5. 命令

```powershell
npm run freeze:baseline -- --resume <resume.docx> --job <job.txt> --out <output-dir> --locale zh-CN --max-pages 1
npm run verify:baseline -- <run-directory>
npm run typecheck
npm test
npm run build
```

## 6. 项目结构

```text
src/baseline/       哈希、解析、快照、冻结和验证
src/cli/            freeze/verify 命令入口
schemas/            Frozen Baseline JSON Schema
tests/fixtures/     无个人信息的最小 DOCX/JD 测试夹具
```

## 7. 代码约定

```ts
const blockId = stableId("resume-block", structuralPath, normalizedText);
```

- SHA-256 使用小写十六进制。
- JSON 哈希使用递归键排序后的 UTF-8 内容。
- 路径只用于复制和定位，不进入可复现 ID。
- 解析器只读取，不修复、不重排、不保存源 DOCX。

## 8. 测试策略

- 单元测试：规范化文本、稳定 JSON、SHA-256、区块 ID。
- 解析测试：段落、样式、中文、英文和空段落。
- 冻结集成测试：创建目录、复制输入、生成四类快照。
- 篡改测试：修改冻结副本或 `baseline.json` 后验证必须失败。
- 可复现测试：相同输入在不同目录冻结得到相同 `baselineId` 和区块 ID。
- 变化测试：简历或 JD 任一内容变化都产生不同 `baselineId`。

## 9. 边界

### 始终执行

- 把所有输入视为不可信数据。
- 冻结前检查扩展名、文件大小和 UTF-8 文本。
- 使用排他创建，禁止覆盖已有 `runId`。
- 先生成临时运行目录，全部成功后再原子改名为最终目录。

### 需要另行确认

- 增加 PDF/OCR、云端读取或新的外部依赖。
- 从区块文本推断新的结构化个人事实。

### 永不执行

- 修改源简历。
- 把输入内容发送到网络。
- 允许专家绕过冻结副本直接读取原路径。
- 在锁校验失败后继续生成候选方案。

## 10. 限制

- DOCX 最大 20 MiB。
- JD 文本最大 5 MiB。
- 正文最多 2,000 个非空区块，每块规范化文本最多 20,000 字符。
- P2 读取主文档正文；页眉、页脚、批注和删除的修订内容暂不进入 Resume AST。

## 11. 成功标准

- 两份现有通用简历均可解析，且不会改动原文件。
- 同一输入重复冻结的 `baselineId`、输入哈希和区块 ID 完全一致。
- 修改简历或 JD 后 `baselineId` 必然变化。
- 修改冻结副本或基线 JSON 后 `verify:baseline` 必须失败。
- 输出可直接填充 ChangeSet v0.1 的 `baseline` 字段。
