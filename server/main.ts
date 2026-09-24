// Ghost server CLI. Build with `npm run build:server`, then:
//   node server/dist/ghost-server.mjs [--port 7790] [--host 127.0.0.1] [--data ./ghost-data]
//                                     [--origins http://127.0.0.1:7778,...] [--rate 120]
// Flags override env. Every setting, including BB_GHOST_STORE=jsonl|tigris and the Tigris
// variables, is documented in config.ts; a bad one stops the start with exit code 2.

import { RULES_VERSION } from "../src/sim/content";
import { createGhostServer } from "./app";
import { ConfigError, openStore, readConfig, type Config } from "./config";

const log = (line: string) => console.log(line);

function fail(e: unknown, code: number): never {
  console.error(e instanceof Error ? e.message : String(e));
  process.exit(code);
}

let cfg: Config;
try {
  cfg = readConfig(process.argv.slice(2), process.env);
} catch (e) {
  fail(e, e instanceof ConfigError ? 2 : 1);
}

const app = createGhostServer({ store: openStore(cfg.store, log), origins: cfg.origins, rateLimit: { windowMs: 60_000, max: cfg.rate }, log });
app.listen(cfg.port, cfg.host).then(
  (p) => log(`ghost server (rules ${RULES_VERSION}, store ${app.store.kind}) listening on http://${cfg.host}:${p}; CORS origins: ${cfg.origins.join(" ")}; rate ${cfg.rate}/min per IP`),
  (e: unknown) => fail(`cannot listen on ${cfg.host}:${cfg.port}: ${e instanceof Error ? e.message : String(e)}`, 1),
);

for (const sig of ["SIGINT", "SIGTERM"] as const) {
  process.on(sig, () => {
    log(`${sig}: shutting down`);
    app.close().then(() => process.exit(0));
  });
}
