export interface LocalRunRequest {
  resume: {
    name: string;
    mediaType: string;
    base64: string;
    extractedText?: string;
  };
  jobText: string;
  skillIds: string[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

export function validateRunRequest(value: unknown): LocalRunRequest {
  if (!isRecord(value) || !isRecord(value.resume)) {
    throw new Error("请求缺少简历文件。");
  }
  const name = value.resume.name;
  const mediaType = value.resume.mediaType;
  const base64 = value.resume.base64;
  if (typeof name !== "string") {
    throw new Error("简历文件名无效。");
  }
  const extension = name.toLowerCase().slice(name.lastIndexOf("."));
  const supportedExtensions = new Set([".docx", ".pdf", ".png", ".jpg", ".jpeg"]);
  if (!supportedExtensions.has(extension)) {
    throw new Error("当前支持 DOCX、PDF、PNG、JPG 简历。");
  }
  if (typeof mediaType !== "string" || typeof base64 !== "string" || base64.length === 0) {
    throw new Error("简历文件内容无效。");
  }
  const extractedText = value.resume.extractedText;
  if (extension !== ".docx" && (typeof extractedText !== "string" || extractedText.trim().length === 0)) {
    throw new Error("PDF 或图片简历必须先完成文字识别。");
  }
  if (typeof value.jobText !== "string" || value.jobText.trim().length === 0) {
    throw new Error("岗位文字不能为空。");
  }
  if (!Array.isArray(value.skillIds) || value.skillIds.length === 0) {
    throw new Error("至少选择 1 个 Skill。");
  }
  if (value.skillIds.length > 3) {
    throw new Error("一次最多只能运行 3 个 Skill。");
  }
  const skillIds = value.skillIds.map((skillId) => {
    if (typeof skillId !== "string" || !/^[A-Za-z0-9][A-Za-z0-9._:-]{1,126}$/.test(skillId)) {
      throw new Error("Skill 名称格式无效。");
    }
    return skillId;
  });
  if (new Set(skillIds).size !== skillIds.length) {
    throw new Error("Skill 不能重复选择。");
  }
  return {
    resume: { name, mediaType, base64, ...(typeof extractedText === "string" ? { extractedText } : {}) },
    jobText: value.jobText,
    skillIds
  };
}
