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
import { RUNE_LIST, RUNES, runeOffer } from "../src/sim/runes";
import type { Build } from "../src/sim/deck";
import { generateSamplePool } from "../tools/samplePool";
import { ghostOf } from "../src/game/day";
import { newRun } from "../src/game/run";
import { servedSnapshot, type GhostServer } from "../server/app";
import type { Identity } from "../src/net/identity";
import { storeBackends } from "./netStores";
import { signedHeaders, testIdentity } from "./netIdentity";

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
 *  pool deck's hull, belt and gold need no change), else its first card. */
function legalRunes(seed: number, hero: HeroId, days: number): { id: string }[] {
  const held: string[] = [];
  for (let d = 1; d <= days; d++) {
    const ids = runeOffer(seed, d, hero, held).ids;
    held.push(ids.find((id) => !["hull", "belt", "dawnGold"].includes(RUNES[id].kind)) ?? ids[0]);
  }
  return held.map((id) => ({ id }));
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
  const offered3 = runeOffer(SEED, 3, hero, runes.slice(0, 2).map((q) => q.id)).ids;
  const wrong3 = notHeld(RUNES[runes[2].id].tier, [...offered3, ...runes.map((q) => q.id)]);
  const swap = (i: number, id: string) => runes.map((q, j) => (j === i ? { id } : q));
  const rows: [string, unknown, boolean][] = [
    ["a legal day-6 build: 6 runes, each from its dawn's offer, with its seed", legal, true],
    ["the same with 5 runes (fewer than the day is allowed until RUNES-2)", withRunes(base, runes.slice(0, 5)), true],
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
    ["a v3 snapshot with the seed and no runes", { ...base, v: 3, seed: SEED }, true],
    ["a v3 snapshot with no v3 field at all", { ...base, v: 3 }, true],
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
      expect(both({ ...s, v: 3, seed: 1 + (s.day * 7919) }), `${tag} v3`).toEqual([true, true]);
    }
  });

  it("the canonical copy writes the v3 fields last: name, then seed; the build's runes after every other key", () => {
    const named = { ...legal, name: "TESTER" };
    const text = net.encodeSnapshot(named as never);
    expect(text.endsWith(`"name":"TESTER","seed":${SEED}}`)).toBe(true);
    const keys = Object.keys(JSON.parse(text).build);
    expect(keys[keys.length - 1]).toBe("runes");
    // a snapshot without any v3 field encodes byte for byte as before
    expect(net.encodeSnapshot(base as never)).toBe(JSON.stringify(net.checkSnapshot(base)));
    expect(net.encodeSnapshot(base as never).includes("runes")).toBe(false);
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
    // epic dawns now show EPIC, not RARE); plus a 3-card epic dawn and a 2-card legendary dawn
    const pins: [number, number, HeroId, string[], string][] = [
      [1, 1, "furnace", ["tar_barrel", "sharp_scrap", "coin_purse"], "common"],
      [4242, 3, "weaver", ["tar_barrel", "oiled_cogs", "ash_cloak"], "common"],
      [77, 5, "foundry", ["ash_cloak", "coin_purse"], "common"],
      [123456789, 10, "bastion", ["warlords_due", "scrap_saint"], "epic"],
      [4294967295, 7, "furnace", ["pyre_heart", "last_stand"], "epic"],
      [2026, 2, "bastion", ["ash_kindle", "ash_cloak", "gun_oil"], "common"],
      // RUNES-087F (cap's Q1): TWIN SUNS took MOLTEN VOWS' epic place and MOLTEN VOWS TWIN SUNS' legendary one (same
      // theme, same weight), so these two dawns show each other's FOUNDRY rune; nothing else moved
      [12, 4, "foundry", ["warlords_due", "twin_suns", "scrap_saint"], "epic"],
      [23, 6, "foundry", ["bulwark_oath", "molten_vows"], "legendary"],
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
  const upload = (runes: { id: string }[], tag: string) =>
    ({ ...withRunes(base, runes), rules: RULES_VERSION, runId: `runes-${tag}`, playerId: me.playerId, name: "TESTER" });
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
    const offered = runeOffer(SEED, 4, hero, runes.slice(0, 3).map((q) => q.id)).ids;
    const wrong = RUNE_LIST.find((d) => d.tier === RUNES[runes[3].id].tier && !offered.includes(d.id) && !runes.some((q) => q.id === d.id) && !["hull", "belt", "dawnGold"].includes(d.kind))!;
    const bad = await post(upload([...runes.slice(0, 3), { id: wrong.id }], "bad"));
    expect(bad.status).toBe(422);
    expect(bad.body.errors).toEqual([`rune: runes[3]: ${wrong.name} was not offered at the dawn of day 4`]);
    const off = await post({ ...upload(runes, "off"), losses: 1 });
    expect([off.status, off.body.error]).toEqual([400, "snapshot.losses: not in this rules version yet"]);
  });

  it("the match serves the ghost without its seed; the served copy passes the client's checks (offer rule skipped)", async () => {
    const r = await fetch(`${url}/v1/ghosts/match?rules=${RULES_VERSION}&day=4&wins=3&lives=5&player=${other.playerId}&runs=99`);
    expect(r.status).toBe(200);
    const got = (await r.json()) as { id: string; snapshot: Record<string, unknown> };
    expect("seed" in got.snapshot).toBe(false);
    expect((got.snapshot.build as Build).runes?.length).toBe(4);
    expect(both(got.snapshot)).toEqual([true, true]);
    expect(servedSnapshot({ ...(got.snapshot as never), seed: 9 })).toEqual(got.snapshot);
  });
});
