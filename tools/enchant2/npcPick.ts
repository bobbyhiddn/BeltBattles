// ENCHANT-2 (REQ-BFG-085; BRIEF-ENCHANT2 T1): THE EVIDENCE FOR THE HAND-PICKED NPC_WORDS TABLE. For every rival, it prints (1) which piece defs the
// deck holds on EVERY day it is fielded from the grant's day to 16, at every luck and both moments (the only pieces a grant may name), and (2) the
// bots' score (src/sim/harness/enchantBot.ts wordGain: the change in that piece's route damage as a share of the deck's rating) of each legal word on
// each piece at the days the schedule opens a word (5, 8, 12), on the rival's warlord deck and on its dusk stand-in deck. The table in
// src/sim/npcWords.ts is picked FROM this (the score), then for identity (the rival's trick, blurb and hero); nothing here runs in the game.
// Usage: node <built>/npcPick.js [--out npc-pick.md] [--ids nettle,grubnose]
import { writeFileSync } from "node:fs";
import { ITEMS } from "../../src/sim/content";
import { installedTurrets } from "../../src/sim/deck";
import { ENCHANT_IDS, enchantProblem, setEnchant } from "../../src/sim/enchant";
import { piecesOf, modelOf, wordGain } from "../../src/sim/harness/enchantBot";
import { LUCKS, planBuild, PLANS, type Luck, type RoadMoment } from "../../src/sim/rivalBuilds";
import { RIVAL_IDS, RIVALS, luckOf, rivalDays, type RivalId } from "../../src/sim/rivals";

const arg = (k: string, d: string): string => { const i = process.argv.indexOf(k); return i >= 0 ? process.argv[i + 1] : d; };
const OUT = arg("--out", "npc-pick.md");
const IDS = arg("--ids", "").split(",").filter(Boolean) as RivalId[];
const DAYS = [5, 8, 12];
const LAST = 16;
setEnchant(true);

const out: string[] = [];
const say = (s = ""): void => { out.push(s); };

for (const id of RIVAL_IDS.filter((x) => !IDS.length || IDS.includes(x))) {
  const r = RIVALS[id];
  say(`## ${id} (${r.name}; ${r.hero}; tier ${r.tier}${r.standInOnly ? "; stand-in only" : ""}) - ${r.trick}: ${r.blurb}`);
  const days = rivalDays(id, LAST);
  // (1) the defs held on every day from each grant day to LAST, at every luck and both moments
  const decks: { day: number; luck: Luck; moment: RoadMoment; defs: Map<string, number> }[] = [];
  for (const day of days) for (const luck of LUCKS) for (const moment of ["warlord", "dusk"] as const) {
    const b = planBuild(PLANS[id], day, luck, moment).build;
    const defs = new Map<string, number>();
    for (const p of b.items) defs.set(p.def, (defs.get(p.def) ?? 0) + 1);
    for (const t of installedTurrets(b)) defs.set(t.turret.def, (defs.get(t.turret.def) ?? 0) + 1);
    decks.push({ day, luck, moment, defs });
  }
  for (const from of DAYS) {
    const live = decks.filter((d) => d.day >= from);
    if (!live.length) continue;
    const all = [...new Set(live.flatMap((d) => [...d.defs.keys()]))];
    const always = all.filter((def) => live.every((d) => d.defs.has(def)));
    const kinds = always.map((def) => `${def}(${ITEMS[def].kind})`);
    say(`- held on every day from ${from} to ${LAST}, every luck, both moments: ${kinds.join(", ") || "(none)"}`);
  }
  // (2) the bots' score at the grant days, on the rival's own warlord deck and its dusk deck
  for (const day of DAYS) {
    if (!days.includes(day)) continue;
    for (const [label, luck, moment] of [["warlord", luckOf(id), "warlord"], ["dusk", "ordinary", "dusk"]] as [string, Luck, RoadMoment][]) {
      const b = planBuild(PLANS[id], day, luck, moment).build;
      const m = modelOf(b, day);
      const rows: { v: number; text: string }[] = [];
      for (const p of piecesOf(b)) {
        for (const w of ENCHANT_IDS) {
          if (w === "growing") continue;
          if (enchantProblem(p.def, w) !== null) continue;
          const g = wordGain(m, p, w, 0, {});
          if (g.value > 0) rows.push({ v: g.value, text: `${w.toUpperCase()} on ${p.def}${p.kind === "turret" ? `@slot${p.slot}` : `#${p.uid}`} ★${p.stars}${g.dir !== undefined ? ` side ${g.dir}` : ""}: ${(100 * g.value).toFixed(2)}` });
        }
      }
      rows.sort((a, c) => c.v - a.v);
      say(`- day ${day} ${label} (${luck}): ${rows.slice(0, 9).map((x) => x.text).join(" | ") || "(no score)"}`);
    }
  }
  say();
}
writeFileSync(OUT, out.join("\n") + "\n");
console.log(`wrote ${OUT}: ${out.length} lines`);
