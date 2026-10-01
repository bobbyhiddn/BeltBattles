// Inline a Vite build (its index.html, the one JS chunk and any CSS) into one HTML file: the single-file game page.
// scripts/singlefile.mjs writes it (and plays it from file://); scripts/asynccheck.mjs (0.7.0 R1, check D) serves it.
// 0.7.0 (R1 M3): the build directory is a parameter: dist/ (npm run build, the offline page) or dist-online/
// (npm run build:online, VITE_GHOST_SERVER=same-origin: the page that plays online from the server that serves it).

import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";

/** The single-file page made from the build in `dist`: { html, script (the JS chunk's name), js (its bytes) }. */
export async function inlineBuild(dist) {
  let html = await readFile(join(dist, "index.html"), "utf8");
  const assets = await readdir(join(dist, "assets"));
  for (const f of assets.filter((a) => a.endsWith(".css"))) {
    const css = await readFile(join(dist, "assets", f), "utf8");
    html = html.replace(new RegExp(`<link[^>]*href="\\./assets/${f}"[^>]*>`), () => `<style>${css}</style>`);
  }
  const scripts = assets.filter((a) => a.endsWith(".js"));
  if (scripts.length !== 1) throw new Error(`expected one JS chunk in ${dist}/assets, found ${scripts.length}`);
  const js = (await readFile(join(dist, "assets", scripts[0]), "utf8")).replace(/<\/script/gi, "<\\/script");
  const tag = new RegExp(`<script[^>]*src="\\./assets/${scripts[0]}"[^>]*></script>`);
  if (!tag.test(html)) throw new Error(`module script tag not found in ${dist}/index.html`);
  html = html.replace(tag, () => `<script type="module">${js}</script>`);
  if (/src="\.\/assets\//.test(html) || /href="\.\/assets\//.test(html)) throw new Error("external asset reference left");
  return { html, script: scripts[0], js };
}
