// Ghost server CLI. Build with `npm run build:server`, then:
//   node server/dist/ghost-server.mjs [serve] [--port 7790] [--host 127.0.0.1] [--data ./ghost-data]
//                                     [--origins http://127.0.0.1:7778,...] [--rate 120] [--static dir]
//   node server/dist/ghost-server.mjs seed   write the bundled sample pool into the configured store
//                                            (the Fly release_command): prints written, unchanged
//                                            and removed counts; exit 1 on any failure
// Flags override env. Every setting, including BB_GHOST_STORE=jsonl|tigris and the Tigris
// variables, is documented in config.ts; a bad one stops the start with exit code 2.
// S2: with uploads open the deck check runs in ONE worker thread (validator.ts), started once the port is open from
// validate-worker.mjs beside this file, and warmed there (the road-cap warm-up that used to run on this thread).

import { fileURLToPath } from "node:url";
import { RULES_VERSION } from "../src/sim/content";
import { createGhostServer, type GhostServer } from "./app";
import { ConfigError, openStore, readConfig, readValidatorConfig, type Config, type ValidatorConfig } from "./config";
import { createWorkerValidator, type WorkerValidator } from "./validator"; // S2: the deck check off the request thread

const log = (line: string) => console.log(line);
const message = (e: unknown) => (e instanceof Error ? e.message : String(e));

function fail(e: unknown, code: number): never {
  console.error(message(e));
  process.exit(code);
}

const argv = process.argv.slice(2);
const command = argv[0] !== undefined && !argv[0].startsWith("--") ? argv.shift()! : "serve";

let cfg: Config;
let vcfg: ValidatorConfig | undefined; // S2: read for `serve` only, so a bad BB_GHOST_VALIDATE_* never stops the deploy's `seed` release command
try {
  if (command !== "serve" && command !== "seed") throw new ConfigError(`unknown command "${command}": use serve (the default) or seed`);
  cfg = readConfig(argv, process.env);
  if (command === "serve") vcfg = readValidatorConfig(process.env);
} catch (e) {
  fail(e, e instanceof ConfigError ? 2 : 1);
}

function serve(): void {
  let app: GhostServer;
  const vc = vcfg!;
  // S2: uploads open -> the worker validator (its script sits beside this bundle); closed -> no check ever runs, so the in-thread default stands
  const validator: WorkerValidator | undefined = cfg.uploads === "open"
    ? createWorkerValidator({ script: fileURLToPath(new URL("./validate-worker.mjs", import.meta.url)), maxQueued: vc.queue, timeoutMs: vc.timeoutMs, heapMb: vc.workerHeapMb, youngMb: vc.workerYoungMb, log, autoStart: false })
    : undefined;
  try {
    app = createGhostServer({
      store: openStore(cfg.store, log), origins: cfg.origins, rateLimit: { windowMs: 60_000, max: cfg.rate }, log,
      uploads: cfg.uploads, trustProxy: cfg.trustProxy, staticDir: cfg.staticDir, ...(validator ? { validator } : {}),
    });
  } catch (e) {
    fail(e, 2); // e.g. BB_GHOST_STATIC without an index.html
  }
  app.listen(cfg.port, cfg.host).then(
    (p) => {
      log(`ghost server (rules ${RULES_VERSION}, store ${app.store.kind}, uploads ${cfg.uploads}) listening on http://${cfg.host}:${p}; CORS origins: ${cfg.origins.join(" ")}; rate ${cfg.rate}/min per ${cfg.trustProxy === "fly" ? "client IP (Fly-Client-IP)" : "socket IP"}`);
      // S2 (was BUMP-1E P6's warmRoadCap on this thread): the deck-check worker starts after the port is open and warms roadCap's memo for days
      // 1-25 INSIDE itself; an upload that arrives meanwhile waits in the queue
      if (validator) {
        log(`deck check: worker thread, queue ${vc.queue}, deadline ${vc.timeoutMs} ms, worker heap setting ${vc.workerHeapMb} MB (young ${vc.workerYoungMb} MB); NODE_OPTIONS="${process.env.NODE_OPTIONS ?? ""}"`);
        validator.start();
      }
    },
    (e: unknown) => fail(`cannot listen on ${cfg.host}:${cfg.port}: ${message(e)}`, 1),
  );
  for (const sig of ["SIGINT", "SIGTERM"] as const) {
    process.on(sig, () => {
      log(`${sig}: shutting down`);
      app.close().then(() => (validator ? validator.close() : undefined)).then(() => process.exit(0));
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
