// SHAPES-1 (BRIEF-SHAPES1 step 7): the bench's tables from tools/shapes1/presence.ts's and cross.ts's JSON files.
// Pure reads; prints markdown. Usage: node tools/shapes1/benchTables.mjs <bench dir> <presence labels, comma-separated>
//   e.g. node tools/shapes1/benchTables.mjs W/output-shapes1/bench on48a,on48b,off48
// Holder and inserted lifts are pooled over the four heroes weighted by deck (PLAIN-1's reading), in points of win rate.
import { existsSync, readFileSync } from "node:fs";

const DIR = process.argv[2] ?? ".";
const LABELS = (process.argv[3] ?? "on48a,on48b,off48").split(",");
const HEROES = ["furnace", "weaver", "foundry", "bastion"];
const pp = (x) => (x === null || Number.isNaN(x) ? "-" : `${x >= 0 ? "+" : ""}${(100 * x).toFixed(1)}`);
const pct = (n, d) => (d ? `${Math.round((100 * n) / d)}%` : "-");
const mean = (xs) => (xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : NaN);

const rows = []; // { label, shapes, hero, k, row }
const cargo = [];
for (const label of LABELS) for (const hero of HEROES) {
  const f = `${DIR}/presence-${label}-${hero}.json`;
  if (!existsSync(f)) { console.log(`(missing ${f})`); continue; }
  const j = JSON.parse(readFileSync(f, "utf8"));
  for (const r of j.rows) rows.push({ label, shapes: j.shapes, hero, k: j.k, sets: j.sets, r });
  for (const c of j.cargo ?? []) cargo.push({ label, hero, k: j.k, c });
}
const key = (x) => `${x.shapes ? "on" : "off"}|${x.r.id}|${x.r.day}`;
const groups = new Map();
for (const x of rows) { const k = key(x); if (!groups.has(k)) groups.set(k, []); groups.get(k).push(x); }

console.log("## Presence (holder lift pooled over the four heroes, weighted by deck; inserted = free ★1 copy, an upper bound)\n");
console.log("| SHAPES | piece | day | holder lift (decks) | fights | inserted lift (decks) | bought by the day (runs) | per hero holder lift (decks): FURNACE / WEAVER / FOUNDRY / BASTION |");
console.log("|---|---|---|---|---|---|---|---|");
const order = ["nailstrip", "embertrough", "spikerail", "whetstone", "temper", "gantry", "assembly"];
const sorted = [...groups.entries()].sort((a, b) => {
  const [sa, ia, da] = a[0].split("|"), [sb, ib, db] = b[0].split("|");
  return (sa === sb ? 0 : sa === "on" ? -1 : 1) || order.indexOf(ia) - order.indexOf(ib) || Number(da) - Number(db);
});
for (const [k, xs] of sorted) {
  const [s, id, day] = k.split("|");
  const hl = xs.flatMap((x) => x.r.holderLifts), il = xs.flatMap((x) => x.r.insertLifts);
  const fights = xs.reduce((t, x) => t + x.r.holderBattles, 0);
  const bought = xs.reduce((t, x) => t + Math.round(x.r.buyRate * x.k), 0), runs = xs.reduce((t, x) => t + x.k, 0);
  const per = HEROES.map((h) => { const x = xs.find((y) => y.hero === h); return x ? `${pp(x.r.holderLift)} (${x.r.holders})` : "-"; }).join(" / ");
  console.log(`| ${s} | ${id} | ${day} | ${pp(mean(hl))} (${hl.length}) | ${fights} | ${pp(mean(il))} (${il.length}) | ${bought}/${runs} (${pct(bought, runs)}) | ${per} |`);
}

console.log("\n## Buy rate per hero (par runs that bought one by the day)\n");
console.log("| SHAPES | piece | day | FURNACE | WEAVER | FOUNDRY | BASTION |");
console.log("|---|---|---|---|---|---|---|");
for (const [k, xs] of sorted) {
  const [s, id, day] = k.split("|");
  console.log(`| ${s} | ${id} | ${day} | ${HEROES.map((h) => { const x = xs.find((y) => y.hero === h); return x ? `${Math.round(x.r.buyRate * x.k)}/${x.k} (${pct(Math.round(x.r.buyRate * x.k), x.k)}), ${x.r.copies} copies` : "-"; }).join(" | ")} |`);
}

if (cargo.length) {
  console.log("\n## Shaped copies off the deck at dusk (acquired by buys and road drops minus copies on the deck: in cargo or sold)\n");
  console.log("| piece | day | acquired | on the deck | off the deck | runs with one off | per hero off: FURNACE / WEAVER / FOUNDRY / BASTION |");
  console.log("|---|---|---|---|---|---|---|");
  const cg = new Map();
  for (const x of cargo) { const k = `${x.c.id}|${x.c.day}`; if (!cg.has(k)) cg.set(k, []); cg.get(k).push(x); }
  for (const [k, xs] of [...cg.entries()].sort((a, b) => order.indexOf(a[0].split("|")[0]) - order.indexOf(b[0].split("|")[0]) || Number(a[0].split("|")[1]) - Number(b[0].split("|")[1]))) {
    const [id, day] = k.split("|");
    const s = (f) => xs.reduce((t, x) => t + f(x.c), 0);
    console.log(`| ${id} | ${day} | ${s((c) => c.acquired)} | ${s((c) => c.onDeck)} | ${s((c) => c.off)} | ${s((c) => c.runsOff)}/${s((c) => c.runs)} | ${HEROES.map((h) => { const x = xs.find((y) => y.hero === h); return x ? `${x.c.off}` : "-"; }).join(" / ")} |`);
  }
}

const cf = (s) => `${DIR}/cross-${s}.json`;
if (existsSync(cf("off")) && existsSync(cf("on"))) {
  const off = JSON.parse(readFileSync(cf("off"), "utf8")), on = JSON.parse(readFileSync(cf("on"), "utf8"));
  console.log(`\n## Hero cross win rate (fightBench's pairing; k ${on.k}, ${on.seeds} seeds a cross pairing, both sides; same seeds off and on)\n`);
  console.log("| day | hero | SHAPES off | SHAPES on | on - off (points) | battles a hero |");
  console.log("|---|---|---|---|---|---|");
  for (const r of on.rows) {
    const o = off.rows.find((x) => x.day === r.day);
    for (const h of HEROES) console.log(`| ${r.day} | ${h.toUpperCase()} | ${(100 * o.per[h].win).toFixed(1)}% | ${(100 * r.per[h].win).toFixed(1)}% | ${pp(r.per[h].win - o.per[h].win)} | ${r.per[h].battles} |`);
  }
}
