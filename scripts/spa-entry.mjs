// Turn a TanStack Start SPA build into a plain static site.
//
// The build emits `_shell.html`; static hosts (GitHub Pages) and Capacitor
// both want `index.html`, plus a `404.html` fallback and per-route entry
// pages so deep links resolve without a server.
//
// Usage: node scripts/spa-entry.mjs <clientDir> [basePath]
//   basePath (e.g. "/logic-link") rewrites root-absolute asset links that
//   the prerenderer emits without the base.

import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const [clientDir, basePath = ""] = process.argv.slice(2);
if (!clientDir) {
  console.error("usage: node scripts/spa-entry.mjs <clientDir> [basePath]");
  process.exit(1);
}

const ROUTES = ["play"];

const shellPath = join(clientDir, "_shell.html");
let shell = readFileSync(shellPath, "utf8");

if (basePath) {
  // The favicon link is emitted root-absolute; prefix it like the rest.
  shell = shell.replaceAll('href="/favicon.ico"', `href="${basePath}/favicon.ico"`);
  writeFileSync(shellPath, shell);
}

writeFileSync(join(clientDir, "index.html"), shell);
writeFileSync(join(clientDir, "404.html"), shell);
for (const route of ROUTES) {
  mkdirSync(join(clientDir, route), { recursive: true });
  writeFileSync(join(clientDir, route, "index.html"), shell);
}
// GitHub Pages: serve files/dirs starting with "_" instead of running Jekyll.
writeFileSync(join(clientDir, ".nojekyll"), "");

console.log(
  `spa-entry: wrote index.html, 404.html, ${ROUTES.map((r) => `${r}/index.html`).join(", ")}` +
    (basePath ? ` (base ${basePath})` : ""),
);
