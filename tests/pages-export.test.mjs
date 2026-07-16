import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import test from "node:test";

test("creates a self-contained GitHub Pages artifact", async () => {
  const html = await readFile(new URL("../dist/pages/index.html", import.meta.url), "utf8");
  assert.match(html, /<base href="\/">/);
  assert.match(html, /(?:href|src)="\/assets\//);
  assert.match(html, /G-MYDMGJZHT7/);
  await access(new URL("../dist/pages/data/bids.geojson", import.meta.url));
  await access(new URL("../dist/pages/.nojekyll", import.meta.url));
  assert.equal(await readFile(new URL("../dist/pages/CNAME", import.meta.url), "utf8"), "bid-atlas.fothergill.com\n");
});
