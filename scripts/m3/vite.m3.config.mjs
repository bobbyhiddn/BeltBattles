// M3 (REQ-BFG-119): the scratch Vite config for the art page (scripts/m3/page/): a small page built from the game's own
// src/render modules, so the icon is drawn by the game's own pixel-art code. Not the game's config and not a game build:
// it writes only to the --outDir it is given (default WS/tmp/m3-page, outside the repo, as lib.mjs buildPage passes it).
//   nice -n 19 ./node_modules/.bin/vite build --config scripts/m3/vite.m3.config.mjs --outDir <dir> --emptyOutDir
import { defineConfig } from "vite";
import { fileURLToPath } from "node:url";
import { join } from "node:path";

const here = fileURLToPath(new URL(".", import.meta.url));

export default defineConfig({
  root: join(here, "page"),
  base: "./",
  publicDir: false,
  logLevel: "warn",
  build: { outDir: join(here, "..", "..", "..", "tmp", "m3-page"), emptyOutDir: true, assetsInlineLimit: 0, target: "es2020" },
});
