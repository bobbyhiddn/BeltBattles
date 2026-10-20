// Ghost server CLI. Build with `npm run build:server`, then:
//   node server/dist/ghost-server.mjs [serve] [--port 7790] [--host 127.0.0.1] [--data ./ghost-data]
//                                     [--origins http://127.0.0.1:7778,...] [--rate 120] [--static dir]
//   node server/dist/ghost-server.mjs seed   write the bundled sample pool into the configured store
//                                            (the Fly release_command): prints written, unchanged
//                                            and removed counts; exit 1 on any failure
// Flags override env. Every setting, including BB_GHOST_STORE=jsonl|tigris and the Tigris
// variables, is documented in config.ts; a bad one stops the start with exit code 2.

import { RULES_VERSION } from "../src/sim/content";
import { createGhostServer, type GhostServer } from "./app";
import { ConfigError, openStore, readConfig, type Config } from "./config";
import { steamVerifier } from "./steamAuth"; // IDENT-1 (REQ-BFG-122)
import { warmRoadCap } from "./warm"; // BUMP-1E P6: roadCap's warm-up at the boot

const log = (line: string) => console.log(line);
const message = (e: unknown) => (e instanceof Error ? e.message : String(e));

function fail(e: unknown, code: number): never {
  console.error(message(e));
  process.exit(code);
}

const argv = process.argv.slice(2);
const command = argv[0] !== undefined && !argv[0].startsWith("--") ? argv.shift()! : "serve";

let cfg: Config;
try {
  if (command !== "serve" && command !== "seed") throw new ConfigError(`unknown command "${command}": use serve (the default) or seed`);
  cfg = readConfig(argv, process.env);
} catch (e) {
  fail(e, e instanceof ConfigError ? 2 : 1);
}

function serve(): void {
  let app: GhostServer;
  try {
    app = createGhostServer({
      store: openStore(cfg.store, log), origins: cfg.origins, rateLimit: { windowMs: 60_000, max: cfg.rate }, log,
      uploads: cfg.uploads, trustProxy: cfg.trustProxy, staticDir: cfg.staticDir,
      steam: cfg.steam ? steamVerifier(cfg.steam) : null, // IDENT-1: Steam linking, on only with BB_STEAM_WEB_API_KEY and BB_STEAM_APP_IDS
    });
    log(cfg.steam ? `steam linking on for App IDs ${cfg.steam.appIds.join(", ")}` : "steam linking off (BB_STEAM_WEB_API_KEY and BB_STEAM_APP_IDS not both set)");
  } catch (e) {
    fail(e, 2); // e.g. BB_GHOST_STATIC without an index.html
  }
  app.listen(cfg.port, cfg.host).then(
    (p) => {
      log(`ghost server (rules ${RULES_VERSION}, store ${app.store.kind}, uploads ${cfg.uploads}) listening on http://${cfg.host}:${p}; CORS origins: ${cfg.origins.join(" ")}; rate ${cfg.rate}/min per ${cfg.trustProxy === "fly" ? "client IP (Fly-Client-IP)" : "socket IP"}`);
      // BUMP-1E P6: roadCap's warm-up, after the port is open (a cache fill, day by day, the event loop yielded between days; server/warm.ts)
      if (cfg.uploads === "open") warmRoadCap(log).catch((e: unknown) => log(`road model warm-up failed (the first deep upload builds it instead): ${message(e)}`));
      // IDENT-1 (REQ-BFG-122): the tombstones (deleted players) are read into memory now; a failure is retried by the first request
      app.links.ensureFresh().catch((e: unknown) => log(`identity store: could not read the tombstones yet: ${message(e)}`));
    },
    (e: unknown) => fail(`cannot listen on ${cfg.host}:${cfg.port}: ${message(e)}`, 1),
  );
  for (const sig of ["SIGINT", "SIGTERM"] as const) {
    process.on(sig, () => {
      log(`${sig}: shutting down`);
      app.close().then(() => process.exit(0));
    });
  }
}

async function seed(): Promise<void> {
  const { seedStore } = await import("./seed"); // the sample pool is only loaded for this command
  const store = openStore(cfg.store, log);
  const r = await seedStore(store);
  log(`seed: rules ${r.rules}, ${r.entries} pool ghosts on ${store.kind} (${store.where}): ${r.written} written, ${r.unchanged} unchanged, ${r.removed} removed`);
}

if (command === "seed") {
  seed().then(() => process.exit(0), (e: unknown) => fail(`seed failed: ${message(e)}`, 1));
} else {
  serve();
}
