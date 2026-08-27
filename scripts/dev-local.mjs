import { spawn } from "node:child_process";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";

const projectRoot = process.cwd();
const node = process.execPath;
const runtimeCheck = spawnSync(node, [resolve(projectRoot, "scripts/check-runtime.mjs")], { cwd: projectRoot, stdio: "inherit" });
if (runtimeCheck.status !== 0) process.exit(runtimeCheck.status || 1);
const api = spawn(node, [resolve(projectRoot, "node_modules", "tsx", "dist", "cli.mjs"), "src/local/server.ts"], {
  cwd: projectRoot,
  stdio: "inherit"
});
const ui = spawn(node, [resolve(projectRoot, "ui", "node_modules", "vite", "bin", "vite.js"), "--host", "127.0.0.1", "--port", "4173"], {
  cwd: resolve(projectRoot, "ui"),
  stdio: "inherit"
});

const apiUrl = "http://127.0.0.1:4317/api/health";
const uiUrl = "http://127.0.0.1:4173";
const shouldOpenBrowser = process.env.RESUME_STUDIO_OPEN_BROWSER !== "0";

async function waitForHttp(url, timeoutMs = 30_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(url);
      if (response.ok) return;
    } catch {
      // The child process may still be starting; keep polling until the deadline.
    }
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 250));
  }
  throw new Error(`本地服务启动超时：${url}`);
}

function openBrowser(url) {
  if (process.platform === "win32") {
    spawn("cmd", ["/d", "/c", "start", "", url], { detached: true, stdio: "ignore" }).unref();
  } else if (process.platform === "darwin") {
    spawn("open", [url], { detached: true, stdio: "ignore" }).unref();
  } else {
    spawn("xdg-open", [url], { detached: true, stdio: "ignore" }).unref();
  }
}

void (async () => {
  try {
    await Promise.all([waitForHttp(apiUrl), waitForHttp(uiUrl)]);
    console.log(`Resume Studio 已就绪：${uiUrl}`);
    if (shouldOpenBrowser) openBrowser(uiUrl);
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    stop(1);
  }
})();

function stop(exitCode = 0) {
  api.kill();
  ui.kill();
  if (exitCode) process.exitCode = exitCode;
}

process.on("SIGINT", () => stop());
process.on("SIGTERM", () => stop());
api.on("exit", (code) => { if (code && !ui.killed) ui.kill(); });
ui.on("exit", (code) => { if (code && !api.killed) api.kill(); });
