import { it } from "vitest";
import { appendFileSync, writeFileSync } from "node:fs";
import { simulate } from "../src/sim/battle";
import { startingBuild, warlordBuild } from "../src/sim/ai";
import { key as K, type Build } from "../src/sim/deck";

// Balance report (not an assertion suite). Run: BB_BALANCE=1 npx vitest run tests/balance.test.ts
const on = !!process.env.BB_BALANCE;

function row(label: string, p: Build, e: Build) {
  const out: string[] = [];
  let wins = 0;
  let tsum = 0;
  for (let seed = 1; seed <= 12; seed++) {
    const b = simulate(p, e, seed * 7919);
    if (b.winner === 0) wins++;
    tsum += b.t;
    if (seed <= 3) {
      const s = b.sides[0].stats;
      out.push(`t=${b.t.toFixed(1)} w=${b.winner} hp=${b.sides.map((x) => Math.round(x.hull.hp)).join("/")} first=${s.firstShot.toFixed(1)} shots=${s.shots} avg=${(s.payloadSum / Math.max(1, s.shots)).toFixed(1)} idle=${(s.idle / Math.max(1e-6, s.turretTime) * 100).toFixed(0)}% q=${s.maxQueue} jams=${s.jams}`);
    }
  }
  appendFileSync(REPORT, `${label}: player wins ${wins}/12, avg t ${(tsum / 12).toFixed(1)}s\n   ` + out.join("\n   ") + "\n");
}

const REPORT = "/tmp/bb-balance.txt";

it.runIf(on)("balance report", () => {
  writeFileSync(REPORT, "");
  const f1 = startingBuild("furnace", 1);
  const w1 = startingBuild("weaver", 1);
  for (let r = 1; r <= 7; r++) {
    row(`FURNACE start vs weaver r${r}`, f1, warlordBuild("weaver", r));
  }
  // furnace with a long cooking route + temper + brake
  const cook: Build = {
    hero: "furnace",
    items: [
      { uid: 1, def: "kiln", x: 4, y: 6 },
      { uid: 2, def: "temper", x: 2, y: 4 },
      { uid: 3, def: "brake", x: 3, y: 2 },
      { uid: 4, def: "longhaul", x: 4, y: 1 },
    ],
    routes: [{ factory: 1, cells: [K(4, 5), K(3, 5), K(2, 5), K(2, 4), K(2, 3), K(2, 2), K(3, 2), K(4, 2), K(4, 1), K(4, 0)] }],
    mods: [], beltCap: 18, hullBonus: 0,
  };
  for (const r of [1, 3, 5, 7]) row(`FURNACE cooker vs weaver r${r}`, cook, warlordBuild("weaver", r));
  for (let r = 1; r <= 7; r++) row(`WEAVER start vs furnace r${r}`, w1, warlordBuild("furnace", r));
});
