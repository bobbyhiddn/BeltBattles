// VERIFY-IDENT1-FIX1 (REQ-BFG-122) step 4, written by the independent re-checker (cap_xi): AN INVARIANT FUZZ OVER THE WHOLE IDENTITY STORE. Random sequences of
// code requests, redeems (live, stale, used and wrong codes), Steam links (known and new accounts, used tickets), uploads, DELETEs, restarts and clock jumps over a
// small crowd of keys; after EVERY step the whole store is read back and must satisfy the layer's invariants:
//   I1  a linked key's player is not itself linked (no chains), and neither of them is tombstoned
//   I2  a linked key has NO players/<key>.json (F1: a device is not a player); a player's keys[] and steam[] are exactly the keys and accounts linked to it, at most 64
//   I3  a live code names a player that is not linked and not deleted; a player has at most one live code and its record names it
//   I4  every reply is one the route documents (no 5xx, no 500 from a corner nobody thought of)
// and, at the end, deleting every key ever made leaves nothing but tombstones. The invariants are the ones the fix is about (F1: no device with a live code or a
// player record, F3: the lists at most MAX_LINKED and read back whole). Both backing stores; seeded, so a failure replays.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Identity } from "../src/net/identity";
import { CODE_TTL_MS, MAX_LINKED } from "../server/links";
import { testIdentity } from "./netIdentity";
import {
  closeRigs, deleteMe, fakeSteam, freshIdentity, identityRecords, linkSteamCall, openRig, postGhost, redeemCode, requestCode, uploadFor, type Kind, type Reply, type Rig,
} from "./identRig";

let A: Identity;
beforeAll(async () => {
  A = await testIdentity(0);
});
afterAll(closeRigs);

const KINDS: Kind[] = ["jsonl", "tigris"];
const NOLIMIT = { windowMs: 600_000, max: 1_000_000 };
const STEAM = ["76561198000000031", "76561198000000032", "76561198000000033", "76561198000000034"];
const TICKETS: Record<string, string> = {};
for (let i = 0; i < 24; i++) TICKETS[`c${i.toString(16).padStart(3, "0")}`] = STEAM[i % STEAM.length];
const ticketNames = Object.keys(TICKETS);

function rng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 2 ** 32;
  };
}

interface Parsed {
  links: Map<string, string>;
  players: Map<string, { keys: string[]; steam: string[]; code?: string }>;
  codes: Map<string, { player: string; expiresAt: number }>;
  steamLinks: Map<string, string>;
  tombs: Set<string>;
}
const idOf = (k: string): string => k.replace(/^.*\//, "").replace(/\.json$/, "");
function parse(records: Record<string, string>): Parsed {
  const p: Parsed = { links: new Map(), players: new Map(), codes: new Map(), steamLinks: new Map(), tombs: new Set() };
  for (const [k, text] of Object.entries(records)) {
    const o = JSON.parse(text);
    if (k.startsWith("links/keys/")) p.links.set(idOf(k), o.player);
    else if (k.startsWith("links/steam/")) p.steamLinks.set(idOf(k), o.player);
    else if (k.startsWith("players/")) p.players.set(idOf(k), o);
    else if (k.startsWith("linkcodes/")) p.codes.set(idOf(k), o);
    else if (k.startsWith("tombstones/")) for (const t of o.ids as string[]) p.tombs.add(t);
  }
  return p;
}
/** The invariants, as messages: an empty list is a healthy store. */
function problems(p: Parsed): string[] {
  const bad: string[] = [];
  const short = (s: string) => s.slice(0, 5);
  for (const [key, player] of p.links) {
    if (p.links.has(player)) bad.push(`I1 chain: ${short(key)} -> ${short(player)} -> ${short(p.links.get(player)!)}`);
    if (p.tombs.has(key) || p.tombs.has(player)) bad.push(`I1 ${short(key)} is linked to ${short(player)} and one of them is tombstoned`);
    if (p.players.has(key)) bad.push(`I2 the linked key ${short(key)} still has a players/ record`);
    const rec = p.players.get(player);
    if (!rec || !rec.keys.includes(key)) bad.push(`I2 ${short(key)} is linked to ${short(player)} whose record does not list it`);
  }
  for (const [player, rec] of p.players) {
    if (rec.keys.length > MAX_LINKED || rec.steam.length > MAX_LINKED) bad.push(`I2 ${short(player)} lists more than ${MAX_LINKED}`);
    for (const k of rec.keys) if (p.links.get(k) !== player) bad.push(`I2 ${short(player)} lists ${short(k)} which is not linked to it`);
    for (const s of rec.steam) if (p.steamLinks.get(s) !== player) bad.push(`I2 ${short(player)} lists Steam ${s.slice(-3)} which is not linked to it`);
    if (p.tombs.has(player)) bad.push(`I1 ${short(player)} has a record and is tombstoned`);
  }
  for (const [s, player] of p.steamLinks) {
    if (!p.players.get(player)?.steam.includes(s) && !p.tombs.has(player)) bad.push(`I2 Steam ${s.slice(-3)} -> ${short(player)} which does not list it`);
    if (p.links.has(player)) bad.push(`I1 Steam ${s.slice(-3)} -> ${short(player)} which is a device`);
  }
  const perPlayer = new Map<string, number>();
  for (const [hash, c] of p.codes) {
    perPlayer.set(c.player, (perPlayer.get(c.player) ?? 0) + 1);
    if (p.links.has(c.player)) bad.push(`I3 a live code names the device ${short(c.player)}`);
    if (p.tombs.has(c.player)) bad.push(`I3 a live code names the deleted player ${short(c.player)}`);
    if (p.players.get(c.player)?.code !== hash) bad.push(`I3 a code of ${short(c.player)} is not the one its record names`);
  }
  for (const [pl, n] of perPlayer) if (n > 1) bad.push(`I3 ${short(pl)} has ${n} live codes`);
  return bad;
}

const OK_STATUS: Record<string, number[]> = {
  code: [200, 410], redeem: [200, 403, 409, 410], steam: [200, 403, 409, 410], delete: [200], upload: [200, 201, 403, 410],
};

async function fuzz(kind: Kind, seed: number, steps: number): Promise<Record<string, number>> {
  const rnd = rng(seed);
  const rig: Rig = await openRig(kind, { rateLimit: { windowMs: 60_000, max: 1_000_000 }, redeemLimit: NOLIMIT, steam: fakeSteam(TICKETS) });
  const all: Identity[] = [A, ...(await Promise.all(Array.from({ length: 7 }, () => freshIdentity())))];
  let crowd = all.slice();
  const issued: { code: string; by: Identity }[] = [];
  const stat: Record<string, number> = {};
  const count = (k: string) => (stat[k] = (stat[k] ?? 0) + 1);
  const pick = <T,>(xs: T[]): T => xs[Math.floor(rnd() * xs.length)];
  let uploads = 0;
  type Out = { op: string; reply: Reply | null };
  /** One random step, its choices made now (so the run is replayable from the seed); `exclusive` steps never run beside another. */
  const make = (): { exclusive: boolean; run: () => Promise<Out> } => {
    const r = rnd();
    const who = pick(crowd);
    if (r < 0.2) {
      return { exclusive: false, run: async () => {
        const reply = await requestCode(rig, who);
        if (reply.status === 200) issued.push({ code: String(reply.json?.code), by: who });
        return { op: "code", reply };
      } };
    }
    if (r < 0.55) {
      const code = rnd() < 0.1 ? "ZZZZ-ZZZZ" : issued.length ? (rnd() < 0.6 ? issued[issued.length - 1].code : pick(issued.slice(-6)).code) : "ZZZZ-ZZZZ";
      return { exclusive: false, run: async () => ({ op: "redeem", reply: await redeemCode(rig, who, code) }) };
    }
    if (r < 0.7) {
      const ticket = pick(ticketNames);
      return { exclusive: false, run: async () => ({ op: "steam", reply: await linkSteamCall(rig, who, ticket, "bb-ghost", 480) }) };
    }
    if (r < 0.725) return { exclusive: false, run: async () => ({ op: "delete", reply: await deleteMe(rig, who) }) };
    if (r < 0.82) {
      const own = rnd() < 0.5, runId = `f-${seed}-${uploads++}`;
      return { exclusive: false, run: async () => {
        const player = own ? who.playerId : await rig.app.links.playerOfKey(who.playerId, true);
        return { op: "upload", reply: await postGhost(rig, who, uploadFor(who, player, { runId })) };
      } };
    }
    if (r < 0.86) return { exclusive: true, run: async () => (await rig.restart(), { op: "restart", reply: null }) };
    if (r < 0.9) return { exclusive: true, run: async () => ((rig.clock.now += CODE_TTL_MS + 1000), { op: "clock", reply: null }) };
    // a key that is gone is replaced by a new one, so the crowd keeps producing joins
    return { exclusive: true, run: async () => {
      await rig.app.links.ensureFresh();
      const gone = crowd.filter((k) => k !== A && rig.app.links.isGone(k.playerId));
      if (gone.length) {
        const fresh = await freshIdentity();
        all.push(fresh);
        crowd = crowd.map((k) => (k === gone[0] ? fresh : k));
      }
      return { op: "fresh", reply: null };
    } };
  };
  for (let step = 0; step < steps; step++) {
    const first = make();
    // a third of the steps run two to four requests at once: the lock, the limiter and the caches under real interleaving
    const batch = [first];
    if (!first.exclusive && rnd() < 0.33) {
      for (let n = 1 + Math.floor(rnd() * 3); n > 0; n--) {
        const next = make();
        if (!next.exclusive) batch.push(next);
      }
    }
    const outs = await Promise.all(batch.map((b) => b.run()));
    if (batch.length > 1) count("parallel batch");
    for (const { op, reply } of outs) {
      count(op);
      if (reply) {
        count(`${op} ${reply.status}`);
        expect(OK_STATUS[op], `seed ${seed} step ${step}: ${op} answered ${reply.status} ${reply.text}`).toContain(reply.status);
      }
    }
    const what = outs.map((o) => `${o.op}${o.reply ? " " + o.reply.status : ""}`).join(" + ");
    const bad = problems(parse(await identityRecords(rig)));
    expect(bad, `seed ${seed} step ${step} after ${what}`).toEqual([]);
  }
  // the end: delete every key ever made; nothing but tombstones may remain
  for (const k of all) await deleteMe(rig, k);
  const left = Object.keys(await identityRecords(rig)).filter((k) => !k.startsWith("tombstones/"));
  expect(left, `seed ${seed}: after deleting every key nothing but tombstones may remain`).toEqual([]);
  return stat;
}

describe.each(KINDS)("an invariant fuzz over the identity store, on %s", (kind) => {
  it.each(kind === "jsonl" ? [11, 12, 13, 14, 15, 16] : [21, 22, 23])("seed %i: every invariant holds after every step", async (seed) => {
    const stat = await fuzz(kind, seed, kind === "jsonl" ? 240 : 90);
    console.log(`VIDENT1FIX fuzz ${kind} seed ${seed}: ${Object.entries(stat).sort().map(([k, v]) => `${k}=${v}`).join(" ")}`);
    expect(Object.keys(stat).length, "the fuzz really did several kinds of step").toBeGreaterThan(8);
  }, 120_000);
});
