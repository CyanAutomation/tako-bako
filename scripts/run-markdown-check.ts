import { dirname, resolve } from "node:path";
import process from "node:process";
import { pathToFileURL } from "node:url";

export async function runMarkdownCheck(
  scriptPath: string,
  check: (root: string) => Promise<string[]>,
  successMessage: string,
): Promise<void> {
  if (!process.argv[1] || pathToFileURL(resolve(process.argv[1])).href !== pathToFileURL(scriptPath).href) return;

  const root = resolve(dirname(scriptPath), "..");
  const errors = await check(root);
  if (errors.length) {
    for (const error of errors) process.stderr.write(`${error}\n`);
    process.exitCode = 1;
  } else {
    process.stdout.write(`${successMessage}\n`);
  }
}
