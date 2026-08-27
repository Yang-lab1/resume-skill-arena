# Resume Studio 第二批实现任务 v0.1

批次目标：完成 P2“冻结简历基线”。  
批次边界：不调用专家 Provider、不生成候选、不制作 UI、不修改或导出简历。

状态：已完成（2026-08-20）

## P2-01：稳定哈希与 ID

- 验收：相同对象键顺序不同仍得到相同哈希；内容变化得到不同哈希。
- 验证：单元测试先失败再实现。
- 文件：`src/baseline/hash.ts`、`src/baseline/hash.test.ts`。

## P2-02：DOCX Resume AST

- 验收：读取正文非空段落、样式、中文与英文；区块 ID 可复现。
- 验证：最小无个人信息 DOCX 夹具和两份本地真实简历只读验收。
- 文件：`src/baseline/docx-parser.ts`、`src/baseline/types.ts`、对应测试。

## P2-03：JD 与事实快照

- 验收：UTF-8 TXT/MD 生成稳定 JD 区块；每个简历区块生成锁定证据单元。
- 验证：空文本失败、相同文本可复现、内容变化哈希变化。
- 文件：`src/baseline/job-parser.ts`、`src/baseline/fact-snapshot.ts`、对应测试。

## P2-04：冻结与锁校验

- 验收：排他创建运行目录，写入冻结副本、`baseline.json` 和锁文件；篡改后验证失败。
- 验证：临时目录集成测试。
- 文件：`src/baseline/freeze.ts`、`src/baseline/verify.ts`、对应测试。

## P2-05：CLI、Schema 与文档

- 验收：freeze/verify 命令有中文输出、稳定退出码；Schema 和 README 与实现一致。
- 验证：CLI 端到端测试、类型检查、构建和真实简历手动验收。
- 文件：`src/cli/`、`schemas/frozen-baseline.schema.json`、`README.md`、端到端测试。
