// BUMP-1E P6 E.2 (REVIEW-STAGE0911 section E.2): the save guard. A saved run that names a part, a rune or a hero this build does not know gets no
// CONTINUE and a plain message (src/game/saveGuard.ts); a run it knows loads as before.
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import "../src/sim/deck"; // load order: the ITEMS key order is part of the seeded draws
import { newRun, saveRun, SAVE_KEY, loadRun, type Run } from "../src/game/run";
import { SAVE_ASIDE_LINE, asideBox, loadRunGuarded, saveProblem, unknownInSave } from "../src/game/saveGuard";
import type { HeroId } from "../src/sim/content";
import { computeView, defaultScale } from "../src/core/io";
import { titleLayout, titleScale } from "../src/screens/titleLayout";

class Mem {
  private m = new Map<string, string>();
  getItem(k: string): string | null { return this.m.get(k) ?? null; }
  setItem(k: string, v: string): void { this.m.set(k, v); }
  removeItem(k: string): void { this.m.delete(k); }
}
const g = globalThis as unknown as { localStorage?: Mem };
let mem: Mem;
beforeEach(() => { mem = new Mem(); g.localStorage = mem; });
afterEach(() => { delete g.localStorage; });

const HEROES4: HeroId[] = ["furnace", "weaver", "foundry", "bastion"];
/** A run with its JSON written as a newer build would: through a loose copy, so a def this build does not know can be put anywhere. */
const strange = (edit: (r: Record<string, any>) => void): Run => { // eslint-disable-line @typescript-eslint/no-explicit-any
  const r = JSON.parse(JSON.stringify(newRun("furnace", 7, "saveguard"))) as Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
  edit(r);
  return r as unknown as Run;
};

describe("the save guard (BUMP-1E E.2)", () => {
  it("a fresh run of each hero names nothing this build lacks, and loads through the guard exactly as loadRun does", () => {
    for (const h of HEROES4) {
      const run = newRun(h, 11, `saveguard-${h}`);
      expect(unknownInSave(run), h).toEqual([]);
      saveRun(run);
      const a = loadRunGuarded(), b = loadRun();
      expect(a, h).toEqual(b);
      expect(a?.hero).toBe(h);
      expect(saveProblem(), h).toBeNull();
    }
  });

  it("names an unknown part wherever the run keeps one, an unknown rune and an unknown hero", () => {
    expect(unknownInSave(strange((r) => { r.build.items.push({ uid: 900, def: "needletrain", x: 0, y: 0 }); }))).toEqual(["part needletrain"]);
    expect(unknownInSave(strange((r) => { r.build.mods.push({ uid: 901, def: "pilegaurd", gun: 0 }); }))).toEqual(["part pilegaurd"]);
    expect(unknownInSave(strange((r) => { r.build.turrets = [{ slot: 0, def: "railgun9", uid: 902 }]; }))).toEqual(["part railgun9"]);
    expect(unknownInSave(strange((r) => { r.inventory.push({ uid: 903, def: "scartissue" }); }))).toEqual(["part scartissue"]);
    expect(unknownInSave(strange((r) => { r.shop.wagons.push({ merchant: "tinker", offers: [{ def: "futurepiece", price: 3, sold: false }] }); }))).toEqual(["part futurepiece"]);
    expect(unknownInSave(strange((r) => { r.build.runes = [{ id: "rune_from_the_future" }]; }))).toEqual(["rune rune_from_the_future"]);
    expect(unknownInSave(strange((r) => { r.hero = "tinker_hero"; }))).toEqual(["hero tinker_hero"]);
    expect(unknownInSave(strange((r) => { r.build.items.push({ uid: 904, def: "needletrain", x: 0, y: 0 }, { uid: 905, def: "needletrain", x: 1, y: 0 }); }))).toEqual(["part needletrain"]); // each name once
  });

  it("a saved run naming something unknown comes back as no run with the plain line; the save stays in storage; a new run clears it", () => {
    const bad = strange((r) => { r.build.items.push({ uid: 900, def: "needletrain", x: 0, y: 0 }); });
    const text = JSON.stringify(bad);
    mem.setItem(SAVE_KEY, text);
    expect(loadRunGuarded()).toBeNull();
    expect(saveProblem()).toBe(SAVE_ASIDE_LINE);
    expect(mem.getItem(SAVE_KEY)).toBe(text); // untouched: a build that knows the part can still continue it
    // starting a new run overwrites the save; the next guarded load is clean
    saveRun(newRun("weaver", 3, "saveguard-new"));
    const ok = loadRunGuarded();
    expect(ok?.hero).toBe("weaver");
    expect(saveProblem()).toBeNull();
  });

  it("the set-aside line fits on the title: under the logo band, above the command panel, inside the screen, on every view the title is tested on", () => {
    const VIEWS: Record<string, [number, number, number]> = { phone: [390, 844, 3], safari: [390, 660, 3], land: [844, 390, 3], desk: [1440, 900, 1], desk2: [1440, 900, 2], small: [360, 640, 2] };
    for (const [name, [cssW, cssH, dpr]] of Object.entries(VIEWS)) {
      const v = computeView(cssW, cssH, dpr, (pw, ph, p) => titleScale(pw, ph, p, dpr));
      const pw = Math.floor(cssW * dpr), ph = Math.floor(cssH * dpr);
      const k = defaultScale(pw, ph, v.portrait) / v.scale;
      const L = titleLayout(v.W, v.H, v.portrait, false, k);
      const box = asideBox(v.W, L.ly + 42, L.panel.y);
      expect(box.lines.length, name).toBeGreaterThan(0);
      expect(box.lines.length, name).toBeLessThanOrEqual(3);
      expect(box.y0, name).toBeGreaterThanOrEqual(L.ly + 42); // under the logo band
      expect(box.y0 - 2 + box.boxH, `${name}: the strip ends above the panel (panel y ${L.panel.y})`).toBeLessThanOrEqual(L.panel.y);
      expect(box.y0 + box.boxH, name).toBeLessThanOrEqual(v.H);
      expect(box.lines.join(" "), name).toBe(SAVE_ASIDE_LINE);
    }
  });

  it("no save, a save that is not JSON and a run with no problem leave no message", () => {
    expect(loadRunGuarded()).toBeNull();
    expect(saveProblem()).toBeNull();
    mem.setItem(SAVE_KEY, "{not json");
    expect(loadRunGuarded()).toBeNull();
    expect(saveProblem()).toBeNull();
  });
});
