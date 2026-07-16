import { cp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

const root = process.cwd();
const clientDir = path.join(root, "dist/client");
const pagesDir = path.join(root, "dist/pages");
const workerPath = path.join(root, "dist/server/index.js");
const normalizedBase = `/${String(process.env.PAGES_BASE_PATH ?? "/").replace(/^\/+|\/+$/g, "")}/`.replace("//", "/");
const siteUrl = String(process.env.PUBLIC_SITE_URL ?? "http://localhost:3000").replace(/\/$/, "");

await rm(pagesDir, { recursive: true, force: true });
await mkdir(pagesDir, { recursive: true });
await cp(clientDir, pagesDir, { recursive: true });

const workerUrl = pathToFileURL(workerPath);
workerUrl.searchParams.set("static-export", Date.now().toString());
const { default: worker } = await import(workerUrl.href);
const publicUrl = new URL(`${normalizedBase.replace(/^\//, "")}`, `${siteUrl}/`);
const response = await worker.fetch(
  new Request(`${siteUrl}/`, {
    headers: {
      accept: "text/html",
      "x-forwarded-host": publicUrl.host,
      "x-forwarded-proto": publicUrl.protocol.replace(":", ""),
    },
  }),
  { ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) } },
  { waitUntil() {}, passThroughOnException() {} },
);
if (!response.ok) throw new Error(`Static render failed: HTTP ${response.status}`);

let html = await response.text();
html = html.replace("<head>", `<head><base href="__PAGES_BASE__">`);
html = html.replaceAll("url(/assets/", `url(${normalizedBase}assets/`);
html = html.replaceAll(`${siteUrl}/og.png`, `${siteUrl}${normalizedBase}og.png`);
html = html.replaceAll(`content="${siteUrl}"`, `content="${siteUrl}${normalizedBase}"`);
html = html.replace(/((?:href|src)=["'])\/(?!\/)/g, `$1${normalizedBase}`);
html = html.replace("__PAGES_BASE__", normalizedBase);

await writeFile(path.join(pagesDir, "index.html"), html);
await writeFile(path.join(pagesDir, ".nojekyll"), "");
if (process.env.PAGES_CUSTOM_DOMAIN) {
  await writeFile(path.join(pagesDir, "CNAME"), `${process.env.PAGES_CUSTOM_DOMAIN}\n`);
}

const unresolved = [...html.matchAll(/(?:href|src)="\/assets\/|url\(\/assets\//g)];
if (normalizedBase !== "/" && unresolved.length) {
  const examples = unresolved.slice(0, 5).map((match) => html.slice(Math.max(0, match.index - 30), match.index + 90));
  throw new Error(`Static export contains ${unresolved.length} root-relative asset URL(s): ${examples.join(" | ")}`);
}
console.log(`GitHub Pages export ready at ${pagesDir} with base ${normalizedBase}`);
