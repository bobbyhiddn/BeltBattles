// S3 (BRIEF-S3 goals 2 and 3, "the defaults must never touch an honest player"; step 3, "the honest case"): at the DEFAULT limits (none are passed) and with the
// REAL deck check (the in-thread validator, wrapped only to read what each check cost):
//   - one player's whole run, days 1-25 (a run won on day 10, then endless dusks to day 25), one upload each dusk plus a profile write, the first deck check cold,
//     a fast player (5 s between dusks on the budget's clock) and a resumed run (three days off in the middle): never a 429, every answer the one a server with
//     the limits out of the way gives, and the whole run's check time a small part of the key's balance;
//   - 50 players behind one carrier-NAT address on one day, each uploading a dusk and writing a profile: no 429 anywhere;
//   - the verdicts are not changed: honest, repeated, badly signed, someone else's, badly named, dishonest-deck and unreachable-record uploads get the same status
//     and the same body with the limits at their defaults as with them out of the way (and the deck's errors are validateUpload's own).
// The honest runs are played through the game's own code (tests/endless1.honest.ts), a lean deck. Nothing here builds the stand-in sample pool.
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { ENDLESS, setEndless } from "../src/sim/endless";
import { setPlayerName } from "../src/game/ghostSnapshot";
import { KEY_HEADER, PROFILE_PREFIX, SIG_HEADER, loadIdentity, memoryKeyStore, type Identity } from "../src/net/identity";
import { encodeWire } from "../src/net/profileWire";
import { ghostId, type GhostSnapshot } from "../src/net/snapshot";
import { validateUpload } from "../src/net/validate";
import { createGhostServer, type GhostServer, type ServerOptions } from "../server/app";
import { DEFAULT_LIMITS } from "../server/limits";
import { createInThreadValidator, type Validator } from "../server/validator";
import { jsonlBackend, type StoreBackend } from "./netStores";
import { ownedBy, signedHeaders, testIdentity, TEST_NAME } from "./netIdentity";
import { playEndless } from "./endless1.honest";
import { NOW, freshWire } from "./profileupWire";

setPlayerName(TEST_NAME);

/** Every limit of S3 out of the way (the same server, nothing refused for its cost or its keys). */
const ROOMY = { newKeysPerIpDay: 1e9, checkKeyMs: 1e12, checkKeyRefill: 1e9, checkIpMs: 1e12, checkIpRefill: 1e9, checkIpInflight: 1e6, checkKeyInflight: 1e6 };

let me: Identity;
let run: GhostSnapshot[]; // days 1-25: a run's dusks to its win on day 10, then endless dusks 11-25
beforeAll(async () => {
  setEndless(true);
  me = await testIdentity(0);
  const played = playEndless("weaver", 42, me.playerId, { buys: 0, until: 25 });
  run = [...played.runSnaps, ...played.endlessSnaps];
}, 300_000);
afterAll(() => setEndless(ENDLESS));

/** The real in-thread deck check, wrapped to keep what each check cost (the time the budget is charged). */
function recording() {
  const inner = createInThreadValidator();
  const costs: number[] = [];
  const validator: Validator = {
    kind: inner.kind,
    validate: (job, onCost) => inner.validate(job, (ms) => { costs.push(ms); onCost?.(ms); }),
    stats: () => inner.stats(),
    close: () => inner.close(),
  };
  return { validator, costs };
}

interface Rig {
  app: GhostServer;
  base: string;
  clock: { now: number };
  costs: number[];
}
const open: { rig: Rig; backend: StoreBackend }[] = [];
async function rig(limits?: NonNullable<ServerOptions["limits"]>, extra: Partial<ServerOptions> = {}): Promise<Rig> {
  const backend = jsonlBackend();
  await backend.setup();
  const rec = recording();
  const clock = { now: 1_000_000 };
  const app = backend.server({
    uploads: "open", log: () => {}, matchSalt: () => 0, validator: rec.validator, trustProxy: "fly", now: () => NOW,
    ...(limits ? { limits } : {}), // undefined: the defaults, exactly as main.ts without any BB_GHOST_* limit setting
    ...extra,
  });
  const r: Rig = { app, base: `http://127.0.0.1:${await app.listen(0)}`, clock, costs: rec.costs };
  open.push({ rig: r, backend });
  return r;
}
afterEach(async () => {
  while (open.length) {
    const o = open.pop()!;
    await o.rig.app.close();
    await o.backend.teardown();
  }
});

interface Reply {
  status: number;
  retryAfter: string | null;
  body: Record<string, any>;
}
async function readReply(res: Response): Promise<Reply> {
  const text = await res.text();
  let body: Record<string, any> = {};
  try {
    body = text ? (JSON.parse(text) as Record<string, any>) : {};
  } catch {
    body = { text };
  }
  return { status: res.status, retryAfter: res.headers.get("retry-after"), body };
}
const FLY = (ip: string) => ({ "fly-client-ip": ip });
async function postGhost(r: Rig, who: Identity, s: GhostSnapshot, ip = "198.51.100.1", signWith: string | null = null): Promise<Reply> {
  const body = JSON.stringify(s);
  return readReply(await fetch(`${r.base}/v1/ghosts`, { method: "POST", headers: { ...(await signedHeaders(who, signWith ?? body)), ...FLY(ip) }, body }));
}
async function putProfile(r: Rig, who: Identity, ip = "198.51.100.1"): Promise<Reply> {
  const text = encodeWire(freshWire());
  const { key, sig } = await who.sign(new TextEncoder().encode(text), PROFILE_PREFIX);
  return readReply(await fetch(`${r.base}/v1/profile`, { method: "PUT", headers: { "content-type": "application/json", [KEY_HEADER]: key, [SIG_HEADER]: sig, ...FLY(ip) }, body: text }));
}
const health = async (r: Rig): Promise<Record<string, any>> => (await fetch(`${r.base}/v1/health`)).json() as Promise<Record<string, any>>;
const freshId = async (): Promise<Identity> => {
  const id = await loadIdentity(memoryKeyStore());
  if (!id) throw new Error("no WebCrypto in this Node");
  return id;
};
const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);

/** A whole run: after each dusk, an upload and a profile write; `between(i)` moves the budget's clock (the player thinking, or stopping for the night). */
async function playRun(r: Rig, between: (i: number) => void): Promise<{ day: number; ghost: Reply; profile: Reply }[]> {
  const out: { day: number; ghost: Reply; profile: Reply }[] = [];
  for (const [i, s] of run.entries()) {
    out.push({ day: s.day, ghost: await postGhost(r, me, s), profile: await putProfile(r, me) });
    between(i);
  }
  return out;
}

describe("S3 the honest case at the default limits", () => {
  it("the fixture is one run of days 1-25: a run's dusks to day 10 and endless dusks 11-25", () => {
    expect(run.map((s) => s.day)).toEqual(Array.from({ length: 25 }, (_, i) => i + 1));
    expect(run.slice(0, 10).every((s) => s.mode === undefined)).toBe(true);
    expect(run.slice(10).every((s) => s.mode === "endless")).toBe(true);
  });

  it("one player's whole run (days 1-25, an upload and a profile write each dusk, the first check cold) never meets a 429 and every answer is the one a server without limits gives", async () => {
    const a = await rig(); // the defaults; the budget's clock is real time (a run's checks take milliseconds, so no refill is counted on)
    const got = await playRun(a, () => {});
    const roomy = await rig(ROOMY);
    const ref = await playRun(roomy, () => {});
    expect(got.map((x) => x.ghost.status)).toEqual(ref.map((x) => x.ghost.status));
    expect(got.map((x) => x.profile.status)).toEqual(ref.map((x) => x.profile.status));
    expect(got.some((x) => x.ghost.status === 429 || x.profile.status === 429)).toBe(false);
    expect(got.map((x) => x.ghost.status)).toEqual(Array(25).fill(201));
    expect(got.map((x) => x.profile.status)).toEqual(Array(25).fill(200));
    expect(got.map((x) => x.ghost.body.id)).toEqual(run.map(ghostId));
    expect((await health(a)).limits).toMatchObject({ keyInflight: 0, ipInflight: 0, keyBudget: 0, ipBudget: 0, newKeys: 0, rate: 0, total: 0 });
    // the cost: what the budget was charged for this whole run, against the key's balance (30 s) and the address's (60 s)
    const total = sum(a.costs), worst = Math.max(...a.costs);
    console.log(`S3 honest run: ${a.costs.length} deck checks, ${total.toFixed(0)} ms in all, worst ${worst.toFixed(0)} ms; key balance ${DEFAULT_LIMITS.checkKeyMs} ms, address balance ${DEFAULT_LIMITS.checkIpMs} ms`);
    expect(a.costs).toHaveLength(25);
    // the margin: on a quiet host the whole run is about a third of the key's balance (30 s) and its dearest check (the cold one) about 1.3 s; the bounds are
    // loose on purpose (the suite runs this on a loaded host, where wall time stretches), the run having met no 429 above is the real assertion
    expect(total).toBeLessThan(DEFAULT_LIMITS.checkKeyMs);
    expect(worst).toBeLessThan(DEFAULT_LIMITS.checkKeyMs / 2);
  }, 240_000);

  it("a fast player (5 s between dusks on the budget's clock) and a resumed run (three days off after day 12) meet no limit either; two uploads of one key never overlap in flight", async () => {
    const clock = { now: 1_000_000 };
    const r = await rig({ now: () => clock.now }); // every other limit at its default
    const got = await playRun(r, (i) => {
      clock.now += i === 11 ? 3 * 86_400_000 : 5000;
    });
    expect(got.map((x) => x.ghost.status)).toEqual(Array(25).fill(201));
    expect(got.map((x) => x.profile.status)).toEqual(Array(25).fill(200));
    expect((await health(r)).limits.total).toBe(0);
    expect(r.app.limits.budget.tracked.inflightKeys).toBe(0);
    // the awaits above are the dusk-to-dusk gap: the previous check is over before the next upload starts, so the key is never in flight twice
    expect(got.every((x) => x.ghost.retryAfter === null && x.profile.retryAfter === null)).toBe(true);
  }, 240_000);

  it("50 players behind one carrier-NAT address on one day, each uploading a dusk and writing a profile, meet no limit", async () => {
    const r = await rig(); // the defaults, the 120-a-minute request limiter included: 100 requests from one address in a few seconds
    const players = await Promise.all(Array.from({ length: 50 }, freshId));
    const statuses: number[] = [];
    for (const [i, who] of players.entries()) {
      const s = ownedBy({ ...run.find((x) => x.day === 1 + (i % 10))!, runId: `s3h-${i}` }, who);
      statuses.push((await postGhost(r, who, s, "100.64.0.1")).status, (await putProfile(r, who, "100.64.0.1")).status);
    }
    expect(statuses.filter((s) => s !== 201 && s !== 200)).toEqual([]);
    expect(statuses.filter((s) => s === 429)).toEqual([]);
    expect((await health(r)).limits.total).toBe(0);
    expect(r.app.limits.newKeys.trackedKeys).toBe(50);
    expect(r.app.limits.newKeys.trackedIps).toBe(1);
    expect(r.costs).toHaveLength(50);
    console.log(`S3 50 players behind one address: ${sum(r.costs).toFixed(0)} ms of deck-check time in all, worst ${Math.max(...r.costs).toFixed(0)} ms; address balance ${DEFAULT_LIMITS.checkIpMs} ms`);
    expect(sum(r.costs)).toBeLessThan(DEFAULT_LIMITS.checkIpMs / 2);
  }, 240_000);
});

describe("S3 the verdicts do not change", () => {
  const dusk5 = () => run.find((s) => s.day === 5)!;
  /** The doubled-rig deck of tests/s1.endlesscap.test.ts: the decoder takes it, validateUpload refuses it. */
  const doubled = (s: GhostSnapshot): GhostSnapshot => ({ ...s, build: { ...s.build, items: [...s.build.items, { ...s.build.items[0], uid: Math.max(...s.build.items.map((i) => i.uid)) + 1 }] } });

  async function cases(r: Rig): Promise<Reply[]> {
    const honest = { ...dusk5(), runId: "s3v-honest" };
    const other = await freshId();
    return [
      await postGhost(r, me, honest), // 201
      await postGhost(r, me, honest), // 200: the same ghost again
      await postGhost(r, me, { ...dusk5(), runId: "s3v-sig" }, "198.51.100.1", JSON.stringify(honest)), // signed over other bytes: 401
      await postGhost(r, me, ownedBy({ ...dusk5(), runId: "s3v-foreign" }, other)), // someone else's player id: 403
      await postGhost(r, me, { ...dusk5(), runId: "s3v-name", name: "X" }), // 422 name
      await postGhost(r, me, { ...doubled(dusk5()), runId: "s3v-deck" }), // 422 deck
      await postGhost(r, me, { ...dusk5(), runId: "s3v-record", wins: 0, lives: 1 }), // a record no run carries into dusk 5 (no win, no loss, and still down to 1 heart)
    ];
  }

  it("honest, repeated, badly signed, someone else's, badly named, dishonest-deck and unreachable-record uploads get the same status and body at the defaults as with every limit out of the way", async () => {
    const a = await rig();
    const b = await rig(ROOMY);
    const got = await cases(a), ref = await cases(b);
    expect(got.map((x) => x.status)).toEqual(ref.map((x) => x.status));
    expect(got.map((x) => x.status)).toEqual([201, 200, 401, 403, 422, 422, 422]);
    expect(got[0].body).toEqual({ id: ghostId({ ...dusk5(), runId: "s3v-honest" }) });
    for (const [i, x] of got.entries()) {
      expect(x.body, `case ${i}`).toEqual(ref[i].body);
      expect(x.retryAfter).toBeNull();
    }
    expect(String(got[4].body.error)).toBe("name: too short");
    expect(String(got[6].body.error)).toMatch(/^record: /);
    // the deck's errors are validateUpload's own, word for word and in order
    const bad = doubled(dusk5());
    const direct = validateUpload(bad.build, bad.day, bad.rules, { seed: bad.seed, ...(bad.lastChance ? { lastChance: bad.lastChance } : {}), ...(bad.road ? { road: bad.road } : {}), ...(bad.firstRun ? { firstRun: true } : {}) });
    expect(direct.ok).toBe(false);
    expect(got[5].body).toEqual({ error: "deck failed validation", errors: direct.errors });
    expect((await health(a)).limits.total).toBe(0);
  }, 120_000);
});
