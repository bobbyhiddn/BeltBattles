// ENCHANT-2W (REQ-BFG-085; BRIEF-ENCHANT2W W5, E2-02's WHOSE rider, 4 of 6): A RIVAL'S PART PANEL SAYS WHOSE PART IT IS.
//   On a FOE's part panel (VIEW BATTLEFIELD's foe side, the build screen's scouted foe) the sub line names the owner: `SPARKFANG'S HEAVY TURRET IN SLOT 1`. Your own parts' panels
//   (VIEW BATTLEFIELD's side 0, the build screen, the text sheet) do not change. Kept text whole on every view: the sub line is never cut and the owner never given way: where the
//   desk column is too narrow for the whole sub, planPanel puts the owner on a line of its own and the sub under it (PanelText.subOwner).
import { afterEach, describe, expect, it, vi } from "vitest";
import { G, fresh, installRaster } from "./raster.helpers";
import { battleLayout, battleScale, laneLayout, battleGrid } from "../src/game/battleLayout";
import { viewWithSub } from "../src/game/viewGrid";
import { BattleFaces, faceArea, faceRun, faceText, ownerSub, type PartSel } from "../src/screens/battleScout";
import { keptWhole, planPanel, selFamilies, type PanelPlan, type PanelText } from "../src/screens/build/inspector";
import { FoeView, foePartsOnScreen, scoutedFoe } from "../src/screens/build/foeView";
import { buildLayout, buildScale, phoneBarLift, phoneScreen, type BuildLayout } from "../src/screens/build/layout";
import type { BuildScreen } from "../src/screens/build/build";
import { runeRowFits, runeRowH, shiftLayout } from "../src/ui/runeBar";
import { turretSlots, type Build } from "../src/sim/deck";
import { ENCHANT, setEnchant, withEnchant } from "../src/sim/enchant";
import { RIVAL_IDS, RIVALS, rivalBuild, rivalDays, standInBuild, type RivalId } from "../src/sim/rivals";
import { Arena } from "../src/game/arena";
import { newRun, type Run } from "../src/game/run";
import { makeEvent, pickChoice } from "../src/game/events";
import { TAP_CSS, tapPx } from "../src/ui/tap";
import { UI } from "../src/ui/ui";
import { textWidth } from "../src/render/font";
import type { Game } from "../src/game/game";

installRaster();
afterEach(() => setEnchant(ENCHANT));

const DAYS = [5, 8, 12, 16];
type Maker = "rivalBuild" | "standInBuild";
const MAKERS: Record<Maker, (id: RivalId, day: number) => Build> = { rivalBuild, standInBuild };

/** Every part of a build a face opens on: its items, its installed turrets (by slot index) and its belt routes. */
function parts(b: Build): PartSel[] {
  const out: PartSel[] = b.items.map((p) => ({ kind: "item", uid: p.uid }) as PartSel);
  turretSlots(b).forEach((s, i) => { if (s.td) out.push({ kind: "turret", index: i }); });
  b.routes.forEach((_, i) => out.push({ kind: "route", index: i }));
  return out;
}

/** The sub lines battleScout.ts drawOn hands fitHead (planned the way drawOn plans it): the variant's, else the planner's broken lines, else the short form where the whole one is wider than the room, else the sub. */
function drawnSubs(t: PanelText, plan: PanelPlan): string[] {
  if (plan.body.sub) return [plan.body.sub];
  if (plan.subs.length > 1) return plan.subs;
  return [t.subShort && textWidth(t.sub, "3") > plan.subMax ? t.subShort : t.sub];
}
/** Is any drawn sub line wider than the room fitHead has (it would be cut with a dot)? */
const cutSub = (t: PanelText, plan: PanelPlan): boolean => drawnSubs(t, plan).some((s) => textWidth(s, "3") > plan.subMax);

const VIEWS: [string, number, number, number][] = [["phone-390x844", 390, 844, 3], ["op-402x690", 402, 690, 3], ["land-844x390", 844, 390, 3], ["desk-1920x1080", 1920, 1080, 1], ["desk-1280x800", 1280, 800, 1], ["laptop-1366x768", 1366, 768, 1]];
const pickSub = (pw: number, ph: number, p: boolean, scale: number): number => { const g = battleGrid(pw, ph, p); return g.close === scale ? g.sub : 1; };

describe("W5: faceText(build, sel, line, day, owner) names the owner in the sub line, and only there", () => {
  it("the sub (and its short form) is `OWNER'S <the sub>`; every other field of the face is the face without an owner; no owner: exactly the face as before", () => {
    withEnchant(() => {
      let n = 0;
      for (const id of RIVAL_IDS) for (const maker of Object.keys(MAKERS) as Maker[]) {
        const day = 12, b = MAKERS[maker](id, day), owner = RIVALS[id].name;
        for (const sel of parts(b)) {
          const plain = faceText(b, sel, null, day)!, own = faceText(b, sel, null, day, owner)!;
          expect(own.sub, `${id} ${maker} ${JSON.stringify(sel)}`).toBe(`${owner}'S ${plain.sub}`);
          expect(own.sub).toBe(ownerSub(owner, plain.sub));
          expect(own.subShort, `${id} ${maker}: the short form too`).toBe(plain.subShort === undefined ? undefined : `${owner}'S ${plain.subShort}`);
          const unowned = { ...own, sub: plain.sub, subShort: plain.subShort, subOwner: undefined, variants: own.variants?.map((v) => ({ ...v, sub: v.sub?.replace(`${owner}'S `, "") })) };
          expect(unowned, `${id} ${maker}: nothing else moves`).toEqual(plain);
          expect(own.subOwner, `${id} ${maker}`).toBe(`${owner}'S`);
          expect(plain.subOwner).toBeUndefined();
          expect(JSON.stringify(faceText(b, sel, null, day, undefined)), "no owner: as before").toBe(JSON.stringify(plain));
          expect(JSON.stringify(faceText(b, sel, null, day)), "no owner argument: as before").toBe(JSON.stringify(plain));
          n++;
        }
      }
      expect(n).toBeGreaterThan(500);
    });
  });

  it("the example of the brief: SPARKFANG's installed turret reads `SPARKFANG'S HEAVY TURRET IN SLOT 1`", () => {
    withEnchant(() => {
      const b = standInBuild("sparkfang", 8);
      const at = turretSlots(b).findIndex((s) => s.td);
      const t = faceText(b, { kind: "turret", index: at }, null, 8, RIVALS.sparkfang.name)!;
      expect(t.sub).toBe(`SPARKFANG'S HEAVY TURRET IN SLOT ${at + 1}`);
      console.log(`ENCHANT-2W W5 example: ${t.sub}`);
    });
  });

  it("the rivals' names are at most 14 characters (rivals.ts): the longest possessive fits the narrowest face's sub room (a 100 px column: 73 px), and a ghost's name (10 characters at most) too", () => {
    const longest = Math.max(...RIVAL_IDS.map((id) => textWidth(`${RIVALS[id].name}'S`, "3")));
    expect(longest).toBeLessThanOrEqual(100 - 27);
    expect(textWidth("ABCDEFGHIJ'S", "3")).toBeLessThanOrEqual(100 - 27);
  });
});

describe("W5: the face keeps its text whole with the owner on every view; the sub line is drawn uncut and the owner is its first word", () => {
  it("every rival x day x deck x part x view: kept text whole wherever the plain face's is, no sub cut that the plain face did not cut, the owner first and whole", () => {
    withEnchant(() => {
      const rows: string[] = [];
      const bad: string[] = [];
      for (const [name, w, h, dpr] of VIEWS) {
        const v = viewWithSub(w, h, dpr, (pw, ph, p) => battleScale(pw, ph, p), pickSub);
        const L = laneLayout(battleLayout(v.W, v.H, v.portrait)), fa = faceArea(L, 1), tp = tapPx(v);
        let faces = 0, notKept = 0, notKeptPlain = 0, cut = 0, cutPlain = 0, moreLost = 0, owners = 0, owned = 0, two = 0;
        for (const id of RIVAL_IDS) for (const maker of Object.keys(MAKERS) as Maker[]) for (const day of DAYS.filter((d) => rivalDays(id, 16).includes(d))) {
          const b = MAKERS[maker](id, day), owner = RIVALS[id].name;
          for (const sel of parts(b)) {
            const run = faceRun(b, day), fam = selFamilies(run, sel);
            const t0 = faceText(b, sel, null, day)!, t1 = faceText(b, sel, null, day, owner)!;
            const p0 = planPanel(t0, fa.area, fam, { tap: tp, band: fa.band }), p1 = planPanel(t1, fa.area, fam, { tap: tp, band: fa.band });
            faces++;
            const tag = `${name} ${id} ${maker} d${day} ${JSON.stringify(sel)}`;
            if (!keptWhole(p0)) notKeptPlain++;
            if (!keptWhole(p1)) { notKept++; if (keptWhole(p0)) bad.push(`${tag}: kept whole without the owner, not with it`); }
            if (cutSub(t0, p0)) cutPlain++;
            if (cutSub(t1, p1)) { cut++; if (!cutSub(t0, p0)) bad.push(`${tag}: the owner's sub is cut, the plain one was not`); }
            const lines = drawnSubs(t1, p1);
            if (lines[0].startsWith(`${owner}'S`) && textWidth(`${owner}'S`, "3") <= p1.subMax) owners++; else bad.push(`${tag}: the owner is not first and whole (${lines[0]})`);
            if (p1.subs.length > 1 && !p1.body.sub) two++;
            if (lines.join(" ").replace(/ ·$/, "").startsWith(`${owner}'S`)) owned++;
            const d1 = p1.body.dropped.filter((x) => x.role === "ability").length, d0 = p0.body.dropped.filter((x) => x.role === "ability").length;
            if (d1 > d0) moreLost++;
          }
        }
        rows.push(`${name}: ${faces} faces, kept whole ${faces - notKept} (plain ${faces - notKeptPlain}), sub uncut ${faces - cut} (plain ${faces - cutPlain}), owner first and whole ${owners}, owner on a line of its own ${two}, ${moreLost} lose more optional ability lines than the plain face`);
      }
      console.log(`ENCHANT-2W W5 fit by view (rivals x days 5/8/12/16 x warlord deck and dusk stand-in x every part):\n${rows.join("\n")}`);
      expect(bad.slice(0, 8)).toEqual([]);
      expect(rows.length).toBe(VIEWS.length);
    });
  });

  it("a part whose plain sub already needs its short form (a belt route's, a rig's) keeps it with the owner in front: the short form names the owner too", () => {
    withEnchant(() => {
      let shorts = 0;
      for (const id of RIVAL_IDS) {
        const b = standInBuild(id, 12), owner = RIVALS[id].name;
        for (const sel of parts(b)) {
          const plain = faceText(b, sel, null, 12)!, own = faceText(b, sel, null, 12, owner)!;
          if (plain.subShort) { shorts++; expect(own.subShort).toBe(`${owner}'S ${plain.subShort}`); }
          for (const [i, v] of (plain.variants ?? []).entries()) if (v.sub) expect(own.variants![i].sub).toBe(`${owner}'S ${v.sub}`);
        }
      }
      expect(shorts).toBeGreaterThan(50);
    });
  });
});

// ------------------------------------------------------------------------------------------------------------ the two screens that draw a foe's faces

class MapStore { m = new Map<string, string>(); get length() { return this.m.size; } key(i: number) { return [...this.m.keys()][i] ?? null; } getItem(k: string) { return this.m.has(k) ? this.m.get(k)! : null; } setItem(k: string, v: string) { this.m.set(k, String(v)); } removeItem(k: string) { this.m.delete(k); } clear() { this.m.clear(); } }

describe("W5 on the screens: VIEW BATTLEFIELD's foe side and the scouted foe say whose part it is; your own side does not", () => {
  it("BattleFaces.draw: a face on side 1 (the foe) names its owner; the same part opened on side 0 (yours) is the plain face; no foe name given: plain on both", () => {
    withEnchant(() => {
      const day = 8, foe = standInBuild("sparkfang", day), mine = newRun("furnace", 4242).build;
      const v = viewWithSub(402, 690, 3, (pw, ph, p) => battleScale(pw, ph, p), pickSub);
      const game = { view: v, ui: new UI(), canvas: fresh(v.W, v.H), t: 0, W: v.W, H: v.H, portrait: v.portrait } as unknown as Game;
      const L = laneLayout(battleLayout(v.W, v.H, v.portrait));
      const a = new Arena(mine, foe, 9, null, undefined, undefined, day);
      const at = turretSlots(foe).findIndex((s) => s.td), mineAt = turretSlots(mine).findIndex((s) => s.td);
      const faces = new BattleFaces();
      const draw = (side: 0 | 1, index: number, owner?: string): string => {
        faces.open = { side, sel: { kind: "turret", index } };
        game.ui.begin();
        faces.draw(G(fresh(v.W, v.H)), game, a, L, true, owner);
        expect(faces.last, `side ${side}: the face drew`).toBeTruthy();
        return faces.last!.sub;
      };
      expect(draw(1, at, "SPARKFANG")).toBe(`SPARKFANG'S HEAVY TURRET IN SLOT ${at + 1}`);
      expect(draw(0, mineAt, "SPARKFANG"), "your own part: the plain sub").toBe(draw(0, mineAt));
      expect(draw(0, mineAt, "SPARKFANG")).not.toContain("SPARKFANG");
      expect(draw(1, at), "no foe name: the plain sub").toBe(`HEAVY TURRET IN SLOT ${at + 1}`);
    });
  });

  it("FoeView (the scouted foe, a SCOUT stop's SPY): every part's face says whose it is: the foe's name first", () => {
    vi.stubGlobal("localStorage", new MapStore());
    try {
      withEnchant(() => {
        const run = newRun("furnace", 4242);
        run.day = 8;
        run.gold = 9;
        run.event = makeEvent(run.seed, run.day, "scout");
        run.stage = "event";
        expect(pickChoice(run, 2).ok).toBe(true);
        run.stage = "refit";
        const foe = scoutedFoe(run)!;
        expect(foe).not.toBeNull();
        const gcd = (x: number, y: number): number => (y ? gcd(y, x % y) : x);
        const [w, h, dpr] = [402, 690, 3], pw = w * dpr, ph = h * dpr, portrait = ph > pw * 1.05;
        const fake = { run: { build: { runes: [{ id: "many_hands" }] } }, refit: false, offers: () => Array.from({ length: 5 }) } as unknown as Parameters<typeof runeRowFits>[0];
        let S = buildScale(pw, ph, portrait, dpr);
        while (S > 1 && !runeRowFits(fake, pw, ph, portrait, S, dpr)) S--;
        const isPh = phoneScreen(pw, ph, dpr), phone = portrait && isPh, tap = isPh ? Math.ceil(TAP_CSS / (S / dpr)) : 0;
        const W = Math.floor(pw / S), H = Math.floor(ph / S), vv = { scale: S, dpr };
        const lay = (unit: number): BuildLayout => {
          const row = runeRowH(vv, 1), lift = phone ? phoneBarLift(W, H, 5, tap, runeRowH(vv, 1)) : 0;
          return shiftLayout(buildLayout(W, H - row, portrait, 5, phone, tap, lift, { scale: S, unit }), row, H);
        };
        const L = lay(gcd(S, lay(1).cam.z));
        const game = { view: vv, ui: new UI(), canvas: fresh(L.W, L.H), t: 0, W: L.W, H: L.H } as unknown as Game;
        const s = { run, L, game, t: 0, foe, note: () => null, modalUp: () => false } as unknown as BuildScreen;
        const view = new FoeView();
        view.show();
        let n = 0;
        for (const p of foePartsOnScreen(L, foe)) {
          view.faces.open = { side: 1, sel: p.sel };
          game.ui.begin();
          view.draw(G(fresh(L.W, L.H)), s);
          const sub = view.faces.last?.sub;
          if (!sub) continue;
          expect(sub.startsWith(`${foe.name}'S `), `${JSON.stringify(p.sel)}: ${sub}`).toBe(true);
          n++;
        }
        expect(n, "faces drawn").toBeGreaterThan(3);
      });
    } finally {
      vi.unstubAllGlobals();
    }
  });
});

void (null as unknown as Run);
