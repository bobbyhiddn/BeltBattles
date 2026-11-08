// POLISH-7 (REQ-BFG-089; P7-5, the scout's S2.1, cap's rule "build it"): A BELT FACE THAT DROPS HIT ROWS SAYS SO, OR IS ON THE NAMED LIST.
//   The rule (BRIEF-POLISH7 P7-5): where a plan drops hit rows and its `+N MORE HIT TILES` note does not fit, the last shown hit row gives its place to the note, and the note's N counts that row too. Where no hit row is shown, nothing is traded.
//   What the base measures (7ce9207865f9; O/logs/p7b-silent*.txt, p7b-sweep-base-game.txt): inspector.ts choose() already IS that rule. It sizes the note with the rows it counts and gives rows up one at a time until the rows and the note fit
//   (heightOf(rows(n) + note) <= avail), so a face never shows a row and loses its note: on band-280x653 223 own / 225 foe belts of corpus A drop hit rows, 218 / 206 draw the note, and over 202 portrait bands (phones 260x560 to 450x900, 12,874
//   belts that drop rows) none shows a row and no note. The scout's 43 own / 57 foe silent belts (O13 p6-s2-silent.md) were polish5-accepted's; P6-1's one-line readout (COPIES 1.3) took them to 5 / 19, and those are the belts the brief's last sentence names:
//   NO hit row is shown, because the belt's own kept lines (the sync sentence, `8 TILES, 9 HITS:` and the readout's grid rows: 42 or 49 px) are taller than the band's body room (42 px; the foe's 30 px under its CLOSE row), so the face is a phone cut and has
//   no row to give. They are left as they are and named here. The belt faces are the game's: a belt has no THIS FIGHT line (battleScout.ts fightLine is null for any part but a turret).
import { afterEach, describe, expect, it } from "vitest";
import { installRaster } from "./raster.helpers";
import { facePlan, faceRun, faceText, hitRowsGone } from "../src/screens/battleScout";
import { selFamilies, visibleLines, type PanelPlan, type PanelText } from "../src/screens/build/inspector";
import { ENCHANT, setEnchant, withEnchant } from "../src/sim/enchant";
import { RIVAL_IDS, RIVALS, rivalBuild, rivalDays, standInBuild, type RivalId } from "../src/sim/rivals";
import type { Build } from "../src/sim/deck";
import { DAYS, parts } from "./polish3b.helpers";
import { VIEW13_NAMES, viewAt, type View13 } from "./polish4.helpers";

installRaster();
afterEach(() => setEnchant(ENCHANT));

interface Belt { tag: string; t: PanelText; fam: ReturnType<typeof selFamilies>; hitRows: number }
const MAKERS: Record<string, (id: RivalId, day: number) => Build> = { rivalBuild, standInBuild };
const cache = new Map<boolean, Belt[]>();
/** Corpus A's 316 belts (every rival build x days 5/8/12/16 x the warlord deck and the dusk stand-in), read as your own (`foe` false) or as the foe's, with no THIS FIGHT line: the belt face the game draws. */
function belts(foe: boolean): Belt[] {
  const hit = cache.get(foe);
  if (hit) return hit;
  const out: Belt[] = [];
  withEnchant(() => {
    for (const id of RIVAL_IDS) for (const maker of Object.keys(MAKERS)) for (const day of DAYS.filter((d) => rivalDays(id, 16).includes(d))) {
      const b = MAKERS[maker](id, day);
      for (const sel of parts(b)) {
        if (sel.kind !== "route") continue;
        const t = faceText(b, sel, null, day, foe ? RIVALS[id].name : undefined)!;
        out.push({ tag: `A ${id} ${maker} d${day} route${sel.index}`, t, fam: selFamilies(faceRun(b, day), sel), hitRows: t.body.filter((x) => x.trim && !x.join).length });
      }
    }
  });
  cache.set(foe, out);
  return out;
}

const plan = (b: Belt, name: View13, side: 0 | 1): PanelPlan => { const { fa, tp } = viewAt(name, side); return withEnchant(() => facePlan(b.t, fa, b.fam, tp)); };
const NOTE = /^\+(\d+) MORE HIT TILES? \(NUMBERED ON THE DECK\)$/;
/** the note as drawn (N), or null: the note is a drawn line of the plan (visibleLines), not only a chosen block */
const noteDrawn = (p: PanelPlan): number | null => {
  for (const v of visibleLines(p)) if (v.line !== "rule") { const m = NOTE.exec(v.line.block.text); if (m) return Number(m[1]); }
  return null;
};
/** hit rows drawn whole */
const rowsShown = (p: PanelPlan): number => {
  const drawn = new Set(visibleLines(p).map((v) => v.line));
  return p.body.shown.filter((l) => l.b.trim && !l.b.join && l.lines.length > 0 && l.lines.every((ln) => drawn.has(ln))).length;
};

/** THE NAMED LIST: band-280x653's belts that drop hit rows and draw no note, because no hit row is shown (the kept lines overrun the band: `body.fits` false). Own: 5 belts, 32 rows; the foe's: 19 belts, 95 rows. Every other view: none. */
const NAMED: Partial<Record<View13, { own: string[]; foe: string[] }>> = {
  "band-280x653": {
    own: ["brasswick standInBuild d8", "brasswick standInBuild d12", "brasswick standInBuild d16", "voss rivalBuild d12", "voss rivalBuild d16"].map((t) => `A ${t} route0`),
    foe: [
      ...["brasswick standInBuild d8", "brasswick standInBuild d12", "brasswick standInBuild d16"].map((t) => `A ${t} route0`),
      ...["voss rivalBuild", "voss standInBuild"].flatMap((m) => [5, 8, 12, 16].flatMap((d) => [0, 1].map((r) => `A ${m} d${d} route${r}`))), // VOSS's sync belts, both builds, every day, both routes: 16
    ],
  },
};
/** Belts of corpus A that drop hit rows, per view, own / foe (what the base measures; the game's way: no THIS FIGHT line on a belt). */
const DROPPING: Record<View13, [number, number]> = {
  "desk-1920x1080": [61, 69], "laptop-1366x768": [33, 33], "desk-1280x800": [0, 0], "land-844x390": [33, 33], "op-402x690": [89, 89], "phone-360x640": [0, 0], "col96-3040x1710": [74, 74],
  "land-812x375@3": [51, 57], "pixel5-851x393@2.75": [85, 104], "land-915x412@2.625": [67, 67], "promax-926x428@3": [64, 82], "band-280x653": [223, 225], "band-300x640": [0, 0],
};

describe("POLISH-7 P7-5: a belt face that drops hit rows draws its note, or is on the named list", () => {
  for (const name of VIEW13_NAMES) {
    for (const side of [0, 1] as const) {
      const who = side === 0 ? "own" : "foe";
      it(`${name} ${who}: every belt of corpus A that drops a hit row draws \`+N MORE HIT TILES\` with rows shown + N = its hit rows, or is named${NAMED[name] ? " (the list)" : " (none are: the list is empty)"}`, () => {
        const silent: string[] = [];
        let dropping = 0;
        for (const b of belts(side === 1)) {
          const p = plan(b, name, side), gone = hitRowsGone(p);
          if (!gone) continue;
          dropping++;
          const n = noteDrawn(p);
          if (n === null) { silent.push(b.tag); continue; }
          expect(rowsShown(p) + n, `${name} ${who} ${b.tag}: rows shown + N = the belt's hit rows`).toBe(b.hitRows);
          expect(n, `${name} ${who} ${b.tag}: N counts every row given away`).toBe(gone);
        }
        expect(dropping, `${name} ${who}: belts that drop hit rows`).toBe(DROPPING[name][side]);
        expect([...silent].sort(), `${name} ${who}: belts that drop hit rows and draw no note`).toEqual([...(NAMED[name]?.[who] ?? [])].sort());
      });
    }
  }
});

describe("POLISH-7 P7-5: the named belts have no hit row to give", () => {
  for (const side of [0, 1] as const) {
    const who = side === 0 ? "own" : "foe";
    it(`band-280x653 ${who}: the ${NAMED["band-280x653"]![who].length} named belts show no hit row at all (the kept lines overrun the band: body.fits false, the plan is a phone cut), drop every one of their hit rows, and the face is left as it is`, () => {
      const list = NAMED["band-280x653"]![who];
      const named = belts(side === 1).filter((b) => list.includes(b.tag));
      expect(named.map((b) => b.tag).sort(), `${who}: the named belts exist`).toEqual([...list].sort());
      let rows = 0;
      for (const b of named) {
        const p = plan(b, "band-280x653", side);
        expect(p.column, `${b.tag}: a band`).toBe(false);
        expect(p.body.fits, `${b.tag}: the kept lines do not fit the band's body`).toBe(false);
        expect(p.body.height, `${b.tag}: the kept lines are taller than the room`).toBeGreaterThan(p.r.h - 27 - p.shift);
        expect(p.body.shown.filter((l) => l.b.trim && !l.b.join), `${b.tag}: no hit row is shown, so none can give its place`).toEqual([]);
        expect(p.body.shown.some((l) => NOTE.test(l.b.text)), `${b.tag}: no note was chosen either`).toBe(false);
        expect(hitRowsGone(p), `${b.tag}: every hit row is dropped`).toBe(b.hitRows);
        rows += b.hitRows;
      }
      expect(rows, `${who}: hit rows these belts drop`).toBe(side === 0 ? 32 : 95);
    });
  }

  it("band-280x653 corpus A, the totals: own 223 belts drop 933 hit rows, 218 draw the note, 5 are named; foe 225 drop 970, 206 draw it, 19 are named (the scout's 43 / 57 were polish5-accepted's, before P6-1's one-line readout)", () => {
    const tot = (side: 0 | 1): { drop: number; rows: number; noted: number } => {
      let drop = 0, rows = 0, noted = 0;
      for (const b of belts(side === 1)) {
        const p = plan(b, "band-280x653", side), g = hitRowsGone(p);
        if (!g) continue;
        drop++; rows += g;
        if (noteDrawn(p) !== null) noted++;
      }
      return { drop, rows, noted };
    };
    expect(tot(0)).toEqual({ drop: 223, rows: 933, noted: 218 });
    expect(tot(1)).toEqual({ drop: 225, rows: 970, noted: 206 });
  });
});
