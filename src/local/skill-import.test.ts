import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { strToU8, zipSync } from "fflate";
import { describe, expect, it, vi } from "vitest";

import { discoverInstalledSkills } from "./skill-catalog.js";
import { importGithubSkill, importLocalSkill } from "./skill-import.js";

const skillMarkdown = "---\nname: imported-resume-skill\ndescription: Imported skill\n---\n# Workflow\nUse the supplied resume.\n";

describe("skill import", () => {
  it("installs a local folder payload and preserves the original Skill name", () => {
    const runtimeRoot = mkdtempSync(join(tmpdir(), "resume-studio-import-"));
    const result = importLocalSkill(runtimeRoot, [
      { path: "imported-resume-skill/SKILL.md", base64: Buffer.from(skillMarkdown).toString("base64") },
      { path: "imported-resume-skill/references/rules.md", base64: Buffer.from("rules").toString("base64") }
    ]);
    expect(result).toMatchObject({ id: "imported-resume-skill", source: "local" });
    expect(readFileSync(join(runtimeRoot, "skills", "imported-resume-skill", "references", "rules.md"), "utf8")).toBe("rules");
    expect(discoverInstalledSkills(["imported-resume-skill"], [join(runtimeRoot, "skills")])[0]?.version).toBe(result.version);
  });

  it("installs a GitHub archive only after an explicit import call", async () => {
    const runtimeRoot = mkdtempSync(join(tmpdir(), "resume-studio-github-"));
    const archive = zipSync({ "repo-main/SKILL.md": strToU8(skillMarkdown) });
    vi.stubGlobal("fetch", vi.fn(async () => new Response(archive, { status: 200 })));
    const result = await importGithubSkill(runtimeRoot, "https://github.com/example/imported-resume-skill");
    expect(result).toMatchObject({ id: "imported-resume-skill", source: "github", sourceRef: "https://github.com/example/imported-resume-skill" });
    vi.unstubAllGlobals();
  });

  it("rejects traversal paths before writing anything", () => {
    const runtimeRoot = mkdtempSync(join(tmpdir(), "resume-studio-invalid-"));
    expect(() => importLocalSkill(runtimeRoot, [{ path: "../SKILL.md", base64: Buffer.from(skillMarkdown).toString("base64") }])).toThrow("越级路径");
  });
});
