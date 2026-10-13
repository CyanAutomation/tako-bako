import { access, readFile } from "node:fs/promises";
import { dirname, isAbsolute, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { extractMarkdownDestinations, markdownFiles } from "./markdown-documents.mjs";
import { runMarkdownCheck } from "./run-markdown-check.mjs";

function extractRelativeLinkTargets(markdown) {
  const targets = [];
  for (const destination of extractMarkdownDestinations(markdown)) {
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

function projectTreeContent(markdown) {
  const heading = /^## Project Structure\s*$/im.exec(markdown);
  if (!heading) return undefined;

  const afterHeading = markdown.slice(heading.index + heading[0].length);
  const fenceStart = /```[^\n]*\n/.exec(afterHeading);
  if (!fenceStart) return undefined;
  const contentStart = fenceStart.index + fenceStart[0].length;
  const fenceEnd = /\n```/.exec(afterHeading.slice(contentStart));
  if (!fenceEnd) return undefined;
  return afterHeading.slice(contentStart, contentStart + fenceEnd.index);
}

function addProjectTreePath(line, directories, paths) {
  const entry = /^(\s*)(\S+)\s{2,}\S/.exec(line);
  if (!entry) return;

  const indentation = entry[1].length;
  while (directories.length && directories.at(-1).indentation >= indentation) directories.pop();
  const parent = directories.at(-1)?.path;
  const projectPath = parent ? join(parent, entry[2]) : entry[2];
  paths.push(projectPath);
  if (entry[2].endsWith("/")) directories.push({ indentation, path: projectPath });
}

function extractProjectTreePaths(markdown) {
  const tree = projectTreeContent(markdown);
  if (!tree) return [];
  const paths = [];
  const directories = [];
  for (const line of tree.split(/\r?\n/)) addProjectTreePath(line, directories, paths);
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

async function missingLinkError({ root, readmeDirectory, readmePath, readmeRelativePath, destination, pathname, fragment, anchorCache }) {
  const target = isAbsolute(pathname)
    ? resolve(root, `.${pathname}`)
    : pathname ? resolve(readmeDirectory, pathname) : readmePath;
  if (!await exists(target)) return `${readmeRelativePath}: relative link target does not exist: ${destination}`;
  if (!fragment || !target.toLowerCase().endsWith(".md")) return undefined;

  if (!anchorCache.has(target)) anchorCache.set(target, readFile(target, "utf8").then(extractHeadingAnchors));
  let decodedFragment = fragment;
  try {
    decodedFragment = decodeURIComponent(fragment);
  } catch {
    // Keep the raw fragment so it is reported as a missing anchor.
  }
  return (await anchorCache.get(target)).has(decodedFragment.toLowerCase())
    ? undefined
    : `${readmeRelativePath}: relative link fragment does not exist: ${destination}`;
}

async function checkRelativeLinks(root, readmeRelativePath, readmePath, markdown) {
  const readmeDirectory = dirname(readmePath);
  const errors = [];
  const anchorCache = new Map();

  for (const { destination, pathname, fragment } of extractRelativeLinkTargets(markdown)) {
    const error = await missingLinkError({ root, readmeDirectory, readmePath, readmeRelativePath, destination, pathname, fragment, anchorCache });
    if (error) errors.push(error);
  }
  return errors;
}

async function checkProjectPaths(root, readmeRelativePath, markdown) {
  const errors = [];
  for (const projectPath of extractProjectTreePaths(markdown)) {
    if (!await exists(resolve(root, projectPath))) {
      errors.push(`${readmeRelativePath}: project structure path does not exist: ${projectPath}`);
    }
  }
  return errors;
}

export async function checkReadme(root, readmeRelativePath = "README.md") {
  const readmePath = resolve(root, readmeRelativePath);
  const markdown = await readFile(readmePath, "utf8");
  return [
    ...await checkRelativeLinks(root, readmeRelativePath, readmePath, markdown),
    ...await checkProjectPaths(root, readmeRelativePath, markdown),
  ];
}

export async function checkDocumentation(root) {
  const markdownPaths = ["README.md", ...(await markdownFiles(join(root, "docs"))).map(path => relative(root, path))];
  const checked = await Promise.all(markdownPaths.map(readmePath => checkReadme(root, readmePath)));
  return checked.flat();
}

const scriptPath = fileURLToPath(import.meta.url);
await runMarkdownCheck(scriptPath, checkDocumentation, "README and docs relative links and project structure paths are valid.");
