// SCALE-2d (REQ-BFG-098 098.6; BRIEF-SCALE2d D3): captains and warlords with SCALE_RIGS on (withScaleRigs; the shipped switch
// stays off). No captain, warlord or captain stand-in gets a new piece in this job (none holds one of the seven new ids, on or
// off); the reworked five fight as their switch-on defs, and the decks themselves are the same decks (the switch changes no
// authored deck: rivalBuilds.ts and ai.ts read no rating). With the switch on every captain's deck passes the strict check
// with exactly the base's problems. The holders by day are written to TABLE_OUT for the REPORT (D3: which captains J5 can
// move through a rework).
import { writeFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { ITEMS } from "../src/sim/content";
import type { Build } from "../src/sim/deck";
import { RIVAL_IDS, rivalBuild, standInBuild } from "../src/sim/rivals";
import { warlordBuild } from "../src/sim/ai";
import { PLAYABLE_HEROES } from "../src/sim/heroBuilds";
import { SCALE_DEF_IDS, SCALE_IDS, withScaleRigs } from "../src/sim/scale";
import { validateBuild } from "../src/net/validate";

const REWORKS = SCALE_DEF_IDS.filter((id) => id !== "venom");
const held = (b: Build, ids: readonly string[]): string[] => [...new Set([...b.items.map((p) => p.def), ...b.mods.map((m) => m.def)].filter((d) => ids.includes(d)))];
const decks = (): { key: string; b: Build }[] => {
  const out: { key: string; b: Build }[] = [];
  for (let d = 1; d <= 10; d++) {
    for (const id of RIVAL_IDS) {
      out.push({ key: `rival/${id}/${d}`, b: rivalBuild(id, d) });
      if (id !== "matriarch") out.push({ key: `standin/${id}/${d}`, b: standInBuild(id, d) });
    }
    for (const h of PLAYABLE_HEROES) out.push({ key: `warlord/${h}/${d}`, b: warlordBuild(h, d) });
  }
  return out;
};

describe("SCALE-2d D3: captains and warlords", () => {
  it("no captain, warlord or captain stand-in holds a new id, off or on; their decks are the same decks both ways", () => {
    const off = decks();
    const on = withScaleRigs(() => decks());
    expect(on.map((x) => x.key)).toEqual(off.map((x) => x.key));
    for (let i = 0; i < off.length; i++) {
      expect(held(on[i].b, SCALE_IDS), on[i].key).toEqual([]);
      expect(JSON.stringify(on[i].b), on[i].key).toBe(JSON.stringify(off[i].b));
    }
  });

  it("with the switch on every captain deck's strict check has exactly the base's problems (days 1-10)", () => {
    const check = (): string[][] => RIVAL_IDS.flatMap((id) => [...Array(10).keys()].map((i) => validateBuild(rivalBuild(id, i + 1), i + 1, "strict").errors));
    const off = check();
    expect(withScaleRigs(() => check())).toEqual(off);
  });

  it("the holders of a rework by day (TABLE_OUT)", () => {
    const rows: string[] = [];
    const by = new Map<string, string[]>();
    for (const x of decks()) {
      const h = held(x.b, REWORKS);
      if (!h.length) continue;
      const [kind, who, day] = x.key.split("/");
      const k = `${kind}/${who}`;
      by.set(k, [...(by.get(k) ?? []), `d${day} ${h.map((id) => ITEMS[id].name).join("+")}`]);
    }
    for (const [k, v] of [...by.entries()].sort()) rows.push(`- ${k}: ${v.join(", ")}`);
    if (process.env.TABLE_OUT) writeFileSync(process.env.TABLE_OUT, rows.join("\n") + "\n");
    console.log(rows.join("\n"));
    expect(rows.length).toBeGreaterThan(0);
  });
});
