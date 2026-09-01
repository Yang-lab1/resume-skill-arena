import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { basename, dirname, join, resolve, sep } from "node:path";

import { unzipSync } from "fflate";

import { sha256 } from "../baseline/hash.js";

const MAX_ARCHIVE_BYTES = 12 * 1024 * 1024;
const MAX_UNPACKED_BYTES = 24 * 1024 * 1024;
const MAX_FILE_COUNT = 256;

export interface SkillImportFile {
  path: string;
  base64: string;
}

export interface ImportedSkill {
  id: string;
  name: string;
  version: string;
  contentHash: string;
  source: "local" | "github";
  sourceRef: string;
}

interface NormalizedFile {
  path: string;
  bytes: Buffer;
}

function safeRelativePath(value: string): string {
  const normalized = value.replaceAll("\\", "/").replace(/^\.\//, "");
  if (!normalized || normalized.startsWith("/") || /^[A-Za-z]:\//.test(normalized)) {
    throw new Error("Skill 文件路径无效。");
  }
  const parts = normalized.split("/");
  if (parts.some((part) => !part || part === "." || part === "..")) {
    throw new Error("Skill 文件不能包含越级路径。");
  }
  return parts.join("/");
}

function decodeBase64(value: string): Buffer {
  const bytes = Buffer.from(value, "base64");
  if (bytes.length === 0) throw new Error("Skill 文件内容为空。");
  return bytes;
}

function normalizeFiles(files: readonly SkillImportFile[]): NormalizedFile[] {
  if (!Array.isArray(files) || files.length === 0) throw new Error("没有收到 Skill 文件。");
  if (files.length > MAX_FILE_COUNT) throw new Error("Skill 文件数量超过 256 个限制。");
  let total = 0;
  return files.map((file) => {
    if (!file || typeof file.path !== "string" || typeof file.base64 !== "string") {
      throw new Error("Skill 文件格式无效。");
    }
    const bytes = decodeBase64(file.base64);
    total += bytes.length;
    if (total > MAX_UNPACKED_BYTES) throw new Error("Skill 解包内容超过 24 MiB 限制。");
    return { path: safeRelativePath(file.path), bytes };
  });
}

function manifestName(content: string): string | undefined {
  const frontmatter = content.match(/^---\s*\r?\n([\s\S]*?)\r?\n---/);
  return frontmatter?.[1]?.match(/^name:\s*['"]?([^'"\r\n]+)['"]?\s*$/m)?.[1]?.trim();
}

function skillId(value: string | undefined): string {
  if (!value || !/^[A-Za-z0-9][A-Za-z0-9._:-]{1,126}$/.test(value)) {
    throw new Error("SKILL.md 的 name 无效，必须保留原始 Skill 名称。");
  }
  return value;
}

function selectSkillRoot(files: readonly NormalizedFile[]): { name: string; files: NormalizedFile[] } {
  const manifests = files.filter((file) => basename(file.path) === "SKILL.md");
  if (manifests.length !== 1) throw new Error("Skill 包必须且只能包含一个 SKILL.md。");
  const manifest = manifests[0]!;
  const prefix = dirname(manifest.path).replaceAll("\\", "/");
  const rootPrefix = prefix === "." ? "" : `${prefix}/`;
  const scopedFiles = files
    .filter((file) => file.path === manifest.path || file.path.startsWith(rootPrefix))
    .map((file) => ({ ...file, path: rootPrefix ? file.path.slice(rootPrefix.length) : file.path }));
  const name = skillId(manifestName(manifest.bytes.toString("utf8")));
  return { name, files: scopedFiles };
}

function installFiles(runtimeRoot: string, files: readonly NormalizedFile[], source: ImportedSkill["source"], sourceRef: string): ImportedSkill {
  const selected = selectSkillRoot(files);
  const skillsRoot = resolve(runtimeRoot, "skills");
  const target = resolve(skillsRoot, selected.name);
  if (!target.startsWith(skillsRoot + sep)) throw new Error("Skill 安装路径无效。");
  const skillContent = selected.files.find((file) => file.path === "SKILL.md")!.bytes.toString("utf8");
  const contentHash = sha256(skillContent);
  if (existsSync(target)) {
    const existingManifest = resolve(target, "SKILL.md");
    if (existsSync(existingManifest) && sha256(readFileSync(existingManifest, "utf8")) === contentHash) {
      return { id: selected.name, name: selected.name, version: `local-${contentHash.slice(0, 12)}`, contentHash, source, sourceRef };
    }
    throw new Error(`本机已有同名 Skill：${selected.name}。请先移除旧版本。`);
  }
  mkdirSync(skillsRoot, { recursive: true });
  const staging = resolve(skillsRoot, `.install-${randomUUID()}`);
  try {
    for (const file of selected.files) {
      const destination = resolve(staging, file.path);
      if (!destination.startsWith(staging + sep)) throw new Error("Skill 文件路径无效。");
      mkdirSync(dirname(destination), { recursive: true });
      writeFileSync(destination, file.bytes, { flag: "wx" });
    }
    renameSync(staging, target);
  } catch (error) {
    rmSync(staging, { recursive: true, force: true });
    throw error;
  }
  return {
    id: selected.name,
    name: selected.name,
    version: `local-${contentHash.slice(0, 12)}`,
    contentHash,
    source,
    sourceRef
  };
}

export function importLocalSkill(runtimeRoot: string, files: readonly SkillImportFile[]): ImportedSkill {
  const normalized = normalizeFiles(files);
  const archive = normalized.length === 1 && /\.zip$/i.test(normalized[0]!.path);
  if (!archive) return installFiles(runtimeRoot, normalized, "local", "本地文件");
  const archiveBytes = normalized[0]!.bytes;
  if (archiveBytes.length > MAX_ARCHIVE_BYTES) throw new Error("Skill 压缩包超过 12 MiB 限制。");
  let entries: Record<string, Uint8Array>;
  try {
    entries = unzipSync(archiveBytes);
  } catch {
    throw new Error("Skill 压缩包无法读取。");
  }
  const unpacked = Object.entries(entries)
    .filter(([, bytes]) => bytes.length > 0)
    .map(([path, bytes]) => ({ path, bytes: Buffer.from(bytes) }));
  return installFiles(runtimeRoot, unpacked, "local", normalized[0]!.path);
}

function githubRepo(source: string): { owner: string; repo: string } {
  const value = source.trim();
  const match = value.match(/^(?:https:\/\/github\.com\/)?([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+?)(?:\.git)?\/?$/);
  if (!match) throw new Error("GitHub 请输入完整仓库地址或 owner/repo。");
  return { owner: match[1]!, repo: match[2]! };
}

export async function importGithubSkill(runtimeRoot: string, source: string): Promise<ImportedSkill> {
  const { owner, repo } = githubRepo(source);
  const sourceRef = `https://github.com/${owner}/${repo}`;
  let response: Response | undefined;
  for (const branch of ["main", "master"]) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15_000);
    try {
      const candidate = await fetch(`https://codeload.github.com/${owner}/${repo}/zip/refs/heads/${branch}`, { redirect: "follow", signal: controller.signal });
      if (candidate.ok) { response = candidate; break; }
    } catch {
      // A branch/network failure is handled as an unavailable GitHub source below.
    } finally {
      clearTimeout(timeout);
    }
  }
  if (!response) throw new Error("无法从 GitHub 下载该仓库，可能不存在或没有公开权限。");
  const bytes = Buffer.from(await response.arrayBuffer());
  if (bytes.length > MAX_ARCHIVE_BYTES) throw new Error("GitHub Skill 压缩包超过 12 MiB 限制。");
  let entries: Record<string, Uint8Array>;
  try { entries = unzipSync(bytes); } catch { throw new Error("GitHub 返回的内容不是可读取的 Skill 压缩包。"); }
  const files = Object.entries(entries)
    .filter(([, data]) => data.length > 0)
    .map(([path, data]) => ({ path, bytes: Buffer.from(data) }));
  return installFiles(runtimeRoot, files, "github", sourceRef);
}
