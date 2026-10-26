// VERIFY-IDENT1-FIX2 (REQ-BFG-122) step 4a/4b, written by the independent re-checker (cap_xi): A FUZZ WITH FAILURE INJECTION FOR N1. Random Steam links, code
// requests, joins and DELETEs over six keys and four Steam accounts, with a store failure injected into one write / delete / read of the op at random (a
// 503 is retried once, as a client would), restarts and clock jumps. After EVERY step the whole identity store is read back and checked:
//   I2  a Steam link that names a live player: that player's record exists and LISTS the account (the new write order's invariant: no link before its listing)
//   I3  no record lists an account twice, none lists more than 64
//   I6  a DELETE never changes a link that names somebody it does not tombstone (byte for byte, whether it ended in 200 or in a 503 half way)
//   I5  after a DELETE that answered 200 nothing of its tombstoned ids is left: no links/keys, no players/, no Steam link, no live code
//   no 5xx other than the injected 503s
// At the end every key is deleted: only tombstones may remain (in particular no links/steam/ record: nothing leaks).
// The seeds replay (a seeded PRNG). Both backing stores.
import { afterAll, describe, expect, it } from "vitest";
import type { Identity } from "../src/net/identity";
import type { SteamVerifier } from "../server/steamAuth";
import { StorageError } from "../server/store";
import { rng, type Rng } from "./profileupWire";
import { closeRigs, deleteMe, freshIdentity, identityRecords, linkSteamCall, openRig, redeemCode, requestCode, type Kind, type Opts, type Reply, type Rig } from "./identRig";

afterAll(closeRigs);

const S = (n: number): string => `7656119800000${String(n).padStart(4, "0")}`;
const NOLIMIT = { windowMs: 600_000, max: 1_000_000 };
const BASE: Opts = { rateLimit: { windowMs: 60_000, max: 1_000_000 }, redeemLimit: NOLIMIT };
// a verifier that reads the account out of the ticket: "a" + account digit + 6 hex digits of a counter
const verifier: SteamVerifier = {
  appIds: [480],
  async verify(ticket) {
    return { ok: true, steamId: S(Number(ticket[1])) };
  },
};
let tickets = 0;
const ticketFor = (acct: number): string => `a${acct}${(++tickets).toString(16).padStart(6, "0")}`;

type Op = "get" | "put" | "delete";
/** Run `fn` while `op` of the store fails for the keys under `prefix`. */
async function failing<T>(rig: Rig, op: Op, prefix: string, fn: () => Promise<T>): Promise<T> {
  const store = rig.app.links.store as unknown as Record<string, (k: string, t?: string) => Promise<unknown>>;
  const real = store[op].bind(store);
  store[op] = async (k: string, t?: string) => {
    if (k.startsWith(prefix)) throw new StorageError(`identity ${op} failed: HTTP 500`);
    return real(k, t);
  };
  try {
    return await fn();
  } finally {
    store[op] = real;
  }
}

interface Link {
  player: string;
}
const parse = (text: string | undefined): Record<string, unknown> | null => {
  try {
    const o = JSON.parse(text ?? "null") as unknown;
    return o && typeof o === "object" && !Array.isArray(o) ? (o as Record<string, unknown>) : null;
  } catch {
    return null;
  }
};

/** Everything the identity store holds, checked against the invariants. Returns the records for the caller's own use. */
async function check(rig: Rig, why: string, incomplete: ReadonlySet<string>): Promise<Record<string, string>> {
  const recs = await identityRecords(rig);
  const ownersOf = new Map<string, string[]>(); // a tombstoned id -> the players whose tombstones name it
  for (const [k, t] of Object.entries(recs)) {
    if (!k.startsWith("tombstones/")) continue;
    const owner = k.slice("tombstones/".length, -".json".length);
    for (const id of (parse(t)?.ids as string[] | undefined) ?? []) ownersOf.set(id, [...(ownersOf.get(id) ?? []), owner]);
  }
  for (const [k, t] of Object.entries(recs)) {
    if (k.startsWith("links/steam/")) {
      const s = k.slice("links/steam/".length, -".json".length);
      const l = parse(t) as Link | null;
      if (!l || typeof l.player !== "string") continue; // (none is ever written unreadable here)
      if (ownersOf.has(l.player)) {
        expect((ownersOf.get(l.player) ?? []).some((o) => incomplete.has(o)), `${why}: a Steam link names the deleted ${l.player.slice(0, 6)} whose DELETE did not fail half way`).toBe(true);
        continue;
      }
      const rec = parse(recs[`players/${l.player}.json`]);
      expect(rec, `${why}: the link ${s} names ${l.player.slice(0, 6)}, whose record must exist (the record is written first)`).not.toBeNull();
      expect((rec?.steam as string[] | undefined) ?? [], `${why}: and list the account`).toContain(s);
      expect(recs[`links/keys/${l.player}.json`], `${why}: the link names a player, not a device`).toBeUndefined();
    }
    if (k.startsWith("players/")) {
      const steam = (parse(t)?.steam as string[] | undefined) ?? [];
      expect(new Set(steam).size, `${why}: no account listed twice`).toBe(steam.length);
      expect(steam.length).toBeLessThanOrEqual(64);
    }
  }
  return recs;
}

async function fuzz(kind: Kind, seed: number, steps: number): Promise<void> {
  const R: Rng = rng(seed);
  const rig = await openRig(kind, { ...BASE, steam: verifier });
  const keys: Identity[] = [];
  for (let i = 0; i < 6; i++) keys.push(await freshIdentity());
  const gone = new Set<string>(); // keys whose DELETE answered 200 at least once
  const incomplete = new Set<string>(); // players whose last DELETE answered 503 and has not been repeated
  const pick = (): Identity => R.pick(keys);
  // (a 403 for a Steam link would be the F1 guard: an account whose player is a device. It must not be reachable from these flows, so it is not accepted.)
  const accepted: Record<string, number[]> = { link: [200, 409, 410], code: [200, 410], redeem: [200, 403, 409, 410], delete: [200] };
  const stats = { injected: 0, retried: 0, ops: 0, deletes: 0 };

  /** One op, optionally with a failure injected; a 503 is retried once without. */
  const op = async (what: string, inject: { op: Op; prefix: string } | null, run: () => Promise<Reply>): Promise<Reply> => {
    stats.ops++;
    let r = inject ? await failing(rig, inject.op, inject.prefix, run) : await run();
    if (inject) stats.injected++;
    if (r.status === 503) {
      expect(inject, `${what}: a 503 without an injected failure: ${r.text}`).not.toBeNull();
      stats.retried++;
    }
    return r;
  };

  for (let i = 0; i < steps; i++) {
    const why = `seed ${seed} step ${i + 1}`;
    const roll = R.next();
    const before = await identityRecords(rig);
    if (roll < 0.42) {
      const k = pick(), acct = R.int(4);
      const inject = R.bool(0.35) ? R.pick([{ op: "put", prefix: "links/steam/" }, { op: "put", prefix: "players/" }, { op: "put", prefix: "links/keys/" }] as const) : null;
      let r = await op(`${why} link`, inject, () => linkSteamCall(rig, k, ticketFor(acct), "x", 480));
      if (r.status === 503) r = await linkSteamCall(rig, k, ticketFor(acct), "x", 480);
      expect(accepted.link, `${why}: link ${r.status} ${r.text}`).toContain(r.status);
    } else if (roll < 0.55) {
      const r = await requestCode(rig, pick());
      expect(accepted.code, `${why}: code ${r.status}`).toContain(r.status);
    } else if (roll < 0.72) {
      const [s, k] = [pick(), pick()];
      if (s !== k) {
        const code = await requestCode(rig, s);
        if (code.status === 200) {
          const inject = R.bool(0.3) ? R.pick([{ op: "put", prefix: "links/keys/" }, { op: "put", prefix: "players/" }, { op: "delete", prefix: "linkcodes/" }] as const) : null;
          let r = await op(`${why} redeem`, inject, () => redeemCode(rig, k, String(code.json?.code)));
          if (r.status === 503) r = await redeemCode(rig, k, String((await requestCode(rig, s)).json?.code));
          expect(accepted.redeem, `${why}: redeem ${r.status} ${r.text}`).toContain(r.status);
        }
      }
    } else if (roll < 0.9) {
      const k = pick();
      const inject = R.bool(0.4) ? R.pick([{ op: "delete", prefix: "links/steam/" }, { op: "get", prefix: "links/steam/" }, { op: "delete", prefix: "links/keys/" }, { op: "delete", prefix: "players/" }] as const) : null;
      const player = parse(before[`links/keys/${k.playerId}.json`])?.player as string | undefined ?? k.playerId;
      let r = await op(`${why} delete`, inject, () => deleteMe(rig, k));
      stats.deletes++;
      if (r.status === 503) {
        incomplete.add(player);
        r = await deleteMe(rig, k); // the same key asks again: its own link goes last, so it still finds its player
      }
      expect(r.status, `${why}: the repeat of a DELETE: ${r.text}`).toBe(200);
      incomplete.delete(player);
      gone.add(k.playerId);
      // I5: nothing of the tombstone is left; I6: no link that names somebody else changed
      const recs = await identityRecords(rig);
      const ids = new Set<string>((parse(recs[`tombstones/${player}.json`])?.ids as string[] | undefined) ?? []);
      expect(ids.has(player), `${why}: the tombstone names the player`).toBe(true);
      for (const [key, text] of Object.entries(recs)) {
        if (key.startsWith("links/keys/")) expect(ids.has(key.slice("links/keys/".length, -5)), `${why}: a key link of the deleted is left: ${key}`).toBe(false);
        if (key.startsWith("players/")) expect(ids.has(key.slice("players/".length, -5)), `${why}: a record of the deleted is left`).toBe(false);
        if (key.startsWith("linkcodes/")) expect(ids.has(String(parse(text)?.player)), `${why}: a live code of the deleted is left`).toBe(false);
        if (key.startsWith("links/steam/")) expect(ids.has(String(parse(text)?.player)), `${why}: a Steam link of the deleted is left`).toBe(false);
      }
      for (const [key, text] of Object.entries(before)) {
        if (!key.startsWith("links/steam/")) continue;
        const named = String(parse(text)?.player);
        if (!ids.has(named)) expect(recs[key], `${why}: the DELETE changed a link that names somebody it does not delete`).toBe(text);
      }
    } else if (roll < 0.95) {
      await rig.restart();
    } else {
      rig.clock.now += 61_000;
    }
    await check(rig, why, incomplete);
  }

  // the end: every key is deleted; nothing may be left but tombstones
  for (const k of keys) {
    let r = await deleteMe(rig, k);
    if (r.status === 503) r = await deleteMe(rig, k);
    expect(r.status, `seed ${seed} final DELETE`).toBe(200);
  }
  const left = Object.keys(await identityRecords(rig)).filter((k) => !k.startsWith("tombstones/"));
  expect(left, `seed ${seed}: after every key is deleted only tombstones are left`).toEqual([]);
  console.log(`VIDENT2 n1fuzz ${kind} seed ${seed}: ${steps} steps, ${stats.ops} injectable ops, ${stats.injected} with a failure injected, ${stats.retried} answered 503 and were retried, ${stats.deletes} DELETEs, ${gone.size} keys deleted before the end`);
}

describe("N1 fuzz with failure injection", () => {
  it.each([1, 2, 3, 4, 5, 6])("JSON lines, seed %i: 220 steps", async (seed) => {
    await fuzz("jsonl", seed, 220);
  }, 180_000);
  it.each([11, 12])("Tigris on the fake S3, seed %i: 90 steps", async (seed) => {
    await fuzz("tigris", seed, 90);
  }, 180_000);
});
