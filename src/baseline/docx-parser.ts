import { DOMParser, type Element, type Node } from "@xmldom/xmldom";
import { strFromU8, unzipSync } from "fflate";

import { sha256, stableId } from "./hash.js";
import { normalizeBlockText } from "./text.js";
import type { BaselineBlock, ResumeAst } from "./types.js";

const WORD_NAMESPACE =
  "http://schemas.openxmlformats.org/wordprocessingml/2006/main";
const MAX_DOCX_BYTES = 20 * 1024 * 1024;
const MAX_DOCUMENT_XML_BYTES = 10 * 1024 * 1024;
const MAX_BLOCKS = 2_000;
const MAX_BLOCK_CHARS = 20_000;

function paragraphText(paragraph: Element): string {
  const parts: string[] = [];

  function walk(node: Node): void {
    if (node.nodeType === 1) {
      const element = node as Element;
      if (element.namespaceURI === WORD_NAMESPACE) {
        if (element.localName === "t") {
          parts.push(element.textContent ?? "");
          return;
        }
        if (element.localName === "tab") {
          parts.push("\t");
          return;
        }
        if (element.localName === "br" || element.localName === "cr") {
          parts.push("\n");
          return;
        }
      }
    }

    for (let child = node.firstChild; child; child = child.nextSibling) {
      walk(child);
    }
  }

  walk(paragraph);
  return normalizeBlockText(parts.join(""));
}

function paragraphStyle(paragraph: Element): string | undefined {
  const styles = paragraph.getElementsByTagNameNS(WORD_NAMESPACE, "pStyle");
  const style = styles.item(0);
  return style?.getAttributeNS(WORD_NAMESPACE, "val") ?? undefined;
}

export function parseResumeDocx(
  bytes: Uint8Array,
  originalName: string,
  locale: string
): ResumeAst {
  if (bytes.byteLength > MAX_DOCX_BYTES) {
    throw new Error("DOCX 超过 20 MiB 限制。");
  }

  let entries: ReturnType<typeof unzipSync>;
  let mainDocumentTooLarge = false;
  try {
    entries = unzipSync(bytes, {
      filter(file) {
        if (file.name !== "word/document.xml") return false;
        if (file.originalSize > MAX_DOCUMENT_XML_BYTES) {
          mainDocumentTooLarge = true;
          return false;
        }
        return true;
      }
    });
  } catch (error) {
    throw new Error("无法打开 DOCX 压缩包。", { cause: error });
  }

  if (mainDocumentTooLarge) {
    throw new Error("DOCX 主文档解压后超过 10 MiB 限制。");
  }

  const documentBytes = entries["word/document.xml"];
  if (!documentBytes) {
    throw new Error("DOCX 缺少 word/document.xml。");
  }

  const documentXml = strFromU8(documentBytes);
  if (/<!DOCTYPE/i.test(documentXml)) {
    throw new Error("DOCX 主文档禁止包含 DOCTYPE 声明。");
  }
  const document = new DOMParser().parseFromString(documentXml, "application/xml");
  if (document.getElementsByTagName("parsererror").length > 0) {
    throw new Error("DOCX 主文档 XML 无法解析。");
  }

  const paragraphNodes = document.getElementsByTagNameNS(WORD_NAMESPACE, "p");
  const blocks: BaselineBlock[] = [];

  for (let sourceIndex = 0; sourceIndex < paragraphNodes.length; sourceIndex += 1) {
    const paragraph = paragraphNodes.item(sourceIndex);
    if (!paragraph) continue;
    const text = paragraphText(paragraph);
    if (!text) continue;
    if (text.length > MAX_BLOCK_CHARS) {
      throw new Error(`DOCX 第 ${sourceIndex + 1} 个段落超过 20,000 字符限制。`);
    }

    const structuralPath = `word/document.xml#paragraph[${sourceIndex}]`;
    const styleName = paragraphStyle(paragraph);
    blocks.push({
      blockId: stableId("resume-block", structuralPath, text),
      index: blocks.length,
      kind: "PARAGRAPH",
      structuralPath,
      contentHash: sha256(text),
      text,
      ...(styleName ? { styleName } : {})
    });
  }

  if (blocks.length === 0) {
    throw new Error("DOCX 正文没有可用文本段落。");
  }
  if (blocks.length > MAX_BLOCKS) {
    throw new Error("DOCX 正文超过 2,000 个非空区块限制。");
  }

  const resumeHash = sha256(bytes);
  return {
    schemaVersion: "0.1",
    resumeId: stableId("resume", resumeHash),
    resumeHash,
    astVersion: "0.1",
    locale,
    source: {
      originalName,
      mediaType:
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      sizeBytes: bytes.byteLength,
      sha256: resumeHash
    },
    blocks
  };
}
