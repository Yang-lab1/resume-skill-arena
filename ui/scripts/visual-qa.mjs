import { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { strToU8, zipSync } from "fflate";

const require = createRequire(import.meta.url);
const playwrightModule = process.env.RESUME_STUDIO_PLAYWRIGHT ?? path.join(
  process.env.USERPROFILE ?? "",
  ".cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright"
);
const { chromium } = require(playwrightModule);
const output = path.resolve("qa-artifacts");
await mkdir(output, { recursive: true });

function anonymousDocx() {
  const paragraphs = [
    ["Title", "候选人 A"],
    [null, "产品设计师"],
    ["Heading1", "个人简介"],
    [null, "拥有五年企业软件产品设计经验，负责用户研究、复杂流程设计与跨团队交付。"],
    ["Heading1", "工作经历"],
    [null, "示例科技有限公司｜高级产品设计师｜2021.06–至今"],
    [null, "负责企业协作产品的需求研究与方案设计，推动核心任务完成率提升 24%。"],
    [null, "建立设计评审与数据复盘流程，将关键功能平均交付周期缩短 18%。"],
    ["Heading1", "项目经历"],
    [null, "流程协作平台｜负责人"],
    [null, "梳理六类高频任务并完成信息架构重构，上线后新用户首周留存提升 12%。"],
    ["Heading1", "教育经历"],
    [null, "示例大学｜工业设计｜本科"],
    ["Heading1", "技能清单"],
    [null, "Figma、用户研究、数据分析、项目管理、跨团队协作"]
  ];
  const body = paragraphs.map(([style, value]) => `<w:p>${style ? `<w:pPr><w:pStyle w:val="${style}"/></w:pPr>` : ""}<w:r><w:t>${value}</w:t></w:r></w:p>`).join("");
  const documentXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${body}<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1134" w:right="1134" w:bottom="1134" w:left="1134"/></w:sectPr></w:body></w:document>`;
  const contentTypes = `<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/></Types>`;
  const packageRels = `<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>`;
  const styles = `<?xml version="1.0" encoding="UTF-8"?><w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:style w:type="paragraph" w:styleId="Normal" w:default="1"><w:name w:val="Normal"/></w:style><w:style w:type="paragraph" w:styleId="Title"><w:name w:val="Title"/><w:rPr><w:b/><w:sz w:val="36"/></w:rPr></w:style><w:style w:type="paragraph" w:styleId="Heading1"><w:name w:val="heading 1"/><w:rPr><w:b/><w:sz w:val="26"/></w:rPr></w:style></w:styles>`;
  return zipSync({
    "[Content_Types].xml": strToU8(contentTypes),
    "_rels/.rels": strToU8(packageRels),
    "word/document.xml": strToU8(documentXml),
    "word/styles.xml": strToU8(styles)
  });
}

const qaDirectory = path.join(os.tmpdir(), `resume-studio-qa-${process.pid}`);
await mkdir(qaDirectory, { recursive: true });
const qaResumePath = path.join(qaDirectory, "anonymous-resume.docx");
await writeFile(qaResumePath, anonymousDocx());

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 1024 }, deviceScaleFactor: 1 });
const consoleErrors = [];
page.on("console", (message) => {
  if (message.type() === "error" || message.type() === "warning") consoleErrors.push(`${message.type()}: ${message.text()}`);
});
page.on("pageerror", (error) => consoleErrors.push(`pageerror: ${error.message}`));

await page.goto("http://localhost:4173", { waitUntil: "networkidle" });
await page.screenshot({ path: path.join(output, "cover-desktop.png"), fullPage: true });
await page.getByRole("button", { name: "进入简历工作台" }).click();
await page.getByRole("heading", { name: /先放材料/ }).waitFor();
const titleLines = page.locator(".setup-poster h1 span");
const titleLineCount = await titleLines.count();
if (titleLineCount !== 2) throw new Error(`Setup title is not locked to two lines: ${titleLineCount}; ${await page.locator(".setup-poster h1").innerHTML()}`);
const firstLine = await titleLines.nth(0).boundingBox();
const secondLine = await titleLines.nth(1).boundingBox();
if (!firstLine || !secondLine || secondLine.y <= firstLine.y) throw new Error("Setup title lines overlap.");
await page.getByText("resume-optimizer", { exact: true }).waitFor();
await page.getByText("resume-jd-fit", { exact: true }).waitFor();
await page.getByText("asu-resume", { exact: true }).waitFor();
if (await page.locator(".job-input > header > b").innerText() !== "岗位") throw new Error("The job badge can still be misread as a company name.");
await page.locator(".resume-input input[type=file]").setInputFiles(qaResumePath);
await page.getByLabel("岗位描述文字").fill("负责 AI 产品设计、用户研究、复杂工作流设计与跨团队交付；要求能够将业务需求转化为可落地方案，并使用数据验证产品效果。");
const setupShell = await page.locator(".setup-shell").boundingBox();
const setupPoster = await page.locator(".setup-poster").boundingBox();
if (!setupShell || !setupPoster || setupPoster.width > 361 || setupPoster.width / setupShell.width > 0.27) throw new Error(`Setup poster is still too wide: ${setupPoster?.width}px`);
await page.screenshot({ path: path.join(output, "setup-desktop.png"), fullPage: true });
await page.setViewportSize({ width: 1024, height: 900 });
await page.screenshot({ path: path.join(output, "setup-compact.png"), fullPage: true });
await page.setViewportSize({ width: 1440, height: 1024 });

await page.getByRole("button", { name: /resume-jd-fit/ }).click();
await page.getByRole("button", { name: /asu-resume/ }).click();
const startButton = page.getByRole("button", { name: /开始真实运行/ });
if (await startButton.isDisabled()) throw new Error("Start button stayed disabled after real local inputs.");
await startButton.click();
await page.getByRole("heading", { name: /这次会真的运行/ }).waitFor();
const runResponsePromise = page.waitForResponse((response) => response.url().endsWith("/api/runs") && response.request().method() === "POST", { timeout: 360000 });
await page.getByRole("button", { name: /确认并开始真实运行/ }).click();
await page.getByText(/正在实际调用 1 个 Skill/).waitFor({ timeout: 15000 });
const runResponse = await runResponsePromise;
const runPayload = await runResponse.json();
if (!runResponse.ok() || !runPayload.ok) throw new Error(`Real provider run failed: ${JSON.stringify(runPayload)}`);
if (runPayload.data.providers[0]?.status !== "SUCCESS") throw new Error(`Provider did not succeed: ${JSON.stringify(runPayload.data.providers)}`);
const realBlocks = runPayload.data.comparison.blocks.filter((block) => block.candidates.length > 0);
if (!realBlocks.length) throw new Error("The real provider returned no verified comparison blocks.");
await page.getByRole("heading", { name: "比较真实原文", level: 1 }).waitFor({ timeout: 30000 });
await page.locator(".docx-preview-body .docx-wrapper").waitFor({ timeout: 15000 });
if (await page.getByText("杨帆", { exact: true }).count()) throw new Error("The comparison page still contains the hard-coded sample person.");
if (await page.getByText("负责会员增长相关工作", { exact: false }).count()) throw new Error("Static demo baseline is still visible.");
if (await page.locator(".baseline").count()) throw new Error("Duplicate baseline text box is still visible.");
if (!(await page.locator(".candidate-detail > p").innerText()).includes(realBlocks[0].candidates[0].proposedText)) throw new Error("Visible proposal did not come from the real ChangeSet.");
await page.getByText(`正在对比 · ${realBlocks[0].candidates[0].skillId}`, { exact: true }).waitFor();
await page.waitForTimeout(300);
const locatedMarkerHeight = (await page.locator(".source-marker").boundingBox())?.height;
if (!Number.isFinite(locatedMarkerHeight) || locatedMarkerHeight < 18) throw new Error(`The real source marker is invalid: ${locatedMarkerHeight}px`);
await page.screenshot({ path: path.join(output, "compare-desktop.png"), fullPage: true });
const preview = await page.locator(".live-preview").boundingBox();
const compareShell = await page.locator(".compare-shell").boundingBox();
const sectionRail = await page.locator(".section-rail").boundingBox();
if (!preview || !compareShell || !sectionRail) throw new Error("Comparison layout bounds are unavailable.");
const previewShare = preview.width / (compareShell.width - sectionRail.width);
if (previewShare < 0.47 || previewShare > 0.53) throw new Error(`Original resume does not occupy half the work area: ${previewShare}`);
if (Math.abs(preview.y + preview.height - 1024) > 2) throw new Error("Comparison workspace does not fill the desktop viewport.");

await page.getByRole("button", { name: "采用这个版本" }).click();
await page.getByText("已采用", { exact: true }).waitFor();
const editButton = page.getByRole("button", { name: "自己改写" });
if (await editButton.isDisabled()) throw new Error("Edit button stayed disabled after adopting a candidate.");
await editButton.click();
const editor = page.getByLabel("修改这条建议");
await editor.fill(`${realBlocks[0].candidates[0].proposedText}（用户确认稿）`);
await page.getByRole("button", { name: "更新已采用版本" }).click();
await page.getByRole("button", { name: /查看真实运行记录/ }).click();
await page.getByRole("heading", { name: /每一版/ }).waitFor();
await page.getByText(runPayload.data.providers[0].invocationId, { exact: false }).first().waitFor();
await page.screenshot({ path: path.join(output, "final-modal-desktop.png"), fullPage: true });

await page.setViewportSize({ width: 390, height: 844 });
await page.reload({ waitUntil: "networkidle" });
await page.screenshot({ path: path.join(output, "cover-mobile.png"), fullPage: true });
await page.getByRole("button", { name: "进入简历工作台" }).click();
await page.getByRole("heading", { name: /先放材料/ }).waitFor();
await page.screenshot({ path: path.join(output, "setup-mobile.png"), fullPage: true });

await browser.close();
await rm(qaDirectory, { recursive: true, force: true });
if (consoleErrors.length) throw new Error(`Console was not clean:\n${consoleErrors.join("\n")}`);
console.log(JSON.stringify({ status: "passed", screenshots: 7, consoleErrors: 0, titleLines: 2, realProvider: runPayload.data.providers[0].providerId, realCandidateBlocks: realBlocks.length, posterWidth: setupPoster.width, previewShare }));
