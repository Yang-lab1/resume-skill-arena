import { createRequire } from "node:module";
import path from "node:path";

const require = createRequire(import.meta.url);
const dependencyRoot = path.join(process.env.USERPROFILE ?? "", ".cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules");
const { chromium } = require(process.env.RESUME_STUDIO_PLAYWRIGHT ?? path.join(dependencyRoot, "playwright"));

const appUrl = "http://127.0.0.1:4173";
const resumePath = path.resolve("fixtures/synthetic-resume.docx");
const originalText = " 工作内容：负责 B 端非标环保设备的客户需求转译与方案设计，根据现场照片、尺寸及改造要求完成 3D 场景还原、空间调整、公司产品植入、Rhino 建模与 KeyShot 渲染，输出可视化方案及 DFM 文件；协同需求、结构、电气及业务团队推进方案确认与项目落地，参与西门子、美的、格力等制造业客户项目。";
const skills = ["career-ops", "interview-coach", "asu-resume"].map((id) => ({ id, name: id, version: "local-test", contentHash: `${id}-hash` }));
const result = {
  status: "COMPLETED",
  runId: "run.progress-preview",
  orchestrationId: "orch.progress-preview",
  resume: { name: "synthetic-resume.docx", hash: "a43fceb8bff3dc0410c009f194073277d929a9cdce1134ff23bc19e7914b8e98", blockCount: 1 },
  job: { hash: "job-hash", blockCount: 1 },
  skills,
  providers: skills.map((skill) => ({ providerId: skill.id, invocationId: `invoke-${skill.id}`, status: "SUCCESS", durationMs: 10 })),
  comparison: { blocks: [{ blockId: "resume-block.test", structuralPath: "word/document.xml#paragraph[15]", originalText, candidates: [{ skillId: "career-ops", invocationId: "invoke-career-ops", proposedText: "面向 B 端非标环保设备项目，负责客户需求转译、方案设计与落地推进；保留原有事实并优化表达。", rationale: "保留事实，改善层级。", category: "JD_ALIGNMENT", riskLevel: "SAFE", skillVersion: "local-test" }, { skillId: "interview-coach", invocationId: "invoke-interview-coach", proposedText: "围绕客户需求完成方案设计与跨团队推进，保留原有事实。", rationale: "保留事实，突出协作。", category: "CLARITY", riskLevel: "SAFE", skillVersion: "local-test" }, { skillId: "asu-resume", invocationId: "invoke-asu-resume", proposedText: "负责 B 端非标环保设备项目的需求转译、方案设计与落地推进。", rationale: "保留事实，突出职责。", category: "CLARITY", riskLevel: "SAFE", skillVersion: "local-test" }] }] }
};

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
page.on("console", (message) => console.log(`CONSOLE ${message.type()}: ${message.text()}`));
page.on("pageerror", (error) => console.log(`PAGEERROR: ${error.message}`));
let statusReads = 0;
await page.route("http://127.0.0.1:4317/api/runs", async (route) => {
  await route.fulfill({ status: 202, contentType: "application/json", body: JSON.stringify({ ok: true, data: { jobId: "job.progress-preview" } }) });
});
await page.route("http://127.0.0.1:4317/api/runs/status/job.progress-preview", async (route) => {
  statusReads += 1;
  const completed = statusReads > 1;
  await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: true, data: completed ? { status: "COMPLETED", progress: { stage: "complete", completed: 6, total: 6, message: "比较工作台已准备完成。" }, result } : { status: "RUNNING", progress: { stage: "provider", completed: 2, total: 6, skillId: "career-ops", status: "RUNNING", message: "正在执行 career-ops。" } } }) });
});

await page.goto(appUrl, { waitUntil: "networkidle" });
await page.getByRole("button", { name: "进入简历工作台" }).click();
await page.locator(".resume-input input[type=file]").setInputFiles(resumePath);
await page.getByLabel("岗位描述文字").fill("负责 B 端产品方案设计、用户需求转译和跨团队项目推进。");
await page.getByRole("button", { name: /开始真实运行/ }).click();
await page.getByRole("button", { name: /确认并开始真实运行/ }).click();
await page.getByRole("progressbar", { name: "真实运行进度" }).waitFor();
const progress = await page.getByRole("progressbar", { name: "真实运行进度" }).count();
await page.screenshot({ path: "output/progress-analysis-smoke.png", fullPage: true });
try { await page.getByRole("heading", { name: "比较真实原文", level: 1 }).waitFor({ timeout: 15000 }); } catch (error) { await page.screenshot({ path: "output/progress-preview-failure.png", fullPage: true }); console.log(await page.locator("body").innerText()); throw error; }
const tabs = await page.locator('.skill-tabs [role="tab"]').count();
const unmodified = await page.locator('.skill-tabs [role="tab"].unmodified').count();
await page.getByRole("tab", { name: /asu-resume/ }).click();
const noChange = await page.getByText("这个 Skill 没有对当前区块生成改写，原文保持不变。", { exact: true }).count();
await page.locator(".docx-preview-body .docx-wrapper").waitFor({ timeout: 15000 });
await page.waitForTimeout(500);
const width = await page.locator(".document-canvas").evaluate((node) => ({ clientWidth: node.clientWidth, scrollWidth: node.scrollWidth }));
const located = await page.locator(".source-marker.located").count();
const paragraphTexts = await page.locator(".docx-preview-body").evaluate((node) => Array.from(node.querySelectorAll("p,h1,h2,h3,h4,h5")).slice(12, 18).map((item) => item.textContent));
const markerStates = await page.locator(".source-marker").evaluateAll((nodes) => nodes.map((node) => ({ className: node.className, text: node.textContent })));
if (progress !== 1) throw new Error("顶部全宽进度条未渲染");
if (tabs !== 3) throw new Error(`Skill 标签不完整：${tabs} 个`);
if (located !== 1) throw new Error(`真实原稿定位框未出现：${JSON.stringify({ markerStates, paragraphTexts })}`);
if (width.scrollWidth > width.clientWidth + 1) throw new Error(`原稿预览仍有横向溢出：${JSON.stringify(width)}`);
await page.screenshot({ path: "output/progress-preview-smoke.png", fullPage: true });
console.log(JSON.stringify({ status: "passed", progress, tabs, unmodified, noChange, width, statusReads, paragraphTexts }));
await browser.close();
