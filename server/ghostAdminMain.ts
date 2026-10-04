// The ghost store's maintenance tool (ghostAdmin.ts) on the command line, built like the server by `npm run build:server`
// into server/dist/ghost-admin.mjs (in the Fly image: /app/dist/ghost-admin.mjs):
//   npm run ghosts:admin -- <command> --rules <bb-x.y.z> [--apply]
//   node server/dist/ghost-admin.mjs list --rules bb-0.8.3
// The store comes from the same settings as the server's (config.ts). Exit 0 done (a dry run too), 1 a storage error or
// an apply that deleted less than its plan, 2 a usage or settings error (nothing read or deleted).

import { runAdmin } from "./ghostAdmin";

runAdmin(process.argv.slice(2), process.env, (line) => console.log(line)).then(
  (code) => process.exit(code),
  (e: unknown) => {
    console.error(`ghosts:admin failed: ${e instanceof Error ? e.message : String(e)}`);
    process.exit(1);
  },
);
