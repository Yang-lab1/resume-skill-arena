import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const excludedDirectories = new Set([
  ".git", ".resume-studio", "agent_memory", "coverage", "dist", "node_modules", "output", "qa-artifacts"
]);
const excludedFiles = new Set(["scripts/privacy-scan.mjs"]);
const textExtensions = new Set([
  ".css", ".html", ".js", ".jsx", ".json", ".md", ".mjs", ".ts", ".tsx", ".txt", ".yml", ".yaml"
]);
const checks = [
  { label: "Windows 用户绝对路径", pattern: /[A-Za-z]:[\\/]+Users[\\/]+[^\\/\s`"']+/g },
  { label: "临时剪贴板文件", pattern: /codex-clipboard/gi },
  { label: "中国大陆手机号", pattern: /(?<!\d)1[3-9]\d{9}(?!\d)/g },
  { label: "QQ 邮箱", pattern: /\b\d{5,12}@qq\.com\b/gi },
  { label: "运行数据路径", pattern: /(?:^|[\\/])\.resume-studio[\\/](?:runs|intake)(?:[\\/]|$)/g }
];

async function collect(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    if (entry.isDirectory() && excludedDirectories.has(entry.name)) continue;
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await collect(fullPath));
    else files.push(fullPath);
  }
  return files;
}

const findings = [];
for (const file of await collect(root)) {
  const relative = path.relative(root, file).replaceAll("\\", "/");
  if (excludedFiles.has(relative) || !textExtensions.has(path.extname(file).toLowerCase())) continue;
  const content = await readFile(file, "utf8");
  for (const check of checks) {
    for (const match of content.matchAll(check.pattern)) {
      const line = content.slice(0, match.index).split(/\r?\n/).length;
      findings.push(`${relative}:${line} ${check.label}`);
    }
  }
}

if (findings.length) {
  console.error("发布隐私扫描失败：\n" + findings.join("\n"));
  process.exitCode = 1;
} else {
  console.log("发布隐私扫描通过：未发现用户绝对路径、剪贴板文件、手机号、QQ 邮箱或运行数据路径。");
}
