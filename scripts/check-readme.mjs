import { access, readFile, readdir } from "node:fs/promises";
import { dirname, isAbsolute, join, relative, resolve } from "node:path";
import process from "node:process";
import { fileURLToPath, pathToFileURL } from "node:url";

function extractRelativeLinkTargets(markdown) {
  const targets = [];
  const pattern = /\]\(\s*(<[^>]+>|[^)\s]+)(?:\s+[^)]*)?\s*\)/g;
  for (const match of markdown.matchAll(pattern)) {
    const destination = match[1].startsWith("<") && match[1].endsWith(">")
      ? match[1].slice(1, -1)
      : match[1];
    if (!destination || destination.startsWith("//") || /^[a-z][a-z\d+.-]*:/i.test(destination)) {
      continue;
    }

    let pathname;
    try {
      pathname = decodeURIComponent(destination.split(/[?#]/, 1)[0]);
    } catch {
      pathname = destination.split(/[?#]/, 1)[0];
    }
    const fragment = destination.includes("#") ? destination.slice(destination.indexOf("#") + 1).split("?", 1)[0] : "";
    targets.push({ destination, pathname, fragment });
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

function extractHeadingAnchors(markdown) {
  const anchors = new Set();
  const occurrences = new Map();
  for (const match of markdown.matchAll(/^#{1,6}[ \t]+(.+?)[ \t]*#*[ \t]*$/gm)) {
    const title = match[1]
      .replace(/<[^>]*>/g, "")
      .replace(/!?\[([^\]]*)\]\([^)]*\)/g, "$1")
      .replace(/[`*_~]/g, "")
      .toLowerCase()
      .replace(/[^\p{L}\p{N}\s-]/gu, "")
      .trim()
      .replace(/\s+/g, "-");
    if (!title) continue;
    const occurrence = occurrences.get(title) ?? 0;
    occurrences.set(title, occurrence + 1);
    anchors.add(occurrence ? `${title}-${occurrence}` : title);
  }
  return anchors;
}

export async function checkReadme(root, readmeRelativePath = "README.md") {
  const readmePath = resolve(root, readmeRelativePath);
  const markdown = await readFile(readmePath, "utf8");
  const readmeDirectory = dirname(readmePath);
  const errors = [];
  const anchorCache = new Map();

  for (const { destination, pathname, fragment } of extractRelativeLinkTargets(markdown)) {
    const target = isAbsolute(pathname)
      ? resolve(root, `.${pathname}`)
      : pathname ? resolve(readmeDirectory, pathname) : readmePath;
    if (!await exists(target)) {
      errors.push(`${readmeRelativePath}: relative link target does not exist: ${destination}`);
      continue;
    }
    if (fragment && target.toLowerCase().endsWith(".md")) {
      if (!anchorCache.has(target)) anchorCache.set(target, readFile(target, "utf8").then(extractHeadingAnchors));
      let decodedFragment = fragment;
      try {
        decodedFragment = decodeURIComponent(fragment);
      } catch {
        // Keep the raw fragment so it is reported as a missing anchor.
      }
      if (!(await anchorCache.get(target)).has(decodedFragment.toLowerCase())) {
        errors.push(`${readmeRelativePath}: relative link fragment does not exist: ${destination}`);
      }
    }
  }

  for (const projectPath of extractProjectTreePaths(markdown)) {
    if (!await exists(resolve(root, projectPath))) {
      errors.push(`${readmeRelativePath}: project structure path does not exist: ${projectPath}`);
    }
  }

  return errors;
}

async function markdownFiles(directory) {
  let entries;
  try {
    entries = await readdir(directory, { withFileTypes: true });
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") return [];
    throw error;
  }
  const paths = await Promise.all(entries.map(async entry => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return markdownFiles(path);
    return entry.isFile() && entry.name.toLowerCase().endsWith(".md") ? [path] : [];
  }));
  return paths.flat();
}

export async function checkDocumentation(root) {
  const markdownPaths = ["README.md", ...(await markdownFiles(join(root, "docs"))).map(path => relative(root, path))];
  const checked = await Promise.all(markdownPaths.map(readmePath => checkReadme(root, readmePath)));
  return checked.flat();
}

const scriptPath = fileURLToPath(import.meta.url);
if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === pathToFileURL(scriptPath).href) {
  const root = resolve(dirname(scriptPath), "..");
  const errors = await checkDocumentation(root);
  if (errors.length) {
    for (const error of errors) process.stderr.write(`${error}\n`);
    process.exitCode = 1;
  } else {
    process.stdout.write("README and docs relative links and project structure paths are valid.\n");
  }
}
