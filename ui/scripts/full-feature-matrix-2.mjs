import { createRequire } from "node:module";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import path from "node:path";

const require = createRequire(import.meta.url);
const dependencyRoot = process.env.CODEX_NODE_DEPENDENCIES ?? path.join(homedir(), ".cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules");
const { chromium } = require(process.env.RESUME_STUDIO_PLAYWRIGHT ?? path.join(dependencyRoot, "playwright"));
const { createCanvas } = require(path.join(dependencyRoot, "@napi-rs/canvas"));
const { Document, HeadingLevel, Packer, Paragraph, TextRun } = require(path.join(dependencyRoot, "docx"));
const { PDFDocument, StandardFonts, rgb } = require(path.join(dependencyRoot, "pdf-lib"));
const { strToU8, zipSync } = require("fflate");

const projectRoot = path.resolve(import.meta.dirname, "../..");
const profile = process.env.RESUME_STUDIO_MATRIX_PROFILE === "strict" ? "strict" : "standard";
const reportLabel = String(process.env.RESUME_STUDIO_MATRIX_LABEL || "").replace(/[^a-z0-9-]/gi, "").toLowerCase();
const baseMatrixId = profile === "strict" ? "full-feature-matrix-strict-2" : "full-feature-matrix-2";
const targetRounds = Math.max(1, Number.parseInt(process.env.RESUME_STUDIO_MATRIX_ROUNDS || "2", 10) || 2);
const matrixId = reportLabel ? `${baseMatrixId}-${reportLabel}` : baseMatrixId;
const fixtureRoot = path.resolve(projectRoot, `output/playwright/${matrixId}/fixtures`);
const artifactRoot = path.resolve(projectRoot, `output/playwright/${matrixId}`);
const reportPath = path.resolve(projectRoot, `.resume-studio/verification/${matrixId}/report.json`);
const runtimeSkillsRoot = path.resolve(projectRoot, ".resume-studio/skills");
const appUrl = process.env.RESUME_STUDIO_UI_URL ?? "http://127.0.0.1:4173";
const apiUrl = process.env.RESUME_STUDIO_API_URL ?? "http://127.0.0.1:4317";
const skipProviders = process.env.RESUME_STUDIO_SKIP_PROVIDERS === "1";

const resumeLines = [
  "ALEX CHEN — PRODUCT DESIGNER",
  "SUMMARY",
  "Product designer with six years of experience in research, prototyping, and product delivery.",
  "EXPERIENCE",
  "Led discovery for a B2B workflow product and reduced task completion time by 32 percent.",
  "Partnered with engineering and analytics to launch three validated customer journeys.",
  "SKILLS",
  "User research, interaction design, prototyping, analytics, stakeholder communication."
];
const jobLines = [
  "SENIOR PRODUCT DESIGNER",
  "Own product discovery, user research, interaction design, and end-to-end delivery.",
  "Partner with product managers, engineers, and analysts to measure customer outcomes.",
  "Candidates should show evidence, measurable impact, and clear cross-functional leadership."
];
const jobText = jobLines.join("\n");
const normalize = (value) => String(value || "").toLowerCase().replace(/[^a-z0-9]+/g, "");

const report = {
  kind: "full-feature-real-browser-matrix",
  profile,
  targetRounds,
  passedRounds: 0,
  localPassedRounds: 0,
  status: "RUNNING",
  startedAt: new Date().toISOString(),
  matrix: {
    resumeInputs: ["DOCX", "PDF", "PNG", "JPG"],
    jobInputs: ["clipboard-text", "typed-text", "TXT", "Markdown", "PDF", "PNG", "JPG", "multi-file", "drag-drop", "clipboard-image"],
    skillInputs: ["local-folder", "local-SKILL.md", "ZIP", "GitHub"],
    rules: ["keyboard-entry", "max-three-skills", "unsupported-inputs", "empty-inputs", "blank-factory-state"],
    realClosures: ["one-provider-each-resume-format", "three-provider-compare", "source-location", "adopt", "edit", "keep-original", "provider-audit"]
  },
  rounds: []
};

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function logProgress(event, detail = {}) {
  process.stdout.write(`${JSON.stringify({ event, at: new Date().toISOString(), ...detail })}\n`);
}

async function saveReport() {
  await mkdir(path.dirname(reportPath), { recursive: true });
  await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
}

async function createTextPdf(lines, outputPath) {
  const pdf = await PDFDocument.create();
  const page = pdf.addPage([612, 792]);
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  lines.forEach((line, index) => page.drawText(line, {
    x: 48,
    y: 738 - index * 42,
    size: index === 0 ? 18 : 12,
    font: index === 0 || /^[A-Z ]+$/.test(line) ? bold : font,
    color: rgb(0.05, 0.05, 0.05),
    maxWidth: 510
  }));
  await writeFile(outputPath, await pdf.save());
}

async function createTextImage(lines, outputPath, type) {
  const canvas = createCanvas(1800, 1400);
  const context = canvas.getContext("2d");
  context.fillStyle = "white";
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.fillStyle = "black";
  lines.forEach((line, index) => {
    context.font = index === 0 || /^[A-Z ]+$/.test(line) ? "bold 48px Arial" : "38px Arial";
    context.fillText(line, 90, 120 + index * 130, 1600);
  });
  const buffer = type === "png" ? canvas.toBuffer("image/png") : canvas.toBuffer("image/jpeg", 0.96);
  await writeFile(outputPath, buffer);
}

async function createFixtures() {
  await mkdir(fixtureRoot, { recursive: true });
  const prefix = profile === "strict" ? "候选人 简历 2026" : "matrix-resume";
  const jobPrefix = profile === "strict" ? "岗位 描述 final" : "matrix-job";
  const resumeDocx = path.join(fixtureRoot, `${prefix}.docx`);
  const doc = new Document({
    sections: [{
      properties: {},
      children: resumeLines.map((line, index) => new Paragraph({
        heading: index === 0 ? HeadingLevel.TITLE : undefined,
        children: [new TextRun({ text: line, bold: index === 0 || /^[A-Z ]+$/.test(line) })]
      }))
    }]
  });
  await writeFile(resumeDocx, await Packer.toBuffer(doc));

  const files = {
    resumeDocx,
    resumePdf: path.join(fixtureRoot, `${prefix}.pdf`),
    resumePng: path.join(fixtureRoot, `${prefix}.png`),
    resumeJpg: path.join(fixtureRoot, `${prefix}.jpg`),
    jobTxt: path.join(fixtureRoot, `${jobPrefix}.txt`),
    jobMd: path.join(fixtureRoot, `${jobPrefix}.md`),
    jobPdf: path.join(fixtureRoot, `${jobPrefix}.pdf`),
    jobPng: path.join(fixtureRoot, `${jobPrefix}.png`),
    jobJpg: path.join(fixtureRoot, `${jobPrefix}.jpg`)
  };
  await Promise.all([
    createTextPdf(resumeLines, files.resumePdf),
    createTextImage(resumeLines, files.resumePng, "png"),
    createTextImage(resumeLines, files.resumeJpg, "jpg"),
    createTextPdf(jobLines, files.jobPdf),
    createTextImage(jobLines, files.jobPng, "png"),
    createTextImage(jobLines, files.jobJpg, "jpg"),
    writeFile(files.jobTxt, jobText, "utf8"),
    writeFile(files.jobMd, `# Role\n\n${jobLines.slice(1).map((line) => `- ${line}`).join("\n")}`, "utf8")
  ]);
  return files;
}

async function waitForValue(locator, predicate, message, timeoutMs = 240_000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    const value = await locator.inputValue();
    if (predicate(value)) return value;
    await new Promise((resolve) => setTimeout(resolve, 300));
  }
  throw new Error(message);
}

async function freshSetup(page) {
  await page.goto(appUrl, { waitUntil: "networkidle", timeout: 60_000 });
  const activeBefore = await page.evaluate(() => document.activeElement?.tagName || "NONE");
  await page.keyboard.press("Tab");
  const coverFocused = await page.locator(".cover-enter").evaluate((element) => element === document.activeElement);
  assert(coverFocused, `封面入口无法键盘聚焦，初始焦点：${activeBefore}`);
  await page.keyboard.press("Enter");
  await page.getByRole("heading", { name: /先放材料/ }).waitFor({ timeout: 30_000 });
}

async function waitJobContains(page, expected, label) {
  const textarea = page.getByLabel("岗位描述文字");
  return waitForValue(textarea, (value) => normalize(value).includes(normalize(expected)), `${label} 没有正确进入岗位文字区`);
}

async function testJobInputs(page, files) {
  await freshSetup(page);
  const textArea = page.getByLabel("岗位描述文字");
  await page.evaluate(async (text) => navigator.clipboard.writeText(text), jobText);
  await textArea.focus();
  await page.keyboard.press("Control+V");
  await waitJobContains(page, jobLines[1], "剪贴板文字");

  await freshSetup(page);
  await page.getByLabel("岗位描述文字").fill(jobText);
  await waitJobContains(page, jobLines[2], "直接输入文字");

  for (const [label, filePath] of [["TXT", files.jobTxt], ["Markdown", files.jobMd], ["PDF", files.jobPdf], ["PNG", files.jobPng], ["JPG", files.jobJpg]]) {
    await freshSetup(page);
    await page.locator(".job-input input[type=file]").setInputFiles(filePath);
    await waitJobContains(page, label === "Markdown" ? jobLines[1] : jobLines[0], `岗位 ${label}`);
    await page.getByText(/已读取 1 个岗位文件/).waitFor({ timeout: 240_000 });
  }

  await freshSetup(page);
  await page.locator(".job-input input[type=file]").setInputFiles([files.jobTxt, files.jobMd]);
  await page.getByText(/已读取 2 个岗位文件/).waitFor({ timeout: 60_000 });
  assert((await page.locator(".job-files span").count()) === 2, "岗位多文件导入没有保留两份文件记录");

  await freshSetup(page);
  const txtBytes = await readFile(files.jobTxt);
  await page.locator(".job-input").evaluate((element, payload) => {
    const bytes = Uint8Array.from(atob(payload.base64), (character) => character.charCodeAt(0));
    const dataTransfer = new DataTransfer();
    dataTransfer.items.add(new File([bytes], payload.name, { type: "text/plain" }));
    element.dispatchEvent(new DragEvent("drop", { bubbles: true, cancelable: true, dataTransfer }));
  }, { base64: txtBytes.toString("base64"), name: path.basename(files.jobTxt) });
  await waitJobContains(page, jobLines[1], "岗位拖放");

  await freshSetup(page);
  const pngBytes = await readFile(files.jobPng);
  await page.getByLabel("岗位描述文字").evaluate((element, payload) => {
    const bytes = Uint8Array.from(atob(payload.base64), (character) => character.charCodeAt(0));
    const dataTransfer = new DataTransfer();
    dataTransfer.items.add(new File([bytes], payload.name, { type: "image/png" }));
    element.dispatchEvent(new ClipboardEvent("paste", { bubbles: true, cancelable: true, clipboardData: dataTransfer }));
  }, { base64: pngBytes.toString("base64"), name: path.basename(files.jobPng) });
  await waitJobContains(page, jobLines[0], "岗位剪贴板图片");
  await page.getByText(/已读取 1 个岗位文件/).waitFor({ timeout: 240_000 });
}

async function openSkillModal(page) {
  await page.getByRole("button", { name: /添加 Skill/ }).click();
  await page.getByRole("heading", { name: /把新的 Skill/ }).waitFor();
}

async function testSkillImports(page, round) {
  const localId = `matrix-local-r${round}`;
  const folderId = `matrix-folder-r${round}`;
  const zipId = `matrix-zip-r${round}`;
  const githubId = "resume-jd-optimizer-cn";
  const cleanTargets = [localId, folderId, zipId, githubId].map((id) => path.join(runtimeSkillsRoot, id));
  for (const target of cleanTargets) await rm(target, { recursive: true, force: true });

  const localFilePath = path.join(fixtureRoot, `skill-file-r${round}`);
  const localManifest = path.join(localFilePath, "SKILL.md");
  const folderPath = path.join(fixtureRoot, `skill-folder-r${round}`);
  const zipPath = path.join(fixtureRoot, `skill-r${round}.zip`);
  await mkdir(folderPath, { recursive: true });
  await mkdir(localFilePath, { recursive: true });
  await writeFile(localManifest, `---\nname: ${localId}\ndescription: Matrix local import verification skill.\n---\n\n# Matrix local skill\n`, "utf8");
  await writeFile(path.join(folderPath, "SKILL.md"), `---\nname: ${folderId}\ndescription: Matrix folder import verification skill.\n---\n\n# Matrix folder skill\n`, "utf8");
  await writeFile(zipPath, Buffer.from(zipSync({ "SKILL.md": strToU8(`---\nname: ${zipId}\ndescription: Matrix ZIP import verification skill.\n---\n\n# Matrix ZIP skill\n`) })));

  await freshSetup(page);
  await openSkillModal(page);
  await page.getByLabel("选择 Skill 文件夹").setInputFiles(folderPath);
  await page.getByRole("button", { name: /导入到本机/ }).click();
  await page.getByText(`已添加 ${folderId}`, { exact: false }).waitFor({ timeout: 60_000 });
  assert(await page.locator(".custom-skill-list").getByText(folderId, { exact: true }).isVisible(), "本地文件夹导入后未显示原始名称");

  await freshSetup(page);
  await openSkillModal(page);
  await page.getByLabel("选择 Skill ZIP 或 SKILL.md").setInputFiles(localManifest);
  await page.getByRole("button", { name: /导入到本机/ }).click();
  await page.getByText(`已添加 ${localId}`, { exact: false }).waitFor({ timeout: 60_000 });
  assert(await page.locator(".custom-skill-list").getByText(localId, { exact: true }).isVisible(), "本地 SKILL.md 导入后未显示原始名称");

  await freshSetup(page);
  await openSkillModal(page);
  await page.getByLabel("选择 Skill ZIP 或 SKILL.md").setInputFiles(zipPath);
  await page.getByRole("button", { name: /导入到本机/ }).click();
  await page.getByText(`已添加 ${zipId}`, { exact: false }).waitFor({ timeout: 60_000 });

  await freshSetup(page);
  await openSkillModal(page);
  await page.getByRole("tab", { name: "GitHub" }).click();
  await page.locator(".import-field input").fill("coinluu/resume-jd-optimizer-cn");
  await page.getByRole("button", { name: /从 GitHub 导入/ }).click();
  await page.getByText(`已添加 ${githubId}`, { exact: false }).waitFor({ timeout: 120_000 });
  assert(await page.locator(".custom-skill-list").getByText(githubId, { exact: true }).isVisible(), "GitHub Skill 导入后未显示原始名称");

  for (const target of cleanTargets) await rm(target, { recursive: true, force: true });
}

async function testSelectionAndGuards(page, files) {
  await freshSetup(page);
  const selected = page.locator('.skill-card[aria-pressed="true"]');
  assert((await selected.count()) === 3, "默认没有固定选择 3 个 Skill");
  const fourth = page.locator(".skill-card").filter({ hasText: "asu真实经历定位" }).first();
  assert(await fourth.isDisabled(), "已选 3 个 Skill 时第四个仍能点击");
  await fourth.evaluate((element) => element.click());
  assert((await selected.count()) === 3, "DOM 点击突破了 3 Skill 硬上限");

  if (profile === "strict") {
    const selectedReplacement = page.locator(".skill-card").filter({ hasText: "asu-resume" }).first();
    await selectedReplacement.click();
    assert((await selected.count()) === 2, "严格模式下取消一个 Skill 后数量不为 2");
    assert(!(await fourth.isDisabled()), "释放一个名额后候选 Skill 仍不可选择");
    await fourth.click();
    assert((await selected.count()) === 3, "替换 Skill 后没有恢复到 3 个");
    assert(await selectedReplacement.isDisabled(), "替换后原 Skill 未被 3 个硬上限锁定");
    await selectedReplacement.evaluate((element) => element.click());
    assert((await selected.count()) === 3, "替换后的 DOM 点击突破了 3 Skill 硬上限");
  }

  await page.getByLabel("岗位描述文字").fill(jobText);
  await page.locator(".resume-input input[type=file]").setInputFiles(files.jobTxt);
  await page.getByText("简历仅支持 DOCX、PDF、PNG、JPG。").waitFor();
  assert(await page.getByRole("button", { name: /开始真实运行/ }).isDisabled(), "不支持的简历格式仍可开始运行");

  await freshSetup(page);
  await page.locator(".job-input input[type=file]").setInputFiles(files.resumeDocx);
  await page.getByText("仅支持 TXT、Markdown、PDF、PNG、JPG").waitFor();
  assert((await page.getByLabel("岗位描述文字").inputValue()) === "", "不支持的岗位文件污染了岗位文字");

  const resumeBase64 = (await readFile(files.resumePdf)).toString("base64");
  const invalidRequests = [
    { label: "four-skills", body: { resume: { name: "matrix-resume.pdf", mediaType: "application/pdf", base64: resumeBase64, extractedText: resumeLines.join("\n") }, jobText, skillIds: ["career-ops", "interview-coach", "asu", "resume"] }, expected: "最多只能运行 3 个 Skill" },
    { label: "empty-job", body: { resume: { name: "matrix-resume.pdf", mediaType: "application/pdf", base64: resumeBase64, extractedText: resumeLines.join("\n") }, jobText: "", skillIds: ["career-ops"] }, expected: "岗位文字不能为空" },
    { label: "unsupported-resume", body: { resume: { name: "matrix-resume.txt", mediaType: "text/plain", base64: resumeBase64, extractedText: resumeLines.join("\n") }, jobText, skillIds: ["career-ops"] }, expected: "当前支持 DOCX、PDF、PNG、JPG" }
  ];
  for (const item of invalidRequests) {
    const response = await fetch(`${apiUrl}/api/runs`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(item.body) });
    const payload = await response.json();
    assert(response.status === 422 && !payload.ok && payload.error.message.includes(item.expected), `${item.label} 没有被后端门禁拒绝`);
  }

  await freshSetup(page);
  assert((await page.getByLabel("岗位描述文字").inputValue()) === "", "空白出厂状态带入了旧岗位数据");
  assert((await page.locator(".resume-input").innerText()).includes("上传本地简历"), "空白出厂状态带入了旧简历");
  assert(!(await page.locator("body").innerText()).includes("ALEX CHEN"), "空白出厂 UI 泄露了测试材料");
}

async function chooseOnlyCareerOps(page) {
  for (const name of ["interview-coach", "asu-resume"]) {
    await page.locator(".skill-card").filter({ hasText: name }).first().click();
  }
  const names = await page.locator('.skill-card[aria-pressed="true"] strong').allTextContents();
  assert(JSON.stringify(names) === JSON.stringify(["career-ops"]), `单 Provider 选择失败：${names.join(", ")}`);
}

async function runFromSetup(page, expectedProviders, timeoutMs = 20 * 60_000) {
  const start = page.getByRole("button", { name: /开始真实运行/ });
  assert(!(await start.isDisabled()), "材料就绪后开始真实运行按钮仍不可用");
  await start.click();
  await page.getByRole("heading", { name: /这次会真的运行/ }).waitFor();
  const responsePromise = page.waitForResponse((response) => response.url().endsWith("/api/runs") && response.request().method() === "POST", { timeout: timeoutMs });
  await page.getByRole("button", { name: /确认并开始真实运行/ }).click();
  const response = await responsePromise;
  const payload = await response.json();
  assert(response.ok() && payload.ok, `真实运行失败：${JSON.stringify(payload.error || payload)}`);
  assert(payload.data?.jobId, "真实运行没有返回任务编号");
  const deadline = Date.now() + timeoutMs;
  let job;
  while (Date.now() < deadline) {
    const statusResponse = await page.request.get(`${apiUrl}/api/runs/status/${encodeURIComponent(payload.data.jobId)}`);
    const statusPayload = await statusResponse.json();
    assert(statusResponse.ok() && statusPayload.ok, `无法读取真实运行进度：${JSON.stringify(statusPayload.error || statusPayload)}`);
    job = statusPayload.data;
    if (job.status === "COMPLETED" || job.status === "FAILED") break;
    await new Promise((resolve) => setTimeout(resolve, 900));
  }
  assert(job?.status === "COMPLETED", `真实运行状态不是 COMPLETED：${job?.status || "TIMEOUT"}${job?.error ? `；${job.error}` : ""}`);
  const data = job.result;
  if (data.status !== "COMPLETED") {
    const providerErrors = data.providers?.map((provider) => `${provider.providerId}: ${provider.errorMessage || provider.errorCode || provider.status}`).join(" | ");
    throw new Error(`真实运行状态不是 COMPLETED：${data.status}${providerErrors ? `；${providerErrors}` : ""}`);
  }
  assert(JSON.stringify(data.providers.map((provider) => provider.providerId)) === JSON.stringify(expectedProviders), "Provider 身份或顺序漂移");
  for (const provider of data.providers) {
    assert(provider.status === "SUCCESS", `${provider.providerId} 没有成功`);
    assert((provider.retryCount ?? 0) <= 1, `${provider.providerId} 超过一次有界重试`);
    assert(provider.attempts?.at(-1)?.status === "SUCCESS", `${provider.providerId} 最后一次尝试没有成功`);
  }
  const changed = data.comparison.blocks.filter((block) => block.candidates?.length > 0);
  assert(changed.length > 0, "真实 Provider 没有生成通过门禁的候选");
  await page.getByRole("heading", { name: "比较真实原文", level: 1 }).waitFor({ timeout: 60_000 });
  return { data, changed };
}

async function assertSourceLocated(page, extension) {
  if (extension === ".pdf") {
    await page.locator('.pdf-page .source-marker[data-state="located"]').first().waitFor({ timeout: 60_000 });
  } else {
    await page.locator(".source-marker.located").first().waitFor({ timeout: extension === ".docx" ? 60_000 : 240_000 });
  }
}

async function testResumeRealClosures(page, files) {
  const formats = [
    ["DOCX", files.resumeDocx, ".docx"],
    ["PDF", files.resumePdf, ".pdf"],
    ["PNG", files.resumePng, ".png"],
    ["JPG", files.resumeJpg, ".jpg"]
  ];
  const results = [];
  for (const [label, filePath, extension] of formats) {
    await freshSetup(page);
    await page.getByLabel("岗位描述文字").fill(jobText);
    await page.locator(".resume-input input[type=file]").setInputFiles(filePath);
    if (extension !== ".docx") await page.getByText(/已识别 .* 字，可开始运行/).waitFor({ timeout: 240_000 });
    await chooseOnlyCareerOps(page);
    const { data, changed } = await runFromSetup(page, ["career-ops"]);
    await assertSourceLocated(page, extension);
    assert((await page.locator(".live-preview").innerText()).includes(path.basename(filePath)), `${label} 原始简历预览未加载`);
    assert((await page.locator(".candidate-detail > p").innerText()) === changed[0].candidates[0].proposedText, `${label} UI 候选与真实结果不一致`);
    await page.getByRole("button", { name: "采用这个版本" }).click();
    await page.getByText("已采用", { exact: true }).waitFor();
    results.push({ format: label, runId: data.runId, changedBlocks: changed.length, provider: data.providers[0].invocationId, retryCount: data.providers[0].retryCount ?? 0, sourceLocated: true });
    logProgress("resume-format-passed", { label, runId: data.runId, changedBlocks: changed.length });
  }
  return results;
}

async function testThreeSkillClosure(page, files) {
  await freshSetup(page);
  await page.locator(".resume-input input[type=file]").setInputFiles(files.resumePdf);
  await page.getByLabel("岗位描述文字").fill(jobText);
  await page.getByText(/已识别 .* 字，可开始运行/).waitFor({ timeout: 120_000 });
  const expectedProviders = ["career-ops", "interview-coach", "asu-resume"];
  const { data, changed } = await runFromSetup(page, expectedProviders);
  assert(changed.length >= 3, `三 Skill 闭环只有 ${changed.length} 个候选区块，无法覆盖采用/改写/保留`);
  const contributors = new Set(changed.flatMap((block) => block.candidates.map((candidate) => candidate.skillId)));
  for (const provider of expectedProviders) assert(contributors.has(provider), `${provider} 没有候选进入横向对比`);

  let candidateCount = 0;
  let minimumMarkerWidthRatio = 1;
  for (let blockIndex = 0; blockIndex < changed.length; blockIndex += 1) {
    const block = changed[blockIndex];
    await page.getByRole("button", { name: new RegExp(`区块\\s*${blockIndex + 1}`) }).click();
    assert((await page.locator(".live-preview").innerText()).includes(path.basename(files.resumePdf)), `区块 ${blockIndex + 1} 原始简历预览未加载`);
    const marker = page.locator('.pdf-page .source-marker[data-state="located"]').first();
    await marker.waitFor({ timeout: 60_000 });
    const markerBox = await marker.boundingBox();
    const pageBox = await marker.locator("xpath=..").boundingBox();
    assert(markerBox && pageBox, `区块 ${blockIndex + 1} 定位框不可测量`);
    minimumMarkerWidthRatio = Math.min(minimumMarkerWidthRatio, markerBox.width / pageBox.width);
    for (const candidate of block.candidates) {
      await page.getByRole("tab", { name: new RegExp(candidate.skillId) }).click();
      assert((await page.locator(".candidate-detail > p").innerText()) === candidate.proposedText, `${candidate.skillId} 候选与 API 不一致`);
      candidateCount += 1;
    }
    if (blockIndex === 0) {
      await page.getByRole("button", { name: "自己改写" }).click();
      const editor = page.getByLabel("修改这条建议");
      await editor.fill(`${await editor.inputValue()} [verified edit]`);
      await page.getByRole("button", { name: "采用这个版本" }).click();
    } else if (blockIndex === 1) {
      await page.getByRole("button", { name: "保留原文" }).click();
    } else {
      await page.getByRole("button", { name: "采用这个版本" }).click();
    }
  }
  assert(Number(await page.locator(".live-preview footer b").innerText()) === changed.length, "没有确认完全部候选区块");
  await page.getByRole("button", { name: /查看真实运行记录/ }).click();
  for (const provider of data.providers) await page.getByText(provider.invocationId, { exact: false }).first().waitFor();
  return { runId: data.runId, changedBlocks: changed.length, candidateCount, providers: data.providers.map((provider) => ({ providerId: provider.providerId, invocationId: provider.invocationId, retryCount: provider.retryCount ?? 0 })), minimumMarkerWidthRatio };
}

await saveReport();
const health = await fetch(`${apiUrl}/api/health`).then((response) => response.json()).catch(() => null);
assert(health?.ok && health.demoData === false, "本地真实 API 没有启动，或仍处于演示模式");
const fixtures = await createFixtures();

for (let round = 1; round <= targetRounds; round += 1) {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext(profile === "strict"
    ? { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1.25, locale: "zh-CN", reducedMotion: "reduce" }
    : { viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 });
  await context.grantPermissions(["clipboard-read", "clipboard-write"], { origin: appUrl });
  const page = await context.newPage();
  const browserErrors = [];
  const networkErrors = [];
  const ignoredDiagnostics = [];
  const checks = [];
  const started = Date.now();
  report.activeRound = { round, startedAt: new Date(started).toISOString(), checks };
  await saveReport();
  page.on("console", (message) => {
    if (message.type() !== "error") return;
    const diagnostic = `console:${message.text()}`;
    if (message.text().startsWith("Warning: Parameter not found:")) ignoredDiagnostics.push(diagnostic);
    else browserErrors.push(diagnostic);
  });
  page.on("pageerror", (error) => browserErrors.push(`pageerror:${error.message}`));
  page.on("requestfailed", (request) => networkErrors.push(`${request.method()} ${request.url()} ${request.failure()?.errorText || "unknown"}`));

  const check = async (name, operation) => {
    const checkStarted = Date.now();
    try {
      const detail = await operation();
      checks.push({ name, status: "PASSED", durationMs: Date.now() - checkStarted, ...(detail ? { detail } : {}) });
      await saveReport();
      logProgress("check-passed", { round, name, durationMs: Date.now() - checkStarted });
      return detail;
    } catch (error) {
      checks.push({ name, status: "FAILED", durationMs: Date.now() - checkStarted, error: error instanceof Error ? error.message : String(error) });
      logProgress("check-failed", { round, name, error: error instanceof Error ? error.message : String(error) });
      throw error;
    }
  };

  try {
    await check("job-inputs-all-modes", () => testJobInputs(page, fixtures));
    await check("skill-import-local-zip-github", () => testSkillImports(page, round));
    await check("selection-guards-negative-privacy", () => testSelectionAndGuards(page, fixtures));
    let resumeRuns;
    let threeSkill;
    if (skipProviders) {
      checks.push({ name: "real-provider-each-resume-format", status: "BLOCKED", reason: "CODEX_USAGE_LIMIT" });
      checks.push({ name: "real-three-skill-compare-decisions-audit", status: "BLOCKED", reason: "CODEX_USAGE_LIMIT" });
      await saveReport();
    } else {
      resumeRuns = await check("real-provider-each-resume-format", () => testResumeRealClosures(page, fixtures));
      threeSkill = await check("real-three-skill-compare-decisions-audit", () => testThreeSkillClosure(page, fixtures));
    }
    assert(browserErrors.length === 0, `浏览器错误：${browserErrors.join(" | ")}`);
    assert(networkErrors.length === 0, `网络错误：${networkErrors.join(" | ")}`);
    await page.screenshot({ path: path.join(artifactRoot, `round-${round}-passed.png`), fullPage: true });
    report.rounds.push({ round, status: skipProviders ? "LOCAL_PASSED_PROVIDER_BLOCKED" : "PASSED", durationMs: Date.now() - started, checks, ...(resumeRuns ? { resumeRuns } : {}), ...(threeSkill ? { threeSkill } : {}), browserErrors: 0, networkErrors: 0, ignoredDiagnostics });
    if (skipProviders) report.localPassedRounds += 1;
    else report.passedRounds += 1;
    delete report.activeRound;
    await saveReport();
  } catch (error) {
    await page.screenshot({ path: path.join(artifactRoot, `round-${round}-FAILED.png`), fullPage: true }).catch(() => {});
    report.rounds.push({ round, status: "FAILED", durationMs: Date.now() - started, checks, error: error instanceof Error ? error.message : String(error), browserErrors, networkErrors, ignoredDiagnostics });
    delete report.activeRound;
    report.status = "FAILED";
    report.completedAt = new Date().toISOString();
    await saveReport();
    throw error;
  } finally {
    await context.close();
    await browser.close();
  }
}

report.status = skipProviders ? "LOCAL_PASSED_PROVIDER_BLOCKED" : "PASSED";
report.completedAt = new Date().toISOString();
await saveReport();
console.log(JSON.stringify({ status: report.status, passedRounds: report.passedRounds, localPassedRounds: report.localPassedRounds, targetRounds: report.targetRounds, reportPath }));
