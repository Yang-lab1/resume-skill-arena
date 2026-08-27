import { describe, expect, it } from "vitest";

import { validateRunRequest } from "./run-request.js";

const validRequest = {
  resume: {
    name: "candidate.docx",
    mediaType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    base64: Buffer.from("real-docx-bytes").toString("base64")
  },
  jobText: "负责产品设计和跨团队项目推进。",
  skillIds: ["resume-optimizer", "resume-jd-fit", "asu-resume"]
};

describe("validateRunRequest", () => {
  it("accepts a DOCX, real job text and one to three Skill ids", () => {
    expect(validateRunRequest(validRequest)).toEqual(validRequest);
  });

  it("rejects a request without real job text", () => {
    expect(() => validateRunRequest({ ...validRequest, jobText: "  " })).toThrow(
      "岗位文字不能为空"
    );
  });

  it("rejects a fourth Skill before execution", () => {
    expect(() =>
      validateRunRequest({
        ...validRequest,
        skillIds: ["a", "b", "c", "d"]
      })
    ).toThrow("一次最多只能运行 3 个 Skill");
  });

  it("accepts PDF input only when real extracted text is present", () => {
    const request = validateRunRequest({
      ...validRequest,
      resume: { ...validRequest.resume, name: "candidate.pdf", mediaType: "application/pdf", extractedText: "教育经历\n工作经历" }
    });
    expect(request.resume.extractedText).toBe("教育经历\n工作经历");
  });

  it("rejects PDF input when extraction did not produce text", () => {
    expect(() =>
      validateRunRequest({
        ...validRequest,
        resume: { ...validRequest.resume, name: "candidate.pdf" }
      })
    ).toThrow("PDF 或图片简历必须先完成文字识别");
  });
});
