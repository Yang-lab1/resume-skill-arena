import { existsSync, readFileSync, readdirSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";

import { sha256 } from "../baseline/hash.js";

export interface InstalledSkill {
  id: string;
  name: string;
  version: string;
  skillPath: string;
  directory: string;
  contentHash: string;
}

export function defaultSkillRoots(): string[] {
  const userHome = homedir();
  const codexRoot = process.env.CODEX_HOME
    ? resolve(process.env.CODEX_HOME, "skills")
    : resolve(userHome, ".codex", "skills");
  return [codexRoot, resolve(userHome, ".agents", "skills")];
}

function manifestName(content: string): string | undefined {
  const frontmatter = content.match(/^---\s*\r?\n([\s\S]*?)\r?\n---/);
  const name = frontmatter?.[1]?.match(/^name:\s*['"]?([^'"\r\n]+)['"]?\s*$/m)?.[1];
  return name?.trim();
}

function findSkillPath(skillId: string, roots: readonly string[]): string | undefined {
  for (const root of roots) {
    const direct = resolve(root, skillId, "SKILL.md");
    if (existsSync(direct)) return direct;
  }
  for (const root of roots) {
    if (!existsSync(root)) continue;
    const queue: Array<{ directory: string; depth: number }> = [{ directory: resolve(root), depth: 0 }];
    while (queue.length > 0) {
      const current = queue.shift();
      if (!current || current.depth > 5) continue;
      for (const entry of readdirSync(current.directory, { withFileTypes: true })) {
        if (!entry.isDirectory() || entry.isSymbolicLink() || entry.name.startsWith(".")) continue;
        const directory = join(current.directory, entry.name);
        if (entry.name === skillId) {
          const candidate = join(directory, "SKILL.md");
          if (existsSync(candidate)) return candidate;
        }
        const manifestCandidate = join(directory, "SKILL.md");
        if (existsSync(manifestCandidate)) {
          try {
            if (manifestName(readFileSync(manifestCandidate, "utf8")) === skillId) return manifestCandidate;
          } catch {
            // Ignore unreadable skill folders while continuing the catalog scan.
          }
        }
        queue.push({ directory, depth: current.depth + 1 });
      }
    }
  }
  return undefined;
}

export function discoverInstalledSkills(
  skillIds: readonly string[],
  roots: readonly string[] = defaultSkillRoots()
): InstalledSkill[] {
  return skillIds.map((skillId) => {
    const skillPath = findSkillPath(skillId, roots);
    if (!skillPath) throw new Error(`未找到已安装的 Skill：${skillId}`);
    const content = readFileSync(skillPath, "utf8");
    const name = manifestName(content);
    if (name !== skillId) {
      throw new Error(`Skill 名称不匹配：请求 ${skillId}，SKILL.md 声明 ${name ?? "空"}`);
    }
    const contentHash = sha256(content);
    return {
      id: skillId,
      name,
      version: `local-${contentHash.slice(0, 12)}`,
      skillPath,
      directory: dirname(skillPath),
      contentHash
    };
  });
}
