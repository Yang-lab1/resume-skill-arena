import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { discoverInstalledSkills } from "./skill-catalog.js";

describe("discoverInstalledSkills", () => {
  it("resolves the requested real SKILL.md and records a content-derived version", () => {
    const root = mkdtempSync(join(tmpdir(), "resume-studio-skills-"));
    const skillDirectory = join(root, "resume-optimizer");
    mkdirSync(skillDirectory);
    writeFileSync(
      join(skillDirectory, "SKILL.md"),
      "---\nname: resume-optimizer\ndescription: Real resume skill\n---\n# Workflow\nRead the resume.\n"
    );

    const [skill] = discoverInstalledSkills(["resume-optimizer"], [root]);

    expect(skill?.name).toBe("resume-optimizer");
    expect(skill?.skillPath).toBe(join(skillDirectory, "SKILL.md"));
    expect(skill?.version).toMatch(/^local-[a-f0-9]{12}$/);
  });

  it("fails closed when a requested Skill is not installed", () => {
    const root = mkdtempSync(join(tmpdir(), "resume-studio-skills-"));
    expect(() => discoverInstalledSkills(["missing-skill"], [root])).toThrow(
      "未找到已安装的 Skill：missing-skill"
    );
  });

  it("rejects a directory whose manifest name does not match the requested Skill", () => {
    const root = mkdtempSync(join(tmpdir(), "resume-studio-skills-"));
    const skillDirectory = join(root, "resume-optimizer");
    mkdirSync(skillDirectory);
    writeFileSync(join(skillDirectory, "SKILL.md"), "---\nname: another-skill\n---\n");
    expect(() => discoverInstalledSkills(["resume-optimizer"], [root])).toThrow(
      "Skill 名称不匹配"
    );
  });
});

