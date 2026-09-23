// Ghost server CLI. Build with `npm run build:server`, then:
//   node server/dist/ghost-server.mjs [--port 7790] [--host 127.0.0.1] [--data ./ghost-data]
//                                     [--origins http://127.0.0.1:7778,...] [--rate 120]
// Flags override env: BB_GHOST_PORT, BB_GHOST_HOST, BB_GHOST_DATA, BB_GHOST_ORIGINS, BB_GHOST_RATE.

import { resolve } from "node:path";
import { RULES_VERSION } from "../src/sim/content";
import { createGhostServer, DEFAULT_ORIGINS } from "./app";

function flag(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

function num(v: string, name: string, min: number, max: number): number {
  const n = Number(v);
  if (!Number.isInteger(n) || n < min || n > max) {
    console.error(`--${name}: expected an integer in ${min}..${max}, got "${v}"`);
    process.exit(2);
  }
  return n;
}

const port = num(flag("port") ?? process.env.BB_GHOST_PORT ?? "7790", "port", 0, 65535);
const host = flag("host") ?? process.env.BB_GHOST_HOST ?? "127.0.0.1";
const dataDir = resolve(flag("data") ?? process.env.BB_GHOST_DATA ?? "ghost-data");
const origins = (flag("origins") ?? process.env.BB_GHOST_ORIGINS ?? DEFAULT_ORIGINS.join(","))
  .split(",").map((s) => s.trim()).filter(Boolean);
const rate = num(flag("rate") ?? process.env.BB_GHOST_RATE ?? "120", "rate", 1, 1_000_000);

const app = createGhostServer({ dataDir, origins, rateLimit: { windowMs: 60_000, max: rate } });
app.listen(port, host).then(
  (p) => console.log(`ghost server (rules ${RULES_VERSION}) listening on http://${host}:${p}; CORS origins: ${origins.join(" ")}; rate ${rate}/min per IP`),
  (e: unknown) => {
    console.error(`cannot listen on ${host}:${port}: ${e instanceof Error ? e.message : String(e)}`);
    process.exit(1);
  },
);

for (const sig of ["SIGINT", "SIGTERM"] as const) {
  process.on(sig, () => {
    console.log(`${sig}: shutting down`);
    app.close().then(() => process.exit(0));
  });
}
