// ghost-ops, the backup tool (ops.ts) on the command line, built like the server by `npm run build:server` into server/dist/ghost-ops.mjs (in the Fly image:
// /app/dist/ghost-ops.mjs; the Dockerfile already copies all of server/dist):
//   node server/dist/ghost-ops.mjs snapshot --out /tmp/bb-backups
//   node server/dist/ghost-ops.mjs verify /tmp/bb-backups/20261026T161500Z --exact
//   node server/dist/ghost-ops.mjs restore /tmp/bb-backups/20261026T161500Z --apply
//   node server/dist/ghost-ops.mjs check-health https://beltbattles.fly.dev
//   node server/dist/ghost-ops.mjs --help           (needs no settings)
// The bucket comes from the same settings as the server's (config.ts). Exit 0 done, 1 a storage error, a difference or a short write (check-health: an alert, or the
// server cannot be reached), 2 a usage or settings error (nothing read or written).

import { runOps } from "./ops";

runOps(process.argv.slice(2), process.env, (line) => console.log(line)).then(
  (code) => process.exit(code),
  (e: unknown) => {
    console.error(`ghost-ops failed: ${e instanceof Error ? e.message : String(e)}`);
    process.exit(1);
  },
);
