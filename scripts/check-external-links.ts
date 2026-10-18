import { readFile } from "node:fs/promises";
import { execFile } from "node:child_process";
import { join } from "node:path";
import { fileURLToPath, URL } from "node:url";
import { promisify } from "node:util";
import { extractMarkdownDestinations, markdownFiles } from "./markdown-documents.ts";
import { runMarkdownCheck } from "./run-markdown-check.ts";

const execFileAsync = promisify(execFile);

type LinkCheckResponse = {
  status: number;
  body?: { cancel(): Promise<void> } | null;
};

type LinkFetcher = (url: string, init?: RequestInit) => Promise<LinkCheckResponse>;

export function extractExternalLinks(markdown: string): string[] {
  const links = new Set<string>();
  for (const destination of extractMarkdownDestinations(markdown)) {
    try {
      const url = new URL(destination);
      if (url.protocol === "http:" || url.protocol === "https:") links.add(url.href);
    } catch {
      // Relative paths, fragments, and non-web schemes are checked separately or ignored.
    }
  }
  return [...links];
}

export async function checkExternalLinks(markdownSources: readonly string[], fetcher: LinkFetcher = globalThis.fetch): Promise<string[]> {
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
  return results.filter((result): result is string => result !== undefined);
}

async function readMarkdownSources(root: string): Promise<string[]> {
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

async function curlFetch(url: string): Promise<LinkCheckResponse> {
  const { stdout } = await execFileAsync("curl", [
    "--silent", "--show-error", "--location", "--max-time", "10", "--output", "/dev/null",
    "--write-out", "%{http_code}", "--url", url,
  ], { timeout: 12_000 });
  const status = Number(stdout);
  if (!Number.isInteger(status) || status === 0) throw new Error("no HTTP response");
  return { status };
}

export async function checkExternalLinksInRepository(root: string, fetcher: LinkFetcher = curlFetch): Promise<string[]> {
  return checkExternalLinks(await readMarkdownSources(root), fetcher);
}

const scriptPath = fileURLToPath(import.meta.url);
await runMarkdownCheck(scriptPath, checkExternalLinksInRepository, "External Markdown links are reachable.");
