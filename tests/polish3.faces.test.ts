// POLISH-3 (REQ-BFG-089, REQ-BFG-087; BRIEF-POLISH3 Q2; the pieces lane's display list, item 5): A FOE'S FACE ON A LANDSCAPE VIEW SHOWS ITS TITLE, ITS SUB AND EVERY OWN-ABILITY LINE.
//   Measured over every rival face (rivals x days 5/8/12/16 x the warlord deck and the dusk stand-in x every part: 2,242 faces, 280 of them turrets):
//   (a) the header. At 1920x1080 the battle view is 384x216 game px (x5) and the face column is 100 px, so the sub's room is 73 px. 92 titles (`RISING RAMPART CAN.`) and every turret sub
//       (`HEAVY TURRET IN SL.`: the slot number lost) were cut with a dot. Now a title wider than the room in the 3x5 face breaks at a space onto a second 3x5 row (`RISING RAMPART` / `CANNON ★`:
//       PanelPlan.titleRows, drawn by fitTitleRows) and a sub with no ` · ` or `. ` breaks at a space (`HEAVY TURRET IN` / `SLOT 1`: breakSub, wrapAt); the header grows by those rows (`shift`) and
//       the body starts under it. Only the foe's face (the text with `subOwner`, cap's ruling B): the build screen's desk column keeps tests/enchant1.faces.test.ts :765.
//   (b) own abilities (REQ-BFG-089). Where the column's 5x7 plan cannot show every block, planPanel takes a shorter form of the same 5x7 face (CORE and GEAR rows without their rule lines) although the
//       3x5 face shows the full text: 236 faces at 1920x1080, 183 at 1366x768, 180 at 844x390 (174 of them fixable), 16 at 1280x800. battleScout.ts facePlan draws the 3x5 plan where it is the full text and
//       the 5x7 plan is not.
import { afterEach, describe, expect, it } from "vitest";
import { G, fresh, installRaster } from "./raster.helpers";
import { battleLayout, battleScale, laneLayout, battleGrid } from "../src/game/battleLayout";
import { viewWithSub } from "../src/game/viewGrid";
import { BattleFaces, facePlan, faceArea, faceRun, faceText, type PartSel } from "../src/screens/battleScout";
import { fitTitleRows, gapsAtLeast, planPanel, rulesWhole, selFamilies, visibleLines, wrapAt, type PanelPlan, type PanelText } from "../src/screens/build/inspector";
import { turretSlots, type Build } from "../src/sim/deck";
import { ENCHANT, ENCHANT_DEFS, setEnchant, withEnchant } from "../src/sim/enchant";
import { RIVAL_IDS, RIVALS, rivalBuild, rivalDays, standInBuild, type RivalId } from "../src/sim/rivals";
import { Arena } from "../src/game/arena";
import { newRun } from "../src/game/run";
import { tapPx } from "../src/ui/tap";
import { UI } from "../src/ui/ui";
import { textWidth } from "../src/render/font";
import { C } from "../src/render/palette";
import type { Game } from "../src/game/game";

installRaster();
afterEach(() => setEnchant(ENCHANT));

const DAYS = [5, 8, 12, 16];
type Maker = "rivalBuild" | "standInBuild";
const MAKERS: Record<Maker, (id: RivalId, day: number) => Build> = { rivalBuild, standInBuild };
const VIEWS = {
  "desk-1920x1080": [1920, 1080, 1], "desk-1280x800": [1280, 800, 1], "laptop-1366x768": [1366, 768, 1], "land-844x390": [844, 390, 3], "op-402x690": [402, 690, 3], "phone-360x640": [360, 640, 3],
} as const;
type ViewName = keyof typeof VIEWS;
const pickSub = (pw: number, ph: number, p: boolean, scale: number): number => { const g = battleGrid(pw, ph, p); return g.close === scale ? g.sub : 1; };

function parts(b: Build): PartSel[] {
  const out: PartSel[] = b.items.map((p) => ({ kind: "item", uid: p.uid }) as PartSel);
  turretSlots(b).forEach((s, i) => { if (s.td) out.push({ kind: "turret", index: i }); });
  b.routes.forEach((_, i) => out.push({ kind: "route", index: i }));
  return out;
}

interface Face { tag: string; sel: PartSel; t: PanelText; fam: ReturnType<typeof selFamilies>; p0: PanelPlan; p: PanelPlan; small: PanelPlan }
const cache = new Map<ViewName, { fa: ReturnType<typeof faceArea>; tp: number; faces: Face[] }>();
/** Every rival face on the view `name`: the text as the foe's face draws it, the plan planPanel makes (p0), the plan the face is drawn from (facePlan: p) and the 3x5 plan (small). */
function corpus(name: ViewName) {
  const hit = cache.get(name);
  if (hit) return hit;
  return withEnchant(() => {
    const [w, h, dpr] = VIEWS[name];
    const v = viewWithSub(w, h, dpr, (pw, ph, p) => battleScale(pw, ph, p), pickSub);
    const L = laneLayout(battleLayout(v.W, v.H, v.portrait)), fa = faceArea(L, 1), tp = tapPx(v);
    const faces: Face[] = [];
    for (const id of RIVAL_IDS) for (const maker of Object.keys(MAKERS) as Maker[]) for (const day of DAYS.filter((d) => rivalDays(id, 16).includes(d))) {
      const b = MAKERS[maker](id, day), owner = RIVALS[id].name;
      for (const sel of parts(b)) {
        const fam = selFamilies(faceRun(b, day), sel);
        const t = faceText(b, sel, "THIS FIGHT: 7422 DAMAGE IN 8 SHOTS.", day, owner)!;
        faces.push({
          tag: `${name} ${id} ${maker} d${day} ${sel.kind}${"index" in sel ? sel.index : "uid" in sel ? sel.uid : ""}`, sel, t, fam,
          p0: planPanel(t, fa.area, fam, { tap: tp, band: fa.band }), p: facePlan(t, fa, fam, tp), small: planPanel(t, fa.area, fam, { tap: tp, band: fa.band, small: true }),
        });
      }
    }
    const out = { fa, tp, faces };
    cache.set(name, out);
    return out;
  });
}

/** The sub rows drawOn hands fitHead: the variant's own, else the planner's rows, else the short form where the whole one is wider than the room, else the sub. */
const drawnSubs = (t: PanelText, p: PanelPlan): string[] => (p.body.sub ? [p.body.sub] : p.subs.length > 1 ? p.subs : [t.subShort && textWidth(t.sub, "3") > p.subMax ? t.subShort : t.sub]);
/** The title rows drawOn draws: planOnce's two 3x5 rows, else the one row fitTitle draws (the 5x7 face where it fits the room, else the 3x5 face, cut with a dot where that is wider). */
const titleRowsOf = (t: PanelText, p: PanelPlan): string[] => (p.titleRows ? [...p.titleRows] : [t.title]);
const titleCut = (t: PanelText, p: PanelPlan): boolean => (p.titleRows ? p.titleRows.join(" ") !== t.title || p.titleRows.some((r) => textWidth(r, "3") > p.subMax) : textWidth(t.title) > p.subMax && textWidth(t.title, "3") > p.subMax);

describe("POLISH-3 Q2 (a): wrapAt breaks a title or a sub at a space, never before a count or a level", () => {
  it("the foe's turret sub and a long title, in the 100 px column's 73 px", () => {
    expect(wrapAt("HEAVY TURRET IN SLOT 1", 73)).toEqual(["HEAVY TURRET IN", "SLOT 1"]);
    expect(wrapAt("RISING RAMPART CANNON ★", 73)).toEqual(["RISING RAMPART", "CANNON ★"]);
    expect(wrapAt("RISING RAMPART CANNON ★★", 73)).toEqual(["RISING RAMPART", "CANNON ★★"]);
    expect(wrapAt("RISING SCRAP CANNON ★", 73)).toEqual(["RISING SCRAP", "CANNON ★"]);
  });
  it("never a break before a number or a run of stars; null where no break gives two rows that fit", () => {
    expect(wrapAt("SLOT 1", 20)).toBeNull(); // SLOT and 1 stay together, and 20 px holds neither word with its number
    expect(wrapAt("CANNON ★", 30)).toBeNull(); // the star stays with its word
    expect(wrapAt("AAAAAAAAAAAAAAAAAAAAAAAAAAAAAA BBBBBBBBBBBBBBBBBBBBBBBBBBBBBB", 73)).toBeNull(); // the second row would not fit
    expect(wrapAt("ONEWORDONLY", 20)).toBeNull();
    const w = wrapAt("HEAVY TURRET IN SLOT 12", 73)!;
    expect(w[1]).toBe("SLOT 12");
  });
  it("both rows fit the room, and the words are the string's own (a space between them)", () => {
    for (const s of ["HEAVY TURRET IN SLOT 1", "RISING RAMPART CANNON ★", "ECHOING TWIN MOULD ★★", "FACTORY BELTS 1/2 AND SOME MORE WORDS"]) {
      const r = wrapAt(s, 73);
      if (!r) continue;
      expect(r.join(" ")).toBe(s);
      expect(r.every((x) => textWidth(x, "3") <= 73)).toBe(true);
    }
  });
});

describe("POLISH-3 Q2 (a): at 1920x1080 no face's title or sub is cut with a dot", () => {
  it("every rival face: the title whole (one row, or two 3x5 rows that say it all), every sub row within the room, the star and the slot number shown", () => {
    const { faces, fa } = corpus("desk-1920x1080");
    expect(fa.area.w, "the face column of the 1920x1080 desk").toBe(100);
    let wrapped = 0, turrets = 0, rows3 = 0;
    for (const f of faces) {
      expect(titleCut(f.t, f.p), `${f.tag}: title ${f.t.title}`).toBe(false);
      expect(drawnSubs(f.t, f.p).some((s) => textWidth(s, "3") > f.p.subMax), `${f.tag}: sub ${JSON.stringify(drawnSubs(f.t, f.p))}`).toBe(false);
      if (f.p.titleRows) {
        wrapped++;
        if (/★+$/.test(f.t.title)) expect(/ ★+$/.test(f.p.titleRows[1]), `${f.tag}: the star is on the second row (${f.p.titleRows[1]})`).toBe(true);
        expect(f.p.titleRows[0].length > 0 && f.p.titleRows[1].length > 0, `${f.tag}: no empty row`).toBe(true);
      }
      if (f.sel.kind === "turret") {
        turrets++;
        const slot = /SLOT \d+$/.exec(f.t.sub)![0];
        expect(f.p.subs[f.p.subs.length - 1].endsWith(slot), `${f.tag}: the slot number on the last sub row (${JSON.stringify(f.p.subs)})`).toBe(true);
        expect(f.p.subs.join(" "), `${f.tag}: the sub's words, whole`).toBe(f.t.sub);
      }
      if (f.p.subs.length > 2) rows3++;
    }
    expect(faces.length).toBe(2242);
    expect(turrets).toBe(280);
    expect(wrapped, "the 92 titles that were cut with a dot are wrapped now").toBe(92);
    expect(rows3).toBeGreaterThan(1400);
  });

  it("the header takes the rows it grew by (shift), and the body starts under the last sub row with the same clear rows as every header", () => {
    const { faces } = corpus("desk-1920x1080");
    let n = 0;
    for (const f of faces) {
      const p = f.p, subShift = p.subs.length > 1 ? 4 + 6 * (p.subs.length - 2) : 0;
      expect(p.shift, f.tag).toBe(subShift + (p.titleRows ? 6 : 0));
      expect(p.y, f.tag).toBe(p.r.y + 25 + p.shift - (p.body.tight ? 1 : 0));
      // the sub rows start at y + 13 (y + 19 under a two-row title) and go down by 6; the last one ends 5 px lower; the body starts after it
      const lastSubEnd = p.r.y + 13 + (p.titleRows ? 6 : 0) + 6 * (p.subs.length - 1) + 5;
      expect(p.y - lastSubEnd, `${f.tag}: clear rows between the header and the body`).toBeGreaterThanOrEqual(3);
      expect(p.r.y + p.r.h, `${f.tag}: the panel is inside the column`).toBeLessThanOrEqual(f.p.r.y + f.p.r.h);
      if (p.titleRows) { n++; expect(p.famHead, `${f.tag}: a two-row title has no family head`).toBeNull(); }
    }
    expect(n).toBe(92);
  });

  it("only the foe's face wraps: the same text without its `subOwner` (the build screen's desk column, an own part's face) plans as before, with no title rows", () => {
    const { faces, fa } = corpus("desk-1920x1080");
    for (const f of faces.slice(0, 600)) {
      const plain = planPanel({ ...f.t, subOwner: undefined }, fa.area, [], {});
      expect(plain.titleRows, f.tag).toBeUndefined();
    }
  });

  it("the face's header, drawn: row 1 and row 2 of a two-row title, the word's colour on row 1 only, then three sub rows (6 px lower), then the body", () => {
    withEnchant(() => {
      const day = 8, foe = standInBuild("sparkfang", day), mine = newRun("furnace", 4242).build;
      const v = viewWithSub(1920, 1080, 1, (pw, ph, p) => battleScale(pw, ph, p), pickSub);
      const L = laneLayout(battleLayout(v.W, v.H, v.portrait));
      const game = { view: v, ui: new UI(), canvas: fresh(v.W, v.H), t: 0, W: v.W, H: v.H, portrait: v.portrait } as unknown as Game;
      const a = new Arena(mine, foe, 9, null, undefined, undefined, day);
      const at = turretSlots(foe).findIndex((s) => s.td);
      const faces = new BattleFaces();
      faces.open = { side: 1, sel: { kind: "turret", index: at } };
      game.ui.begin();
      const c = fresh(v.W, v.H);
      faces.draw(G(c), game, a, L, false, "SPARKFANG");
      const last = faces.last!, r = last.r;
      expect(last.title).toBe("RISING SCRAP CANNON ★");
      expect(last.sub).toBe(`SPARKFANG'S HEAVY TURRET IN SLOT ${at + 1}`);
      const { fa, tp } = corpus("desk-1920x1080");
      const t = faceText(foe, { kind: "turret", index: at }, null, day, "SPARKFANG")!;
      const plan = facePlan(t, fa, selFamilies(faceRun(foe, day), { kind: "turret", index: at }), tp);
      expect(plan.titleRows).toEqual(["RISING SCRAP", "CANNON ★"]);
      expect(plan.subs).toEqual(["SPARKFANG'S", "HEAVY TURRET IN", `SLOT ${at + 1}`]);
      // the rows of the header that hold a colour, right of the icon box (x from r.x + 23) and above the body
      const rowsOf = (col: string): number[] => {
        const out: number[] = [];
        for (let y = r.y + 3; y < plan.y - 1; y++) for (let x = r.x + 23; x < r.x + r.w - 3; x++) if ((c.at(x, y) ?? "").toLowerCase() === col.toLowerCase()) { out.push(y - r.y); break; }
        return out;
      };
      const word = ENCHANT_DEFS[t.ench!].color, name = t.color, sub = t.subColor ?? C.slate4;
      expect(rowsOf(word), "the word's colour: row 1 only").toEqual([5, 6, 7, 8, 9]);
      expect(rowsOf(name), "the rest of the title: both rows").toEqual([5, 6, 7, 8, 9, 11, 12, 13, 14, 15]);
      expect(rowsOf(sub), "the sub rows: 19-23, 25-29, 31-35").toEqual([19, 20, 21, 22, 23, 25, 26, 27, 28, 29, 31, 32, 33, 34, 35]);
      expect(plan.y - r.y, "the body starts under them").toBe(41);
    });
  });
});

describe("POLISH-3 Q2 (b): a face keeps every one of its own rule lines wherever the 3x5 face shows them", () => {
  const SIX = ["sparkfang rivalBuild d8 turret0", "sparkfang rivalBuild d12 turret0", "sparkfang rivalBuild d16 turret0", "sparkfang standInBuild d8 turret0", "sparkfang standInBuild d12 turret0", "sparkfang standInBuild d16 turret0"];
  for (const name of ["desk-1920x1080", "laptop-1366x768", "land-844x390", "desk-1280x800"] as ViewName[]) {
    it(`${name}: every face whose 3x5 plan is the full text is drawn full (no rule line of a CORE or a GEAR given way); the rest is the one turret named below`, () => {
      const { faces } = corpus(name);
      const left = faces.filter((f) => !rulesWhole(f.p));
      expect(left.filter((f) => rulesWhole(f.small)).map((f) => f.tag), "a face drawn short although the 3x5 plan is whole").toEqual([]);
      // the faces neither face can show whole: SPARKFANG's turret with its SPEED level line (6 faces at 1920x1080 and at 844x390; its 3x5 plan is 6 px short in a 100 px column once the header wraps), none elsewhere
      expect(left.map((f) => f.tag.replace(`${name} `, "")), name).toEqual(name === "desk-1920x1080" || name === "land-844x390" ? SIX : []);
      // no ability sentence is given way in the plan a face draws wherever the 3x5 plan has them all
      for (const f of faces) if (rulesWhole(f.small)) expect(f.p.body.dropped.some((b) => b.role === "ability"), f.tag).toBe(false);
    });
  }

  it("the faces planPanel's plan gave a rule line away: the brief measured 236 at 1920x1080, 183 at 1366x768, 16 at 1280x800 and 180 at 844x390; the 3x5 plan restores every one it can show whole", () => {
    // 1920x1080: 236 before the header wrapped, 296 with it (the taller header takes room from the 5x7 plan too), 273 once Q3's rung (planRung) gives belt faces the 3x5 face; 1366x768: 183, 180 with the
    // rung (three belt faces); 1280x800 (16) and 844x390 (180) as at the base
    const FLOOR: Record<string, number> = { "desk-1920x1080": 236, "laptop-1366x768": 180, "desk-1280x800": 16, "land-844x390": 177 };
    const got: Record<string, [number, number, number]> = {};
    for (const name of Object.keys(FLOOR) as ViewName[]) {
      const short = corpus(name).faces.filter((f) => !rulesWhole(f.p0));
      const stuck = short.filter((f) => !rulesWhole(f.p));
      expect(short.length, `${name}: faces short in planPanel's plan`).toBeGreaterThanOrEqual(FLOOR[name]);
      expect(stuck.every((f) => !rulesWhole(f.small)), `${name}: what stays short is short in the 3x5 face too`).toBe(true);
      got[name] = [short.length, short.length - stuck.length, stuck.length];
    }
    console.log(`POLISH-3 Q2 (b): faces short in planPanel's plan, restored by the 3x5 plan, still short: ${JSON.stringify(got)}`);
  });

  it("a swapped face is the full text where the plan it replaced was not (content first: SPACE-1 D3, the gap yields); at 1366x768 and 1280x800 every swapped face's gaps are at least min", () => {
    // the faces whose full text in the 3x5 face leaves less room than min for their gaps (they had less than the 5x7 form's min before, too): 10 at 1920x1080 (0 px), 12 at 844x390 (1 px)
    const LOW: Record<string, number> = { "desk-1920x1080": 10, "laptop-1366x768": 0, "land-844x390": 12, "desk-1280x800": 0 };
    for (const name of Object.keys(LOW) as ViewName[]) {
      let low = 0, n = 0;
      for (const f of corpus(name).faces) {
        if (f.p === f.p0 || JSON.stringify(f.p) === JSON.stringify(f.p0)) continue; // planPanel's own plan
        if ((name === "desk-1920x1080" || name === "land-844x390") && SIX.includes(f.tag.replace(`${name} `, ""))) { // POLISH-3b (P2, the review's N1): the one turret neither plan shows whole is drawn from the 3x5 plan, which gives away fewer ability blocks (tests/polish3b.sparkfang.test.ts)
          expect(rulesWhole(f.p) || rulesWhole(f.small), `${f.tag}: neither plan is the full text`).toBe(false);
          expect(JSON.stringify(f.p), `${f.tag}: the 3x5 plan`).toBe(JSON.stringify(f.small));
          continue;
        }
        n++;
        expect(rulesWhole(f.p) && !rulesWhole(f.p0), `${f.tag}: the 3x5 plan is the full text and the 5x7 plan was not`).toBe(true);
        if (!gapsAtLeast(f.p, f.p.gaps.min)) low++;
      }
      expect(n, name).toBeGreaterThan(0);
      expect(low, `${name}: swapped faces with gaps under min`).toBe(LOW[name]);
    }
  });

  it("Q3's desk rung (inspector.ts planRung) moves only belt faces: every other face's plan is the same with and without it; a belt face moves only where its 5x7 plan gave hit rows away", () => {
    for (const name of ["desk-1920x1080", "laptop-1366x768", "land-844x390", "desk-1280x800", "op-402x690", "phone-360x640"] as ViewName[]) {
      const { fa, tp, faces } = corpus(name);
      let moved = 0, belts = 0;
      for (const f of faces) {
        const on = planPanel(f.t, fa.area, f.fam, { tap: tp, band: fa.band }), off = planPanel(f.t, fa.area, f.fam, { tap: tp, band: fa.band, rung: false });
        if (f.sel.kind === "route") belts++;
        if (JSON.stringify(on) === JSON.stringify(off)) continue;
        moved++;
        expect(f.sel.kind, `${f.tag}: a plan the rung moved is a belt's`).toBe("route");
        expect(off.body.dropped.some((b) => b.trim && !b.join), `${f.tag}: it gave hit rows away`).toBe(true);
        expect(on.body.font, `${f.tag}: the rung is the 3x5 face`).toBe("3");
        expect(on.body.dropped.some((b) => b.trim && !b.join), `${f.tag}: and keeps every row`).toBe(false);
      }
      if (name === "op-402x690" || name === "phone-360x640") expect(moved, `${name}: the band is not a column`).toBe(0);
      else expect(moved, `${name}: belt faces the rung moved (of ${belts})`).toBeGreaterThan(0);
    }
  });

  it("402x690 and 360x640 (the band) are planPanel's plan as before; 1366x768, 1280x800 and 844x390 wrap no header (their column holds the sub)", () => {
    for (const name of ["op-402x690", "phone-360x640"] as ViewName[]) for (const f of corpus(name).faces) expect(JSON.stringify(f.p), f.tag).toBe(JSON.stringify(f.p0));
    for (const name of ["desk-1280x800", "laptop-1366x768", "land-844x390"] as ViewName[]) for (const f of corpus(name).faces) {
      expect(f.p.titleRows, f.tag).toBeUndefined();
      expect(f.p.subs.length, f.tag).toBeLessThanOrEqual(2);
      expect(titleCut(f.t, f.p) || drawnSubs(f.t, f.p).some((s) => textWidth(s, "3") > f.p.subMax), f.tag).toBe(false);
    }
  });

  it("the plan a face draws is visible whole: every line of the kept blocks is drawn, on every view", () => {
    for (const name of Object.keys(VIEWS) as ViewName[]) for (const f of corpus(name).faces) {
      const drawn = new Set(visibleLines(f.p).map((v) => v.line));
      expect(f.p.body.fits, f.tag).toBe(true);
      expect(f.p.body.shown.filter((l) => l.b.keep).every((l) => l.lines.every((ln) => drawn.has(ln))), f.tag).toBe(true);
    }
  });
});

describe("POLISH-3 Q2: fitTitleRows draws the two rows in fitTitle's colours", () => {
  it("a plain title: both rows in its colour, 3x5, row 2 six px under row 1; an enchanted one: its word first in the word's colour", () => {
    const c = fresh(120, 40);
    fitTitleRows(G(c), { title: "RAMPART CANNON FRAME ★", color: C.bone }, 3, 4, ["RAMPART CANNON", "FRAME ★"]);
    const rows = (col: string): number[] => { const o: number[] = []; for (let y = 0; y < 40; y++) for (let x = 0; x < 120; x++) if (c.at(x, y) === col) { o.push(y); break; } return o; };
    expect(rows(C.bone)).toEqual([5, 6, 7, 8, 9, 11, 12, 13, 14, 15]);
    const e = withEnchant(() => {
      const c2 = fresh(120, 40);
      const word = ENCHANT_DEFS.rising.color;
      fitTitleRows(G(c2), { title: "RISING SCRAP CANNON ★", color: C.bone, ench: "rising" }, 3, 4, ["RISING SCRAP", "CANNON ★"]);
      const rs = (col: string): number[] => { const o: number[] = []; for (let y = 0; y < 40; y++) for (let x = 0; x < 120; x++) if (c2.at(x, y) === col) { o.push(y); break; } return o; };
      return { word: rs(word), name: rs(C.bone) };
    }, true);
    expect(e.word).toEqual([5, 6, 7, 8, 9]);
    expect(e.name).toEqual([5, 6, 7, 8, 9, 11, 12, 13, 14, 15]);
  });
});
