import { realpath, rm } from "node:fs/promises";
import path from "node:path";

const workspace = await realpath(process.cwd());
const target = path.resolve(workspace, "ui", "qa-artifacts");
const expectedParent = path.resolve(workspace, "ui") + path.sep;

if (!target.startsWith(expectedParent) || path.basename(target) !== "qa-artifacts") {
  throw new Error(`拒绝清理意外路径：${target}`);
}

await rm(target, { recursive: true, force: true });
console.log("已清理本机 QA 截图；这些文件可由 visual-qa.mjs 重新生成。 ");
