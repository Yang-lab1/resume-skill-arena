import {
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  unlinkSync,
  writeFileSync
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { strToU8, zipSync } from "fflate";
import { afterEach, describe, expect, it } from "vitest";

import { freezeBaseline, toChangeSetBaselineReference } from "./freeze.js";
import { verifyFrozenBaseline } from "./verify.js";

const tempRoots: string[] = [];

afterEach(() => {
  tempRoots.splice(0).forEach((directory) =>
    rmSync(directory, { recursive: true, force: true })
  );
});

function setupInputs() {
  const root = mkdtempSync(join(tmpdir(), "resume-studio-freeze-"));
  tempRoots.push(root);
  const resumePath = join(root, "我的 简历.docx");
  const jobPath = join(root, "目标岗位.md");
  const xml = `<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>AI 产品设计师</w:t></w:r></w:p></w:body></w:document>`;
  writeFileSync(
    resumePath,
    Buffer.from(zipSync({ "word/document.xml": strToU8(xml) }))
  );
  writeFileSync(jobPath, "负责 AI 产品设计\n推动原型落地", "utf8");
  return { root, resumePath, jobPath, output: join(root, "runs") };
}

describe("freezeBaseline", () => {
  it("creates reproducible frozen baselines without modifying source files", () => {
    const input = setupInputs();
    const originalResume = readFileSync(input.resumePath);
    const first = freezeBaseline({
      ...input,
      outputDirectory: input.output,
      runId: "run.test.001",
      locale: "zh-CN",
      maxPages: 1,
      now: () => new Date("2026-08-20T12:00:00.000Z")
    });
    const second = freezeBaseline({
      ...input,
      outputDirectory: input.output,
      runId: "run.test.002",
      locale: "zh-CN",
      maxPages: 1,
      now: () => new Date("2026-08-21T12:00:00.000Z")
    });

    expect(first.baseline.baselineId).toBe(second.baseline.baselineId);
    expect(first.baseline.resumeAst.blocks[0]!.blockId).toBe(
      second.baseline.resumeAst.blocks[0]!.blockId
    );
    expect(readFileSync(input.resumePath)).toEqual(originalResume);
    expect(existsSync(join(first.runDirectory, "baseline/baseline.lock.json"))).toBe(
      true
    );
    expect(verifyFrozenBaseline(first.runDirectory)).toEqual({ ok: true, issues: [] });
    expect(toChangeSetBaselineReference(first.baseline)).toMatchObject({
      resumeId: first.baseline.resumeAst.resumeId,
      resumeHash: first.baseline.resumeAst.resumeHash,
      resumeAstVersion: "0.1",
      jobId: first.baseline.jobSnapshot.jobId,
      jobHash: first.baseline.jobSnapshot.jobHash,
      jobAstVersion: "0.1",
      factSnapshotId: first.baseline.factSnapshot.factSnapshotId,
      locale: "zh-CN"
    });
  });

  it("changes the baseline ID when the JD changes", () => {
    const input = setupInputs();
    const first = freezeBaseline({
      ...input,
      outputDirectory: input.output,
      runId: "run.change.001",
      locale: "zh-CN",
      maxPages: 1
    });
    writeFileSync(input.jobPath, "完全不同的岗位要求", "utf8");
    const second = freezeBaseline({
      ...input,
      outputDirectory: input.output,
      runId: "run.change.002",
      locale: "zh-CN",
      maxPages: 1
    });

    expect(second.baseline.baselineId).not.toBe(first.baseline.baselineId);
  });

  it("accepts a PDF source when it carries verified extracted text", () => {
    const input = setupInputs();
    const pdfPath = join(input.root, "我的 简历.pdf");
    writeFileSync(pdfPath, "%PDF-1.7\nreal source bytes");
    const frozen = freezeBaseline({
      resumePath: pdfPath,
      resumeText: "教育经历\n工作经历\n产品设计师",
      resumeMediaType: "application/pdf",
      jobPath: input.jobPath,
      outputDirectory: input.output,
      runId: "run.pdf.001",
      locale: "zh-CN",
      maxPages: 1
    });

    expect(frozen.baseline.resumeAst.source.mediaType).toBe("application/pdf");
    expect(verifyFrozenBaseline(frozen.runDirectory)).toEqual({ ok: true, issues: [] });
  });

  it("detects tampering in a frozen input", () => {
    const input = setupInputs();
    const frozen = freezeBaseline({
      ...input,
      outputDirectory: input.output,
      runId: "run.tamper.001",
      locale: "zh-CN",
      maxPages: 1
    });
    writeFileSync(
      join(frozen.runDirectory, "input/目标岗位.md"),
      "被修改的岗位",
      "utf8"
    );

    expect(verifyFrozenBaseline(frozen.runDirectory)).toEqual({
      ok: false,
      issues: [expect.objectContaining({ code: "JOB_HASH_MISMATCH" })]
    });
  });

  it("reports a deleted frozen input instead of throwing", () => {
    const input = setupInputs();
    const frozen = freezeBaseline({
      ...input,
      outputDirectory: input.output,
      runId: "run.deleted.001",
      locale: "zh-CN",
      maxPages: 1
    });
    unlinkSync(join(frozen.runDirectory, "input/我的 简历.docx"));

    expect(verifyFrozenBaseline(frozen.runDirectory)).toEqual({
      ok: false,
      issues: [expect.objectContaining({ code: "RESUME_HASH_MISMATCH" })]
    });
  });

  it("never overwrites an existing run directory", () => {
    const input = setupInputs();
    const options = {
      ...input,
      outputDirectory: input.output,
      runId: "run.existing.001",
      locale: "zh-CN",
      maxPages: 1
    };
    freezeBaseline(options);

    expect(() => freezeBaseline(options)).toThrow("运行目录已存在");
  });
});
