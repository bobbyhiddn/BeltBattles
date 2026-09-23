// Compare two balance JSON files: identical tables (days) regardless of workers/runtime.
//   node tools/cmpRuns.mjs a/balance-v1.json b/balance-v1.json
import { readFileSync } from "node:fs";

const [a, b] = process.argv.slice(2).map((p) => JSON.parse(readFileSync(p, "utf8")));
const da = JSON.stringify(a.days), db = JSON.stringify(b.days);
console.log(`days identical: ${da === db} (${da.length} chars); workers ${a.meta.workers} vs ${b.meta.workers}; battles ${a.battles} vs ${b.battles}`);
process.exit(da === db ? 0 : 1);
