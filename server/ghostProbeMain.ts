// The uploads step's probe (ghostProbe.ts) on the command line, built like the server by `npm run build:server` into
// server/dist/ghost-probe.mjs (0.8.0 U2 M2; a port of 0.7.0 U1's):
//   node server/dist/ghost-probe.mjs <base-url> <id-file>
//   node server/dist/ghost-probe.mjs https://beltbattles.fly.dev ../output-u080/probe-id.txt
// Exit 0 every check as expected, 1 a check failed or a POST got no answer, 2 a usage error (nothing sent).

import { probeMain } from "./ghostProbe";

probeMain(process.argv.slice(2), (line) => console.log(line)).then(
  (code) => process.exit(code),
  (e: unknown) => {
    console.error(`ghost-probe failed: ${e instanceof Error ? e.message : String(e)}`);
    process.exit(1);
  },
);
