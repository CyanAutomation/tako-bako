import assert from "node:assert/strict";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { checkSkillsIndex } from "../scripts/check-skills.ts";

async function withSkillsFixture(run: (root: string) => Promise<void>): Promise<void> {
  const root = await mkdtemp(join(tmpdir(), "tako-bako-skills-"));
  try {
    await mkdir(join(root, ".github", "skills", "sample"), { recursive: true });
    await writeFile(join(root, ".github", "skills", "README.md"), "# Skills\n\n| Skill | Use it for |\n|---|---|\n| [Sample](sample/SKILL.md) | Sample work. |\n");
    await writeFile(join(root, ".github", "skills", "sample", "SKILL.md"), "---\nname: sample\ndescription: Sample.\n---\n");
    await run(root);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

test("skills index passes when it lists every skill file", async () => {
  await withSkillsFixture(async root => {
    assert.deepEqual(await checkSkillsIndex(root), []);
  });
});

test("skills index reports missing entries and broken listed paths", async () => {
  await withSkillsFixture(async root => {
    await writeFile(join(root, ".github", "skills", "README.md"), "# Skills\n\n| Skill | Use it for |\n|---|---|\n| [Sample](missing/SKILL.md) | Sample work. |\n");
    await mkdir(join(root, ".github", "skills", "unlisted"));
    await writeFile(join(root, ".github", "skills", "unlisted", "SKILL.md"), "---\nname: unlisted\ndescription: Another.\n---\n");

    assert.deepEqual(await checkSkillsIndex(root), [
      ".github/skills/README.md: listed skill does not exist: .github/skills/missing/SKILL.md",
      ".github/skills/README.md: skill is not listed: .github/skills/sample/SKILL.md",
      ".github/skills/README.md: skill is not listed: .github/skills/unlisted/SKILL.md",
    ]);
  });
});
