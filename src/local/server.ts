import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { randomUUID } from "node:crypto";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { executeLocalRun, type LocalRunProgress } from "./local-run.js";
import { defaultSkillRoots, discoverInstalledSkills } from "./skill-catalog.js";
import { validateRunRequest } from "./run-request.js";
import { importGithubSkill, importLocalSkill, type SkillImportFile } from "./skill-import.js";

const MAX_REQUEST_BYTES = 30 * 1024 * 1024;
const LOCAL_UI_ORIGINS = new Set([
  "http://localhost:4173",
  "http://localhost:5173",
  "http://127.0.0.1:4173",
  "http://127.0.0.1:5173"
]);

type RunJob = {
  status: "RUNNING" | "COMPLETED" | "FAILED";
  progress: LocalRunProgress;
  result?: unknown;
  error?: string;
};

const runJobs = new Map<string, RunJob>();

function sendJson(response: ServerResponse, statusCode: number, body: unknown, origin?: string): void {
  response.writeHead(statusCode, {
    "content-type": "application/json; charset=utf-8",
    "access-control-allow-origin": origin && LOCAL_UI_ORIGINS.has(origin) ? origin : "http://localhost:4173",
    "access-control-allow-headers": "content-type",
    "access-control-allow-methods": "GET,POST,OPTIONS"
  });
  response.end(`${JSON.stringify(body)}\n`);
}

async function readJson(request: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of request) {
    const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += bytes.length;
    if (size > MAX_REQUEST_BYTES) throw new Error("请求超过 30 MiB 限制。");
    chunks.push(bytes);
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

export function createLocalServer(projectRoot: string) {
  return createServer(async (request, response) => {
    const origin = request.headers.origin;
    if (request.method === "OPTIONS") {
      sendJson(response, 204, null, origin);
      return;
    }
    if (request.method === "GET" && request.url === "/api/health") {
      sendJson(response, 200, { ok: true, host: "codex-sdk", demoData: false }, origin);
      return;
    }
    if (request.method === "GET" && request.url?.startsWith("/api/skills/check?")) {
      const ids = new URL(request.url, "http://127.0.0.1").searchParams.getAll("id");
      try {
        const installed = discoverInstalledSkills(ids, [resolve(projectRoot, ".resume-studio", "skills"), ...defaultSkillRoots()]);
        sendJson(response, 200, { ok: true, data: { requested: ids, installed: installed.map((skill) => ({ id: skill.id, name: skill.name, version: skill.version })), missing: [] } }, origin);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        const missing = ids.filter((id) => message.includes(id));
        sendJson(response, 200, { ok: true, data: { requested: ids, installed: [], missing } }, origin);
      }
      return;
    }
    if (request.method === "POST" && request.url === "/api/runs") {
      try {
        const body = await readJson(request);
        // Reject malformed or over-limit requests before creating an async job.
        // Valid runs become jobs; invalid runs remain a synchronous 422 for callers.
        validateRunRequest(body);
        const jobId = `job.${randomUUID().replaceAll("-", "").slice(0, 20)}`;
        const job: RunJob = {
          status: "RUNNING",
          progress: { stage: "intake", completed: 0, total: 1, message: "已接收材料，准备冻结基线。" }
        };
        runJobs.set(jobId, job);
        void executeLocalRun(body, {
          projectRoot,
          runtimeRoot: resolve(projectRoot, ".resume-studio"),
          onProgress: (progress) => { job.progress = progress; }
        }).then((result) => {
          job.status = "COMPLETED";
          job.result = result;
        }).catch((error) => {
          job.status = "FAILED";
          job.error = error instanceof Error ? error.message : String(error);
        });
        sendJson(response, 202, { ok: true, data: { jobId } }, origin);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        sendJson(response, 422, { ok: false, error: { code: "RUN_FAILED", message } }, origin);
      }
      return;
    }
    if (request.method === "GET" && request.url?.startsWith("/api/runs/status/")) {
      const jobId = request.url.slice("/api/runs/status/".length);
      const job = runJobs.get(jobId);
      if (!job) {
        sendJson(response, 404, { ok: false, error: { code: "RUN_NOT_FOUND", message: "运行任务不存在或已过期。" } }, origin);
        return;
      }
      sendJson(response, 200, { ok: true, data: job }, origin);
      return;
    }
    if (request.method === "POST" && request.url === "/api/skills/import") {
      try {
        const body = await readJson(request);
        if (!body || typeof body !== "object") throw new Error("Skill 导入请求无效。");
        const input = body as { source?: unknown; files?: unknown; github?: unknown };
        const runtimeRoot = resolve(projectRoot, ".resume-studio");
        const result = input.source === "github"
          ? await importGithubSkill(runtimeRoot, String(input.github ?? ""))
          : importLocalSkill(runtimeRoot, (input.files ?? []) as SkillImportFile[]);
        sendJson(response, 200, { ok: true, data: result }, origin);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        sendJson(response, 422, { ok: false, error: { code: "SKILL_IMPORT_FAILED", message } }, origin);
      }
      return;
    }
    sendJson(response, 404, { ok: false, error: { code: "NOT_FOUND", message: "接口不存在。" } }, origin);
  });
}

const entryPath = process.argv[1] ? resolve(process.argv[1]) : undefined;
if (entryPath === fileURLToPath(import.meta.url)) {
  const projectRoot = resolve(fileURLToPath(new URL("../../", import.meta.url)));
  const port = Number(process.env.RESUME_STUDIO_API_PORT ?? "4317");
  createLocalServer(projectRoot).listen(port, "127.0.0.1", () => {
    process.stdout.write(`Resume Studio local API: http://127.0.0.1:${port}\n`);
  });
}
