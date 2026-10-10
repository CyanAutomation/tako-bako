/** Escapes text and attributes before they are inserted into generated HTML. */
export const escapeHtml = (value: string) => value.replace(/[&<>'"`]/g, character => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;", "`": "&#96;" })[character]!);
