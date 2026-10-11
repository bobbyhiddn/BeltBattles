// SCOUT-1c (REQ-BFG-082; presentation only): the build screen's NEXT BATTLE card opens tonight's foe once a SCOUT road
// stop has revealed it (build/foeView.ts). The reveal signal is the run's own mark (run.event.reveal for today), not
// storedFoe alone (online it also fills when the ghost arrives without a reveal); it holds through a reload. On every view
// the card's, BACK's and every face's CLOSE target is at least TAP_CSS; every part of the foe's carrier opens its face
// where it is drawn, read only; and opening and closing the view (with faces, Escape and BACK) never changes the run: the
// saved run's bytes are equal before and after, offline and online.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { newRun, type DuskFoe, type Run } from "../src/game/run";
import { makeEvent, pickChoice } from "../src/game/events";
import { chooseFoe, storedFoe, storeOnlineFoe } from "../src/game/day";
import { SAVE_KEY, loadRun, saveRun } from "../src/game/save";
import { setSession, type Session } from "../src/game/session";
import { TAP_CSS, tapPx } from "../src/ui/tap";
import { tapRect, type Rect } from "../src/ui/ui";
import { localX, localY } from "../src/render/frame";
import { buildLayout, buildScale, phoneBarLift, phoneScreen, toDeck, type BuildLayout } from "../src/screens/build/layout";
import { runeRowFits, runeRowH, shiftLayout } from "../src/ui/runeBar";
import { columnButtons, planPanel, selFamilies } from "../src/screens/build/inspector";
import { faceRun, faceText, partAt } from "../src/screens/battleScout";
import { FoeView, foePartsOnScreen, foeViewRects, scoutedFoe } from "../src/screens/build/foeView";
import type { BuildScreen } from "../src/screens/build/build";

/** localStorage as a Map. */
class MapStore {
  m = new Map<string, string>();
  get length(): number { return this.m.size; }
  key(i: number): string | null { return [...this.m.keys()][i] ?? null; }
  getItem(k: string): string | null { return this.m.has(k) ? this.m.get(k)! : null; }
  setItem(k: string, v: string): void { this.m.set(k, String(v)); }
  removeItem(k: string): void { this.m.delete(k); }
  clear(): void { this.m.clear(); }
}
let store = new MapStore();
beforeEach(() => {
  store = new MapStore();
  vi.stubGlobal("localStorage", store);
});
afterEach(() => {
  setSession(null);
  vi.unstubAllGlobals();
});

/** An online session stand-in: settle stores 0.6.2's stand-in (no server answer), as online.ts does without one. */
function onlineStub(): Session {
  const base = { failed: false, settle: (run: Run) => storeOnlineFoe(run, null), searching: () => false };
  return new Proxy(base, { get: (t, k) => (k in t ? (t as Record<string | symbol, unknown>)[k] : () => undefined) }) as unknown as Session;
}

/** A run on `day` at its road's SCOUT stop; with `spy`, SPY picked (tonight's deck revealed), the run then in REFIT. */
function scoutRun(day: number, spy: boolean, seed = 4242): Run {
  const run = newRun("furnace", seed);
  run.day = day;
  run.gold = 9;
  run.event = makeEvent(run.seed, run.day, "scout");
  run.stage = "event";
  const r = pickChoice(run, spy ? 2 : 0); // the scout stop: HAGGLE, SEND WORD, SPY
  expect(r.ok).toBe(true);
  run.stage = "refit";
  return run;
}

/** The build screen as the game frames it (zoom1.test.ts's framed(): BuildScreen.pickScale and pickSub, then layout()). */
const gcd = (a: number, b: number): number => (b ? gcd(b, a % b) : a);
function framed(w: number, h: number, dpr: number, runes = 1, offers = 5): { L: BuildLayout; view: { scale: number; dpr: number } } {
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
  const Z = lay(1).cam.z;
  return { L: lay(gcd(S, Z)), view: v };
}

/** The brief's views: phone portrait 390x844, 430x932 and 402x690; landscape 844x390; desk; the two laptops. */
const VIEWS: [string, number, number, number][] = [
  ["phone-390x844", 390, 844, 3], ["max-430x932", 430, 932, 3], ["op-402x690", 402, 690, 3], ["land-844x390", 844, 390, 3],
  ["desk", 1920, 1080, 1], ["laptop-1366", 1366, 768, 1], ["laptop-1280", 1280, 720, 1],
];

const bigEnough = (r: Rect | null, tp: number): boolean => !!r && r.w >= tp && r.h >= tp;

describe("SCOUT-1c: a scouted foe from the NEXT BATTLE card (REQ-BFG-082)", () => {
  it("the reveal signal: the run's own mark for today, not storedFoe alone; it holds through a reload", () => {
    // a dawn run: no event, no foe
    expect(scoutedFoe(newRun("furnace", 1))).toBeNull();
    // the SCOUT stop without SPY (HAGGLE): no reveal, no stored foe
    const haggle = scoutRun(4, false);
    expect(haggle.event?.reveal).toBeUndefined();
    expect(scoutedFoe(haggle)).toBeNull();
    // offline SPY: tonight's foe stored at the reveal, and the card opens it
    const spy = scoutRun(4, true);
    expect(spy.event?.reveal).toBe(true);
    expect(storedFoe(spy)).not.toBeNull();
    expect(scoutedFoe(spy)).toBe(storedFoe(spy));
    // a reload keeps the mark and the foe (the event and run.dusk are saved with the run)
    saveRun(spy);
    const back = loadRun()!;
    expect(scoutedFoe(back)).toEqual(storedFoe(back));
    expect(scoutedFoe(back)).not.toBeNull();
    // the next day: yesterday's reveal opens nothing
    const next = { ...spy, day: spy.day + 1, dusk: { ...spy.dusk!, day: spy.day + 1 } as DuskFoe };
    expect(scoutedFoe(next)).toBeNull();
    // online: the ghost arrives during the build screen without a reveal (storedFoe fills): the card opens nothing
    setSession(onlineStub());
    const ghostOnly = scoutRun(5, false);
    storeOnlineFoe(ghostOnly, null);
    expect(storedFoe(ghostOnly)).not.toBeNull();
    expect(scoutedFoe(ghostOnly)).toBeNull();
    // online SPY: settled at the reveal (the stand-in without a server answer), and the card opens it
    const spyOn = scoutRun(5, true);
    expect(scoutedFoe(spyOn)).not.toBeNull();
    expect(scoutedFoe(spyOn)).toBe(storedFoe(spyOn));
  });

  it("on every view the card's, BACK's and every face's CLOSE target is at least TAP_CSS, and every part opens its face where it is drawn", () => {
    const foes = [3, 6, 9].map((day) => { const r = newRun("weaver", 900 + day); r.day = day; return chooseFoe(r, []); });
    const rows: string[] = [];
    for (const [name, w, h, dpr] of VIEWS) {
      for (const runes of [0, 1]) {
        const { L, view } = framed(w, h, dpr, runes);
        const tp = tapPx(view);
        const R = foeViewRects(L, tp);
        expect(L.foe, `${name}: the NEXT BATTLE card`).not.toBeNull();
        expect(bigEnough(R.cardHit, tp), `${name} runes ${runes}: the card's target ${JSON.stringify(R.cardHit)} (tp ${tp})`).toBe(true);
        expect(bigEnough(R.backHit, tp), `${name} runes ${runes}: BACK's target ${JSON.stringify(R.backHit)} (tp ${tp})`).toBe(true);
        // the card's target stays inside the band (portrait) or its column (landscape): never over the shop or the carrier
        if (L.portrait) expect(R.cardHit!.y >= L.info.y && R.cardHit!.y + R.cardHit!.h <= L.info.y + L.info.h).toBe(true);
        let faces = 0;
        for (const foe of foes) {
          const parts = foePartsOnScreen(L, foe);
          expect(parts.length).toBeGreaterThan(3);
          for (const p of parts) {
            // the tap at the part's point maps back to that part (the build screen's own zoom: toDeck, then the deck frame)
            const d = toDeck(L, p.x, p.y);
            const at = partAt(foe.build, localX(L.frame, d.x, d.y), localY(L.frame, d.x, d.y));
            expect(at, `${name}: ${p.name} at ${p.x},${p.y}`).toEqual(p.sel);
            // its face, read only, and CLOSE's target as BattleFaces.drawOn places it
            const t = faceText(foe.build, p.sel)!;
            expect(t).not.toBeNull();
            expect(t.labels).toEqual(["CLOSE"]);
            expect(t.body.some((b) => b.role === "hint")).toBe(false);
            const plan = planPanel(t, R.area, selFamilies(faceRun(foe.build), p.sel), { tap: tp, band: R.band });
            const cr = plan.column ? columnButtons(1, plan.r, tp)[0] : plan.rects ? plan.rects[0] : null;
            expect(cr, `${name}: ${p.name}'s CLOSE`).toBeTruthy();
            expect(bigEnough(tapRect(cr!, tp, plan.r, tp), tp), `${name}: ${p.name}'s CLOSE target`).toBe(true);
            // the face stays in the view's area, clear of the card and BACK
            expect(plan.r.y >= R.area.y - 1 && plan.r.y + plan.r.h <= R.area.y + R.area.h + 1, `${name}: ${p.name}'s face ${JSON.stringify(plan.r)} in ${JSON.stringify(R.area)}`).toBe(true);
            faces++;
          }
        }
        rows.push(`${name} runes ${runes}: tp ${tp}; card ${R.cardHit!.w}x${R.cardHit!.h}, BACK ${R.backHit.w}x${R.backHit.h}; face area ${R.area.w}x${R.area.h} (${R.band ? "band" : "column"}); ${faces} faces`);
      }
    }
    console.log(`SCOUT-1c foe view:\n${rows.join("\n")}`);
  });

  it("opening and closing the view, with faces, Escape and BACK, never changes the run: the saved run's bytes, offline and online", () => {
    for (const on of [false, true]) {
      setSession(on ? onlineStub() : null);
      const run = scoutRun(6, true, on ? 777 : 778);
      const foe = scoutedFoe(run)!;
      expect(foe).not.toBeNull();
      saveRun(run);
      const before = store.getItem(SAVE_KEY)!, json = JSON.stringify(run), dusk = JSON.stringify(run.dusk), seed = run.seed;
      const shop = JSON.stringify(run.shop);
      const { L, view } = framed(390, 844, 3, 1);
      const s = { run, L, game: { view } } as unknown as BuildScreen;
      const v = new FoeView();
      v.show();
      expect(v.open).toBe(true);
      for (const p of foePartsOnScreen(L, foe)) {
        v.press(s, p.x, p.y);
        expect(v.faces.open?.sel).toEqual(p.sel);
      }
      v.press(s, 1, 1); // empty space closes the face
      expect(v.faces.open).toBeNull();
      v.press(s, foePartsOnScreen(L, foe)[0].x, foePartsOnScreen(L, foe)[0].y);
      v.key("Escape"); // the face first
      expect(v.open).toBe(true);
      expect(v.faces.open).toBeNull();
      v.key("Escape"); // then the view
      expect(v.open).toBe(false);
      v.show();
      v.close(); // BACK
      expect(JSON.stringify(run)).toBe(json);
      expect(JSON.stringify(run.dusk)).toBe(dusk);
      expect(JSON.stringify(run.shop)).toBe(shop);
      expect(run.seed).toBe(seed);
      saveRun(run);
      expect(store.getItem(SAVE_KEY), on ? "online" : "offline").toBe(before);
    }
  });
});
