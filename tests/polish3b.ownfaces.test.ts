// POLISH-3b (REQ-BFG-087, REQ-BFG-089; P1, cap's ruling 1 on POLISH-3's question 1): YOUR OWN PARTS' BATTLE FACES WRAP ON THE 1920x1080 DESK AS THE FOE'S DO.
//   At polish3-accepted the plan with `subOwner` (the foe's face) wrapped its title and sub in the 100 px column; your own parts' faces (no `subOwner`) were still cut with a dot, on the same corpus: 92 titles
//   (`RISING RAMPART CAN.`) and every turret sub (280: `HEAVY TURRET IN SL.`), the star and the slot number lost. Measured also on every shop piece x star x enchant word placed on your own build (corpus B): 883 titles and
//   312 turret subs cut at 1920x1080, and 8 titles (the enchanted DRAG CHAIN and FROSTBITE FOUNDRYs at two and three stars) in the 135-136 px columns of 1366x768, 1280x800 and 844x390.
//   Now planPanel's `wrap` (inspector.ts planOnce; battleScout.ts facePlan passes it for every battle face): a title wider than its room even in the 3x5 face breaks at a space onto two 3x5 rows, a sub with no ` · ` or `. `
//   breaks at a space; the header grows by those rows and the body starts under it. The build screen's desk column (no `wrap`) is as before: tests/enchant1.faces.test.ts :765 stands.
import { afterEach, describe, expect, it } from "vitest";
import { G, fresh, installRaster } from "./raster.helpers";
import { battleLayout, battleScale, laneLayout, battleGrid } from "../src/game/battleLayout";
import { viewWithSub } from "../src/game/viewGrid";
import { BattleFaces, facePlan, faceRun, faceText } from "../src/screens/battleScout";
import { gapsAtLeast, planPanel, rulesWhole, selFamilies, type PanelPlan } from "../src/screens/build/inspector";
import { turretSlots } from "../src/sim/deck";
import { ENCHANT, ENCHANT_DEFS, setEnchant, withEnchant } from "../src/sim/enchant";
import { rivalBuild, standInBuild } from "../src/sim/rivals";
import { Arena } from "../src/game/arena";
import { newRun } from "../src/game/run";
import { UI } from "../src/ui/ui";
import { C } from "../src/render/palette";
import type { Game } from "../src/game/game";
import { VIEW_NAMES, abilityLeft, faces, isSix, oldFacePlan, plain, titleCut, drawnSubs, viewOf, type Face, type ViewName } from "./polish3b.helpers";
import { p3bFacePlan } from "./polish4.helpers";
import { hitRowsGone } from "../src/screens/battleScout";
import { textWidth } from "../src/render/font";

installRaster();
afterEach(() => setEnchant(ENCHANT));

const subCut = (f: Face, p: PanelPlan): boolean => drawnSubs(f.t, p).some((s) => textWidth(s, "3") > p.subMax);
const drawnOwn = (f: Face, name: ViewName): PanelPlan => { const { fa, tp } = viewOf(name, 0); return withEnchant(() => facePlan(f.t, fa, f.fam, tp)); };
const oldOwn = (f: Face, name: ViewName): PanelPlan => { const { fa, tp } = viewOf(name, 0); return withEnchant(() => oldFacePlan(f.t, fa, f.fam, tp)); };
const OWN = (): Face[] => faces(false);
/** the 135-136 px columns' eight enchanted foundry faces of corpus B (their title was cut with a dot at polish3-accepted) */
const B8 = ["B frostbite 3 growing", "B frostbite 3 echoing", "B dragchain 2 growing", "B dragchain 2 echoing", "B dragchain 3 rising", "B dragchain 3 growing", "B dragchain 3 echoing", "B dragchain 3 braced"];

describe("POLISH-3b P1: at 1920x1080 no own face is cut with a dot", () => {
  it("corpus A (2,234 faces) and B (1,809): every title whole (one row, or two 3x5 rows with the star on the second), every sub row within the room with the slot number on the last row; POLISH-4 P4-1: a two-row title keeps its family head (A 72 of 92, B 883 of 883)", () => {
    const { fa } = viewOf("desk-1920x1080", 0);
    expect(fa.area.w, "the face column of the 1920x1080 desk").toBe(100);
    const n = { A: { faces: 0, wrapped: 0, turrets: 0, rows3: 0, heads: 0 }, B: { faces: 0, wrapped: 0, turrets: 0, rows3: 0, heads: 0 } };
    for (const f of OWN()) {
      const p = drawnOwn(f, "desk-1920x1080"), c = n[f.corpus];
      c.faces++;
      expect(titleCut(f.t, p), `${f.tag}: title ${f.t.title}`).toBe(false);
      expect(subCut(f, p), `${f.tag}: sub ${JSON.stringify(drawnSubs(f.t, p))}`).toBe(false);
      if (p.titleRows) {
        c.wrapped++;
        expect(p.titleRows.join(" "), `${f.tag}: the title's words, whole`).toBe(f.t.title);
        if (/★+$/.test(f.t.title)) expect(/ ★+$/.test(p.titleRows[1]), `${f.tag}: the star is on the second row (${p.titleRows[1]})`).toBe(true);
        // POLISH-4 (P4-1, REVIEW-POLISH3 N6): POLISH-3 gave a two-row title no family head (this line asserted null); it keeps it now, under the sub or beside its second row (tests/polish4.famhead.test.ts has the rest)
        if (p.famHead) { c.heads++; expect(["sub", "sub2"], `${f.tag}: the head's place under a two-row title`).toContain(p.famHead.at); }
        else expect(f.fam.length === 0 || p.subs.length > 1, `${f.tag}: no head only where the sub leaves no row for it`).toBe(true);
      }
      if (f.kind === "turret") {
        c.turrets++;
        const slot = /SLOT \d+$/.exec(f.t.sub)![0];
        expect(p.subs[p.subs.length - 1].endsWith(slot), `${f.tag}: the slot number on the last sub row (${JSON.stringify(p.subs)})`).toBe(true);
        expect(p.subs.join(" "), `${f.tag}: the sub's words, whole`).toBe(f.t.sub);
        expect(p.subs.length, `${f.tag}: the sub on two rows`).toBe(2);
      }
      if (p.subs.length > 2) c.rows3++;
      // the header takes the rows it grew by and the body starts under them with the same clear rows as every header; the panel stays inside the column
      const subShift = p.subs.length > 1 ? 4 + 6 * (p.subs.length - 2) : 0;
      expect(p.shift, `${f.tag}: the header's shift`).toBe(subShift + (p.titleRows ? 6 : 0));
      expect(p.y, `${f.tag}: the body's top`).toBe(p.r.y + 25 + p.shift - (p.body.tight ? 1 : 0));
      const lastSubEnd = p.r.y + 13 + (p.titleRows ? 6 : 0) + 6 * (p.subs.length - 1) + 5;
      expect(p.y - lastSubEnd, `${f.tag}: clear rows between the header and the body`).toBeGreaterThanOrEqual(p.titleRows || p.subs.length > 1 ? 3 : 0);
      expect(p.r.y + p.r.h, `${f.tag}: the panel is inside the column`).toBeLessThanOrEqual(fa.area.y + fa.area.h);
    }
    // 92 and 883 titles (the ones cut with a dot at polish3-accepted), every turret's sub (280 and 312)
    // BUMP-1H (RULING-BUMP1H-R6 R6.4, the merge with 0.9.15.1): was 2242 (POLISH-3b's pin over 0.9.15's rival decks). BUMP-1H's H3 (src/sim/rivalBuilds.ts) drops MOTH QUEEN's good-luck HEATJACKET and SILKSHADE's good-luck COUNTERWEIGHT
    // from their warlord road decks: one face fewer on each of days 5/8/12/16 in each of the two decks, 8 in all (rigs that put arrows on belts: tests/polish4.rigsub.test.ts counts 1,456 of them, was 1,464). With rivalBuilds.ts put back
    // to bump1h-base this file's A count is 2242 again (kit-1h/revert6m.sh, kit-1h/soft6x.sh).
    expect(n.A.faces).toBe(2234);
    expect(n.B.faces).toBe(1809);
    expect(n.A.wrapped, "A: the 92 titles that were cut with a dot").toBe(92);
    expect(n.B.wrapped, "B: the 883 titles that were cut with a dot").toBe(883);
    expect(n.A.turrets).toBe(280);
    expect(n.B.turrets).toBe(312);
    expect(n.A.heads, "A: the two-row titles that carry a family head (the other 20 are rigs whose two sub rows leave no room)").toBe(72);
    expect(n.B.heads, "B: every two-row title carries its head").toBe(883);
  });

  it("a face changes if and only if its old plan cut a title or a sub with a dot, or (POLISH-4 P4-4) it is a belt that gives away fewer hit rows in the 3x5 plan (every other own face is drawn exactly as polish3-accepted drew it); A 322 + 68 belts of 2,234 and B 1,078 of 1,809 change", () => {
    const changed = { A: 0, B: 0 };
    for (const f of OWN()) {
      const p = drawnOwn(f, "desk-1920x1080"), old = oldOwn(f, "desk-1920x1080"); // POLISH-4 (P4-5): oldFacePlan plans with `sub1: false`: the reference stays polish3-accepted's plan (a battle face never has the sub1 head either: `wrap`)
      const differs = JSON.stringify(p) !== JSON.stringify(old), wasCut = titleCut(f.t, old) || subCut(f, old);
      const belt = f.kind === "route" && hitRowsGone(p) < hitRowsGone(old); // P4-4: the 3x5 plan, fewer hit rows given away (tests/polish4.beltrows.test.ts)
      expect(differs, `${f.tag}: changes iff it was cut (old: title cut ${titleCut(f.t, old)}, sub cut ${subCut(f, old)}) or is a belt that gives fewer rows away`).toBe(wasCut || belt);
      if (differs) changed[f.corpus]++;
    }
    // BUMP-1H (RULING-BUMP1H-R6 R6.4, the merge with 0.9.15.1): was { A: 322 + 69, B: 1078 }: the 322 cut faces are the same; the belts that take the 3x5 plan are 68 now, not 69. H3 moves it (tests/polish4.beltrows.test.ts, desk-1920x1080 own
    // [76,486,76,258,68], was [77,492,77,261,69]); H2 does not (kit-1h/soft6x.sh: with rivalBuilds.ts alone put back this assertion passes at 322 + 69, and with both files put back the whole file passes at 0.9.15.1's pins).
    expect(changed).toEqual({ A: 322 + 68, B: 1078 });
  });

  it("the six own SPARKFANG faces (turret slot 0, days 8/12/16, both decks) read short once they wrap (the 3x5 plan is 6 px short): with their CLOSE row they take P2's plan, giving away SPEED: LEVEL 2/4. only; POLISH-4 (P4-3) draws them without the row, SPEED drawn too", () => {
    const six = OWN().filter(isSix);
    expect(six.length).toBe(6);
    for (const f of six) {
      const { fa, tp } = viewOf("desk-1920x1080", 0);
      const p = withEnchant(() => p3bFacePlan(f.t, fa, f.fam, tp)); // the face with its CLOSE row: facePlan as POLISH-3b left it
      const bare = drawnOwn(f, "desk-1920x1080");
      expect(bare.bare, `${f.tag}: POLISH-4 P4-3: drawn without the CLOSE row`).toBe(true);
      expect(rulesWhole(bare), `${f.tag}: the rule text whole`).toBe(true);
      expect(abilityLeft(f.t, bare), `${f.tag}: nothing given away`).toEqual([]);
      expect(p.titleRows, f.tag).toEqual(["RISING SCRAP", "CANNON ★"]);
      expect(p.subs, f.tag).toEqual(["HEAVY TURRET IN", "SLOT 1"]);
      expect(p.body.font, f.tag).toBe("3");
      expect(abilityLeft(f.t, p).map((b) => plain(b.text)), f.tag).toEqual(["SPEED: LEVEL 2/4."]);
      expect(rulesWhole(p), f.tag).toBe(false);
    }
  });
});

describe("POLISH-3b P1: where nothing was cut, an own face is drawn as before", () => {
  for (const name of VIEW_NAMES.filter((v) => v !== "desk-1920x1080")) {
    it(`${name}: every own face of A and B is JSON-equal to polish3-accepted's plan${name === "op-402x690" || name === "phone-360x640" ? " (the band is not a column)" : ", except the eight enchanted foundry faces of B whose title was cut with a dot (now two rows)"}`, () => {
      const differ: string[] = [];
      for (const f of OWN()) {
        const p = drawnOwn(f, name), old = oldOwn(f, name);
        if (JSON.stringify(p) === JSON.stringify(old)) continue;
        if (f.kind === "route") { expect(hitRowsGone(p), `${name} ${f.tag}: POLISH-4 P4-4: a belt that moved gives away fewer hit rows`).toBeLessThan(hitRowsGone(old)); continue; }
        differ.push(f.tag);
        expect(titleCut(f.t, old), `${name} ${f.tag}: it was cut with a dot`).toBe(true);
        expect(titleCut(f.t, p) || subCut(f, p), `${name} ${f.tag}: and is not now`).toBe(false);
        expect(p.titleRows, `${name} ${f.tag}`).toBeDefined();
        expect(p.famHead, `${name} ${f.tag}: POLISH-4 P4-1: the family head under the two-row title (it had none)`).not.toBeNull();
      }
      expect(differ, name).toEqual(name === "op-402x690" || name === "phone-360x640" ? [] : B8);
    });
  }

  it("the build screen's desk column is not a battle face: planPanel without `wrap` never makes title rows and still cuts the two longest factory names (tests/enchant1.faces.test.ts :765 stands)", () => {
    const { fa, tp } = viewOf("desk-1920x1080", 0);
    for (const f of OWN()) {
      const plain1 = withEnchant(() => planPanel(f.t, fa.area, f.fam, { tap: tp, band: fa.band, fewer: false }));
      expect(plain1.titleRows, f.tag).toBeUndefined();
      expect(plain1.subs.length, `${f.tag}: a sub breaks only at a ' · ' or '. ' as before`).toBeLessThanOrEqual(2);
      if (f.kind === "turret" && /^HEAVY TURRET IN SLOT/.test(f.t.sub)) expect(plain1.subs, `${f.tag}: the sub is one row, cut with a dot when drawn`).toEqual([f.t.sub]);
    }
    for (const view of ["desk-1280x800", "laptop-1366x768"] as ViewName[]) {
      const v = viewOf(view, 0);
      const cut = OWN().filter((f) => B8.includes(f.tag)).filter((f) => titleCut(f.t, withEnchant(() => planPanel(f.t, v.fa.area, f.fam, { tap: v.tp, band: v.fa.band, fewer: false }))));
      expect(cut.map((f) => f.tag), `${view}: planPanel's plan still cuts them (the build screen's pin)`).toEqual(B8);
    }
  });
});

describe("POLISH-3b P1: an own face's header, drawn", () => {
  it("BattleFaces.draw on side 0: the title on two 3x5 rows (the word's colour on row 1 only), the sub on two rows at y + 19 and y + 25, the body from y + 35", () => {
    withEnchant(() => {
      const day = 8, mine = standInBuild("sparkfang", day), other = newRun("furnace", 4242).build;
      const pickSub = (pw: number, ph: number, p: boolean, scale: number): number => { const g = battleGrid(pw, ph, p); return g.close === scale ? g.sub : 1; };
      const v = viewWithSub(1920, 1080, 1, (pw, ph, p) => battleScale(pw, ph, p), pickSub);
      const L = laneLayout(battleLayout(v.W, v.H, v.portrait));
      const game = { view: v, ui: new UI(), canvas: fresh(v.W, v.H), t: 0, W: v.W, H: v.H, portrait: v.portrait } as unknown as Game;
      const a = new Arena(mine, other, 9, null, undefined, undefined, day);
      const at = turretSlots(mine).findIndex((s) => s.td);
      const bf = new BattleFaces();
      bf.open = { side: 0, sel: { kind: "turret", index: at } };
      game.ui.begin();
      const c = fresh(v.W, v.H);
      bf.draw(G(c), game, a, L, false);
      const last = bf.last!, r = last.r;
      expect(last.title).toBe("RISING SCRAP CANNON ★");
      expect(last.sub, "your own part: no owner in the sub").toBe(`HEAVY TURRET IN SLOT ${at + 1}`);
      const { fa, tp } = viewOf("desk-1920x1080", 0);
      const t = faceText(mine, { kind: "turret", index: at }, null, day)!;
      const plan = facePlan(t, fa, selFamilies(faceRun(mine, day), { kind: "turret", index: at }), tp);
      expect(plan.titleRows).toEqual(["RISING SCRAP", "CANNON ★"]);
      expect(plan.subs).toEqual(["HEAVY TURRET IN", `SLOT ${at + 1}`]);
      // the rows of the header that hold a colour, right of the icon box (x from r.x + 23) and above the body
      const rowsOf = (col: string): number[] => {
        const out: number[] = [];
        for (let y = r.y + 3; y < plan.y - 1; y++) for (let x = r.x + 23; x < r.x + r.w - 3; x++) if ((c.at(x, y) ?? "").toLowerCase() === col.toLowerCase()) { out.push(y - r.y); break; }
        return out;
      };
      const word = ENCHANT_DEFS[t.ench!].color, name = t.color, sub = t.subColor ?? C.slate4;
      expect(rowsOf(word), "the word's colour: row 1 only").toEqual([5, 6, 7, 8, 9]);
      expect(rowsOf(name), "the rest of the title: both rows").toEqual([5, 6, 7, 8, 9, 11, 12, 13, 14, 15]);
      expect(rowsOf(sub), "the sub rows: 19-23, 25-29").toEqual([19, 20, 21, 22, 23, 25, 26, 27, 28, 29]);
      expect(plan.y - r.y, "the body starts under them").toBe(35);
    });
  });
});

describe("POLISH-3b P1: REQ-BFG-089 and REQ-BFG-087 keep", () => {
  // REQ-BFG-087: own faces with a gap under min (gaps.px < gaps.min) after, and at polish3-accepted (A: 72 -> 82 and B: 165 -> 132 at 1920x1080 with POLISH-3b; every other view unchanged).
  // POLISH-4 (P4-1): B 132 -> 162 at 1920x1080: a family head under a two-row title takes a gap slot, and the gap yields to the head (content first, SPACE-1 D3); the real builds (A) stay at 82.
  // POLISH-4 (P4-3): A 82 -> 76 at 1920x1080: the six SPARKFANG turrets drawn without their CLOSE row have the room for their gaps (6 fewer faces under min).
  // BUMP-1H (RULING-BUMP1H-R6 R6.4, the merge with 0.9.15.1): A at 1280x800 57 -> 50 and at 402x690 503 -> 500, now and at polish3-accepted's rules alike (`was`; B does not move). 402x690: H3 (src/sim/rivalBuilds.ts: the eight faces
  // it drops from the two warlord decks), 503 -> 500. 1280x800: H3 +1 (58 with H3 alone) and H2 -8 (src/sim/npcWords.ts: the four Easy captains' day-5 words are BRACED now; 49 with H2 alone): 50.
  // With npcWords.ts and rivalBuilds.ts both put back to bump1h-base every row reads 0.9.15.1's (kit-1h/revert6m.sh, kit-1h/soft6x.sh).
  const UNDER: Record<ViewName, { A: number; B: number; was: { A: number; B: number } }> = {
    "desk-1920x1080": { A: 76, B: 162, was: { A: 72, B: 165 } },
    "laptop-1366x768": { A: 48, B: 83, was: { A: 48, B: 83 } },
    "desk-1280x800": { A: 50, B: 2, was: { A: 50, B: 2 } }, // BUMP-1H: was 57 / 57
    "land-844x390": { A: 106, B: 161, was: { A: 105, B: 161 } }, // POLISH-4 P4-4: +1, a belt that shows more hit rows in the 3x5 plan has a thinner gap
    "op-402x690": { A: 500, B: 644, was: { A: 500, B: 644 } }, // BUMP-1H: was 503 / 503
    // POLISH-6 (P6-1): COPIES prints 1.3, not 1.3333333333333333: the readout's grid rows are one line, not two. At 360x640 six belt faces (tags `A grimhold rivalBuild d12 route0` and d16, `A highspire rivalBuild d12 route2` and d16,
    // `A nettle standInBuild d12 route1` and d16) then fit the 5x7 plan with a 1 px gap (min 3) where they were 3x5 with room, and two (`A nettle rivalBuild d12 route1` and d16) leave the list: 28 -> 32, at polish3-accepted's rules too (`was`).
    "phone-360x640": { A: 32, B: 0, was: { A: 32, B: 0 } },
  };
  for (const name of VIEW_NAMES) {
    it(`${name}: REQ-BFG-089 no battle face draws default rules text (no block flagged note, no flavour, reminder, hint or caveat; own and foe) and REQ-BFG-087 own faces under min gap are ${UNDER[name].was.A} / ${UNDER[name].was.B} -> ${UNDER[name].A} / ${UNDER[name].B} (A / B; a face newly under min is a face that wrapped: content first, SPACE-1 D3)`, () => {
      for (const side of [0, 1] as const) {
        const { fa, tp } = viewOf(name, side);
        for (const f of faces(side === 1).filter((x) => side === 0 || x.corpus === "A")) {
          const p = withEnchant(() => facePlan(f.t, fa, f.fam, tp));
          for (const l of p.body.shown) {
            expect(l.b.note, `${name} ${f.tag}: ${l.b.text}`).toBeUndefined();
            expect(["flavour", "hint", "reminder", "caveat"].includes(l.b.role), `${name} ${f.tag}: ${l.b.role} ${l.b.text}`).toBe(false);
          }
        }
      }
      const under = { A: 0, B: 0 }, was = { A: 0, B: 0 };
      for (const f of OWN()) {
        const p = drawnOwn(f, name), old = oldOwn(f, name);
        const now = !gapsAtLeast(p, p.gaps.min), before = !gapsAtLeast(old, old.gaps.min);
        if (now) under[f.corpus]++;
        if (before) was[f.corpus]++;
        if (now && !before) expect(!!p.titleRows || p.subs.length > 1 || (f.kind === "route" && hitRowsGone(p) < hitRowsGone(old)), `${name} ${f.tag}: newly under min and not wrapped (or a belt that shows more hit rows: POLISH-4 P4-4)`).toBe(true);
      }
      expect({ A: under.A, B: under.B }, `${name}: under min now`).toEqual({ A: UNDER[name].A, B: UNDER[name].B });
      expect(was, `${name}: under min at polish3-accepted`).toEqual(UNDER[name].was);
    });
  }
});
