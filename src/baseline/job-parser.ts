import { extname } from "node:path";

import { sha256, stableId } from "./hash.js";
import { normalizeBlockText } from "./text.js";
import type { BaselineBlock, JobSnapshot } from "./types.js";

const MAX_JOB_BYTES = 5 * 1024 * 1024;
const MAX_BLOCKS = 2_000;
const MAX_BLOCK_CHARS = 20_000;

export function parseJobText(
  bytes: Uint8Array,
  originalName: string,
  locale: string
): JobSnapshot {
  if (bytes.byteLength > MAX_JOB_BYTES) {
    throw new Error("JD 文本超过 5 MiB 限制。");
  }

  let decoded: string;
  try {
    decoded = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch (error) {
    throw new Error("JD 必须是有效的 UTF-8 文本。", { cause: error });
  }

  const blocks: BaselineBlock[] = [];
  decoded.replace(/^\uFEFF/, "").split(/\r?\n/).forEach((line, sourceIndex) => {
    const text = normalizeBlockText(line);
    if (!text) return;
    if (text.length > MAX_BLOCK_CHARS) {
      throw new Error(`JD 第 ${sourceIndex + 1} 行超过 20,000 字符限制。`);
    }
    const structuralPath = `text#line[${sourceIndex}]`;
    blocks.push({
      blockId: stableId("job-block", structuralPath, text),
      index: blocks.length,
      kind: "JOB_LINE",
      structuralPath,
      contentHash: sha256(text),
      text
    });
  });

  if (blocks.length === 0) {
    throw new Error("JD 没有可用文本。");
  }
  if (blocks.length > MAX_BLOCKS) {
    throw new Error("JD 超过 2,000 个非空区块限制。");
  }

  const jobHash = sha256(bytes);
  const extension = extname(originalName).toLowerCase();
  return {
    schemaVersion: "0.1",
    jobId: stableId("job", jobHash),
    jobHash,
    astVersion: "0.1",
    locale,
    source: {
      originalName,
      mediaType: extension === ".md" ? "text/markdown" : "text/plain",
      sizeBytes: bytes.byteLength,
      sha256: jobHash
    },
    blocks
  };
}
