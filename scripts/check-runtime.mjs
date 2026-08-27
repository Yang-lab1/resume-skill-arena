import { existsSync } from "node:fs";
import { execFileSync, spawnSync } from "node:child_process";
import path from "node:path";

function fail(message) {
  console.error(`Resume Skill Arena 无法启动：${message}`);
  console.error("当前环境必须同时支持 Node.js 进程、Shell 命令和本地浏览器；不满足时不会进入残缺工作台。");
  process.exit(1);
}

const [major] = process.versions.node.split(".").map(Number);
if (major < 20) fail(`需要 Node.js 20+，当前是 ${process.versions.node}。`);

const childCheck = spawnSync(process.execPath, ["-e", "process.exit(0)"], { stdio: "ignore" });
if (childCheck.error || childCheck.status !== 0) fail("当前环境无法启动本地子进程。");

const browserCandidates = process.platform === "win32"
  ? [
    process.env.RESUME_STUDIO_BROWSER,
    process.env.LOCALAPPDATA && path.join(process.env.LOCALAPPDATA, "Google/Chrome/Application/chrome.exe"),
    "C:/Program Files/Google/Chrome/Application/chrome.exe",
    "C:/Program Files (x86)/Google/Chrome/Application/chrome.exe",
    "C:/Program Files/Microsoft/Edge/Application/msedge.exe",
    "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
  ]
  : [process.env.RESUME_STUDIO_BROWSER, "/usr/bin/google-chrome", "/usr/bin/chromium", "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"];
const browserPath = browserCandidates.find((candidate) => candidate && existsSync(candidate));
if (!browserPath) {
  const browserCommands = process.platform === "win32" ? ["chrome", "msedge"] : ["google-chrome", "chromium", "chromium-browser"];
  const foundOnPath = browserCommands.some((command) => {
    try { execFileSync(process.platform === "win32" ? "where.exe" : "which", [command], { stdio: "ignore" }); return true; } catch { return false; }
  });
  if (!foundOnPath) {
    const browserCommand = process.platform === "win32" ? "where chrome 或 where msedge" : "which google-chrome 或 which chromium";
    fail(`找不到可用的本地浏览器（可先安装 Chrome/Edge，或设置 RESUME_STUDIO_BROWSER；也可用 ${browserCommand} 检查）。`);
  }
}

console.log(JSON.stringify({ ok: true, node: process.versions.node, browser: browserPath || "PATH", shell: process.env.ComSpec || process.env.SHELL || "available" }));
