# resume-skill-arena

> 把同一份简历交给最多 3 个 Resume Skill，逐句比较、定位原文、选择更好的改法。

![resume-skill-arena cover](ui/public/assets/resume-studio-cover-clean.png)

`resume-skill-arena` 是一个本地运行的简历改写工作台。它不会拿演示简历冒充你的结果：所有候选改写都必须来自你本次导入的简历、岗位描述和真实 Skill 调用；没有真实结果时，界面只会显示失败或空状态。

## 它能做什么

- 导入 DOCX、PDF、PNG 或 JPG 简历。
- 粘贴岗位文字，或导入 TXT、Markdown、PDF、PNG、JPG；支持多文件、拖放和剪贴板截图。
- 默认选择 3 个 Skill，并把 3 个设为不可突破的硬上限。
- 导入本地文件夹、单个 `SKILL.md`、ZIP 或 GitHub 仓库中的 Skill。
- 基于同一份冻结原稿运行不同 Skill，逐段横向比较真实结果。
- 在右侧原始文件中定位正在修改的句子；DOCX、PDF、PNG/JPG 均有对应定位链路。
- 采用某一版、自己改写或保留原文，并保留 Provider 调用与来源记录。
- 原始材料和运行结果默认只保存在本机。

## 支持的输入

| 内容 | 支持方式 |
| --- | --- |
| 简历 | DOCX、PDF、PNG、JPG |
| 岗位 | 直接输入、复制粘贴、TXT、Markdown、PDF、PNG、JPG、多文件、拖放、剪贴板图片 |
| Skill | 本地文件夹、单个 `SKILL.md`、ZIP、GitHub 仓库 |

## 最简单的使用方式

在 Codex、Claude Code 或 CodeBuddy 中安装本 Skill 后，可以直接说：

```text
打开 resume-skill-arena，我要用 3 个 Skill 对比修改这份简历。
```

宿主应安装依赖、启动本地工作台并打开浏览器。进入工作台后：

1. 导入简历和岗位描述。
2. 保留默认 3 个 Skill，或替换为自己导入的 Skill。
3. 确认一次运行权限，然后开始真实比较。
4. 逐段选择“采用这个版本”“自己改写”或“保留原文”。

## 手动安装与启动

需要 Node.js 20 或更高版本、本地 Chrome/Edge 等浏览器、可启动本地子进程的 Shell，以及已登录且有可用额度的 Codex 环境。默认使用当前宿主可用的 `gpt-5.6-terra`（可通过 `RESUME_STUDIO_CODEX_MODEL` 覆盖）；浏览器或本地进程能力缺失时，Skill 会直接阻断，不提供残缺的纯文本替代流程。

```powershell
git clone https://github.com/Yang-lab1/resume-skill-arena.git
cd resume-skill-arena
npm install
npm --prefix ui install
npm run check:runtime
npm run dev:local
```

启动后会自动等待 API 和 UI 就绪，并打开浏览器。网页地址是 `http://127.0.0.1:4173`，本地 API 默认位于 `http://127.0.0.1:4317`。

### 重启电脑后如何打开

本地服务不会在电脑开机时偷偷自启，这是为了避免后台占用端口。重启电脑后，直接双击项目根目录里的 `start-resume-studio.cmd` 即可：它会检查运行环境、启动 API 和网页、等待服务就绪，然后自动打开浏览器。黑色命令窗口需要保持打开；关闭它会停止本次本地服务。

### 作为 Agent Skill 安装

也可以把整个仓库放入宿主的个人 Skill 目录：

| 宿主 | 个人 Skill 目录 |
| --- | --- |
| Codex / Agent Skills 兼容宿主 | 宿主配置的 Skills 目录 |
| Claude Code | `~/.claude/skills/resume-skill-arena/` |
| CodeBuddy | `~/.codebuddy/skills/resume-skill-arena/` |

目录内必须保留顶层 `SKILL.md`、`package.json`、`src/` 和 `ui/`。安装后在对应宿主中点名 `resume-skill-arena` 即可启动。

> 当前 v0.1 的真实 Provider 桥接使用 `@openai/codex-sdk`。Claude Code 或 CodeBuddy 可以负责安装和启动工作台，但运行简历 Skill 时仍需要本机 Codex 已登录且有可用额度。README 不会把尚未实现的原生 Claude/CodeBuddy Provider 冒充成已支持。

## 添加自己的 Skill

工作台支持四种入口：

- 选择包含且只包含一份 `SKILL.md` 的本地文件夹；
- 选择单个文件名为 `SKILL.md` 的文件；
- 选择包含一份 `SKILL.md` 的 ZIP；
- 粘贴 GitHub 的 `owner/repo` 或完整仓库地址。

导入只负责安装到本机。是否参与本次运行仍由你选择，并且总数始终最多 3 个。

## 隐私与空白出厂

- 仓库不包含用户简历、岗位、候选结果、运行缓存或个人绝对路径。
- 首次启动不会自动载入任何业务数据。
- 简历、岗位、OCR 文本、Provider 结果和决策日志写入本机运行目录，该目录被 Git 忽略。
- 只有在使用 GitHub 导入 Skill 或真实 Provider 时才会联网。
- 图片 OCR 语言包随 UI 本地提供；加载或识别失败时会明确阻止运行，不会伪造识别结果。

## 当前边界

- 尚未把最终选择保持原版式导出为 DOCX/PDF。
- DOCX 浏览器预览不等同于 Microsoft Word 的打印级渲染。
- 复杂扫描件的 OCR 与原句定位可能失败；失败会明确提示。
- GitHub 导入要求目标仓库能解析到且只包含一份 Skill 清单。

## 发布验证

发布门槛不是“页面能打开”，而是完整功能矩阵连续两轮通过：

```powershell
npm run verify:release
npm run verify:release:full
```

完整入口会先执行基础门禁，再启动本地 API/UI 并运行完整矩阵；矩阵覆盖所有简历格式、所有岗位输入方式、四种 Skill 导入、3 Skill 硬上限、真实 Provider、原文定位、采用/编辑/保留、审计记录、空白出厂和隐私门禁。只有报告的 `status` 为 `PASSED` 且 `passedRounds` 为 `2` 才允许发布。

## 开发命令

```powershell
npm run typecheck
npm test
npm run build
npm --prefix ui test
npm --prefix ui run build
```

## 兼容规范与文档

- [OpenAI Skills](https://developers.openai.com/api/docs/guides/tools-skills)
- [Claude Code Skills](https://code.claude.com/docs/en/skills)
- [CodeBuddy Skills](https://www.codebuddy.ai/docs/cli/skills)
- [Agent Skills specification](https://agentskills.io/)

## License

MIT
