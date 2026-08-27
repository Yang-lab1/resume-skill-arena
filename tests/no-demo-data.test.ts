import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("factory-clean UI", () => {
  const source = readFileSync(resolve("ui/src/App.jsx"), "utf8");

  it("does not ship static resume comparison data", () => {
    expect(source).not.toContain("const SECTIONS");
    expect(source).not.toContain("负责会员增长相关工作");
    expect(source).not.toContain("使用示例材料");
  });

  it("does not promise results before real material is supplied", () => {
    expect(source).toContain("只处理你的真实材料");
    expect(source).toContain("开始真实运行");
  });
});
