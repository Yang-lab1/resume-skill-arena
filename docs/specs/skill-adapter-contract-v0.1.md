# Skill Adapter Contract v0.1

状态：ACCEPTED  
版本：0.1.0  
机器规范：`schemas/skill-manifest.schema.json`

## 1. 目标

Skill Adapter Contract 定义 Resume Studio 如何发现、审查、调用和规范化第一方或第三方 Skill。它解决宿主差异和输出差异，不假设 Codex、Claude Code、WorkBuddy 或其他 Agent 提供相同的 Skill 调用 API。

Adapter 的职责是让外部能力“可检查、可调用、可取消、可追溯、可降级”。它不得绕过事实门禁或替用户采用修改。

## 2. 接入层次

| 接入结果 | 含义 | 可进入逐段比较 | 可一键采用 |
|---|---|---:|---:|
| `NATIVE` | Skill 原生输出 ChangeSet v0.1 | 是 | 通过门禁后是 |
| `ADAPTED` | Adapter 将稳定结构转换为 ChangeSet v0.1 | 是 | 通过门禁后是 |
| `ADVISORY_ONLY` | 只能输出自由文本建议 | 单独建议区 | 否 |
| `INCOMPATIBLE` | 输入、输出或宿主能力不兼容 | 否 | 否 |
| `BLOCKED_SECURITY` | 来源、脚本或权限存在不可接受风险 | 否 | 否 |
| `FAILED_CONTRACT_TEST` | 无法通过样例和契约测试 | 否 | 否 |

`ADVISORY_ONLY` 结果不得通过模型“猜测映射”后静默升级为 `ADAPTED`。升级必须经过可重复的 Adapter 和契约测试。

## 3. Manifest

每个 Provider 必须有符合 `skill-manifest.schema.json` 的 Manifest。Manifest 描述：

- 身份、版本、来源、许可证和内容哈希。
- 能力类型和输出模式。
- 支持的宿主、操作系统和依赖。
- 读取、写入、联网和 Shell 权限。
- 运行方式、超时和取消能力。
- Adapter 与规范化方式。
- 安全审查状态和契约测试样例。

Manifest 是声明，不是信任依据。安装器必须用实际文件和运行行为核验声明。

## 4. 生命周期

```text
DISCOVERED
  → QUARANTINED
  → INSPECTED
  → CLASSIFIED
  → PERMISSION_REVIEWED
  → CONTRACT_TESTED
  → ENABLED
  → RUNNING
  → SUCCEEDED | PARTIAL | FAILED | CANCELLED | TIMED_OUT
```

### 4.1 `DISCOVERED`

来源可以是 GitHub URL、ZIP、本地文件夹、宿主市场或内置 Registry。只记录元数据，不执行任何脚本。

### 4.2 `QUARANTINED`

第三方内容下载到隔离目录。不得写入正式 Skill 目录，不得自动执行安装脚本。

### 4.3 `INSPECTED`

检查：

- `SKILL.md` 和 Manifest 格式。
- 文件清单、体积、符号链接和隐藏文件。
- 脚本、二进制、下载器和动态执行行为。
- 网络域名、Shell 命令和文件访问范围。
- 许可证、来源、版本与内容哈希。

### 4.4 `CLASSIFIED`

至少分为：

- `RESUME_REWRITE`
- `RESUME_REVIEW`
- `JOB_ANALYSIS`
- `INTERVIEW_PREP`
- `APPLICATION_OPERATIONS`
- `EVIDENCE_AUDIT`
- `OTHER`

只有 `RESUME_REWRITE` 和能生成逐块建议的 `RESUME_REVIEW` 可申请进入横向比较。

### 4.5 `PERMISSION_REVIEWED`

默认拒绝：联网、Shell、工作区写入和工作区外读取。任何新增权限都要显示理由、作用域和风险，并由用户显式授权。

### 4.6 `CONTRACT_TESTED`

至少运行：

1. 有明确 JD 的正常简历。
2. 缺少量化数据的简历。
3. 含锁定事实的简历。
4. 故意诱导虚构的 JD 或提示。
5. 超时、取消和无效输出测试。

### 4.7 `ENABLED`

仅通过格式、安全、权限和契约测试的 Provider 可以启用。启用范围分为当前运行、当前项目或用户全局；V1 默认当前项目。

## 5. Adapter 接口

概念接口如下；具体语言实现可以不同，但语义必须一致：

```ts
interface SkillAdapter {
  inspect(source: SkillSource): Promise<InspectionResult>;
  classify(bundle: InspectedBundle): Promise<ClassificationResult>;
  validateManifest(manifest: SkillManifest): Promise<ValidationResult>;
  checkHealth(context: HostContext): Promise<HealthResult>;
  execute(request: SkillExecutionRequest): Promise<SkillExecutionResult>;
  normalize(result: SkillExecutionResult): Promise<ChangeSet | AdvisoryResult>;
  cancel(invocationId: string): Promise<CancelResult>;
}
```

## 6. 执行请求

`SkillExecutionRequest` 必须包含：

```ts
interface SkillExecutionRequest {
  contractVersion: "0.1";
  invocationId: string;
  runId: string;
  providerId: string;
  baseline: {
    resumeId: string;
    resumeHash: string;
    resumeAstVersion: string;
    jobId: string;
    jobHash: string;
    jobAstVersion: string;
    factSnapshotId: string;
  };
  inputs: {
    resumeAstPath: string;
    jobAstPath: string;
    factSnapshotPath: string;
  };
  constraints: {
    locale: string;
    maxPages: number;
    lockedFactTypes: string[];
  };
  grantedPermissions: GrantedPermissions;
  deadline: string;
}
```

所有路径必须位于本次运行的授权工作区内。Adapter 不得用请求中的路径推导更宽的目录权限。

## 7. 执行结果

结果使用固定信封：

```ts
type SkillExecutionResult =
  | {
      status: "SUCCEEDED" | "PARTIAL";
      invocationId: string;
      startedAt: string;
      completedAt: string;
      outputMode: "NATIVE" | "ADAPTED" | "ADVISORY_ONLY";
      outputPath: string;
      auditPath: string;
    }
  | {
      status: "FAILED" | "CANCELLED" | "TIMED_OUT";
      invocationId: string;
      startedAt: string;
      completedAt: string;
      error: AdapterError;
      auditPath: string;
    };
```

自由文本、Markdown 或 DOCX 不是可合并输出。只有通过 Normalizer 生成并验证的 ChangeSet 才能进入逐段比较。

## 8. 错误语义

所有 Adapter 使用相同错误结构：

```ts
interface AdapterError {
  code: AdapterErrorCode;
  message: string;
  retryable: boolean;
  details?: Record<string, unknown>;
}
```

错误码：

- `SOURCE_NOT_FOUND`
- `INVALID_MANIFEST`
- `UNSUPPORTED_HOST`
- `UNSUPPORTED_CONTRACT`
- `PERMISSION_DENIED`
- `SECURITY_BLOCKED`
- `DEPENDENCY_MISSING`
- `EXECUTION_FAILED`
- `INVALID_OUTPUT`
- `NORMALIZATION_FAILED`
- `BASELINE_MISMATCH`
- `TIMED_OUT`
- `CANCELLED`

`retryable` 只表示在相同权限和范围内重试是否合理，不授权自动扩大权限、修改输入或更换 Skill。

## 9. 权限模型

### 9.1 默认值

- `fileRead`：仅本轮已生成的规范化输入文件。
- `fileWrite`：禁止；必要时只允许专属临时输出目录。
- `network`：禁止。
- `shell`：禁止。
- `secrets`：禁止。

这些默认值只适用于尚未审查或后来添加的第三方 Provider。Resume Studio 第一方核心能力可以在安装或首次运行时一次性声明并申请完成主流程所需的最小权限，包括读取用户主动选择的输入文件、写入项目输出目录、运行内置校验与导出脚本，以及启动本地 UI。

### 9.2 授权

权限必须声明最小作用域，例如具体目录、域名或命令前缀。禁止使用 `*`、用户主目录、磁盘根目录或未解析环境变量作为默认范围。

Resume Studio 必须先根据核心模块、已启用 Provider 和当前任务自动计算最小权限计划。默认用户界面不得要求普通用户逐项配置域名、命令、目录或权限类型，而应提供一套系统推荐方案和一次统一确认。技术明细保留在可展开的高级详情中，供审查与追溯。

首次运行的默认操作为“按推荐继续”或“取消”。用户后来添加第三方 Provider 时，系统必须先完成来源、安全、许可证、脚本和权限预审，再给出“按推荐启用”或“跳过此 Skill”；逐项权限调整只放在高级设置中。

拒绝第三方 Provider 的推荐方案只影响该 Provider；编排器必须继续运行其他 Provider，并保留比较、编辑和导出能力。只有用户拒绝 Resume Studio 核心输入或输出目录权限时，主流程才可以停止。

系统推荐不等于静默授权。最终确认仍由用户完成；Codex、WorkBuddy、操作系统或其他宿主强制显示的安全确认不得被绕过。

### 9.3 凭据

Manifest 只能声明需要何种凭据，不得包含凭据值。Resume Studio 不把简历内容、API Key 或用户事实写入审计日志。

## 10. 超时、取消和隔离

- 每次调用必须有唯一 `invocationId` 和明确截止时间。
- V1 默认超时 180 秒，Manifest 可声明更短值；更长值需要用户确认。
- 支持取消的宿主必须立即转发取消请求。
- 超时或取消后不得把迟到输出自动加入当前比较。
- 第三方 Provider 在专属临时目录运行，不能与其他 Provider 共享可写目录。

## 11. 规范化规则

Normalizer 必须：

1. 校验输出来源与 `invocationId`。
2. 校验简历和 JD 基线哈希。
3. 将每条建议映射到稳定 `sourceBlockRef`。
4. 提取修改前后文本、理由和证据。
5. 识别事实影响和风险。
6. 生成 ChangeSet。
7. 执行 JSON Schema 和语义门禁。

Normalizer 不得补写 Provider 没有提供的事实依据。如果无法可靠定位或提取证据，应降级为 `ADVISORY_ONLY` 或失败。

## 12. 宿主行为

### Codex

首个 V1 Adapter。可以使用显式 Skill 路径、宿主调用能力或第一方 Provider 执行器，但必须记录实际执行方式。

### Claude Code / WorkBuddy

后续 Adapter 可以使用宿主插件、市场或本地 Skill 能力。不得假定与 Codex 有相同路径、命令或子 Skill 调用语义。

### 无宿主运行

未来独立桌面版使用自己的模型运行层，仍必须遵守相同请求、结果和 ChangeSet 契约。

## 13. 版本和兼容

- Adapter 必须声明支持的输入和输出契约版本。
- 新字段优先可选添加。
- 不识别的字段只能位于 `extensions`。
- 不支持请求版本时返回 `UNSUPPORTED_CONTRACT`，不得猜测执行。
- v1.0 后破坏性变化使用新的主版本。

## 14. 审计

每次执行至少记录：

- Provider、Skill、Adapter 和宿主版本。
- 来源 revision 和内容哈希。
- 输入基线哈希。
- 授予的权限。
- 开始、结束、超时和取消时间。
- 输出模式、验证结果和错误码。

审计记录不保存原始简历全文、用户凭据或不必要的个人信息。

## 15. 验收条件

- 未审查的第三方 Skill 不能进入 `ENABLED`。
- 权限声明和实际行为不一致时立即阻断。
- 相同比较组中的 Provider 使用相同基线哈希。
- 无法转换为 ChangeSet 的结果只能是 `ADVISORY_ONLY`。
- Provider 失败、超时或取消不会产生伪造候选。
- 新宿主 Adapter 不改变 ChangeSet 语义。
