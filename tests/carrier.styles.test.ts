// CUSTOM-3 (REQ-BFG-074): the carrier styles, the fourth surface. The catalogue (src/render/styles.ts CARRIERS: WAR
// COLOURS, today's ship, first, then the four to earn), the unlock goals on profile.ts's counters (no new counter), the
// migration of profiles from before carrier styles, CUSTOMIZE's CARRIER tab (its rows, wear and preview, and its frame on
// every view: four tabs in the row the three had, each a finger's target on a phone), and the ship canvases: the default
// keeps today's cache keys and pixels (digests pinned from custom2b-accepted 3e8dc80 by kit-custom3/digest.sh), a style
// keys its own and paints exactly the default's outline (no style is bigger than the default).
import { describe, expect, it } from "vitest";
import { createHash } from "node:crypto";
import { installRaster, type RasterCanvas } from "./raster.helpers";
import { computeView } from "../src/core/io";
import { CustomizeState, TAB_LABEL, customizeLayout, customizeScale } from "../src/screens/customize";
import {
  PROFILE_KEY, PROFILE_V, chosenSkin, emptyProfile, evaluateUnlocks, foldDusk, foldEnd, foldWarlord, loadProfile,
  migrateProfile, playerSkin, runUnlockNames, saveProfile, styleByKey, unseen, wear, type RunFacts,
} from "../src/game/profile";
import { CARRIERS, DEFAULT_SKIN, SURFACES, carrierStyle, isStyleId, styleKey, stylesOf, type CarrierId } from "../src/render/styles";
import { textWidth, wrap } from "../src/render/font";
import { TAP_CSS, isPhone, tapPx } from "../src/ui/tap";
import { ROT_H, ROT_W, shipCacheKeys, shipShadow, shipSprite } from "../src/render/carrier";
import { drawShip, shipKey } from "../src/render/ship";
import { heroPalette } from "../src/render/hull";
import { makeCanvas } from "../src/render/pixel";
import type { HeroId } from "../src/sim/content";

function mem(): Storage {
  const m = new Map<string, string>();
  return {
    get length() { return m.size; }, clear: () => m.clear(), key: (i: number) => [...m.keys()][i] ?? null,
    getItem: (k: string) => (m.has(k) ? m.get(k)! : null), setItem: (k: string, v: string) => void m.set(k, String(v)),
    removeItem: (k: string) => void m.delete(k),
  };
}
const facts = (o: Partial<RunFacts> = {}): RunFacts => ({ runId: "r1", hero: "furnace", day: 2, over: null, flawless: false, belts: 1, ...o });
const has = (p: ReturnType<typeof emptyProfile>, id: CarrierId) => p.unlocked.includes(styleKey("carrier", id));

describe("CUSTOM-3 carrier styles: the catalogue and the unlocks", () => {
  it("the catalogue: WAR COLOURS (today's ship) first, then four to earn on the prestige goals; CARRIER is the fourth tab", () => {
    expect(SURFACES).toEqual(["floor", "belt", "panel", "carrier"]);
    expect(stylesOf("carrier")).toBe(CARRIERS);
    expect(CARRIERS.map((s) => s.id)).toEqual(["war", "admiral", "ironclad", "storm", "gold"]);
    expect(CARRIERS.map((s) => s.name)).toEqual(["WAR COLOURS", "ADMIRAL'S BLUE", "IRONCLAD", "STORMCALLER", "CHAMPION'S GOLD"]);
    expect(DEFAULT_SKIN.carrier).toBe("war");
    expect(CARRIERS[0].counter).toBeUndefined();
    expect(CARRIERS[0].paint).toBeUndefined();
    expect(carrierStyle("nope" as CarrierId).id).toBe("war");
    expect(isStyleId("carrier", "storm")).toBe(true);
    expect(isStyleId("carrier", "plate")).toBe(false);
    expect(TAB_LABEL.carrier).toBe("CARRIER");
    // the prestige tier: each goal is past every floor, belt and panel goal on the same counter
    const counters = new Set(Object.keys(emptyProfile().counters).concat(["heroesWon", "heroesFinished"]));
    for (const s of CARRIERS.slice(1)) {
      expect(counters.has(s.counter!), s.id).toBe(true);
      const others = SURFACES.filter((x) => x !== "carrier").flatMap((x) => stylesOf(x)).filter((o) => o.counter === s.counter);
      for (const o of others) expect(s.need!, `${s.id} vs ${o.id}`).toBeGreaterThan(o.need ?? 1);
      expect(`LOCKED: ${s.how}.`.length).toBeLessThanOrEqual(44);
    }
    expect(CARRIERS.map((s) => [s.counter, s.need])).toEqual([[undefined, undefined], ["runsFinished", 3], ["warlordWins", 5], ["heroesWon", 4], ["duskWins", 100]]);
  });

  it("each goal opens its style exactly at its target, announces it (NEW) and names it on the summary", () => {
    const p = emptyProfile();
    for (let i = 1; i <= 3; i++) {
      foldEnd(p, facts({ runId: `f${i}`, over: "complete", day: 10 }));
      expect(has(p, "admiral"), `finished ${i}`).toBe(i >= 3);
    }
    expect(runUnlockNames(p, "f3")).toContain("ADMIRAL'S BLUE");
    for (let i = 1; i <= 5; i++) {
      foldWarlord(p, facts({ runId: `w${i}` }), 5, "win", false);
      expect(has(p, "ironclad"), `warlords ${i}`).toBe(i >= 5);
    }
    const heroes = ["furnace", "weaver", "foundry", "bastion"];
    heroes.forEach((hero, i) => {
      foldDusk(p, facts({ runId: `h${i}`, hero }), 1, "win");
      expect(has(p, "storm"), `heroes ${i + 1}`).toBe(i + 1 >= 4);
    });
    const q = emptyProfile();
    for (let d = 1; d <= 100; d++) {
      foldDusk(q, facts({ runId: `d${d}` }), 1, "win");
      expect(has(q, "gold"), `dusk wins ${d}`).toBe(d >= 100);
    }
    expect(unseen(p)).toEqual(expect.arrayContaining(["style:carrier.admiral", "style:carrier.ironclad", "style:carrier.storm"]));
    expect(styleByKey("style:carrier.gold")?.style.name).toBe("CHAMPION'S GOLD");
    expect(styleByKey("style:carrier.war")?.surface).toBe("carrier");
    // a default is never "unlocked"
    expect(p.unlocked).not.toContain("style:carrier.war");
  });

  it("migration: a profile from before carrier styles wears WAR COLOURS; an unknown or locked choice is worn as the default", () => {
    // 3e8dc80's shape: chosen has no carrier
    const old = { v: 1, counters: { runs: 4, runsFinished: 3 }, unlocked: ["style:floor.timber"], chosen: { floor: "timber", belt: "iron", panel: "slate" } };
    const p = migrateProfile(old)!;
    expect(p.v).toBe(PROFILE_V);
    expect(p.chosen.carrier).toBe("war");
    expect(chosenSkin(p)).toEqual({ floor: "timber", belt: "iron", panel: "slate", carrier: "war" });
    // the counters already earn ADMIRAL'S BLUE: loading opens it (a catalogue that grew opens what the counters earn)
    const st = mem();
    st.setItem(PROFILE_KEY, JSON.stringify(old));
    const loaded = loadProfile(st);
    expect(has(loaded, "admiral")).toBe(true);
    expect(unseen(loaded)).toContain("style:carrier.admiral");
    expect(migrateProfile({ ...old, chosen: { ...old.chosen, carrier: "nope" } })!.chosen.carrier).toBe("war");
    const locked = migrateProfile({ ...old, chosen: { ...old.chosen, carrier: "gold" } })!;
    evaluateUnlocks(locked);
    expect(locked.chosen.carrier).toBe("gold");
    expect(chosenSkin(locked).carrier).toBe("war"); // CHAMPION'S GOLD isn't open: worn as WAR COLOURS
    expect(wear(locked, "carrier", "gold")).toBe(false);
    expect(wear(locked, "carrier", "admiral")).toBe(true);
    expect(chosenSkin(locked).carrier).toBe("admiral");
    saveProfile(locked, st);
    expect(JSON.parse(st.getItem(PROFILE_KEY)!).chosen.carrier).toBe("admiral");
    expect(JSON.parse(st.getItem(PROFILE_KEY)!).v).toBe(1); // no version bump: the field is optional to older builds
    expect(playerSkin(st).carrier).toBe("admiral");
  });
});

describe("CUSTOM-3 CUSTOMIZE: the CARRIER tab", () => {
  /** A player with 3 finished runs: ADMIRAL'S BLUE open, the other three locked. */
  function player(st: Storage) {
    const p = loadProfile(st);
    for (let i = 1; i <= 3; i++) foldEnd(p, facts({ runId: `f${i}`, over: "complete", day: 10 }));
    saveProfile(p, st);
    return loadProfile(st);
  }

  it("five rows, WAR COLOURS worn; an open row is worn and saved at once; a locked one previews only; BACK restores", () => {
    const st = mem();
    const s = new CustomizeState(player(st), st);
    s.tapTab("carrier");
    expect(s.rows().map((r) => r.style.id)).toEqual(["war", "admiral", "ironclad", "storm", "gold"]);
    expect(s.rows()[0].worn && s.rows()[0].open).toBe(true);
    expect(s.rows().map((r) => r.open)).toEqual([true, true, false, false, false]);
    expect(s.rows().find((r) => r.style.id === "gold")!.progress).toEqual([0, 100]);
    expect(s.tapRow("admiral")).toBe("worn");
    expect(JSON.parse(st.getItem(PROFILE_KEY)!).chosen.carrier).toBe("admiral");
    const before = st.getItem(PROFILE_KEY);
    expect(s.tapRow("storm")).toBe("preview");
    expect(s.previewLocked()).toBe(true);
    expect(s.preview.carrier).toBe("storm");
    expect(s.worn.carrier).toBe("admiral");
    expect(st.getItem(PROFILE_KEY)).toBe(before); // nothing saved
    s.back();
    expect(s.preview.carrier).toBe("admiral");
    s.tapRow("gold");
    s.tapTab("floor"); // another tab brings back what you wear
    expect(s.preview).toEqual({ ...DEFAULT_SKIN, carrier: "admiral" });
    // a reload keeps the choice
    expect(new CustomizeState(loadProfile(st), st).worn.carrier).toBe("admiral");
    expect(playerSkin(st)).toEqual({ ...DEFAULT_SKIN, carrier: "admiral" });
  });

  const VIEWS: [string, number, number, number][] = [
    ["phone", 390, 844, 3], ["phone-660", 390, 660, 3], ["wk-iphone13", 390, 664, 3], ["wk-iphone15pm", 430, 739, 3],
    ["wk-op-690", 402, 690, 3], ["small", 360, 640, 2], ["bar-667", 375, 667, 2], ["phone-land", 844, 390, 3],
    ["desk", 1920, 1080, 1], ["laptop", 1280, 720, 1],
  ];
  const meets = (a: { x: number; y: number; w: number; h: number }, b: { x: number; y: number; w: number; h: number }) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
  for (const [name, w, h, dpr] of VIEWS) {
    it(`${name} ${w}x${h} @${dpr}: four tabs in one row, each label whole, each a finger's target on a phone`, () => {
      const v = computeView(w, h, dpr, (pw, ph, p) => customizeScale(pw, ph, p, dpr));
      const tap = isPhone(v) ? tapPx(v) : 0;
      const L = customizeLayout(v.W, v.H, v.portrait, tap);
      const css = v.scale / v.dpr;
      expect(L.tabs.length).toBe(4);
      expect(L.tabHits.length).toBe(4);
      SURFACES.forEach((surface, i) => {
        const t = L.tabs[i], hit = L.tabHits[i];
        expect(t.y, name).toBe(L.tabs[0].y); // one row
        expect(t.h, name).toBe(L.tabs[0].h);
        expect(textWidth(TAB_LABEL[surface], "3") + 4, `${name}: ${surface}`).toBeLessThanOrEqual(t.w); // the label whole
        expect(t.x >= 0 && t.x + t.w <= v.W && hit.y >= 0 && hit.y + hit.h <= v.H, name).toBe(true);
        if (isPhone(v)) {
          expect(hit.h * css, `${name}: ${surface}`).toBeGreaterThanOrEqual(TAP_CSS - 1e-9);
          expect(hit.w * css, `${name}: ${surface}`).toBeGreaterThanOrEqual(TAP_CSS - 1e-9);
        }
        for (const r of [...L.rows, L.backHit]) expect(meets(hit, r), `${name}: ${surface}`).toBe(false);
      });
      for (let i = 0; i < 4; i++) for (let j = i + 1; j < 4; j++) expect(meets(L.tabHits[i], L.tabHits[j]), name).toBe(false);
      // the four tabs span the column the three did
      expect(L.tabs[3].x + L.tabs[3].w - L.tabs[0].x, name).toBe(L.rows[0].w);
      // every carrier's locked line fits its row in two lines beside the swatch and the progress number
      for (const s of CARRIERS.slice(1)) {
        const room = L.rows[0].w - 5 - Math.min(L.rows[0].h - 6, 40) - 3 - 5 - 8 - textWidth(`${s.need}/${s.need}`, "3") - 4;
        expect(wrap(`LOCKED: ${s.how}.`, room, "3").length, `${name}: ${s.id}`).toBeLessThanOrEqual(2);
      }
    });
  }
});

describe("CUSTOM-3 the ship canvases", () => {
  installRaster();
  const HEROES: HeroId[] = ["furnace", "weaver", "foundry", "bastion"];
  const digest = (c: HTMLCanvasElement) => createHash("sha256").update((c as unknown as RasterCanvas).px.join(",")).digest("hex").slice(0, 16);
  /** 3e8dc80's default canvases at heading 0 (kit-custom3/digest.sh; output-custom3/logs/digest-3e8dc80.log). */
  const PIN: Record<string, [string, string]> = {
    furnace: ["27c51809cc4773ef", "c4e08159af133906"],
    weaver: ["fa3718b99558a39d", "c4e08159af133906"],
    foundry: ["341c8ca10a161ce4", "c4e08159af133906"],
    bastion: ["31d9140a0139d6ac", "c4e08159af133906"],
  };

  it("the default (WAR COLOURS) keeps today's keys and today's pixels", () => {
    const [cv, g] = makeCanvas(ROT_W * 2, ROT_H * 2);
    for (const hero of HEROES) {
      drawShip(g, hero, ROT_W, ROT_H, 0, 0); // the default: no style passed
      drawShip(g, hero, ROT_W, ROT_H, 0, 0, "war");
      expect(shipKey(hero)).toBe(hero);
      expect(shipKey(hero, "war")).toBe(hero);
      const keys = shipCacheKeys();
      for (const k of [`ship:${hero}`, `shipR:${hero}:0`, `shipS:${hero}:0`]) expect(keys, k).toContain(k);
      expect(keys.some((k) => k.includes(":war")), "no key names the default").toBe(false);
      expect([digest(shipSprite(hero, heroPalette(hero), 0)), digest(shipShadow(hero, heroPalette(hero), 0))], hero).toEqual(PIN[hero]);
    }
    void cv;
  });

  it("a style keys its own canvases and paints exactly the default's outline (no style is bigger), in its own colours", () => {
    const [, g] = makeCanvas(ROT_W * 2, ROT_H * 2);
    for (const hero of HEROES) {
      const base = (shipSprite(hero, heroPalette(hero), 0) as unknown as RasterCanvas).px;
      for (const s of CARRIERS.slice(1)) {
        drawShip(g, hero, ROT_W, ROT_H, 0, 0, s.id);
        const keys = shipCacheKeys();
        for (const k of [`ship:${hero}:${s.id}`, `shipR:${hero}:${s.id}:0`, `shipS:${hero}:${s.id}:0`]) expect(keys, k).toContain(k);
        const px = (shipSprite(shipKey(hero, s.id), heroPalette(hero), 0, s) as unknown as RasterCanvas).px;
        let outline = 0, differ = 0, painted = 0;
        for (let i = 0; i < px.length; i++) {
          if ((px[i] === null) !== (base[i] === null)) outline++;
          if (px[i] !== null) painted++;
          if (px[i] !== base[i]) differ++;
        }
        expect(outline, `${hero} ${s.id}: pixels off the default's outline`).toBe(0);
        expect(differ / painted, `${hero} ${s.id}: share repainted`).toBeGreaterThan(0.5);
        // its shadow is the default's (the same silhouette)
        expect(digest(shipShadow(shipKey(hero, s.id), heroPalette(hero), 0, s)), `${hero} ${s.id} shadow`).toBe(PIN[hero][1]);
      }
    }
  });
});
