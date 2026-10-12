import { access, readFile } from "node:fs/promises";
import { dirname, isAbsolute, join, resolve } from "node:path";
import process from "node:process";
import { fileURLToPath, pathToFileURL } from "node:url";

function extractRelativeLinkTargets(markdown) {
  const targets = [];
  const pattern = /\]\(\s*(<[^>]+>|[^)\s]+)(?:\s+[^)]*)?\s*\)/g;
  for (const match of markdown.matchAll(pattern)) {
    const destination = match[1].startsWith("<") && match[1].endsWith(">")
      ? match[1].slice(1, -1)
      : match[1];
    if (!destination || destination.startsWith("#") || destination.startsWith("//") || /^[a-z][a-z\d+.-]*:/i.test(destination)) {
      continue;
    }

    let pathname;
    try {
      pathname = decodeURIComponent(destination.split(/[?#]/, 1)[0]);
    } catch {
      pathname = destination.split(/[?#]/, 1)[0];
    }
    if (pathname) targets.push({ destination, pathname });
  }
  return targets;
}

function extractProjectTreePaths(markdown) {
  const heading = /^## Project Structure\s*$/im.exec(markdown);
  if (!heading) return [];

  const afterHeading = markdown.slice(heading.index + heading[0].length);
  const fenceStart = /```[^\n]*\n/.exec(afterHeading);
  if (!fenceStart) return [];
  const contentStart = fenceStart.index + fenceStart[0].length;
  const fenceEnd = /\n```/.exec(afterHeading.slice(contentStart));
  if (!fenceEnd) return [];

  const tree = afterHeading.slice(contentStart, contentStart + fenceEnd.index);
  const paths = [];
  const directories = [];
  for (const line of tree.split(/\r?\n/)) {
    const entry = /^(\s*)(\S+)\s{2,}\S/.exec(line);
    if (!entry) continue;

    const indentation = entry[1].length;
    while (directories.length && directories.at(-1).indentation >= indentation) directories.pop();
    const parent = directories.at(-1)?.path;
    const projectPath = parent ? join(parent, entry[2]) : entry[2];
    paths.push(projectPath);
    if (entry[2].endsWith("/")) directories.push({ indentation, path: projectPath });
  }
  return paths;
}

async function exists(path) {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

export async function checkReadme(root, readmeRelativePath = "README.md") {
  const readmePath = resolve(root, readmeRelativePath);
  const markdown = await readFile(readmePath, "utf8");
  const readmeDirectory = dirname(readmePath);
  const errors = [];

  for (const { destination, pathname } of extractRelativeLinkTargets(markdown)) {
    const target = isAbsolute(pathname)
      ? resolve(root, `.${pathname}`)
      : resolve(readmeDirectory, pathname);
    if (!await exists(target)) {
      errors.push(`${readmeRelativePath}: relative link target does not exist: ${destination}`);
    }
  }

  for (const projectPath of extractProjectTreePaths(markdown)) {
    if (!await exists(resolve(root, projectPath))) {
      errors.push(`${readmeRelativePath}: project structure path does not exist: ${projectPath}`);
    }
  }

  return errors;
}

const scriptPath = fileURLToPath(import.meta.url);
if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === pathToFileURL(scriptPath).href) {
  const root = resolve(dirname(scriptPath), "..");
  const errors = await checkReadme(root);
  if (errors.length) {
    for (const error of errors) process.stderr.write(`${error}\n`);
    process.exitCode = 1;
  } else {
    process.stdout.write("README relative links and project structure paths are valid.\n");
  }
}
