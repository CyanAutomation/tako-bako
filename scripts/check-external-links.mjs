import { readFile, readdir } from "node:fs/promises";
import { execFile } from "node:child_process";
import { dirname, join, resolve } from "node:path";
import process from "node:process";
import { fileURLToPath, pathToFileURL, URL } from "node:url";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export function extractExternalLinks(markdown) {
  const links = new Set();
  const pattern = /\]\(\s*(<[^>]+>|[^)\s]+)(?:\s+[^)]*)?\s*\)/g;
  for (const match of markdown.matchAll(pattern)) {
    const destination = match[1].startsWith("<") && match[1].endsWith(">")
      ? match[1].slice(1, -1)
      : match[1];
    try {
      const url = new URL(destination);
      if (url.protocol === "http:" || url.protocol === "https:") links.add(url.href);
    } catch {
      // Relative paths, fragments, and non-web schemes are checked separately or ignored.
    }
  }
  return [...links];
}

export async function checkExternalLinks(markdownSources, fetcher = globalThis.fetch) {
  const links = [...new Set(markdownSources.flatMap(extractExternalLinks))];
  const results = await Promise.all(links.map(async url => {
    try {
      const response = await fetcher(url, {
        method: "GET",
        redirect: "follow",
        headers: { accept: "text/html,application/json;q=0.9,*/*;q=0.8", "user-agent": "TakoBako-link-check/1.0" },
        signal: globalThis.AbortSignal.timeout(10_000),
      });
      await response.body?.cancel();
      return response.status >= 400
        ? `External link returned HTTP ${response.status}: ${url}`
        : undefined;
    } catch (error) {
      return `External link could not be checked: ${url} (${error instanceof Error ? error.message : String(error)})`;
    }
  }));
  return results.filter(Boolean);
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

async function readMarkdownSources(root) {
  const readmePath = join(root, "README.md");
  let readme;
  try {
    readme = await readFile(readmePath, "utf8");
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") {
      throw new Error(`Required README.md not found in ${root}`, { cause: error });
    }
    throw error;
  }

  const docsPaths = await markdownFiles(join(root, "docs"));
  return [readme, ...await Promise.all(docsPaths.map(path => readFile(path, "utf8")))];
}

async function curlFetch(url) {
  const { stdout } = await execFileAsync("curl", [
    "--silent", "--show-error", "--location", "--max-time", "10", "--output", "/dev/null",
    "--write-out", "%{http_code}", "--url", url,
  ], { timeout: 12_000 });
  const status = Number(stdout);
  if (!Number.isInteger(status) || status === 0) throw new Error("no HTTP response");
  return { status };
}

export async function checkExternalLinksInRepository(root, fetcher = curlFetch) {
  return checkExternalLinks(await readMarkdownSources(root), fetcher);
}

const scriptPath = fileURLToPath(import.meta.url);
if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === pathToFileURL(scriptPath).href) {
  const root = resolve(dirname(scriptPath), "..");
  const errors = await checkExternalLinksInRepository(root);
  if (errors.length) {
    for (const error of errors) process.stderr.write(`${error}\n`);
    process.exitCode = 1;
  } else {
    process.stdout.write("External Markdown links are reachable.\n");
  }
}
