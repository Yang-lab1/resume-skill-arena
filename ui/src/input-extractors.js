import * as pdfjsLib from "pdfjs-dist/build/pdf.mjs";
import { createWorker } from "tesseract.js";
import { withTimeout } from "./async-utils.js";
import { textItemsToLines } from "./pdf-line-utils.js";

pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
  "pdfjs-dist/build/pdf.worker.min.mjs",
  import.meta.url
).toString();

const IMAGE_EXTENSIONS = new Set([".png", ".jpg", ".jpeg"]);
const OCR_ATTEMPTS = 2;
const OCR_INITIALIZE_TIMEOUT_MS = 60_000;
const OCR_RECOGNIZE_TIMEOUT_MS = 90_000;
const OCR_TERMINATE_TIMEOUT_MS = 10_000;
const OCR_LANG_PATH = "/tessdata";

export function resumeExtension(name) {
  const lowerName = String(name || "").toLowerCase();
  const dot = lowerName.lastIndexOf(".");
  return dot >= 0 ? lowerName.slice(dot) : "";
}

export function isImageResume(name) {
  return IMAGE_EXTENSIONS.has(resumeExtension(name));
}

export async function extractPdfText(file, onProgress = () => {}) {
  const bytes = new Uint8Array(await file.arrayBuffer());
  const loadingTask = pdfjsLib.getDocument({ data: bytes });
  const pdf = await loadingTask.promise;
  const lines = [];
  try {
    for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
      const page = await pdf.getPage(pageNumber);
      const content = await page.getTextContent();
      const pageLines = textItemsToLines(content.items);
      pageLines.forEach((line) => lines.push(`【第 ${pageNumber} 页】 ${line}`));
      onProgress({ stage: "pdf", current: pageNumber, total: pdf.numPages });
    }
  } finally {
    await loadingTask.destroy();
  }
  const text = lines.join("\n").trim();
  if (!text) throw new Error("PDF 没有可提取的文字；如果这是扫描件，请改用 PNG/JPG OCR。 ");
  return text;
}

export async function extractImageText(file, onProgress = () => {}) {
  let lastError;
  for (let attempt = 1; attempt <= OCR_ATTEMPTS; attempt += 1) {
    let worker;
    try {
      onProgress({ stage: "ocr", progress: 0, status: attempt > 1 ? "retrying" : "starting", attempt });
      worker = await withTimeout(createWorker(["chi_sim", "eng"], undefined, {
        langPath: OCR_LANG_PATH,
        gzip: false,
        logger(message) {
          onProgress({ stage: "ocr", progress: message.progress ?? 0, status: message.status, attempt });
        }
      }), OCR_INITIALIZE_TIMEOUT_MS, "OCR 初始化超时。");
      const result = await withTimeout(worker.recognize(file), OCR_RECOGNIZE_TIMEOUT_MS, "OCR 识别超时。");
      const text = result.data.text.trim();
      if (!text) throw new Error("图片没有识别出可用文字。");
      return text;
    } catch (reason) {
      lastError = reason instanceof Error ? reason : new Error(String(reason));
      if (attempt < OCR_ATTEMPTS) onProgress({ stage: "ocr", progress: 0, status: "retrying", attempt: attempt + 1 });
    } finally {
      if (worker) {
        await withTimeout(worker.terminate(), OCR_TERMINATE_TIMEOUT_MS, "OCR Worker 终止超时。").catch(() => {});
      }
    }
  }
  throw new Error(`OCR 失败（已重试 1 次）：${lastError?.message || "未知错误"}`);
}

export async function extractResumeText(file, onProgress = () => {}) {
  const extension = resumeExtension(file?.name);
  if (extension === ".pdf") return extractPdfText(file, onProgress);
  if (IMAGE_EXTENSIONS.has(extension)) return extractImageText(file, onProgress);
  return "";
}
