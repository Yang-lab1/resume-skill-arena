import assert from "node:assert/strict";
import test from "node:test";

import { withTimeout } from "../src/async-utils.js";
import { clipboardImageFiles } from "../src/clipboard-utils.js";
import { findOcrLine, tesseractLines } from "../src/ocr-utils.js";
import { findPdfTargetBox, textItemsToLines } from "../src/pdf-line-utils.js";

test("preserves PDF visual lines instead of flattening one page into a source block", () => {
  const lines = textItemsToLines([
    { str: "工作经历", hasEOL: true },
    { str: "2024.01", hasEOL: false },
    { str: "产品设计师", hasEOL: true },
    { str: "负责需求分析", hasEOL: true }
  ]);

  assert.deepEqual(lines, ["工作经历", "2024.01 产品设计师", "负责需求分析"]);
});

test("keeps PNG and JPEG clipboard files while leaving pasted text to the textarea", () => {
  const png = { name: "job.png" };
  const jpg = { name: "job.jpg" };
  const files = clipboardImageFiles({
    items: [
      { kind: "string", type: "text/plain", getAsFile: () => null },
      { kind: "file", type: "image/png", getAsFile: () => png },
      { kind: "file", type: "image/jpeg", getAsFile: () => jpg },
      { kind: "file", type: "image/gif", getAsFile: () => ({ name: "job.gif" }) },
    ]
  });

  assert.deepEqual(files, [png, jpg]);
  assert.deepEqual(clipboardImageFiles(undefined), []);
});

test("locates the complete PDF source line instead of a single text fragment", () => {
  const box = findPdfTargetBox([
    { str: "2024.01", width: 60, height: 12, transform: [1, 0, 0, 1, 20, 700], hasEOL: false },
    { str: "产品设计师", width: 100, height: 12, transform: [1, 0, 0, 1, 100, 700], hasEOL: true },
    { str: "下一行", width: 50, height: 12, transform: [1, 0, 0, 1, 20, 670], hasEOL: true }
  ], { scale: 1, height: 800 }, "【第 1 页】 2024.01 产品设计师");

  assert.ok(box);
  assert.equal(box.left, 16);
  assert.equal(box.width, 188);
  assert.equal(box.height, 22);
});

test("does not guess a PDF location from a partial or duplicated line", () => {
  const items = [
    { str: "工作经历", width: 60, height: 12, transform: [1, 0, 0, 1, 20, 700], hasEOL: true },
    { str: "工作经历", width: 60, height: 12, transform: [1, 0, 0, 1, 20, 670], hasEOL: true }
  ];
  assert.equal(findPdfTargetBox(items, { scale: 1, height: 800 }, "工作"), null);
  assert.equal(findPdfTargetBox(items, { scale: 1, height: 800 }, "工作经历"), null);
});

test("reads Tesseract v7 block output and locates the matching OCR line", () => {
  const expected = { text: "Product designer with six years of experience.", bbox: { x0: 10, y0: 20, x1: 700, y1: 70 } };
  const lines = tesseractLines({
    blocks: [{ paragraphs: [{ lines: [expected, { text: "Other line", bbox: { x0: 0, y0: 80, x1: 100, y1: 100 } }] }] }]
  });
  const normalizeText = (value) => String(value || "").replace(/\s+/g, "").toLowerCase();

  assert.deepEqual(lines, [expected, { text: "Other line", bbox: { x0: 0, y0: 80, x1: 100, y1: 100 } }]);
  assert.equal(findOcrLine(lines, "Product designer with six years of experience.", normalizeText), expected);
  assert.equal(findOcrLine(lines, "Missing sentence", normalizeText), null);
});

test("does not guess an OCR location from a partial or duplicated line", () => {
  const lines = [
    { text: "工作经历", bbox: { x0: 0, y0: 0, x1: 100, y1: 20 } },
    { text: "工作经历", bbox: { x0: 0, y0: 30, x1: 100, y1: 50 } }
  ];
  const normalizeText = (value) => String(value || "").replace(/\s+/g, "");
  assert.equal(findOcrLine(lines, "工作", normalizeText), null);
  assert.equal(findOcrLine(lines, "工作经历", normalizeText), null);
});

test("bounds a stalled OCR operation with an explicit timeout", async () => {
  await assert.rejects(
    withTimeout(new Promise(() => {}), 5, "OCR 识别超时。"),
    /OCR 识别超时/
  );
});
