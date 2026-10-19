import { YOKAIBA_ORIGIN } from "../src/yokaiba.js";

/** Server-only origin override for local full-stack development. */
export function yokaibaApiOrigin(configured = process.env.YOKAIBA_API_ORIGIN): string {
  if (!configured?.trim()) return YOKAIBA_ORIGIN;
  const url = new URL(configured.trim());
  if ((url.protocol !== "http:" && url.protocol !== "https:") || url.username || url.password || url.pathname !== "/" || url.search || url.hash) {
    throw new TypeError("YOKAIBA_API_ORIGIN must be an HTTP(S) origin without credentials, path, query, or fragment");
  }
  return url.origin;
}
