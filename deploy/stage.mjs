// Build the server bundle and stage the game page for the Docker image (deploy/RUNBOOK.md step 4).
//
//   node deploy/stage.mjs <game.html>            npm run build:server, then copy <game.html> to
//                                                deploy/public/index.html and check it against
//                                                deploy/GAME_BUILD.txt (refuses on a mismatch)
//   node deploy/stage.mjs <game.html> --record   the same, but first record <game.html> as the
//                                                build to ship (commit GAME_BUILD.txt afterwards)
//
// deploy/public/ is gitignored: the ~240 KB page is never committed, only where it came from and
// its SHA-256. Paths in GAME_BUILD.txt are relative to the repo root. Node built-ins only.

import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, isAbsolute, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const recordFile = join(root, "deploy", "GAME_BUILD.txt");
const staged = join(root, "deploy", "public", "index.html");

function die(msg) {
  console.error(`stage: ${msg}`);
  process.exit(1);
}

const args = process.argv.slice(2);
const record = args.includes("--record");
const input = args.find((a) => !a.startsWith("--"));
if (!input) die("usage: node deploy/stage.mjs <game.html> [--record]");
const src = resolve(input);
if (!existsSync(src)) die(`no such file: ${src}`);

const bytes = readFileSync(src);
const sha256 = createHash("sha256").update(bytes).digest("hex");
if (!bytes.subarray(0, 512).toString("utf8").toLowerCase().includes("<!doctype html")) die(`${src} does not look like an HTML page`);
const source = relative(root, src);

function readRecord() {
  if (!existsSync(recordFile)) return null;
  const out = {};
  for (const line of readFileSync(recordFile, "utf8").split("\n")) {
    const m = /^([a-z0-9]+):\s*(.+)$/.exec(line.trim());
    if (m) out[m[1]] = m[2];
  }
  return out;
}

if (record) {
  writeFileSync(recordFile, [
    "# The game page baked into the image as /app/public/index.html and served at / (BB_GHOST_STATIC).",
    "# The page itself is not committed: `node deploy/stage.mjs <file>` copies it to the gitignored",
    "# deploy/public/index.html and refuses a file whose SHA-256 differs from this record. To ship a new",
    "# build: `node deploy/stage.mjs <new.html> --record`, then commit this file. Paths: from the repo root.",
    `source: ${isAbsolute(source) ? src : source}`,
    `bytes: ${bytes.length}`,
    `sha256: ${sha256}`,
    "",
  ].join("\n"));
  console.log(`stage: recorded ${source} (${bytes.length} bytes) in deploy/GAME_BUILD.txt`);
}

const rec = readRecord();
if (!rec) die("deploy/GAME_BUILD.txt is missing: stage with --record once, then commit it");
if (rec.sha256 !== sha256 || Number(rec.bytes) !== bytes.length) {
  die(`${source} is not the recorded build (GAME_BUILD.txt: ${rec.source}, ${rec.bytes} bytes). Stage the recorded file, or pass --record to ship this one.`);
}

console.log("stage: npm run build:server");
const build = spawnSync("npm", ["run", "build:server"], { cwd: root, stdio: "inherit" });
if (build.status !== 0) die(`npm run build:server failed (exit ${build.status})`);
if (!existsSync(join(root, "server", "dist", "ghost-server.mjs"))) die("server/dist/ghost-server.mjs is missing after the build");

mkdirSync(dirname(staged), { recursive: true });
copyFileSync(src, staged);
const check = createHash("sha256").update(readFileSync(staged)).digest("hex");
if (check !== sha256) die("the staged copy does not match its source");
console.log(`stage: ${source} -> deploy/public/index.html (${bytes.length} bytes, sha256 matches GAME_BUILD.txt); server/dist built`);
