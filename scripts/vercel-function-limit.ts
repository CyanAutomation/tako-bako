import { readdir } from "node:fs/promises";
import { extname, join, relative } from "node:path";

export const VERCEL_FUNCTION_LIMIT = 12;

const VERCEL_FUNCTION_EXTENSIONS = new Set([".cjs", ".cts", ".js", ".jsx", ".mjs", ".mts", ".ts", ".tsx"]);

function isVercelFunctionFile(filename: string): boolean {
  return VERCEL_FUNCTION_EXTENSIONS.has(extname(filename).toLowerCase())
    && !/\.d\.(?:c|m)?ts$/i.test(filename);
}

async function collectVercelFunctionFiles(rootDirectory: string, currentDirectory: string): Promise<string[]> {
  const entries = await readdir(currentDirectory, { withFileTypes: true });
  const functionFiles: string[] = [];

  for (const entry of entries) {
    const entryPath = join(currentDirectory, entry.name);
    if (entry.isDirectory()) {
      functionFiles.push(...await collectVercelFunctionFiles(rootDirectory, entryPath));
    } else if (entry.isFile() && isVercelFunctionFile(entry.name)) {
      functionFiles.push(relative(rootDirectory, entryPath));
    }
  }

  return functionFiles;
}

export async function findVercelFunctionFiles(apiDirectory: string): Promise<string[]> {
  return (await collectVercelFunctionFiles(apiDirectory, apiDirectory)).sort();
}

export function assertVercelFunctionLimit(
  functionFiles: readonly string[],
  limit = VERCEL_FUNCTION_LIMIT,
): void {
  if (!Number.isInteger(limit) || limit < 0) {
    throw new RangeError("The Vercel function limit must be a non-negative integer.");
  }
  if (functionFiles.length <= limit) return;

  const entries = functionFiles.map(path => `  - api/${path}`).join("\n");
  throw new Error(
    `Found ${functionFiles.length} Vercel functions under api/; this project's Hobby plan supports at most ${limit}.\n`
      + `Move reusable implementation modules outside api/ so Vercel does not deploy them as functions.\n${entries}`,
  );
}
