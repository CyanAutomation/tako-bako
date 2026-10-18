import { access, readFile } from "node:fs/promises";
import { dirname, isAbsolute, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { extractMarkdownDestinations, markdownFiles } from "./markdown-documents.ts";
import { runMarkdownCheck } from "./run-markdown-check.ts";

type ProjectTreeDirectory = { indentation: number; path: string };
type LinkTarget = { destination: string; pathname: string; fragment: string };
type MissingLinkArguments = LinkTarget & {
  root: string;
  readmeDirectory: string;
  readmePath: string;
  readmeRelativePath: string;
  anchorCache: Map<string, Promise<Set<string>>>;
};

function extractRelativeLinkTargets(markdown: string): LinkTarget[] {
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

function projectTreeContent(markdown: string): string | undefined {
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

function addProjectTreePath(line: string, directories: ProjectTreeDirectory[], paths: string[]): void {
  const entry = /^(\s*)(\S+)\s{2,}\S/.exec(line);
  if (!entry) return;

  const indentation = entry[1].length;
  while (directories.length > 0) {
    const lastDirectory = directories.at(-1);
    if (!lastDirectory || lastDirectory.indentation < indentation) break;
    directories.pop();
  }
  const parent = directories.at(-1)?.path;
  const projectPath = parent ? join(parent, entry[2]) : entry[2];
  paths.push(projectPath);
  if (entry[2].endsWith("/")) directories.push({ indentation, path: projectPath });
}

function extractProjectTreePaths(markdown: string): string[] {
  const tree = projectTreeContent(markdown);
  if (!tree) return [];
  const paths: string[] = [];
  const directories: ProjectTreeDirectory[] = [];
  for (const line of tree.split(/\r?\n/)) addProjectTreePath(line, directories, paths);
  return paths;
}

async function exists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

function extractHeadingAnchors(markdown: string): Set<string> {
  const anchors = new Set<string>();
  const occurrences = new Map<string, number>();
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

async function missingLinkError({ root, readmeDirectory, readmePath, readmeRelativePath, destination, pathname, fragment, anchorCache }: MissingLinkArguments): Promise<string | undefined> {
  const target = isAbsolute(pathname)
    ? resolve(root, `.${pathname}`)
    : pathname ? resolve(readmeDirectory, pathname) : readmePath;
  if (!await exists(target)) return `${readmeRelativePath}: relative link target does not exist: ${destination}`;
  if (!fragment || !target.toLowerCase().endsWith(".md")) return undefined;

  let anchors = anchorCache.get(target);
  if (!anchors) {
    anchors = readFile(target, "utf8").then(extractHeadingAnchors);
    anchorCache.set(target, anchors);
  }
  let decodedFragment = fragment;
  try {
    decodedFragment = decodeURIComponent(fragment);
  } catch {
    // Keep the raw fragment so it is reported as a missing anchor.
  }
  return (await anchors).has(decodedFragment.toLowerCase())
    ? undefined
    : `${readmeRelativePath}: relative link fragment does not exist: ${destination}`;
}

async function checkRelativeLinks(root: string, readmeRelativePath: string, readmePath: string, markdown: string): Promise<string[]> {
  const readmeDirectory = dirname(readmePath);
  const errors = [];
  const anchorCache = new Map<string, Promise<Set<string>>>();

  for (const { destination, pathname, fragment } of extractRelativeLinkTargets(markdown)) {
    const error = await missingLinkError({ root, readmeDirectory, readmePath, readmeRelativePath, destination, pathname, fragment, anchorCache });
    if (error) errors.push(error);
  }
  return errors;
}

async function checkProjectPaths(root: string, readmeRelativePath: string, markdown: string): Promise<string[]> {
  const errors = [];
  for (const projectPath of extractProjectTreePaths(markdown)) {
    if (!await exists(resolve(root, projectPath))) {
      errors.push(`${readmeRelativePath}: project structure path does not exist: ${projectPath}`);
    }
  }
  return errors;
}

export async function checkReadme(root: string, readmeRelativePath = "README.md"): Promise<string[]> {
  const readmePath = resolve(root, readmeRelativePath);
  const markdown = await readFile(readmePath, "utf8");
  return [
    ...await checkRelativeLinks(root, readmeRelativePath, readmePath, markdown),
    ...await checkProjectPaths(root, readmeRelativePath, markdown),
  ];
}

export async function checkDocumentation(root: string): Promise<string[]> {
  const markdownPaths = ["README.md", ...(await markdownFiles(join(root, "docs"))).map(path => relative(root, path))];
  const checked = await Promise.all(markdownPaths.map(readmePath => checkReadme(root, readmePath)));
  return checked.flat();
}

const scriptPath = fileURLToPath(import.meta.url);
await runMarkdownCheck(scriptPath, checkDocumentation, "README and docs relative links and project structure paths are valid.");
