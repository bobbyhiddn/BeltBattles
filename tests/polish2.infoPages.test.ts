// POLISH-2 (REQ-BFG-089; BRIEF-POLISH2 Q4 (a), cap's ruling 4891557f50a5880a: LEAVE the layout): a GUARD on the ⓘ view's page count. The aim stays at most 3 pages; POLISH-1's `NAME ★` made the title too wide to sit
// beside the buttons for some panels, so portraitButtons drops them under the sub line (the 0.6.1r F7 rule, unchanged) and the ⓘ view loses that row. tests/enchant1.faces.test.ts pins ONE such view (MASSIVE
// SCRAP CANNON ★, installed, 402x690) among its representative pieces; a full scan (every priced piece x ★1-3 x each legal word x placed / cargo / installed / fitted, the three phone views) finds 29 views past
// 3 pages, all on 402x690 and none on 390x844 or 360x640 (28 of them already at polish1-base; only the star's MASSIVE SCRAP CANNON ★ is new). This file pins that exact list, so the exceptions cannot grow unseen:
// a change that adds a view past 3 pages, or any view past 4, fails here. (A rule that fixed them would move 2,645 of the 14,608 views: not done, the ruling.) Pages are counted as the repo's own test counts them
// (infoView of infoItems(infoLevels, explainWords, notes) in the panel's rect).
import { describe, expect, it } from "vitest";
import { installRaster } from "./raster.helpers";
import { newRun, type Run } from "../src/game/run";
import { UI } from "../src/ui/ui";
import { TAP_CSS } from "../src/ui/tap";
import { buildLayout, buildScale, panelArea, phoneBarLift, phoneScreen, type Sel } from "../src/screens/build/layout";
import { runeRowFits, runeRowH, shiftLayout } from "../src/ui/runeBar";
import { cargoPanel, detailsPlan, fittedPanel, itemPanel, panelFit, turretPanel } from "../src/screens/build/inspector";
import { explainWords, infoFree, infoItems, infoLevels, infoView, panelPiece } from "../src/screens/build/keywords";
import type { Ctx } from "../src/screens/build/actions";
import { ITEMS } from "../src/sim/content";
import { setTurretList, type Build } from "../src/sim/deck";
import { ENCHANT_DEFS, ENCHANT_IDS, enchantKindOf, enchantProblem, freeSides } from "../src/sim/enchant";

installRaster();

/** The 402x690 views that need more than 3 ⓘ pages, `view|how|piece|stars|word`, sorted (4 pages each). RE-PINNED for a 0.9.14.1 base
 *  (cap's review of POLISH-2, D/polish2/REVIEW-POLISH2.md): 35 views, the same with or without POLISH-2's src (it changes no ⓘ page count);
 *  against POLISH-2's own base (29), 0.9.14.1's rides moved 6 views back to 3 pages and 12 to 4 (GANTRY PRESS and LIMPET with a word).
 *  0.9.15 (cap, release lane 4228a395, RULING-STAGE0915-R0): 39 views. PRESENT-3's E (1b5778d1, a turret panel folds its EMPTY gear rows
 *  into one `GEAR 2-6 EMPTY` row) makes an installed turret's panel shorter, so its ⓘ view has less room: 4 installed ★★ views with a word
 *  move from 3 pages to 4. Measured at merge-tree(present3-accepted, polish2-accepted) and at r0915-rides; BUMP-1G (bb-0.14.0) moves none. */
const PAST_3_AT_402X690 = [
  "op690|installed|rampart|1|massive", // MASSIVE RAMPART CANNON ★
  "op690|installed|rampart|2|massive", // MASSIVE RAMPART CANNON ★★ (0.9.15: PRESENT-3's E folds the EMPTY gear rows; RULING-STAGE0915-R0)
  "op690|installed|rampart|2|wide", // WIDE RAMPART CANNON ★★ (0.9.15: PRESENT-3's E folds the EMPTY gear rows; RULING-STAGE0915-R0)
  "op690|installed|scrapcannon|1|massive", // MASSIVE SCRAP CANNON ★ (the one tests/enchant1.faces.test.ts pins)
  "op690|installed|scrapcannon|2|massive", // MASSIVE SCRAP CANNON ★★ (0.9.15: PRESENT-3's E folds the EMPTY gear rows; RULING-STAGE0915-R0)
  "op690|installed|twinneedle|2|massive", // MASSIVE TWIN NEEDLE ★★ (0.9.15: PRESENT-3's E folds the EMPTY gear rows; RULING-STAGE0915-R0)
  "op690|placed|armorpress|3|braced", // BRACED ARMOR PRESS ★★★
  "op690|placed|armorpress|3|fiery", // FIERY ARMOR PRESS ★★★
  "op690|placed|coil|1|fiery", // FIERY GALVANIC COIL ★
  "op690|placed|coil|2|fiery", // FIERY GALVANIC COIL ★★
  "op690|placed|coil|3|fiery", // FIERY GALVANIC COIL ★★★
  "op690|placed|doublestamp|2|braced", // BRACED DOUBLE STAMP ★★
  "op690|placed|elbowguard|1|braced", // BRACED ELBOW GUARD ★
  "op690|placed|elbowguard|1|echoing", // ECHOING ELBOW GUARD ★
  "op690|placed|elbowguard|1|fiery", // FIERY ELBOW GUARD ★
  "op690|placed|elbowguard|1|growing", // GROWING ELBOW GUARD ★
  "op690|placed|elbowguard|2|braced", // BRACED ELBOW GUARD ★★
  "op690|placed|elbowguard|2|echoing", // ECHOING ELBOW GUARD ★★
  "op690|placed|elbowguard|2|fiery", // FIERY ELBOW GUARD ★★
  "op690|placed|elbowguard|2|growing", // GROWING ELBOW GUARD ★★
  "op690|placed|elbowguard|3|braced", // BRACED ELBOW GUARD ★★★
  "op690|placed|elbowguard|3|fiery", // FIERY ELBOW GUARD ★★★
  "op690|placed|elbowguard|3|growing", // GROWING ELBOW GUARD ★★★
  "op690|placed|gantry|1|braced", // BRACED GANTRY PRESS ★ (0.9.14.1: joined with PRESENT-1/2's panels)
  "op690|placed|gantry|1|fiery", // FIERY GANTRY PRESS ★ (0.9.14.1: joined with PRESENT-1/2's panels)
  "op690|placed|gantry|2|braced", // BRACED GANTRY PRESS ★★ (0.9.14.1: joined with PRESENT-1/2's panels)
  "op690|placed|gantry|2|fiery", // FIERY GANTRY PRESS ★★ (0.9.14.1: joined with PRESENT-1/2's panels)
  "op690|placed|limpet|1|echoing", // ECHOING LIMPET ★ (0.9.14.1: joined with PRESENT-1/2's panels)
  "op690|placed|limpet|2|braced", // BRACED LIMPET ★★ (0.9.14.1: joined with PRESENT-1/2's panels)
  "op690|placed|limpet|2|echoing", // ECHOING LIMPET ★★ (0.9.14.1: joined with PRESENT-1/2's panels)
  "op690|placed|limpet|2|rising", // RISING LIMPET ★★ (0.9.14.1: joined with PRESENT-1/2's panels)
  "op690|placed|limpet|3|braced", // BRACED LIMPET ★★★ (0.9.14.1: joined with PRESENT-1/2's panels)
  "op690|placed|limpet|3|echoing", // ECHOING LIMPET ★★★ (0.9.14.1: joined with PRESENT-1/2's panels)
  "op690|placed|limpet|3|fiery", // FIERY LIMPET ★★★ (0.9.14.1: joined with PRESENT-1/2's panels)
  "op690|placed|limpet|3|wide", // WIDE LIMPET ★★★ (0.9.14.1: joined with PRESENT-1/2's panels)
  "op690|placed|mendpress|3|braced", // BRACED MEND PRESS ★★★
  "op690|placed|scaleguard|1|wide", // WIDE SCALE GUARD ★
  "op690|placed|scaleguard|2|wide", // WIDE SCALE GUARD ★★
  "op690|placed|scaleguard|3|wide", // WIDE SCALE GUARD ★★★
];

const gcd = (a: number, b: number): number => (b ? gcd(b, a % b) : a);
function framed(w: number, h: number, dpr: number, runes = 1, offers = 5) {
  const pw = Math.floor(w * dpr), ph = Math.floor(h * dpr), portrait = ph > pw * 1.05;
  const fake = { run: { build: { runes: Array.from({ length: runes }, () => ({ id: "many_hands" })) } }, refit: false, offers: () => Array.from({ length: offers }) } as unknown as Parameters<typeof runeRowFits>[0];
  let S = buildScale(pw, ph, portrait, dpr);
  while (S > 1 && !runeRowFits(fake, pw, ph, portrait, S, dpr)) S--;
  const isPh = phoneScreen(pw, ph, dpr), phone = portrait && isPh, tap = isPh ? Math.ceil(TAP_CSS / (S / dpr)) : 0;
  const v = { scale: S, dpr }, W = Math.floor(pw / S), H = Math.floor(ph / S);
  const lay = (unit: number) => {
    const row = runeRowH(v, runes), lift = phone ? phoneBarLift(W, H, offers, tap, runeRowH(v, 1)) : 0;
    return shiftLayout(buildLayout(W, H - row, portrait, offers, phone, tap, lift, { scale: S, unit }), row, H);
  };
  const Z = lay(1).cam.z, unit = gcd(S, Z), sub = S / unit;
  return { S, W, H, L: lay(unit), tap, phone, portrait, view: { W, H, scale: S, dpr, portrait, sub } };
}
const VIEWS = { op690: framed(402, 690, 3, 1), tall390x844: framed(390, 844, 3, 1), small360x640: framed(360, 640, 2, 1) } as const;

function base(): Run {
  const run = newRun("furnace", 5, "polish2-pages");
  run.build = { hero: "furnace", items: [{ uid: 1, def: "kiln", x: 4, y: 6 }], routes: [], mods: [], beltCap: 40, hullBonus: 0 };
  run.inventory = [];
  return run;
}

/** Every priced piece x star x word (or none) x how, on one phone view: `view|how|piece|stars|word` -> its ⓘ page count. */
function pagesOn(view: keyof typeof VIEWS): Map<string, number> {
  const f = VIEWS[view], out = new Map<string, number>();
  for (const d of Object.values(ITEMS)) {
    if (!d.price) continue;
    const kind = enchantKindOf(d);
    const words: (string | undefined)[] = [undefined, ...(kind ? ENCHANT_IDS.filter((id) => ENCHANT_DEFS[id].kinds.includes(kind) && enchantProblem(d, id, id === "wide" ? { enchDir: freeSides(d)[0] } : undefined) === null) : [])];
    for (const stars of [1, 2, 3]) {
      if (stars > 1 && !(d.kind === "gate" || d.kind === "factory" || d.kind === "turret" || d.kind === "mod" || d.kind === "core" || d.kind === "converter")) continue;
      for (const word of words) {
        const w = word ? { ench: word, ...(word === "wide" && kind === "rig" ? { enchDir: freeSides(d)[0] } : {}) } : {};
        const star = stars > 1 ? { stars } : {};
        const cases: [string, Run, Sel][] = [];
        if (d.kind === "turret") {
          const r1 = base(); setTurretList(r1.build, [{ slot: 0, def: d.id, uid: 90, ...star, ...w } as never]); cases.push(["installed", r1, { kind: "turret", index: 0 }]);
          const r2 = base(); r2.inventory = [{ uid: 900, def: d.id, ...star, ...w } as never]; cases.push(["cargo", r2, { kind: "cargo", uid: 900 }]);
        } else if (d.kind === "core" || d.kind === "mod") {
          if (word) continue;
          const r1 = base(); setTurretList(r1.build, [{ slot: 0, def: "scrapcannon", uid: 90 } as never]); r1.build.mods = [{ uid: 950, def: d.id, turret: 0, ...star }] as Build["mods"]; cases.push(["fitted", r1, { kind: "fitted", uid: 950 }]);
          const r2 = base(); r2.inventory = [{ uid: 900, def: d.id, ...star } as never]; cases.push(["cargo", r2, { kind: "cargo", uid: 900 }]);
        } else {
          const r1 = base(); r1.build.items.push({ uid: 9, def: d.id, x: d.kind === "factory" ? 0 : 3, y: d.kind === "factory" ? 0 : 3, ...star, ...w } as Build["items"][number]); cases.push(["placed", r1, { kind: "item", uid: 9 }]);
          const r2 = base(); r2.inventory = [{ uid: 900, def: d.id, ...star, ...w } as never]; cases.push(["cargo", r2, { kind: "cargo", uid: 900 }]);
        }
        for (const [how, run, sel] of cases) {
          const panel = sel.kind === "item" ? itemPanel(run, 9) : sel.kind === "cargo" ? cargoPanel(run, 900) : sel.kind === "turret" ? turretPanel(run, 0) : fittedPanel(run, 950);
          if (!panel) continue;
          const ctx = { game: { ui: new UI(), t: 0, view: f.view, W: f.W, H: f.H }, run, touch: true, L: f.L } as unknown as Ctx;
          const area = panelArea(f.L, sel, { touch: true, hover: false, busy: false }, panelFit(ctx, sel, !!f.L.phone));
          const dd = detailsPlan(ctx, sel, null, area)!, p = dd.plan;
          const words2 = explainWords(dd.t, panelPiece(run, dd.show)), notes = (dd.t.notes ?? []).map((b) => b.text);
          const items = infoItems(infoLevels(run, sel), words2, p.r.w - 10, notes);
          out.set(`${view}|${how}|${d.id}|${stars}|${word ?? "-"}`, infoView(items, p.r, p.y - 1, p.maxY + 2, infoFree(f.L, p.r, p.column)).pages.length);
        }
      }
    }
  }
  return out;
}

describe("POLISH-2 Q4 (a): the ⓘ view's page count has a guard (the layout is left as it is: cap's ruling 4891557f50a5880a)", () => {
  it("402x690: exactly the pinned views (35 on 0.9.14.1) need a 4th page (none more than 4); a new one past 3 fails here", () => {
    const pages = pagesOn("op690");
    expect(pages.size).toBeGreaterThan(3000);
    const over = [...pages].filter(([, n]) => n > 3).map(([k]) => k).sort();
    expect(over, "the 402x690 views past 3 ⓘ pages").toEqual(PAST_3_AT_402X690);
    expect(Math.max(...pages.values()), "the most pages any view needs").toBe(4);
    // the one enchant1.faces.test.ts pins (MASSIVE SCRAP CANNON ★, installed) is in the list
    expect(over).toContain("op690|installed|scrapcannon|1|massive");
  });

  it("390x844 and 360x640: no view past 3 pages", () => {
    for (const view of ["tall390x844", "small360x640"] as const) {
      const pages = pagesOn(view);
      expect(pages.size, view).toBeGreaterThan(3000);
      expect([...pages].filter(([, n]) => n > 3).map(([k]) => k), view).toEqual([]);
    }
  }, 120_000); // RIDE T1 (STAGE-0916, the hull lane's call): 120 s (was the 30-s default): STAGE-09151 read 13.4 s alone and 30.1 s, the default limit, at load 42: a host timeout, not the rule
});
