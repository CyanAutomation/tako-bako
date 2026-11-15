import { access, readdir, readFile } from "node:fs/promises";
import { join, relative, resolve, sep } from "node:path";

async function skillFiles(directory: string): Promise<string[]> {
  let entries;
  try {
    entries = await readdir(directory, { withFileTypes: true });
  } catch {
    return [];
  }

  const nested = await Promise.all(entries.map(async entry => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return skillFiles(path);
    return entry.isFile() && entry.name === "SKILL.md" ? [path] : [];
  }));
  return nested.flat().sort();
}

export async function checkSkillsIndex(root: string): Promise<string[]> {
  const indexPath = join(root, ".github", "skills", "README.md");
  const indexRelativePath = ".github/skills/README.md";
  let markdown: string;
  try {
    markdown = await readFile(indexPath, "utf8");
  } catch {
    return [`${indexRelativePath}: skills index does not exist`];
  }

  const base = join(root, ".github", "skills");
  const listed = new Set<string>();
  const errors: string[] = [];
  for (const match of markdown.matchAll(/\[[^\]]+\]\(([^)]+\.md)(?:#[^)]*)?\)/g)) {
    const destination = match[1];
    if (!destination || destination.includes(":") || destination.startsWith("/")) continue;
    const target = resolve(base, destination.split(/[?#]/, 1)[0] ?? "");
    const normalizedBase = `${resolve(base)}${sep}`;
    if (!target.startsWith(normalizedBase)) continue;
    const skillPath = relative(root, target).split(sep).join("/");
    listed.add(target);
    try {
      await access(target);
    } catch {
      errors.push(`${indexRelativePath}: listed skill does not exist: ${skillPath}`);
    }
  }

  for (const path of await skillFiles(base)) {
    if (!listed.has(resolve(path))) {
      errors.push(`${indexRelativePath}: skill is not listed: ${relative(root, path).split(sep).join("/")}`);
    }
  }
  return errors.sort();
}
