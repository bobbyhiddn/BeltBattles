// 0.8.0 H2 M1 (REQ-BFG-009, REQ-BFG-016; backlog 325): POST /v1/ghosts refuses, with 422, a snapshot whose (day, wins,
// lives) record no run can carry into that day's dusk (src/net/records.ts isReachable, as the seed and ghosts:admin
// revalidate already check). Before H2 an honest, signed, budget-checked and hero-gated deck could carry a fake low
// record, for example day 1 with 1 life, and so be eligible for more matches (D1 serves only ghosts with no better
// record). The check comes after the rules check and validateUpload and before store.add, so nothing is stored.
// On both stores (tests/netStores.ts: JSON lines, and Tigris through tools/fakeS3.ts), uploads open in-process:
//  - every unreachable record the decoder takes gets 422 with the record error, and the store is unchanged: the
//    /v1/health ghosts count, the store's own listing (every day's bucket), its stored records and, on Tigris, every
//    object in the bucket (listed through the store's own S3 client);
//  - every reachable record of every day 1-10 (floorRecord included) gets 201 and is stored;
//  - the order: closed 403, signing 401, decode 400 (a record the decoder bounds keeps its 400), playerId 403, rules 422
//    (a bb-0.6.2 FURNACE snapshot with an unreachable record meets the rules 422, as a 0.7.0 page does), deck 422, then
//    the record 422;
//  - a resend of a stored ghost still gets 200; a ghost planted past POST with an unreachable record (stored before
//    this check) gets the record 422 on a resend, and the store keeps its one copy;
//  - all 120 bb-0.8.0 seed ghosts (generateSamplePool(), the RC's pool), posted as one player's signed dusks, get 201
//    (ported from the Prime's RC check, output-RC/verify-cap/zz-caprc.test.ts).
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { RULES_VERSION } from "../src/sim/content";
import { floorRecord, isReachable, reachableRecords } from "../src/net/records";
import { decodeSnapshot, encodeSnapshot, ghostId, MAX_DAY, type GhostSnapshot } from "../src/net/snapshot";
import { validateUpload } from "../src/net/validate";
import type { Identity } from "../src/net/identity";
import type { GhostServer } from "../server/app";
import { seedStore } from "../server/seed";
import type { TigrisStore } from "../server/tigrisStore";
import { generateSamplePool } from "../tools/samplePool";
import { storeBackends } from "./netStores";
import { ownedBy, signedHeaders, testIdentity } from "./netIdentity";

const POOL = generateSamplePool(); // the RC's bb-0.8.0 seed pool: 120 ghosts, four heroes x days 1-10 x 3
/** An honest deck of `day`: the FURNACE seed ghost of that day without turrets or joins where there is one. */
const deckOf = (day: number): GhostSnapshot => {
  const ofDay = POOL.filter((s) => s.day === day && s.hero === "furnace");
  return ofDay.find((s) => !s.build.turrets?.length && !s.build.routes.some((r) => r.join !== undefined)) ?? ofDay[0];
};
const recordError = (day: number, wins: number, lives: number) => `record: ${wins}W ${lives} lives is no record a run carries into dusk ${day}`;

/** The brief's unreachable records the decoder takes: [day, wins, lives]. The first is backlog 325's example. */
const UNREACHABLE: readonly [number, number, number][] = [
  [1, 0, 1], [1, 0, 4], [2, 1, 4], [3, 0, 3], [3, 1, 4], [2, 0, 6], [10, 9, 1],
];

describe("H2: the records the check refuses and takes (pure)", () => {
  it("the seven unreachable records pass the strict decoder with an honest deck of their day, and isReachable refuses each", () => {
    for (const [day, wins, lives] of UNREACHABLE) {
      const s = { ...deckOf(day), wins, lives };
      expect(validateUpload(s.build, day), `d${day}`).toEqual({ ok: true, errors: [] });
      expect(decodeSnapshot(encodeSnapshot(s)), `d${day} ${wins}W ${lives}L`).toEqual(s);
      expect(isReachable(day, wins, lives), `d${day} ${wins}W ${lives}L`).toBe(false);
    }
    expect(recordError(1, 0, 1)).toBe("record: 0W 1 lives is no record a run carries into dusk 1");
  });

  it("each day's floorRecord is reachable; 178 reachable records over days 1-10", () => {
    for (let day = 1; day <= MAX_DAY; day++) {
      const f = floorRecord(day);
      expect(isReachable(day, f.wins, f.lives), `d${day}`).toBe(true);
    }
    expect(Array.from({ length: MAX_DAY }, (_, i) => reachableRecords(i + 1).length).reduce((a, b) => a + b)).toBe(178);
  });
});

describe.each(storeBackends())("H2: POST /v1/ghosts and the record on the $name store (uploads open in-process)", (backend) => {
  let app: GhostServer, base: string, me: Identity, other: Identity;
  beforeAll(async () => {
    await backend.setup();
    app = backend.server({ uploads: "open", log: () => {}, matchSalt: () => 0, rateLimit: { windowMs: 60_000, max: 1_000_000 } });
    base = `http://127.0.0.1:${await app.listen(0)}`;
    me = await testIdentity(2);
    other = await testIdentity(1);
    expect(await seedStore(app.store)).toMatchObject({ rules: RULES_VERSION, entries: 120, written: 120 });
  }, 180_000);
  afterAll(async () => {
    await app.close();
    await backend.teardown();
  });

  let k = 0;
  /** `s` as `me` uploads it from a run of its own (a fresh runId and time, so each POST is a new ghost unless resent). */
  const mine = (s: GhostSnapshot): GhostSnapshot => ownedBy({ ...s, runId: `h2-${backend.name}-${k}`, createdAt: 1_790_200_000_000 + k++ }, me);
  const send = async (body: string, headers: Record<string, string>) => {
    const r = await fetch(`${base}/v1/ghosts`, { method: "POST", headers, body });
    return { status: r.status, body: (await r.json()) as { id?: string; error?: string; errors?: string[] } };
  };
  const post = async (s: GhostSnapshot, signer: Identity = me) => {
    const body = encodeSnapshot(s);
    return send(body, await signedHeaders(signer, body));
  };
  /** Signed raw JSON, for bodies encodeSnapshot itself refuses (it checks what it encodes). */
  const postRaw = async (o: unknown) => {
    const body = JSON.stringify(o);
    return send(body, await signedHeaders(me, body));
  };
  /** Everything a POST could have changed: health's count, the store's own listing, its records, the bucket's objects. */
  const state = async () => {
    const listing: string[] = [];
    for (let day = 1; day <= MAX_DAY; day++) for (const e of await app.store.bucket(RULES_VERSION, day, "all")) listing.push(e.id);
    const health = (await (await fetch(`${base}/v1/health`)).json()) as { ghosts: number };
    const objects = backend.name === "tigris" ? (await (app.store as TigrisStore).s3.listAll("")).map((o) => o.key).sort() : null;
    return { ghosts: health.ghosts, size: app.store.size, listing: listing.sort(), records: backend.storedRecords(), objects };
  };

  it("refuses every unreachable record the decoder takes: 422 with the record error that names the record and the day; nothing is stored", async () => {
    const before = await state();
    for (const [day, wins, lives] of UNREACHABLE) {
      const s = mine({ ...deckOf(day), wins, lives });
      const r = await post(s);
      expect(r, `d${day} ${wins}W ${lives}L`).toEqual({ status: 422, body: { error: recordError(day, wins, lives) } });
      expect(await state(), `d${day} ${wins}W ${lives}L: the store is unchanged`).toEqual(before);
      expect((await app.store.bucket(RULES_VERSION, day, "all")).some((e) => e.id === ghostId(s))).toBe(false);
    }
    // backlog 325's example, word for word
    const ex = await post(mine({ ...deckOf(1), wins: 0, lives: 1 }));
    expect(ex).toEqual({ status: 422, body: { error: "record: 0W 1 lives is no record a run carries into dusk 1" } });
    expect(await state()).toEqual(before);
  });

  it("takes every reachable record of every day 1-10 (each day's floorRecord included): 201, stored once each", async () => {
    let n = 0;
    for (let day = 1; day <= MAX_DAY; day++) {
      const recs = reachableRecords(day);
      expect(recs).toContainEqual(floorRecord(day));
      for (const { wins, lives } of recs) {
        const before = await state();
        const s = mine({ ...deckOf(day), wins, lives });
        const r = await post(s);
        expect(r, `d${day} ${wins}W ${lives}L`).toEqual({ status: 201, body: { id: ghostId(s) } });
        const after = await state();
        expect([after.ghosts, after.size, after.records], `d${day} ${wins}W ${lives}L`).toEqual([before.ghosts + 1, before.size + 1, before.records + 1]);
        expect(after.listing).toEqual([...before.listing, ghostId(s)].sort());
        if (before.objects) expect(after.objects!.length).toBe(before.objects.length + 1);
        n++;
      }
    }
    expect(n).toBe(178);
  }, 120_000);

  it("keeps the order: closed 403, signing 401, decode 400, playerId 403, rules 422, deck 422, then the record 422", async () => {
    const before = await state();
    const bad = mine({ ...deckOf(3), wins: 0, lives: 3 }); // unreachable at dusk 3 (the refund gives a life back)
    expect(isReachable(3, 0, 3)).toBe(false);
    // closed: 403 before the body is read (a second server, uploads closed, over fresh storage)
    const closed = backend.server({ uploads: "closed", log: () => {}, rateLimit: { windowMs: 60_000, max: 1000 } }, true);
    const closedBase = `http://127.0.0.1:${await closed.listen(0)}`;
    const body = encodeSnapshot(bad);
    const c = await fetch(`${closedBase}/v1/ghosts`, { method: "POST", headers: await signedHeaders(me, body), body });
    expect([c.status, ((await c.json()) as { error: string }).error]).toEqual([403, "uploads are not open yet"]);
    await closed.close();
    // signing: unsigned, then a signature over other bytes
    expect((await send(body, { "content-type": "application/json" })).status).toBe(401);
    expect((await send(body, await signedHeaders(me, `${body} `))).status).toBe(401);
    // decode: a record the decoder bounds keeps its 400 (wins at most day - 1, lives 1..9), as does an unknown field
    for (const [day, wins, lives, field] of [[1, 1, 5, "wins"], [3, 0, 0, "lives"], [3, 0, 10, "lives"], [3, 3, 5, "wins"]] as const) {
      const r = await postRaw(mine({ ...deckOf(day), wins, lives }));
      expect(r.status, `d${day} ${wins}W ${lives}L`).toBe(400);
      expect(r.body.error, `d${day} ${wins}W ${lives}L`).toMatch(new RegExp(`^snapshot\\.${field}: `));
    }
    expect((await postRaw({ ...bad, extra: 1 })).status).toBe(400);
    // playerId: another player's id under my key
    expect((await post({ ...bad, playerId: other.playerId })).status).toBe(403);
    // rules: a bb-0.6.2 FURNACE snapshot with an unreachable record meets the rules 422 (what a 0.7.0 page meets)
    const old = await post({ ...bad, rules: "bb-0.6.2" });
    expect(old).toEqual({ status: 422, body: { error: `rules bb-0.6.2 not accepted: this server validates ${RULES_VERSION}` } });
    // deck: over the player ceiling with an unreachable record: the deck's 422 and its errors
    const rich = await post({ ...bad, build: { ...bad.build, hullBonus: bad.build.hullBonus + 500 } });
    expect([rich.status, rich.body.error]).toEqual([422, "deck failed validation"]);
    expect(rich.body.errors!.join()).toMatch(/budget/);
    // and only then the record
    expect(await post(bad)).toEqual({ status: 422, body: { error: recordError(3, 0, 3) } });
    expect(await state()).toEqual(before);
  });

  it("a resend of a stored ghost still gets 200 with its id; a ghost planted past POST with an unreachable record gets the record 422 on a resend, and the store keeps its one copy", async () => {
    const s = mine({ ...deckOf(5), wins: 2, lives: 3 });
    expect(isReachable(5, 2, 3)).toBe(true);
    const before = await state();
    expect(await post(s)).toEqual({ status: 201, body: { id: ghostId(s) } });
    expect(await post(s)).toEqual({ status: 200, body: { id: ghostId(s) } }); // a fresh signature over the same bytes
    const once = await state();
    expect([once.size, once.records]).toEqual([before.size + 1, before.records + 1]);
    // stored before this check (or planted by an admin): exactly as a POST stored it
    const planted = mine({ ...deckOf(6), wins: 5, lives: 1 });
    expect(isReachable(6, 5, 1)).toBe(false);
    const { id, created } = await app.store.add(decodeSnapshot(encodeSnapshot(planted)));
    expect([id, created]).toEqual([ghostId(planted), true]);
    const held = await state();
    expect(await post(planted)).toEqual({ status: 422, body: { error: recordError(6, 5, 1) } });
    expect(await state()).toEqual(held);
  });

  it("all 120 bb-0.8.0 seed ghosts (generateSamplePool(), the RC's pool), posted as one player's signed dusks, are taken (201) and stored", async () => {
    expect(POOL).toHaveLength(120);
    const before = await state();
    const statuses: Record<number, number> = {};
    for (const s of POOL) {
      const r = await post(mine(s));
      statuses[r.status] = (statuses[r.status] ?? 0) + 1;
      expect(r.status, `${s.hero} d${s.day} ${s.wins}W ${s.lives}L: ${JSON.stringify(r.body)}`).toBe(201);
    }
    expect(statuses).toEqual({ 201: 120 });
    const after = await state();
    expect([after.ghosts - before.ghosts, after.records - before.records]).toEqual([120, 120]);
  }, 120_000);
});
