// ARTB-CODE-3B (REQ-BFG-126 (3): "a piece not redrawn yet keeps today's icon"), item H: the HOLD, pinned positively.
// ARTB-READ-6 put 27 of the 53 new pictures under the requirement's bar (the reader names the piece: 5 of 6 readers must match). A picture under the bar is redrawn, and until its redraw has passed a read the piece keeps TODAY's art:
// the 27 are HELD, out of tools/artb/artb-slice.json (and so out of src/render/artBData.ts), and the game shows the base's drawing for them as it did at stage-0918. This file is the positive pin that a held picture cannot leak:
//   1. the 27 ids and their names are typed below from the brief; ITEMS[id].name is the same name, tools/artb/hold-read6.json (a byte copy of HOLD.json, the art lane's record of the read) says the same, and no id counts 5 of 6;
//   2. the data has no card, board, icon, body or work entry for any of them (the JSON and the generated module), and HOLD.json's lists of removed sprites and work entries are exactly what the data lacks;
//   3. with the art ON every art hook answers null (not mine) for each of them;
//   4. with the art ON the shop card's picture, the small icon and (a rig) the board sprite, plain and working, at every frame, and the hit silhouette, equal what the switch OFF gives, pixel for pixel; and the digests of every
//      drawing function equal the base's recorded digests (tests/artb1.base-digests.json);
//   5. PINCER, TWIN LATCH and SHIELD FUEL (id platebreaker) also in each of their battle states: the deck's sprite is the base's wave3GateSprite (the three held rigs that have a state look in wave3Art.ts).
// Every expectation compares the game with itself (art on = art off) or reads the data: no pixel, digest or pixel count is typed here. The names are the game's (ITEMS[id].name), never a typed alias.
import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it } from "vitest";
import { R, installRaster } from "./raster.helpers";

installRaster();

import { ITEMS } from "../src/sim/content";
import { ART_B_LEGEND, ART_B_SPRITES, ART_B_WORK } from "../src/render/artBData";
import { artBBoard, artBBoardSil, artBBoardState, artBBody, artBCard, artBFace, artBFactory, artBFactorySil, artBHas, artBIcon, setArtB } from "../src/render/artB";
import { cruiserModel } from "../src/render/cruiser";
import { gateSil, gateSprite, itemIcon } from "../src/render/sprites";
import { iconX2 } from "../src/screens/build/shop";
import type { Build } from "../src/sim/deck";
import { stKey, wave3GateSprite, type Wave3RigState } from "../src/render/wave3Art";
import type { CruiserView } from "../src/render/cruiser";
import { FRAMES, allDigests, sigOf, type Digests } from "./artb1.helpers";
import { data } from "./artb3.helpers";
import { battleView, buildView, cellCheck, cellOf, drawDeck, gate, hot, momentOf, play } from "./artb3.scene";
import { barge, furnaceBench, item, withItem } from "./wave3.helpers";

type Kind = "gun" | "rig";
/** The 27 held ids with the game's name (ITEMS[id].name) and their kind: 7 gun pieces (card/<id> and icon/<id> were held) and 20 rigs (card/<id> and board/<id> and the board's work entry). */
const HELD: [string, string, Kind][] = [
  ["hailgun", "HAIL GUN", "gun"], ["carronade", "CARRONADE", "gun"], ["thunderer", "THUNDERER", "gun"], ["deckgun", "DECK GUN", "gun"], ["rampart", "RAMPART CANNON", "gun"], ["bombard", "BOMBARD", "gun"], ["scrapcannon", "SCRAP CANNON", "gun"],
  ["overdrive", "OVERDRIVE", "rig"], ["platebreaker", "SHIELD FUEL", "rig"], ["overclocker", "OVERCLOCKER", "rig"], ["longhaul", "LONG HAUL", "rig"], ["splitter", "SPLITTER", "rig"], ["grindstone", "GRINDSTONE", "rig"],
  ["quench", "KINDLING", "rig"], ["rotgauge", "ROT GAUGE", "rig"], ["heatjacket", "HEAT JACKET", "rig"], ["leechcoil", "LEECH COIL", "rig"], ["coil", "GALVANIC COIL", "rig"], ["riveter", "RIVETER", "rig"],
  ["crowdpress", "CROWD PRESS", "rig"], ["brandingiron", "BRANDING IRON", "rig"], ["stoker", "STOKER", "rig"], ["sorting", "SORTING ARM", "rig"], ["twinlatch", "TWIN LATCH", "rig"], ["cindermail", "CINDER MAIL", "rig"],
  ["scaleguard", "SCALE GUARD", "rig"], ["pincer", "PINCER", "rig"],
];
const IDS = HELD.map(([id]) => id);
/** The one name tools/artb/hold-read6.json (HOLD.json, a byte copy of the art lane's record) has that the game does not: id quench was QUENCH TANK in content.ts's base row; the scaling rules that ship on (scale.ts SCALE_DEFS.quench,
 *  "KINDLING (was QUENCH TANK)") rename it, so ITEMS.quench.name is KINDLING as shipped, and every name written in this repo comes from ITEMS[id].name (ARTB-CODE-3B item N). Pinned here so any other difference fails. */
const STALE_IN_HOLD_JSON: Record<string, string> = { quench: "QUENCH TANK" };
/** The held rigs that have a battle-state look in wave3Art.ts (wave3Moments.ts rigMoment gives them a state), with the states the deck can ask for. Their deck sprite stays the base's wave3GateSprite. */
const STATES: Record<string, Wave3RigState[]> = {
  pincer: [{ crowd: 1 }, { crowd: 2 }, { crowd: 3 }],
  twinlatch: [{ latch: "hold" }, { latch: "release" }],
  platebreaker: [{ spent: false }],
};
/** tools/artb/hold-read6.json: a byte copy of the art lane's HOLD.json (the record of ARTB-READ-6, run 1) */
const hold = JSON.parse(readFileSync("tools/artb/hold-read6.json", "utf8")) as {
  held: { id: string; name: string; names_matching_of_6: number; kind: Kind }[];
  removed_sprites: string[];
  removed_work: string[];
  states_left: Record<string, string[]>;
};
const base = JSON.parse(readFileSync("tests/artb1.base-digests.json", "utf8")) as Digests;
const WAVES = [false, true];
/** every key wave3Art.ts stKey makes of a wave-3 rig's state (the keys the state hook is asked with) */
const STATE_KEYS = ["m", "c1", "c2", "c3", "s", "hold", "release", "n", "p"];

afterEach(() => setArtB(true));

describe("ARTB-CODE-3B H: the 27 held ids and their names", () => {
  it("27 distinct ids: 7 gun pieces and 20 rigs; each is a piece of the game (a turret or a gate) and ITEMS[id].name is the name typed here", () => {
    expect(HELD.length).toBe(27);
    expect(new Set(IDS).size, "27 distinct ids").toBe(27);
    expect(HELD.filter(([, , k]) => k === "gun").length).toBe(7);
    expect(HELD.filter(([, , k]) => k === "rig").length).toBe(20);
    for (const [id, name, kind] of HELD) {
      expect(ITEMS[id], `${id}: a piece of the game`).toBeDefined();
      expect(ITEMS[id].name, `${id}: the game's name`).toBe(name);
      expect(ITEMS[id].kind, `${id} (${name})`).toBe(kind === "gun" ? "turret" : "gate");
    }
    expect(ITEMS.platebreaker.name, "id platebreaker is SHIELD FUEL").toBe("SHIELD FUEL");
    expect(ITEMS.shieldwall.name, "id shieldwall is IRON WALL").toBe("IRON WALL");
  });

  it("tools/artb/hold-read6.json (HOLD.json) lists the same 27 with the same names and kinds, in the same order, and no id reached the bar of 5 of 6 readers", () => {
    expect(hold.held.map((h) => h.id)).toEqual(IDS);
    expect(hold.held.map((h) => h.name)).toEqual(HELD.map(([id, n]) => STALE_IN_HOLD_JSON[id] ?? n));
    expect(hold.held.map((h) => h.kind)).toEqual(HELD.map(([, , k]) => k));
    expect(Object.keys(STALE_IN_HOLD_JSON), "one stale name only").toEqual(["quench"]);
    for (const h of hold.held) {
      expect(h.name, `${h.id}: HOLD.json's name is the game's (except the one stale name)`).toBe(STALE_IN_HOLD_JSON[h.id] ?? ITEMS[h.id].name);
      expect(h.names_matching_of_6, `${h.id} (${h.name}): under the bar (5 of 6)`).toBeLessThan(5);
      expect(h.names_matching_of_6).toBeGreaterThanOrEqual(0);
    }
  });
});

describe("ARTB-CODE-3B H: the data holds nothing of a held id", () => {
  it("no sprite, work entry or body of the 27 ids in the JSON or in the generated module; HOLD.json's removed sprites (54) and work entries (20) are exactly what the data lacks", () => {
    for (const id of IDS) {
      for (const name of [`card/${id}`, `board/${id}`, `icon/${id}`, `body/${id}`, id]) {
        expect(data.sprites[name], `${name}: not in the JSON`).toBeUndefined();
        expect(ART_B_SPRITES[name], `${name}: not in the generated module`).toBeUndefined();
        expect(data.work[name], `${name}: no work entry in the JSON`).toBeUndefined();
        expect(ART_B_WORK[name], `${name}: no work entry in the generated module`).toBeUndefined();
      }
    }
    // no name of the data ends in a held id (a stray `state` or a renamed sprite would show here)
    for (const name of [...Object.keys(data.sprites), ...Object.keys(data.work), ...Object.keys(ART_B_SPRITES), ...Object.keys(ART_B_WORK)]) expect(IDS, `${name}`).not.toContain(name.split("/").pop());
    expect(hold.removed_sprites.length, "7 guns x (card + icon) + 20 rigs x (card + board)").toBe(7 * 2 + 20 * 2);
    expect(hold.removed_work.length).toBe(20);
    for (const name of hold.removed_sprites) expect(data.sprites[name], `${name}: removed`).toBeUndefined();
    for (const name of hold.removed_work) expect(data.work[name], `${name}: removed`).toBeUndefined();
    // the legend stays whole (the held pictures come back after their redraw): 86, the generated one the same
    expect([Object.keys(data.legend).length, Object.keys(ART_B_LEGEND).length]).toEqual([86, 86]);
  });

  it("the state patches that ride are exactly HOLD.json's states_left (TWIN GAUGE, BRACE FRAME, IRON WALL); none of the three held state rigs has one", () => {
    const left = Object.fromEntries(Object.entries(data.work).filter(([, w]) => w.state).map(([n, w]) => [n, Object.keys(w.state!).sort()]));
    expect(left).toEqual(hold.states_left);
    expect(Object.keys(left).sort()).toEqual(["board/braceframe", "board/shieldwall", "board/twingauge"]);
    for (const id of Object.keys(STATES)) expect(data.work[`board/${id}`], `${id}: no board work entry, so no state`).toBeUndefined();
  });
});

describe("ARTB-CODE-3B H: with the art ON, every art hook answers null for a held id (the base draws it)", () => {
  for (const [id, name, kind] of HELD) {
    it(`${id} (${name}): artBHas false; card, icon, board (idle and working, 8 frames), board silhouette, factory, factory silhouette, body and face all null`, () => {
      setArtB(true);
      expect(artBHas(id), `${id}: artBHas`).toBe(false);
      expect(artBCard(id), `${id}: artBCard`).toBeNull();
      expect(artBIcon(id), `${id}: artBIcon`).toBeNull();
      for (const f of FRAMES) for (const active of WAVES) expect(artBBoard(id, f, active), `${id} (${kind}): artBBoard frame ${f} ${active ? "working" : "idle"}`).toBeNull();
      expect(artBBoardSil(id), `${id}: artBBoardSil`).toBeNull();
      for (const key of STATE_KEYS) for (const active of WAVES) expect(artBBoardState(id, 2, active, key), `${id}: artBBoardState key "${key}"`).toBeNull(); // ARTB-CODE-3B S: the state hook too
      expect(artBFactory(id, 0, false), `${id}: artBFactory`).toBeNull();
      expect(artBFactory(id, 0, true), `${id}: artBFactory flash`).toBeNull();
      expect(artBFactorySil(id), `${id}: artBFactorySil`).toBeNull();
      expect(artBBody(id, 24, 12, 0, false), `${id}: artBBody lying`).toBeNull();
      expect(artBBody(id, 12, 24, 0, true), `${id}: artBBody upright`).toBeNull();
      expect(artBFace(id), `${id}: artBFace`).toBeNull();
    });
  }
});

describe("ARTB-CODE-3B H: with the art ON a held piece is drawn exactly as with the switch OFF", () => {
  /** What the game draws for `id` through the hooks art B sits behind: the shop card's picture, the small icon and, for a rig, the board sprite plain and working at every frame and its hit silhouette. */
  function drawn(id: string, kind: Kind): Record<string, string> {
    const out: Record<string, string> = { card: sigOf(iconX2(id)), icon: sigOf(itemIcon(id)) };
    if (kind === "rig") {
      for (const f of FRAMES) for (const active of WAVES) out[`board f${f} ${active ? "working" : "idle"}`] = sigOf(gateSprite(id, f, active));
      out.gateSil = sigOf(gateSil(id));
    }
    return out;
  }
  for (const [id, name, kind] of HELD) {
    it(`${id} (${name}): the shop card's picture, the small icon${kind === "rig" ? ", the board sprite (plain and working, 8 frames) and its silhouette" : ""} equal the switch OFF's`, () => {
      setArtB(true);
      const on = drawn(id, kind);
      setArtB(false);
      const off = drawn(id, kind);
      setArtB(true);
      expect(Object.keys(on).sort()).toEqual(Object.keys(off).sort());
      for (const k of Object.keys(off)) expect(on[k], `${id} (${name}): ${k}`).toBe(off[k]);
      // the card is the 24x24 doubling of the base's 12x12 icon, and the icon is a real picture (not a blank)
      const ic = R(itemIcon(id)), card = R(iconX2(id));
      expect([ic.width, ic.height, card.width, card.height], `${id}: sizes`).toEqual([12, 12, 24, 24]);
      expect(ic.px.some((p) => p !== null), `${id}: the icon draws something`).toBe(true);
    });
  }

  it("the digests of every drawing function of the 27 ids (icon, gate, gate silhouette, factory, factory silhouette, bodies) equal the base's recorded digests, with the art ON and OFF", () => {
    for (const on of [true, false]) {
      setArtB(on);
      const d = allDigests(IDS);
      for (const fn of Object.keys(base)) for (const key of Object.keys(d[fn])) expect(d[fn][key], `art ${on ? "on" : "off"}: ${fn} ${key}: the base's`).toBe(base[fn][key]);
      for (const fn of ["icon", "gate", "gateSil", "factory", "factorySil"]) expect(Object.keys(d[fn]).sort(), `art ${on ? "on" : "off"}: ${fn}: the 27 ids`).toEqual([...IDS].sort());
    }
  });
});

describe("ARTB-CODE-3B H: PINCER, TWIN LATCH and SHIELD FUEL in each of their states are the base's wave3GateSprite, with the art ON as with it OFF", () => {
  for (const [id, states] of Object.entries(STATES)) {
    it(`${id} (${ITEMS[id].name}): wave3GateSprite answers for each of its ${states.length} state(s) at every frame, idle and working, and is the same picture with the switch on and off`, () => {
      for (const st of states) for (const f of FRAMES) for (const active of WAVES) {
        setArtB(true);
        const on = wave3GateSprite(id, f, active, st);
        expect(on, `${id} ${JSON.stringify(st)}: the base has a state look`).not.toBeNull();
        const a = sigOf(on);
        setArtB(false);
        const b = sigOf(wave3GateSprite(id, f, active, st));
        expect(a, `${id} ${JSON.stringify(st)} frame ${f} ${active ? "working" : "idle"}: on = off`).toBe(b);
      }
    });
  }

  it("on the deck (the game's drawMachinery -> drawRigs): PINCER with a crowd on a build deck, TWIN LATCH releasing and SHIELD FUEL's spent blow in a battle: the rig's cell is the same picture with the art ON as OFF and shows the base's state look", () => {
    const pincer = withItem(withItem(furnaceBench(), item(30, "pincer", 3, 3, 1)), item(31, "whetstone", 5, 3, 3)); // the WHETSTONE (which rides) shares PINCER's tile: a crowd of one; only PINCER's cell is compared
    const battle = (def: string) => play(withItem(furnaceBench(), item(30, def, 3, 3, 0)), barge(), (x) => x.b.t > 2 && !hot(x, 30));
    const latch = battle("twinlatch"), breaker = battle("platebreaker");
    latch.sfx[0].w3.release.set(30, 0.2); // what the arena's react() sets on a `release` event
    breaker.sfx[0].w3.spent.set(30, false); // what it sets when SHIELD FUEL's last blow found no plating to take
    gate(breaker, 30).flash = 0.5; // the blow itself: a hit flash, so the rig draws working (its plain-blow look differs from the plain look only while it works)
    expect(cruiserModel(pincer).rigs.get(30)!.w3, "the deck gives PINCER its crowd").toEqual({ crowd: 1 });
    const scenes: [string, Build, CruiserView, Wave3RigState, string, boolean][] = [
      ["pincer", pincer, buildView(pincer), { crowd: 1 }, "c1", false],
      ["twinlatch", latch.b.sides[0].build, battleView(latch), { latch: "release" }, "release", false],
      ["platebreaker", breaker.b.sides[0].build, battleView(breaker), { spent: false }, "n", true],
    ];
    for (const [id, b, v, st, key, working] of scenes) {
      if (v.sim) expect(momentOf(id === "twinlatch" ? latch : breaker, v, 30), `${id}: rigMoment`).toEqual(st);
      expect(stKey(st), `${id}: the state's key`).toBe(key);
      expect(artBBoardState(id, 0, false, key), `${id}: art B has no state look for it`).toBeNull();
      setArtB(true);
      const on = drawDeck(v);
      setArtB(false);
      const off = drawDeck(v);
      setArtB(true);
      expect(cellOf(on, b, 30), `${id} ${JSON.stringify(st)}: the cell, art on = art off`).toEqual(cellOf(off, b, 30));
      const n = cellCheck(on, b, 30, wave3GateSprite(id, 0, working, st)!, gateSprite(id, 0, working));
      expect([n.total > 0, n.shown > 0, n.stale], `${id} ${JSON.stringify(st)}: the base's state look shows`).toEqual([true, true, 0]);
    }
  });
});
