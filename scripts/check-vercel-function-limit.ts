import { dirname, resolve } from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

import { assertVercelFunctionLimit, findVercelFunctionFiles, VERCEL_FUNCTION_LIMIT } from "./vercel-function-limit.js";

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const apiDirectory = resolve(projectRoot, "api");

try {
  const functionFiles = await findVercelFunctionFiles(apiDirectory);
  assertVercelFunctionLimit(functionFiles);
  console.log(`Vercel API function count: ${functionFiles.length}/${VERCEL_FUNCTION_LIMIT}.`);
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
