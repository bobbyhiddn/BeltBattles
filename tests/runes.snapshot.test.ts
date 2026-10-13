// RUNES-1 (REQ-BFG-058) M3: snapshot v3 and the rune checks on both sides, pinned together (R1b-2 4.2; the model is
// tests/belts.snapshot.test.ts). The client's full check (src/game/ghostSnapshot.ts isSnapshot, which runs runes.ts
// runeProblem, then validate.ts validateUpload with the snapshot's seed, as online.ts does before an upload) and the
// server's (src/net/snapshot.ts checkSnapshot, then validateUpload with the seed, as server/app.ts POST /v1/ghosts does)
// must agree on every row. A second case pins runeOffer to literal (seed, day, hero) -> ids triples, so a catalogue edit
// can't move offers silently. A third goes through the in-process server: the seed is stored and never served (FIX-6).
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import * as local from "../src/game/ghostSnapshot";
import * as net from "../src/net/snapshot";
import { validateUpload } from "../src/net/validate";
import { offlineGhost, STAND_IN_HEROES } from "../src/net/fallback";
import { RULES_VERSION, type HeroId } from "../src/sim/content";
import { RUNE_LIST, RUNES, runeGrants, runeOffer } from "../src/sim/runes";
import type { Build } from "../src/sim/deck";
import { generateSamplePool } from "../tools/samplePool";
import { ghostOf } from "../src/game/day";
import { newRun } from "../src/game/run";
import { servedSnapshot, type GhostServer } from "../server/app";
import type { Identity } from "../src/net/identity";
import { storeBackends } from "./netStores";
import { signedHeaders, testIdentity } from "./netIdentity";
import { openRunesFor } from "../src/net/rulesGate"; // HULL-ON (the flip, OPEN_RUNES): the offer rule of this build's rules
import { HEARTS_START } from "../src/sim/hearts"; // HULL-ON (the flip, HEARTS): the best record's hearts

type Snap = Record<string, unknown> & { build: Build & Record<string, unknown> };
const POOL = generateSamplePool();
const SEED = 4242;

function clientOk(s: unknown): boolean {
  if (!local.isSnapshot(s)) return false;
  return validateUpload(s.build, s.day, s.rules, { seed: s.seed }).ok;
}
function serverOk(s: unknown): boolean {
  try {
    const c = net.checkSnapshot(s);
    return validateUpload(c.build, c.day, c.rules, { seed: c.seed }).ok;
  } catch {
    return false;
  }
}
const both = (s: unknown) => [clientOk(s), serverOk(s)];

/** A legal pick sequence for (seed, hero) through `days` dawns: each dawn's first card that only acts in battle (so the
 *  pool deck's hull, belt and gold need no change), else its first card. HULL-ON (the flip, OPEN_RUNES): each dawn's offer
 *  under this build's rules (open: openRunesFor(RULES_VERSION)), the offer validateUpload re-derives (was runeOffer's
 *  default, the closed offer, which the upload check no longer derives under bb-0.10.0). */
const OPEN = openRunesFor(RULES_VERSION);
function legalRunes(seed: number, hero: HeroId, days: number): { id: string }[] {
  const held: string[] = [];
  for (let d = 1; d <= days; d++) {
    const ids = runeOffer(seed, d, hero, held, OPEN).ids;
    held.push(ids.find((id) => !["hull", "belt", "dawnGold"].includes(RUNES[id].kind)) ?? ids[0]);
  }
  return held.map((id) => ({ id }));
}

/** FLIP-X2: `s` as a rune-less v2 snapshot (no build.runes, no seed: both are v3 only), the runes' HULL and BELT taken
 *  back out of the build (the deck as an older client held it). HULL-ON (the flip, PICK): and no grade (v3 only too): the
 *  seed step writes one on every pool deck with PICK on, and a v2 copy carrying it was refused for it ("snapshot.grade:
 *  not allowed in a v2 snapshot") instead of being the plain v2 snapshot the callers mean. */
function bareV2(s: Snap): Snap {
  const { runes, ...build } = s.build;
  const g = runeGrants(runes, s.day as number);
  const { seed: _seed, grade: _grade, ...rest } = s;
  return { ...rest, v: 2, build: { ...build, hullBonus: build.hullBonus - g.hull, beltCap: build.beltCap - g.belt } as Snap["build"] };
}

/** `s` as a v3 snapshot carrying `seed` and `runes`, with the runes' HULL and BELT on the build (run.ts takeRune). */
function withRunes(s: Snap, runes: { id: string }[], seed: number | null = SEED): Snap {
  const b = { ...s.build, runes } as Snap["build"];
  for (const q of runes) {
    const d = RUNES[q.id];
    if (d?.kind === "hull") b.hullBonus += d.amount.n;
    if (d?.kind === "belt") b.beltCap += d.amount.n;
  }
  return { ...s, v: 3, build: b, ...(seed === null ? {} : { seed }) };
}

describe("RUNES-1 M3: snapshot v3, the client's and the server's checks agree", () => {
  const base = POOL.find((s) => s.day === 6 && s.build.upgrades === undefined && (s.build.mods?.length ?? 0) > 0) as unknown as Snap;
  const hero = base.hero as HeroId;
  const runes = legalRunes(SEED, hero, 6);
  const legal = withRunes(base, runes);
  const notHeld = (tier: string, not: string[]) => RUNE_LIST.find((d) => d.tier === tier && !not.includes(d.id) && !["hull", "belt", "dawnGold"].includes(d.kind))!;
  const offered3 = runeOffer(SEED, 3, hero, runes.slice(0, 2).map((q) => q.id), OPEN).ids; // HULL-ON (the flip, OPEN_RUNES): the open offer
  const wrong3 = notHeld(RUNES[runes[2].id].tier, [...offered3, ...runes.map((q) => q.id)]);
  const swap = (i: number, id: string) => runes.map((q, j) => (j === i ? { id } : q));
  const rows: [string, unknown, boolean][] = [
    ["a legal day-6 build: 6 runes, each from its dawn's offer, with its seed", legal, true],
    // FLIP-X2: cap's ruling 5d6d83ef57d1494c (item 5): validateUpload's player mode now wants exactly `day` runes, so
    // both sides refuse 5 on day 6 ("rune: runes: 5 held on day 6, one a dawn (6)"; not DORMANT_RUNES, not an offer):
    // true -> false
    ["the same with 5 runes (fewer than the day: refused since the exact count, cap's ruling 5d6d83ef57d1494c)", withRunes(base, runes.slice(0, 5)), false],
    ["the same without its seed (a served ghost, FIX-6): the offer rule is skipped", withRunes(base, runes, null), true],
    ["one rune too many (7 on day 6)", withRunes(base, [...runes, { id: notHeld("common", runes.map((q) => q.id)).id }]), false],
    ["a rune its dawn didn't offer (day 3)", withRunes(base, swap(2, wrong3.id)), false],
    ["that rune again, served without the seed: the offer rule is skipped", withRunes(base, swap(2, wrong3.id), null), true],
    ["a duplicate", withRunes(base, swap(5, runes[0].id)), false],
    ["an unknown rune", withRunes(base, swap(5, "no_such_rune")), false],
    ["a rune id that is no id", withRunes(base, swap(5, "War Edge")), false],
    ["a rune entry with GROW-1's counter n", withRunes(base, runes.map((q, j) => (j === 0 ? { ...q, n: 1 } : q))), false],
    ["a rune entry with another key", withRunes(base, runes.map((q, j) => (j === 0 ? { ...q, x: 1 } : q))), false],
    ["runes that are no list", { ...legal, build: { ...legal.build, runes: { id: runes[0].id } } }, false],
    ["the build's held gold (R1b-2/R1d: off)", { ...legal, build: { ...legal.build, gold: 5 } }, false],
    ["an item's grow (GROW-1: off)", { ...legal, build: { ...legal.build, items: legal.build.items.map((p, j) => (j === 0 ? { ...p, grow: 1 } : p)) } }, false],
    ["a mod's grow (GROW-1: off)", { ...legal, build: { ...legal.build, mods: legal.build.mods.map((p, j) => (j === 0 ? { ...p, grow: 1 } : p)) } }, false],
    ...(["losses", "mode", "endlessWins", "endlessLives", "victoryDay", "battleGold"] as const).map((k): [string, unknown, boolean] =>
      [`the snapshot's ${k} (R1e/R1d: off)`, { ...legal, [k]: k === "mode" ? "run" : 1 }, false]),
    ["seed 0 (left out when zero)", { ...legal, seed: 0 }, false],
    ["seed 2^32", { ...legal, seed: 2 ** 32 }, false],
    ["seed 1.5", { ...legal, seed: 1.5 }, false],
    ["seed as a string", { ...legal, seed: "4242" }, false],
    ["its v2 copy (runes and the seed need v3)", { ...legal, v: 2 }, false],
    ["its v2 copy with the seed only", { ...withRunes(base, [], SEED), build: base.build, v: 2 }, false],
    // FLIP-X2: `base` (the regenerated pool's day-6 deck) now holds 6 runes, so "no runes" is its rune-less copy
    // (bareV2); the exact count (cap's ruling 5d6d83ef57d1494c: 0 held on day 6) refuses it on both sides: true -> false
    ["a v3 snapshot with the seed and no runes", { ...bareV2(base), v: 3, seed: SEED }, false],
    ["a v3 snapshot with no v3 field at all", { ...bareV2(base), v: 3 }, false],
    ["v4", { ...legal, v: 4 }, false],
  ];

  it("every row: both sides give the same verdict, the one expected", () => {
    expect(runes.length).toBe(6);
    for (const [name, s, ok] of rows) expect(both(s), name).toEqual([ok, ok]);
    // the rows that differ only by the seed: the offer rule is what refuses them
    expect("seed" in (rows[2][1] as object)).toBe(false);
  });

  it("every seed-pool ghost and every stand-in passes both checks, as v2 and as v3 with a seed", () => {
    const standIns = STAND_IN_HEROES.flatMap((h) => Array.from({ length: 10 }, (_, i) => offlineGhost(h, i + 1, 900 + i).snapshot));
    expect(POOL.length).toBeGreaterThan(100);
    for (const s of [...POOL, ...standIns]) {
      const tag = `${s.hero} d${s.day} ${s.runId}`;
      expect(both(s), tag).toEqual([true, true]);
      // FLIP-X2: the seed pool (94e0cbf) and the stand-ins (eb22262) are v3 now, each deck holding its day's runes. v3
      // with a seed: a race ghost's own par-run seed passes (the offer rule holds); a sample, floor or stand-in deck
      // stores no run seed (its runes follow none), so a made-up seed (1 + day * 7919) is refused by the offer rule on
      // both sides (was [true, true] for every ghost: the decks held no runes)
      const seeded = typeof s.seed === "number";
      expect(both({ ...s, v: 3, seed: seeded ? s.seed : 1 + (s.day * 7919) }), `${tag} v3`).toEqual(seeded ? [true, true] : [false, false]);
      // FLIP-X2: as v2 the deck can't hold its runes (build.runes is v3 only): its rune-less v2 copy is refused on both
      // sides by the exact count (cap's ruling 5d6d83ef57d1494c: 0 held on day N) (was: the stored v2 ghost, [true, true])
      expect(both(bareV2(s as unknown as Snap)), `${tag} v2`).toEqual([false, false]);
    }
  });

  it("the canonical copy writes the v3 fields last: name, then seed; the build's runes after every other key", () => {
    const named = { ...legal, name: "TESTER" };
    const text = net.encodeSnapshot(named as never);
    // HULL-ON (the flip, PICK): `legal` is a pool deck, which carries the seed step's grade (written with PICK on), and the
    // canonical copy writes the grade after the seed, last of all (snapshot.ts gradeField): `"seed":4242}` ->
    // `"seed":4242,"grade":<its grade>}`. A copy without a grade (every upload, the game's own) still ends name, then seed
    expect(text.endsWith(`"name":"TESTER","seed":${SEED},"grade":${legal.grade as number}}`)).toBe(true);
    expect(net.encodeSnapshot({ ...named, grade: undefined } as never).endsWith(`"name":"TESTER","seed":${SEED}}`)).toBe(true);
    const keys = Object.keys(JSON.parse(text).build);
    expect(keys[keys.length - 1]).toBe("runes");
    // a snapshot without any v3 field encodes byte for byte as before
    expect(net.encodeSnapshot(base as never)).toBe(JSON.stringify(net.checkSnapshot(base)));
    // FLIP-X2: the seed pool regenerated (94e0cbf): `base`, its day-6 deck, now holds its 6 runes and travels as v3, so
    // it is no longer a snapshot without a v3 field (its text includes "runes": false -> true). The no-v3-field check
    // moves to its rune-less v2 copy (no runes, no seed), the snapshot the line is about
    expect(net.encodeSnapshot(base as never).includes("runes")).toBe(true);
    const bare = bareV2(base);
    expect(net.encodeSnapshot(bare as never)).toBe(JSON.stringify(net.checkSnapshot(bare)));
    expect(net.encodeSnapshot(bare as never).includes("runes")).toBe(false);
  });

  it("the game's own snapshot (day.ts ghostOf) is v3 with the run seed and the held runes, and both checks take it", () => {
    const run = newRun("weaver", 31337);
    const picks: string[] = [];
    for (let d = 1; d <= 1; d++) picks.push(runeOffer(run.seed, d, run.hero, picks).ids[0]);
    run.build.runes = picks.map((id) => ({ id }));
    const s = ghostOf(run, 1_790_000_000_000, "ptest", "TESTER");
    expect([s.v, s.seed]).toEqual([3, 31337]);
    expect(both(s)).toEqual([local.isSnapshot(s), true]);
  });
});

describe("RUNES-1 M3: runeOffer pinned (a catalogue edit can't move offers silently)", () => {
  it("literal (seed, day, hero) -> ids triples, with nothing held", () => {
    // RUNES-2a (decision 4): re-pinned for the 57-rune catalogue (all six moved: the commons and rares grew, and the two
    // epic dawns now show EPIC, not RARE); plus a 3-card epic dawn and a 2-card legendary dawn.
    // RUNES-087F: item 1 (cap's Q1): TWIN SUNS took MOLTEN VOWS' epic place and MOLTEN VOWS TWIN SUNS' legendary one (same
    // theme, same weight), so the last two dawns show each other's FOUNDRY rune. Item 2 (the Q2 guard): EMBER SHOT a
    // generic epic and MANY HANDS a generic common (turrets weigh 2 for every hero) move three dawns: 4242 d3 (was
    // tar_barrel, oiled_cogs, ash_cloak), 123456789 d10 (was warlords_due, scrap_saint) and 12 d4 (was warlords_due first)
    const pins: [number, number, HeroId, string[], string][] = [
      [1, 1, "furnace", ["tar_barrel", "sharp_scrap", "coin_purse"], "common"],
      // FLIP-X2: DORMANT_RUNES (searing, shatter_shot, coal_chute, heat_sink) left the offer pool (step 3b), moving
      // the common day-3+ dawns: was iron_skin, oiled_cogs, scrap_biter
      // BAL-2 (the lines: DORMANT_RUNES empty, the four back in the offer pool, COAL CHUTE among the commons): was tar_barrel,
      // oiled_cogs, scrap_halo. Cause check: FLIP-X2's four put back in DORMANT_RUNES at run time give every old pin here
      [4242, 3, "weaver", ["tar_barrel", "rivet_hoard", "scrap_halo"], "common"],
      // FLIP-X2: the same (DORMANT_RUNES left the offer pool): was ash_cloak, coin_purse
      [77, 5, "foundry", ["scrap_halo", "tar_barrel"], "common"],
      [123456789, 10, "bastion", ["ember_shot", "scrap_saint"], "epic"],
      [4294967295, 7, "furnace", ["pyre_heart", "last_stand"], "epic"],
      [12, 4, "foundry", ["ember_shot", "twin_suns", "scrap_saint"], "epic"],
      [23, 6, "foundry", ["bulwark_oath", "molten_vows"], "legendary"],
      // FLIP-X2: the same cause on days 1-2: their list is RUNE_LIST minus DORMANT_RUNES (COAL CHUTE and HEAT SINK are in
      // RUNE_LIST), so a day-2 draw moves too (seed 1 day 1 happens not to): was ash_kindle, ash_cloak, gun_oil
      // BAL-2 (the lines: DORMANT_RUNES empty): the day 1-2 list is RUNE_LIST itself again (COAL CHUTE and HEAT SINK back),
      // so this dawn is the one before FLIP-X2 again: was many_hands, bulkheads, oiled_cogs
      [2026, 2, "bastion", ["ash_kindle", "ash_cloak", "gun_oil"], "common"],
    ];
    for (const [seed, day, hero, ids, tier] of pins) {
      const o = runeOffer(seed, day, hero, []);
      expect([o.ids, o.tier], `${seed} d${day} ${hero}`).toEqual([ids, tier]);
    }
  });
});

describe.each(storeBackends().slice(0, 1))("RUNES-1 M3 through POST /v1/ghosts and the match on the $name store (FIX-6)", (backend) => {
  let app: GhostServer, url: string, me: Identity, other: Identity;
  beforeAll(async () => {
    await backend.setup();
    app = backend.server({ uploads: "open", log: () => {}, matchSalt: () => 0, rateLimit: { windowMs: 60_000, max: 10_000 } });
    url = `http://127.0.0.1:${await app.listen(0)}`;
    me = await testIdentity(0);
    other = await testIdentity(2);
  });
  afterAll(async () => {
    await app.close();
    await backend.teardown();
  });
  const base = POOL.find((s) => s.day === 4 && s.build.upgrades === undefined) as unknown as Snap;
  // HULL-ON (the flip, PICK): `grade: undefined` (JSON leaves it out): the pool deck carries the seed step's grade (written
  // with PICK on), and an upload carries none (the server refuses one: "grade: only the seed pool's ghosts carry a grade")
  const upload = (runes: { id: string }[], tag: string) =>
    ({ ...withRunes(base, runes), rules: RULES_VERSION, runId: `runes-${tag}`, playerId: me.playerId, name: "TESTER", grade: undefined });
  const post = async (s: unknown) => {
    const body = JSON.stringify(s);
    const r = await fetch(`${url}/v1/ghosts`, { method: "POST", headers: await signedHeaders(me, body), body });
    return { status: r.status, body: (await r.json()) as { id?: string; error?: string; errors?: string[] } };
  };

  it("a legal upload is stored with its seed; a rune its dawn didn't offer is a 422 naming it; nothing else is stored", async () => {
    const hero = base.hero as HeroId;
    const runes = legalRunes(SEED, hero, 4);
    const ok = await post(upload(runes, "ok"));
    expect(ok.status).toBe(201);
    const held = (await app.store.bucket(RULES_VERSION, 4)).find((e) => e.id === ok.body.id)!;
    expect([held.snapshot.seed, held.snapshot.build.runes]).toEqual([SEED, runes]);
    const offered = runeOffer(SEED, 4, hero, runes.slice(0, 3).map((q) => q.id), OPEN).ids; // HULL-ON (the flip, OPEN_RUNES): the open offer
    const wrong = RUNE_LIST.find((d) => d.tier === RUNES[runes[3].id].tier && !offered.includes(d.id) && !runes.some((q) => q.id === d.id) && !["hull", "belt", "dawnGold"].includes(d.kind))!;
    const bad = await post(upload([...runes.slice(0, 3), { id: wrong.id }], "bad"));
    expect(bad.status).toBe(422);
    expect(bad.body.errors).toEqual([`rune: runes[3]: ${wrong.name} was not offered at the dawn of day 4`]);
    const off = await post({ ...upload(runes, "off"), losses: 1 });
    expect([off.status, off.body.error]).toEqual([400, "snapshot.losses: not in this rules version yet"]);
  });

  it("the match serves the ghost without its seed; the served copy passes the client's checks (offer rule skipped)", async () => {
    // HULL-ON (the flip, HEARTS): lives=5 -> HEARTS_START (10): the best record a run carries into dusk 4 is 3W 10 hearts now
    // (the pool deck's label is on the hearts scale; D1 never serves a better record than the request's)
    const r = await fetch(`${url}/v1/ghosts/match?rules=${RULES_VERSION}&day=4&wins=3&lives=${HEARTS_START}&player=${other.playerId}&runs=99`);
    expect(r.status).toBe(200);
    const got = (await r.json()) as { id: string; snapshot: Record<string, unknown> };
    expect("seed" in got.snapshot).toBe(false);
    expect((got.snapshot.build as Build).runes?.length).toBe(4);
    expect(both(got.snapshot)).toEqual([true, true]);
    expect(servedSnapshot({ ...(got.snapshot as never), seed: 9 })).toEqual(got.snapshot);
  });
});
