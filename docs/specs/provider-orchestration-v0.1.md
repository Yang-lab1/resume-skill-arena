# Provider 编排规范 v0.1

状态：ACCEPTED（用户已授权按既定规则继续 P3）  
适用范围：V1 本地自用版 P3

## 1. 目标

编排器必须把同一份已验证的冻结基线并行交给多个 Provider，收集可比较的 ChangeSet。单个 Provider 的失败、超时或非法输出不得阻断其他 Provider。

## 2. 固定规则

- 未显式选择时，按注册顺序运行前 3 个已启用 Provider。
- 单次运行最多 5 个 Provider；第 6 个必须在核心层拒绝，不能只依赖 UI。
- 每个 Provider 获得相同的 `baselineId`、基线引用和只读基线对象，以及独立的 `invocationId` 与取消信号。
- 默认超时 180 秒；测试和宿主可传入更短超时，但必须大于 0。
- Provider 输出一律视为不可信数据，依次通过 ChangeSet Schema、事实语义门禁和基线匹配门禁。
- Schema、事实或基线不匹配的输出状态为 `REJECTED`，不得作为候选方案。
- 抛错为 `FAILED`，超时为 `TIMED_OUT`；这两类结果不得伪造空候选。
- 汇总状态：全部成功为 `COMPLETED`，部分成功为 `PARTIAL`，没有成功候选为 `FAILED`。
- 运行记录必须先写 `RUNNING`，结束后原子更新为最终状态；摘要记录不保存简历原文、JD 原文或凭据。

## 3. Provider 与适配器

Provider 是可产生 ChangeSet 的能力单元，不负责选择、合成、导出或 UI。Codex Adapter 是宿主注入调用能力的桥，不自行运行 Shell、不自行联网，也不自动获得额外权限。

P3 内置三个明确标记为测试用途的参考 Provider，用 `KEEP` ChangeSet 验证编排闭环；另提供模拟失败 Provider。它们不是正式简历专家，后续真实专家必须遵守同一接口。

## 4. 运行记录

每次编排写入冻结运行目录下：

```text
orchestration/<orchestrationId>/
  run.json
  candidates/<providerId>.json
```

`run.json` 只包含 ID、时间、状态、耗时、错误分类、门禁问题和候选文件相对路径。候选 ChangeSet 单独保存在本地文件中，便于后续 P4 使用。

## 5. 验收标准

1. 默认恰好选择 3 个 Provider，显式选择 5 个可运行，6 个被拒绝。
2. 至少两个 Provider 从相同冻结基线生成合法候选。
3. 一个 Provider 失败或超时时，其他 Provider 仍可成功完成。
4. 错误基线与非法 ChangeSet 被拒绝，不进入候选目录。
5. 运行记录可识别未完成的 `RUNNING` 任务，并能读取最终结果。

