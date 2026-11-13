// ARTB-CODE-3B (REQ-BFG-126, REVIEW-CODE3A F1), item S: art B's own STATE looks. A rig in a battle or deck state used to be drawn as the BASE's wave3GateSprite whole (machinery.ts drawRigs: the old art in place of art B's
// sprite, for as long as the state lasted). Now the data carries a small patch per state (work["board/<id>"].state = { "<key>": [phase, ...] }, a phase a list of [x, y, legend character]) for the three rigs that ride and show
// a state: TWIN GAUGE `m` (one phase), BRACE FRAME `s` (one), IRON WALL `p` (two). artB.ts artBBoardState(id, frame, active, key) lays the patch over board/<id> (and over its work phase while it works); machinery.ts asks it first and
// draws wave3GateSprite only on null (art B holds no board sprite for the rig: a held rig, PINCER, TWIN LATCH and SHIELD FUEL, or the switch off). This file pins, for every (id, key, frame, idle and working), that the deck's sprite is
// board/<id> + work + the patch, pixel for pixel from the JSON; that a rig without a patch for a key shows its plain art B sprite (never null, never the base's); that a rig art B does not draw answers null; that with the switch
// off the base draws as it did; and three scenes through the game's own drawMachinery (TWIN GAUGE on a matched belt on a build deck, IRON WALL plated in a battle, BRACE FRAME shrugging in a battle).
// Every expectation is decoded from tools/artb/artb-slice.json or read from the game: no pixel, digest or pixel count is typed. The held rigs' states are pinned in tests/artb3.hold.test.ts.
import { afterEach, describe, expect, it } from "vitest";
import { R, installRaster } from "./raster.helpers";

installRaster();

import type { Arena } from "../src/game/arena";
import { ITEMS } from "../src/sim/content";
import type { Build } from "../src/sim/deck";
import { heroStartBuild } from "../src/sim/heroBuilds";
import { cruiserModel } from "../src/render/cruiser";
import { artBBoard, artBBoardSil, artBBoardState, setArtB } from "../src/render/artB";
import { gateSil, gateSprite } from "../src/render/sprites";
import { stKey, wave3GateSprite, type Wave3RigState } from "../src/render/wave3Art";
import { rigMoment } from "../src/render/wave3Moments";
import { ALL_RIGS, SHAPED, STATE_RIGS, data, expected, phase, same } from "./artb3.helpers";
import { battleView, buildView, cellCheck, cellOf, drawDeck, gate, hot, momentOf, play } from "./artb3.scene";
import { barge, furnaceBench, item, withItem } from "./wave3.helpers";

/** the state each of the three rigs can be in, as wave3Moments.ts rigMoment gives it */
const STATE_OF: Record<string, Wave3RigState> = { twingauge: { matched: true }, braceframe: { shrug: true }, shieldwall: { plated: true } };
/** the keys wave3Art.ts stKey makes of every state a wave-3 rig can have (a rig has only its own fields, so one of these) */
const KEYS = ["m", "c1", "c2", "c3", "s", "hold", "release", "n", "p"];
const STATE_IDS = Object.keys(STATE_RIGS);
/** frames 0..7 and the wrapped ones (the clock keeps counting) */
const FR = [0, 1, 2, 3, 4, 5, 6, 7, -1, 8, 9, 17];
const WAVES = [false, true];
const ONE_CELL = ALL_RIGS.filter((id) => !SHAPED.includes(id));
/** the patch phase artBBoardState lays over board/<id> at frame m: the one phase, or phase (m >> 1) & 1 */
const patchAt = (id: string, key: string, m: number) => { const l = data.work[`board/${id}`].state![key]; return l[((m >> 1) & 1) % l.length]; };

afterEach(() => setArtB(true));

describe("ARTB-CODE-3B S: the three rigs that show a state through art B", () => {
  it("TWIN GAUGE (m), BRACE FRAME (s) and IRON WALL (p): the game's names, and the data's state keys are the keys wave3Art's stKey makes of the states rigMoment gives them", () => {
    expect(STATE_IDS).toEqual(["twingauge", "braceframe", "shieldwall"]);
    expect(STATE_IDS.map((id) => ITEMS[id].name)).toEqual(["TWIN GAUGE", "BRACE FRAME", "IRON WALL"]);
    for (const id of STATE_IDS) {
      expect(Object.keys(data.work[`board/${id}`].state!), `${id}: the data's keys`).toEqual(Object.keys(STATE_RIGS[id]));
      expect([stKey(STATE_OF[id])], `${id}: stKey of its state`).toEqual(Object.keys(STATE_RIGS[id]));
      expect(data.work[`board/${id}`].work!.length, `${id}: it also works (two work phases)`).toBe(2);
    }
    // the build screen's deck gives TWIN GAUGE its state from cruiserModel's `w3` (matched); the other two need a battle (the scenes below)
    expect(rigMoment("twingauge", 60, null, undefined, undefined, { matched: true })).toEqual({ matched: true });
    expect(rigMoment("braceframe", 30, null, undefined, undefined, { shrug: true })).toEqual({});
    expect(rigMoment("shieldwall", 30, null, undefined, undefined, { plated: true })).toEqual({});
  });

  it("for every (id, key, frame 0..7 and wrapped, idle and working) the deck's sprite under art B is board/<id> + its work phase + the state's patch, pixel for pixel from the JSON", () => {
    setArtB(true);
    let n = 0;
    for (const id of STATE_IDS) for (const key of Object.keys(STATE_RIGS[id])) {
      const name = `board/${id}`;
      for (const f of FR) for (const active of WAVES) {
        const m = ((f % 8) + 8) % 8;
        const ov = [...(active ? phase(name, "work", (m >> 1) & 1) : []), ...patchAt(id, key, m)];
        same(artBBoardState(id, f, active, key), expected(name, ov), `${id} key ${key} frame ${f} ${active ? "working" : "idle"}`);
        n++;
      }
    }
    expect(n, "3 rigs x 12 frames x idle and working").toBe(3 * FR.length * 2);
  });

  it("the patch shows and the base's drawing does not: the state's sprite differs from art B's plain sprite and from wave3Art's own state look at every frame, idle and working; IRON WALL's two phases differ", () => {
    setArtB(true);
    for (const id of STATE_IDS) for (const f of FR) for (const active of WAVES) {
      const st = R(artBBoardState(id, f, active, Object.keys(STATE_RIGS[id])[0])).px;
      expect(st, `${id} frame ${f} ${active ? "working" : "idle"}: not art B's plain sprite`).not.toEqual(R(artBBoard(id, f, active)).px);
      expect(st, `${id} frame ${f} ${active ? "working" : "idle"}: not the base's state look`).not.toEqual(R(wave3GateSprite(id, f, active, STATE_OF[id])).px);
    }
    expect(R(artBBoardState("shieldwall", 0, false, "p")).px, "IRON WALL's two phases differ").not.toEqual(R(artBBoardState("shieldwall", 2, false, "p")).px);
  });

  it("a rig art B draws that has no patch for the key answers its plain art B sprite (what artBBoard gives), never null, whatever the key", () => {
    setArtB(true);
    let n = 0;
    for (const id of ONE_CELL) for (const key of [...KEYS, "", "zz"]) {
      if (STATE_RIGS[id]?.[key] !== undefined) continue;
      const name = `board/${id}`;
      for (const f of FR) for (const active of WAVES) {
        const m = ((f % 8) + 8) % 8;
        same(artBBoardState(id, f, active, key), expected(name, active ? phase(name, "work", (m >> 1) & 1) : []), `${id} key "${key}" frame ${f} ${active ? "working" : "idle"}`);
        n++;
      }
    }
    expect(n, "22 one-cell rigs x keys without a patch x 12 frames x 2").toBeGreaterThan(22 * 9 * FR.length * 2 - 3 * FR.length * 2);
    // the three state rigs with a key that is not theirs: also the plain sprite (a TWIN GAUGE asked for "p")
    for (const [id, key] of [["twingauge", "p"], ["braceframe", "m"], ["shieldwall", "s"]]) same(artBBoardState(id, 0, false, key), expected(`board/${id}`), `${id} key ${key}`);
  });
});

describe("ARTB-CODE-3B S: where art B has no board sprite the base's drawing runs, as it always did", () => {
  it("null for every piece of the game that is not a one-cell rig art B draws (a held rig, a gun, a mod, a factory, any other rig) and for an id that is no piece, at every key", () => {
    setArtB(true);
    const others = [...Object.keys(ITEMS).filter((id) => !ALL_RIGS.includes(id)), "nosuchpiece", "board/twingauge"];
    expect(others).toEqual(expect.arrayContaining(["pincer", "twinlatch", "platebreaker", "stoker", "scrapcannon", "dartgun", "wardbell", "kiln", "mendpress"]));
    for (const id of others) for (const key of KEYS) for (const f of [0, 2]) for (const active of WAVES) expect(artBBoardState(id, f, active, key), `${id} key ${key}`).toBeNull();
  });

  it("with the switch off artBBoardState answers null for every id and key: the deck draws wave3GateSprite as it did", () => {
    setArtB(false);
    for (const id of [...ALL_RIGS, ...Object.keys(ITEMS)]) for (const key of KEYS) expect(artBBoardState(id, 0, true, key), `${id} key ${key}`).toBeNull();
  });
});

describe("ARTB-CODE-3B X: the hit flash never lays art B's silhouette over the base's look (the cause of ARTB-CODE-3A's 20 px outside the boxes)", () => {
  // The cause (found by the controlled experiment kit/xsupp.* on the frame dusk-pool-d10-mid-phone; W/output-artb3b/REPORT.md section X): drawRigs draws a flashing rig as its sprite and then gateSil(id), a white silhouette at alpha 0.7
  // (C.white). At ARTB-CODE-3A a rig in a battle moment state was drawn by the BASE's wave3GateSprite whole while gateSil(id) was already art B's silhouette, so the white laid over the old art had art B's shape: 496 px of the cell differed
  // from the 0.9.18 frame, 20 of them outside every sprite's box. Leave the silhouettes out and the cell equalled the 0.9.18 frame. Now a state sprite and its silhouette come from the same art, or both from the base.
  it("art B answers a rig's state sprite and its hit silhouette together: artBBoardState, artBBoardSil and artBBoard are all null or all not null, for every piece of the game and every key", () => {
    setArtB(true);
    let both = 0;
    for (const id of Object.keys(ITEMS)) for (const key of KEYS) {
      const st = artBBoardState(id, 0, false, key) !== null, sil = artBBoardSil(id) !== null, board = artBBoard(id, 0, false) !== null;
      expect([st, sil], `${id} key ${key}: state sprite, silhouette`).toEqual([board, board]);
      if (board) both++;
    }
    expect(both, "the 24 rigs art B draws, 9 keys each").toBe(ALL_RIGS.length * KEYS.length);
  });

  /** A flashing rig `id` (rig 30 on FURNACE's bench, a hit flash running) in its state and out of it: the cell of the deck drawn with every paint (the translucent silhouette too), and which cell px differ between the two. */
  function flashCell(id: string, def: Build, on: (a: Arena) => void, off: (a: Arena) => void): { got: Set<number>; expect: Set<number>; st: Wave3RigState } {
    const a = play(def, barge(), (x) => x.b.t > 2 && !hot(x, 30));
    gate(a, 30).flash = 0.5; // a hit: the rig draws working, and its white silhouette goes over it at alpha 0.7
    off(a);
    const plain = cellOf(drawDeck(battleView(a), false), def, 30);
    on(a);
    const v = battleView(a);
    const st = momentOf(a, v, 30);
    const state = cellOf(drawDeck(v, false), def, 30);
    const key = stKey(st), want = R(artBBoardState(id, 0, true, key)), bare = R(artBBoard(id, 0, true)), sil = R(gateSil(id));
    const exp = new Set<number>(), got = new Set<number>();
    for (let j = 0; j < 12; j++) for (let i = 0; i < 12; i++) {
      const wp = want.at(i, j);
      if (wp !== null && wp !== bare.at(i, j) && sil.at(i, j) === null) exp.add(j * 12 + i);
      if (state[j * 12 + i] !== plain[j * 12 + i]) got.add(j * 12 + i);
    }
    return { got, expect: exp, st };
  }

  it("a flashing IRON WALL and a flashing BRACE FRAME in their states: the cell differs from the same rig's plain flashing cell only at the state's own pixels that the white silhouette does not cover", () => {
    setArtB(true);
    const wall = flashCell("shieldwall", withItem(furnaceBench(), item(30, "shieldwall", 3, 3, 0)), (a) => { a.b.sides[0].plate.plate = 1000; }, (a) => { a.b.sides[0].plate.plate = 0; });
    expect(wall.st, "rigMoment: plated").toEqual({ plated: true });
    for (const k of wall.got) expect(wall.expect.has(k), `IRON WALL: cell px ${k % 12},${Math.floor(k / 12)} differs from the plain flashing wall but is not a state pixel outside the silhouette`).toBe(true);
    const brace = flashCell("braceframe", withItem(furnaceBench(), item(30, "braceframe", 3, 4, 0)), (a) => { a.sfx[0].w3.shrug.set(30, 0.2); }, (a) => { a.sfx[0].w3.shrug.delete(30); });
    expect(brace.st, "rigMoment: shrugging").toEqual({ shrug: true });
    expect(brace.expect.size, "BRACE FRAME's sparks lie outside its silhouette").toBeGreaterThan(0);
    expect(brace.got.size, "the sparks show through the flash").toBeGreaterThan(0);
    for (const k of brace.got) expect(brace.expect.has(k), `BRACE FRAME: cell px ${k % 12},${Math.floor(k / 12)} differs from the plain flashing rig but is not a state pixel outside the silhouette`).toBe(true);
  });
});

describe("ARTB-CODE-3B S: scenes through the game's own drawMachinery (drawRigs): the pixels at the rig's cell are art B's", () => {
  const gaugeDeck = () => withItem(heroStartBuild("foundry", 1), item(60, "twingauge", 1, 3, 1)); // FOUNDRY's mirrored belts are matched

  it("TWIN GAUGE on a matched belt on a build deck: the cell shows art B's board sprite with the patch laid over it (m), not the base's needles", () => {
    setArtB(true);
    const b = gaugeDeck();
    expect(cruiserModel(b).rigs.get(60)!.w3, "the deck gives TWIN GAUGE its state").toEqual({ matched: true });
    const n = cellCheck(drawDeck(buildView(b)), b, 60, artBBoardState("twingauge", 0, false, "m")!, artBBoard("twingauge", 0, false)!, wave3GateSprite("twingauge", 0, false, { matched: true }));
    expect(n.total, "the patch has pixels").toBeGreaterThan(0);
    expect(n.shown, "the patch's pixels show").toBeGreaterThan(0);
    expect(n.stale, "no plain look where the state should be").toBe(0);
    expect(n.leak, "none of the base's state look shows").toBe(0);
    expect(n.shown + n.covered, "every patch pixel is shown or lies under a nozzle").toBe(n.total);
    // a lone TWIN GAUGE (no matched belt) draws art B's plain sprite
    const lone = withItem(furnaceBench(), item(60, "twingauge", 3, 3, 1));
    expect(cruiserModel(lone).rigs.get(60)!.w3).toBeUndefined();
    const p = cellCheck(drawDeck(buildView(lone)), lone, 60, artBBoardState("twingauge", 0, false, "m")!, artBBoard("twingauge", 0, false)!);
    expect(p.shown, "no state pixels on a lone belt").toBe(0);
    expect(p.stale, "the plain look shows where the patch would be").toBeGreaterThan(0);
    expect(p.stale + p.covered, "every would-be patch pixel shows the plain look or lies under a nozzle").toBe(p.total);
  });

  it("the same deck with the switch off draws the base's wave3GateSprite state look, as today", () => {
    setArtB(false);
    const b = gaugeDeck();
    const n = cellCheck(drawDeck(buildView(b)), b, 60, wave3GateSprite("twingauge", 0, false, { matched: true })!, gateSprite("twingauge", 0, false));
    expect([n.shown > 0, n.stale]).toEqual([true, 0]);
  });

  it("IRON WALL plated in a battle (the hull holds its plating): the cell shows art B's board sprite with the boss patch (p), phase (frame >> 1) & 1, at two clocks", () => {
    setArtB(true);
    const b = withItem(furnaceBench(), item(30, "shieldwall", 3, 3, 0));
    const a = play(b, barge(), (x) => x.b.t > 2 && !hot(x, 30));
    a.b.sides[0].plate.plate = 0; // the same battle without plating: the reference picture (rigMoment gives no state)
    const plainDecks = [0, 0.25].map((t) => drawDeck(battleView(a, t)));
    expect(momentOf(a, battleView(a), 30), "below the threshold: no state").toEqual({});
    a.b.sides[0].plate.plate = 1000; // the hull's plating pool: rigMoment reads it against IRON WALL's threshold
    for (const [k, [t, frame]] of [[0, 0], [0.25, 2]].entries()) {
      const v = battleView(a, t), st = momentOf(a, v, 30);
      expect(st, "rigMoment: plated").toEqual({ plated: true });
      expect(stKey(st)).toBe("p");
      const n = cellCheck(drawDeck(v), v.build, 30, artBBoardState("shieldwall", frame, false, "p")!, artBBoard("shieldwall", frame, false)!, wave3GateSprite("shieldwall", frame, false, st), plainDecks[k]);
      expect([n.total > 0, n.shown > 0, n.stale, n.leak], `IRON WALL at clock ${t} (frame ${frame})`).toEqual([true, true, 0, 0]);
      expect(n.shown + n.covered).toBe(n.total);
      // and the plain deck of the same battle shows no state pixels (art B's plain sprite)
      const q = cellCheck(plainDecks[k], v.build, 30, artBBoardState("shieldwall", frame, false, "p")!, artBBoard("shieldwall", frame, false)!);
      expect([q.shown, q.stale > 0, q.stale + q.covered], "no state pixels without plating").toEqual([0, true, q.total]);
    }
  });

  it("BRACE FRAME shrugging in a battle (its brace event's timer is running): the cell shows art B's board sprite with the bolt patch (s), not the base's glow", () => {
    setArtB(true);
    const b = withItem(furnaceBench(), item(30, "braceframe", 3, 4, 0));
    const a = play(b, barge(), (x) => x.b.t > 2 && !hot(x, 30));
    const plain = drawDeck(battleView(a)); // the same battle before the shrug: the reference picture
    a.sfx[0].w3.shrug.set(30, 0.2); // what the arena's react() sets on a `brace` event
    const v = battleView(a), st = momentOf(a, v, 30);
    expect(st, "rigMoment: shrugging").toEqual({ shrug: true });
    expect(stKey(st)).toBe("s");
    const n = cellCheck(drawDeck(v), v.build, 30, artBBoardState("braceframe", 0, false, "s")!, artBBoard("braceframe", 0, false)!, wave3GateSprite("braceframe", 0, false, st), plain);
    expect([n.total > 0, n.shown > 0, n.stale, n.leak]).toEqual([true, true, 0, 0]);
    expect(n.shown + n.covered).toBe(n.total);
  });
});
