import { readdir } from "node:fs/promises";
import { join } from "node:path";

export function extractMarkdownDestinations(markdown) {
  const destinations = [];
  const pattern = /\]\(\s*(<[^>]+>|[^)\s]+)(?:\s+[^)]*)?\s*\)/g;
  for (const match of markdown.matchAll(pattern)) {
    const target = match[1];
    destinations.push(target.startsWith("<") && target.endsWith(">") ? target.slice(1, -1) : target);
  }
  return destinations;
}

export async function markdownFiles(directory) {
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
