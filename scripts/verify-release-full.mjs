import { spawn } from "node:child_process";
import { once } from "node:events";
import { resolve } from "node:path";

const root = process.cwd();
const node = process.execPath;
const npm = process.env.npm_execpath;

function command(args, options = {}) {
  const executable = npm ? node : process.platform === "win32" ? "npm.cmd" : "npm";
  const commandArgs = npm ? [npm, ...args] : args;
  return new Promise((resolvePromise, reject) => {
    const child = spawn(executable, commandArgs, { cwd: root, stdio: "inherit", ...options });
    child.once("error", reject);
    child.once("exit", (code, signal) => code === 0 ? resolvePromise() : reject(new Error(`命令失败：${args.join(" ")}（${signal || code}）`)));
  });
}

async function waitFor(url, timeoutMs = 30_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(url);
      if (response.ok) return;
    } catch {}
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 250));
  }
  throw new Error(`服务启动超时：${url}`);
}

await command(["run", "privacy:scan"]);
await command(["test"]);
await command(["run", "typecheck"]);
await command(["run", "build"]);
await command(["--prefix", "ui", "run", "build"]);
await command(["--prefix", "ui", "test"]);
await command(["run", "check:runtime"]);

const api = spawn(node, [resolve(root, "dist/local/server.js")], { cwd: root, stdio: "inherit" });
const ui = spawn(node, [resolve(root, "ui/node_modules/vite/bin/vite.js"), "--host", "127.0.0.1", "--port", "4173"], { cwd: resolve(root, "ui"), stdio: "inherit" });
try {
  await Promise.all([waitFor("http://127.0.0.1:4317/api/health"), waitFor("http://127.0.0.1:4173/")]);
  await command(["ui/scripts/full-feature-matrix-2.mjs"]);
} finally {
  api.kill();
  ui.kill();
  await Promise.allSettled([once(api, "exit"), once(ui, "exit")]);
}
