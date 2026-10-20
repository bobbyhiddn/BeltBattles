// IDENT-1 steps 3 and 4, the server half (REQ-BFG-122; BRIEF-IDENT1): link codes and the signed profile read, through the real server in
// process. The code (8 symbols of a 31 symbol alphabet, single use, 10 minutes, stored hashed), issue and redeem on both stores (the
// JSON-lines directory, and Tigris on the in-process fake S3), the one plain refusal for a wrong, expired or used code, a raced redeem,
// the failed-try limit per client address, the 409 rules, the lone key's profile merged into the player's, the cross-domain and
// shape refusals every new route shares, the 10 minute `at` bound, closed uploads, CORS, and GET /v1/profile.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  DELETE_PREFIX, LINK_CODE_PREFIX, LINK_REDEEM_PREFIX, LINK_STEAM_PREFIX, PROFILE_GET_PREFIX, PROFILE_PREFIX, UPLOAD_PREFIX, type Identity, type SignDomain,
} from "../src/net/identity";
import { encodeWire, mergeWire } from "../src/net/profileWire";
import { encodeSnapshot, ghostId } from "../src/net/snapshot";
import { AT_WINDOW_MS, CODE_ALPHABET, CODE_LENGTH, CODE_TTL_MS, hashCode, newCode, normalizeCode, showCode } from "../server/links";
import { testIdentity } from "./netIdentity";
import { NOW, earnedWire } from "./profileupWire";
import {
  bodyAt, closeRigs, fakeSteam, freshIdentity, ghostCount, identityRecords, linkSteamCall, linkVia, matchAs, openRig, postGhost, profileStored, putWire,
  readProfile, redeemCode, requestCode, send, signedBy, uploadFor, type Kind, type Opts, type Reply, type Rig,
} from "./identRig";

let A: Identity, B: Identity, C: Identity, D: Identity;
beforeAll(async () => {
  [A, B, C, D] = await Promise.all([0, 1, 2, 3].map((n) => testIdentity(n)));
});
afterAll(closeRigs);

const KINDS: Kind[] = ["jsonl", "tigris"];
/** A rig whose global rate limiter stays out of the way (these tests send many requests from one address). */
const open = (kind: Kind, over: Opts = {}) => openRig(kind, { rateLimit: { windowMs: 60_000, max: 1_000_000 }, ...over });
const SHORE = "http://127.0.0.1:7778";
const REFUSED = "that code did not work";
const SHOWN = new RegExp(`^[${CODE_ALPHABET}]{4}-[${CODE_ALPHABET}]{4}$`);
const j = (r: Reply): Record<string, unknown> => r.json ?? {};
const codeOf = (r: Reply): string => String(j(r).code);

const DOMAINS: SignDomain[] = [UPLOAD_PREFIX, PROFILE_PREFIX, LINK_CODE_PREFIX, LINK_REDEEM_PREFIX, LINK_STEAM_PREFIX, PROFILE_GET_PREFIX, DELETE_PREFIX];

// ------------------------------------------------------------------------------------------------------------------ the code

describe("the link code: its alphabet, its size, its draw, its spelling, its hash", () => {
  it("31 symbols: A-Z without I L O, and 2-9; 8 of them are about 40 bits; none of 0 O 1 I L", () => {
    expect(CODE_ALPHABET).toHaveLength(31);
    expect(new Set(CODE_ALPHABET).size).toBe(31);
    for (const bad of "01OIL") expect(CODE_ALPHABET).not.toContain(bad);
    for (const ok of "ABCDEFGHJKMNPQRSTUVWXYZ23456789") expect(CODE_ALPHABET).toContain(ok);
    expect(CODE_LENGTH).toBe(8);
    const bits = CODE_LENGTH * Math.log2(CODE_ALPHABET.length);
    expect(bits).toBeGreaterThan(39.5);
    expect(bits).toBeLessThan(40);
    expect(CODE_TTL_MS).toBe(10 * 60_000);
    expect(AT_WINDOW_MS).toBe(10 * 60_000);
  });

  it("newCode draws without modulo bias: a byte of 248 or more is dropped (248 = 8 x 31), the rest map by b % 31", () => {
    const bytes = [255, 250, 248, 0, 30, 31, 62, 247, 93, 124, 17, 3, 200, 2, 1, 9];
    const code = newCode(() => Uint8Array.from(bytes));
    const want = bytes.filter((b) => b < 248).slice(0, 8).map((b) => CODE_ALPHABET[b % 31]).join("");
    expect(code).toBe(want);
    expect(code).toHaveLength(8);
    // fewer than 8 usable bytes in a draw: it draws again
    let calls = 0;
    const slow = newCode(() => {
      calls++;
      return calls === 1 ? Uint8Array.from([255, 255, 0, 1]) : Uint8Array.from([2, 3, 4, 5, 6, 7, 8, 9]);
    });
    expect(calls).toBe(2);
    expect(slow).toHaveLength(8);
  });

  it("real draws use every symbol about equally often and never a banned one", () => {
    const counts = new Map<string, number>();
    const N = 3000;
    for (let i = 0; i < N; i++) for (const ch of newCode()) counts.set(ch, (counts.get(ch) ?? 0) + 1);
    const total = N * CODE_LENGTH;
    expect([...counts.keys()].every((ch) => CODE_ALPHABET.includes(ch))).toBe(true);
    expect(counts.size).toBe(31);
    const each = total / 31;
    for (const [ch, n] of counts) expect(Math.abs(n - each), ch).toBeLessThan(each * 0.2);
  });

  it("normalizeCode: case, spaces and dashes are ignored; the wrong length, a banned symbol or a long text is not a code", () => {
    expect(normalizeCode("abcd-efgh")).toBe("ABCDEFGH");
    expect(normalizeCode("  ABCD EFGH ")).toBe("ABCDEFGH");
    expect(normalizeCode("ab-cd-ef-gh")).toBe("ABCDEFGH");
    expect(normalizeCode("ABCDEFGH")).toBe("ABCDEFGH");
    expect(normalizeCode("ABCD-EFG")).toBeNull();
    expect(normalizeCode("ABCD-EFGHJ")).toBeNull();
    for (const bad of ["0BCD-EFGH", "ABCD-EFGO", "1BCD-EFGH", "ABCI-EFGH", "ABCD-EFGL", "ABCD-EFG!"]) expect(normalizeCode(bad), bad).toBeNull();
    expect(normalizeCode("A".repeat(33))).toBeNull();
    expect(normalizeCode(5 as unknown as string)).toBeNull();
    expect(showCode("ABCDEFGH")).toBe("ABCD-EFGH");
  });

  it("hashCode: 64 hex characters, one per code, not the code, and a domain tag in front", () => {
    const h = hashCode("ABCDEFGH");
    expect(h).toMatch(/^[0-9a-f]{64}$/);
    expect(hashCode("ABCDEFGJ")).not.toBe(h);
    expect(h).not.toContain("ABCDEFGH");
    expect(hashCode("ABCDEFGH")).toBe(h);
  });

  it("no signing domain's bytes begin another's (every one ends in a newline and holds no other)", () => {
    for (const a of DOMAINS) {
      expect(a.endsWith("\n") && a.indexOf("\n") === a.length - 1, JSON.stringify(a)).toBe(true);
      for (const b of DOMAINS) if (a !== b) expect(b.startsWith(a), `${JSON.stringify(a)} / ${JSON.stringify(b)}`).toBe(false);
    }
    expect(new Set(DOMAINS).size).toBe(DOMAINS.length);
    // the two old domains' bytes are the ones 0.9.13 signs
    expect(UPLOAD_PREFIX).toBe("bb-ghost-upload-1\n");
    expect(PROFILE_PREFIX).toBe("bb-profile-1\n");
  });
});

// ------------------------------------------------------------------------------------------------------- issue and redeem

describe.each(KINDS)("link codes on %s", (kind) => {
  it("a second device links: the code, the redeem, uploads under the player, and the player's profile follows", async () => {
    const rig = await open(kind);
    const wa = earnedWire({ runs: 5, bestDay: 7 });
    expect((await putWire(rig, wa, A)).status).toBe(200);
    const issued = await requestCode(rig, A);
    expect(issued.status, issued.text).toBe(200);
    expect(Object.keys(j(issued))).toEqual(["code", "expiresAt"]);
    expect(codeOf(issued)).toMatch(SHOWN);
    expect(j(issued).expiresAt).toBe(NOW + CODE_TTL_MS);
    const joined = await redeemCode(rig, B, codeOf(issued));
    expect(joined.status, joined.text).toBe(200);
    expect(j(joined)).toEqual({ player: A.playerId, profile: wa });
    expect((await postGhost(rig, B, uploadFor(B, A.playerId))).status).toBe(201); // B now uploads under the player
    expect((await postGhost(rig, C, uploadFor(C, A.playerId, { runId: "c-1" }))).status).toBe(403); // a stranger still may not
    const read = await readProfile(rig, B);
    expect(read.status, read.text).toBe(200);
    expect(j(read)).toEqual({ player: A.playerId, profile: wa });
  });

  it("the code is typed forgivingly: lower case, a space for the dash, spaces around", async () => {
    const rig = await open(kind);
    const code = codeOf(await requestCode(rig, A));
    const r = await redeemCode(rig, B, `  ${code.toLowerCase().replace("-", " ")}  `);
    expect(r.status, r.text).toBe(200);
    expect(j(r).player).toBe(A.playerId);
  });

  it("a code is good for 10 minutes: a millisecond before the end it works, at the end it is gone", async () => {
    const rig = await open(kind);
    const early = codeOf(await requestCode(rig, A));
    rig.clock.now += CODE_TTL_MS - 1;
    expect((await redeemCode(rig, B, early)).status).toBe(200);
    const late = codeOf(await requestCode(rig, A));
    rig.clock.now += CODE_TTL_MS;
    const gone = await redeemCode(rig, C, late);
    expect(gone.status).toBe(403);
    expect(gone.json).toEqual({ error: REFUSED });
    // the expired code was dropped when it was met
    const left = Object.keys(await identityRecords(rig)).filter((k) => k.startsWith("linkcodes/"));
    expect(left).toEqual([]);
  });

  it("a used, a wrong, a malformed and an expired code get one refusal, with the same words and the same status", async () => {
    const rig = await open(kind);
    const first = codeOf(await requestCode(rig, A));
    expect((await redeemCode(rig, B, first)).status).toBe(200);
    const reused = await redeemCode(rig, C, first);
    const wrong = await redeemCode(rig, C, "ZZZZ-ZZZZ");
    const malformed = await redeemCode(rig, C, "12");
    const stale = codeOf(await requestCode(rig, A));
    rig.clock.now += CODE_TTL_MS + 1;
    const expired = await redeemCode(rig, C, stale);
    for (const r of [reused, wrong, malformed, expired]) {
      expect(r.status, r.text).toBe(403);
      expect(r.json).toEqual({ error: REFUSED });
    }
    expect(new Set([reused.text, wrong.text, malformed.text, expired.text]).size).toBe(1);
    // and none of it linked C
    expect((await postGhost(rig, C, uploadFor(C, A.playerId, { runId: "c-1" }))).status).toBe(403);
  });

  it("a new code replaces the player's live one: the old one fails, and only one code is stored", async () => {
    const rig = await open(kind);
    const c1 = codeOf(await requestCode(rig, A));
    const c2 = codeOf(await requestCode(rig, A));
    expect(c2).not.toBe(c1);
    const stored = Object.keys(await identityRecords(rig)).filter((k) => k.startsWith("linkcodes/"));
    expect(stored).toEqual([`linkcodes/${hashCode(normalizeCode(c2)!)}.json`]);
    expect((await redeemCode(rig, B, c1)).status).toBe(403);
    expect((await redeemCode(rig, B, c2)).status).toBe(200);
  });

  it("a key of the linked player can issue the next code too: any device of the player adds another", async () => {
    const rig = await open(kind);
    expect((await linkVia(rig, A, B)).joined.status).toBe(200);
    const fromB = await requestCode(rig, B);
    expect(fromB.status, fromB.text).toBe(200);
    const joined = await redeemCode(rig, C, codeOf(fromB));
    expect(joined.status, joined.text).toBe(200);
    expect(j(joined).player).toBe(A.playerId); // the player is A, whichever of its keys asked
    const players = JSON.parse((await identityRecords(rig))[`players/${A.playerId}.json`]) as { keys: string[] };
    expect([...players.keys].sort()).toEqual([B.playerId, C.playerId].sort());
  });

  it("two redeems racing on one machine: exactly one wins, the other gets the one refusal", async () => {
    for (let i = 0; i < 3; i++) {
      const rig = await open(kind);
      const code = codeOf(await requestCode(rig, A));
      const [r1, r2] = await Promise.all([redeemCode(rig, B, code), redeemCode(rig, C, code)]);
      expect([r1.status, r2.status].sort(), `${r1.text} ${r2.text}`).toEqual([200, 403]);
      const [winner, loser] = r1.status === 200 ? [B, C] : [C, B];
      expect((r1.status === 200 ? r2 : r1).json).toEqual({ error: REFUSED });
      expect((await postGhost(rig, winner, uploadFor(winner, A.playerId, { runId: `w${i}` }))).status).toBe(201);
      expect((await postGhost(rig, loser, uploadFor(loser, A.playerId, { runId: `l${i}` }))).status).toBe(403);
    }
  });

  it("a key that is linked already redeems a second code of the same player as a no-op, and the code is spent; the player's own key too", async () => {
    const rig = await open(kind);
    expect((await linkVia(rig, A, B)).joined.status).toBe(200);
    const again = codeOf(await requestCode(rig, A));
    const r = await redeemCode(rig, B, again);
    expect(r.status, r.text).toBe(200);
    expect(j(r).player).toBe(A.playerId);
    expect((await redeemCode(rig, C, again)).status).toBe(403); // spent
    const own = codeOf(await requestCode(rig, A));
    expect(j(await redeemCode(rig, A, own)).player).toBe(A.playerId);
    const players = JSON.parse((await identityRecords(rig))[`players/${A.playerId}.json`]) as { keys: string[] };
    expect(players.keys).toEqual([B.playerId]); // nothing was added twice, and the player is not its own key
  });

  it("the store holds a hash and never the code, in any record, name or log line", async () => {
    const rig = await open(kind);
    const code = codeOf(await requestCode(rig, A));
    const norm = normalizeCode(code)!;
    const records = await identityRecords(rig);
    const hash = hashCode(norm);
    expect(Object.keys(records)).toContain(`linkcodes/${hash}.json`);
    expect(JSON.parse(records[`linkcodes/${hash}.json`])).toEqual({ player: A.playerId, expiresAt: NOW + CODE_TTL_MS });
    expect(JSON.parse(records[`players/${A.playerId}.json`])).toMatchObject({ keys: [], steam: [], code: hash });
    const everything = JSON.stringify(records);
    for (const form of [code, norm, code.toLowerCase(), norm.toLowerCase()]) expect(everything).not.toContain(form);
    await redeemCode(rig, B, code);
    await redeemCode(rig, C, code);
    expect(rig.log.join("\n")).not.toContain(norm);
    expect(rig.log.join("\n")).not.toContain(A.playerId);
    for (const l of rig.log.filter((x) => / \/v1\//.test(x))) expect(l, l).toMatch(/^\S+ (GET|POST|PUT|DELETE) \/v1\/[a-z/]+ \d{3} \d+ms$/);
  });

  it("409: a key linked elsewhere, a key whose player has other keys, a key with a Steam link; nothing changes and the code stays good", async () => {
    const steam = fakeSteam({ aa01: "76561198000000001" });
    const rig = await open(kind, { steam });
    const [E, F, G] = [await freshIdentity(), await freshIdentity(), await freshIdentity()];
    const code = codeOf(await requestCode(rig, A));
    expect((await linkVia(rig, E, B)).joined.status).toBe(200); // B belongs to E
    expect((await linkVia(rig, D, F)).joined.status).toBe(200); // D is a player with a key
    expect((await linkSteamCall(rig, C, "aa01", "bb-ghost", 480)).status).toBe(200); // C has a Steam account
    const before = await identityRecords(rig);
    const linkedElsewhere = await redeemCode(rig, B, code);
    const hasKeys = await redeemCode(rig, D, code);
    const hasSteam = await redeemCode(rig, C, code);
    expect(linkedElsewhere).toMatchObject({ status: 409, json: { error: "this device is already linked to another player" } });
    expect(hasKeys).toMatchObject({ status: 409, json: { error: "this device already has linked devices or a Steam account" } });
    expect(hasSteam).toMatchObject({ status: 409, json: { error: "this device already has linked devices or a Steam account" } });
    expect(await identityRecords(rig)).toEqual(before); // not one record changed, the code included
    expect((await postGhost(rig, B, uploadFor(B, E.playerId, { runId: "b-1" }))).status).toBe(201); // B is still E's
    expect((await postGhost(rig, B, uploadFor(B, A.playerId, { runId: "b-2" }))).status).toBe(403);
    expect((await postGhost(rig, F, uploadFor(F, D.playerId, { runId: "f-1" }))).status).toBe(201); // F is still D's
    expect((await redeemCode(rig, G, code)).status).toBe(200); // and a lone key can still use the code
  });

  it("a lone key's stored profile is merged into the player's (max, union, newer) and removed; its old ghosts stay", async () => {
    const rig = await open(kind);
    const wa = earnedWire({ runs: 12, bestDay: 3, duskWins: 4 }, { won: ["furnace"] });
    const wb = earnedWire({ runs: 6, bestDay: 9, duskWins: 31, mostBelts: 5 }, { won: ["weaver"], finished: ["weaver"] }, { updatedAt: NOW + 5_000 });
    expect((await putWire(rig, wa, A)).status).toBe(200);
    expect((await putWire(rig, wb, B)).status).toBe(200);
    const old = uploadFor(B, B.playerId, { runId: "b-before" });
    expect((await postGhost(rig, B, old)).status).toBe(201);
    const ghosts = ghostCount(rig);
    expect(profileStored(rig, B.playerId)).toBe(true);
    const { joined } = await linkVia(rig, A, B);
    expect(joined.status, joined.text).toBe(200);
    const expected = mergeWire(wa, wb);
    expect(expected.counters).toMatchObject({ runs: 12, bestDay: 9, duskWins: 31, mostBelts: 5 }); // max, field by field
    expect(expected.heroesWon).toEqual(["furnace", "weaver"]); // union
    expect(j(joined)).toEqual({ player: A.playerId, profile: expected });
    expect(profileStored(rig, B.playerId)).toBe(false); // its own record is gone
    expect(profileStored(rig, A.playerId)).toBe(true);
    expect(j(await readProfile(rig, A)).profile).toEqual(expected);
    expect(j(await readProfile(rig, B))).toEqual({ player: A.playerId, profile: expected });
    // its old ghost is where it was, and a stranger is still served it
    expect(ghostCount(rig)).toBe(ghosts);
    const seen = await matchAs(rig, C.playerId);
    expect(seen.status, seen.text).toBe(200);
    expect(j(seen).id).toBe(ghostId(old));
  });

  it("a lone key with no stored profile just joins; a player with no stored profile gets the key's", async () => {
    const rig = await open(kind);
    const wb = earnedWire({ runs: 3 });
    expect((await putWire(rig, wb, B)).status).toBe(200);
    const { joined } = await linkVia(rig, A, B); // A has no profile record at all
    expect(joined.status).toBe(200);
    expect(j(joined)).toEqual({ player: A.playerId, profile: wb });
    expect(profileStored(rig, A.playerId)).toBe(true);
    const rig2 = await open(kind);
    const lone = await linkVia(rig2, C, D); // neither has one
    expect(j(lone.joined)).toEqual({ player: C.playerId, profile: null });
  });
});

// ------------------------------------------------------------------------------------------------- the failed-try limit

describe("failed redeems are limited per client address", () => {
  const redeemFrom = async (rig: Rig, id: Identity, code: string, ip: string): Promise<Reply> => {
    const body = bodyAt(rig.clock.now, { code });
    return send(rig, "POST", "/v1/link/redeem", body, { ...(await signedBy(id, body, LINK_REDEEM_PREFIX)), "fly-client-ip": ip });
  };

  it("5 wrong codes in 10 minutes; the 6th is 429 with a retry-after, even with the right code; the window slides with the clock", async () => {
    const rig = await open("jsonl");
    const code = codeOf(await requestCode(rig, A));
    for (let i = 0; i < 5; i++) expect((await redeemCode(rig, B, "ZZZZ-ZZZZ")).status, `try ${i + 1}`).toBe(403);
    const sixth = await redeemCode(rig, B, "ZZZZ-ZZZZ");
    expect(sixth.status).toBe(429);
    expect(sixth.json).toEqual({ error: "too many wrong codes, try again later" });
    expect(sixth.headers.get("retry-after")).toBe("600");
    const right = await redeemCode(rig, B, code);
    expect(right.status).toBe(429); // an address over the limit learns nothing, right code or not
    rig.clock.now += 5 * 60_000;
    const half = await redeemCode(rig, B, code);
    expect(half.status).toBe(429);
    expect(half.headers.get("retry-after")).toBe("300"); // the oldest failure leaves the window in 5 minutes
    rig.clock.now += 5 * 60_000 + 1;
    const fresh = codeOf(await requestCode(rig, A)); // the first code expired with the window
    expect((await redeemCode(rig, B, code)).status).toBe(403); // (one more wrong try: the old, expired code)
    expect((await redeemCode(rig, B, fresh)).status).toBe(200);
  });

  it("only wrong codes count (not a success, a 401, a 409 or a 422); another address is not affected", async () => {
    const rig = await open("jsonl", { trustProxy: "fly" });
    const one = "203.0.113.7", two = "203.0.113.8";
    const code = codeOf(await requestCode(rig, A));
    for (let i = 0; i < 5; i++) expect((await redeemFrom(rig, B, "ZZZZ-ZZZZ", one)).status).toBe(403);
    expect((await redeemFrom(rig, B, "ZZZZ-ZZZZ", one)).status).toBe(429);
    expect((await redeemFrom(rig, B, code, one)).status).toBe(429);
    expect((await redeemFrom(rig, B, code, two)).status).toBe(200); // the other address redeems the right code
    // not counted: a 401 (bad signature), a 422 (bad clock), a 409 (linked elsewhere) from a third address
    const three = "203.0.113.9";
    for (let i = 0; i < 8; i++) {
      const body = bodyAt(rig.clock.now, { code: "ZZZZ-ZZZZ" });
      const bad = await send(rig, "POST", "/v1/link/redeem", body, { ...(await signedBy(B, bodyAt(rig.clock.now, { code: "AAAA-AAAA" }), LINK_REDEEM_PREFIX)), "fly-client-ip": three });
      expect(bad.status).toBe(401);
      const late = await send(rig, "POST", "/v1/link/redeem", bodyAt(rig.clock.now + 2 * AT_WINDOW_MS, { code: "ZZZZ-ZZZZ" }), { ...(await signedBy(B, bodyAt(rig.clock.now + 2 * AT_WINDOW_MS, { code: "ZZZZ-ZZZZ" }), LINK_REDEEM_PREFIX)), "fly-client-ip": three });
      expect(late.status).toBe(422);
      expect(body.length).toBeGreaterThan(0);
    }
    expect((await redeemFrom(rig, C, "ZZZZ-ZZZZ", three)).status).toBe(403); // the first counted one, not the ninth
  });

  it("the limit is the redeemLimit option's: 2 in 1 second, and the clock moves the window", async () => {
    const rig = await open("jsonl", { redeemLimit: { windowMs: 1000, max: 2 } });
    expect((await redeemCode(rig, B, "ZZZZ-ZZZZ")).status).toBe(403);
    expect((await redeemCode(rig, B, "YYYY-YYYY")).status).toBe(403);
    expect((await redeemCode(rig, B, "XXXX-XXXX")).status).toBe(429);
    rig.clock.now += 1000;
    expect((await redeemCode(rig, B, "XXXX-XXXX")).status).toBe(403);
  });
});

// ----------------------------------------------------------------------------------- what every new route shares, in order

describe("the refusals every identity route shares", () => {
  it("a signature made in another domain never passes: every route against every other domain's signature, both ways with the old two", async () => {
    const rig = await open("jsonl", { steam: fakeSteam({}) });
    const at = rig.clock.now;
    const query = `at=${at}`;
    const routes: { name: string; method: string; path: string; domain: SignDomain; body: string; bare?: true }[] = [
      { name: "link/code", method: "POST", path: "/v1/link/code", domain: LINK_CODE_PREFIX, body: bodyAt(at) },
      { name: "link/redeem", method: "POST", path: "/v1/link/redeem", domain: LINK_REDEEM_PREFIX, body: bodyAt(at, { code: "ABCD-EFGH" }) },
      { name: "link/steam", method: "POST", path: "/v1/link/steam", domain: LINK_STEAM_PREFIX, body: bodyAt(at, { ticket: "aa01", identity: "bb-ghost", appid: 480 }) },
      { name: "DELETE /v1/player", method: "DELETE", path: "/v1/player", domain: DELETE_PREFIX, body: bodyAt(at) },
      { name: "GET /v1/profile", method: "GET", path: `/v1/profile?${query}`, domain: PROFILE_GET_PREFIX, body: query, bare: true },
      { name: "PUT /v1/profile", method: "PUT", path: "/v1/profile", domain: PROFILE_PREFIX, body: encodeWire(earnedWire({ runs: 1 })) },
      { name: "POST /v1/ghosts", method: "POST", path: "/v1/ghosts", domain: UPLOAD_PREFIX, body: encodeSnapshot(uploadFor(A)) },
    ];
    let checked = 0;
    for (const r of routes) {
      for (const d of DOMAINS) {
        if (d === r.domain) continue;
        const res = await send(rig, r.method, r.path, r.bare ? undefined : r.body, await signedBy(A, r.body, d));
        expect(res.status, `${r.name} signed in ${JSON.stringify(d)}: ${res.text}`).toBe(401);
        expect(res.json).toEqual({ error: "x-bb-sig: the signature does not match this body and key" });
        checked++;
      }
    }
    expect(checked).toBe(7 * 6);
    // the right domain is not a 401 (DELETE is left for the deletion tests: it would delete A)
    for (const r of routes.filter((x) => x.method !== "DELETE")) {
      const res = await send(rig, r.method, r.path, r.bare ? undefined : r.body, await signedBy(A, r.body, r.domain));
      expect(res.status, `${r.name}: ${res.text}`).not.toBe(401);
    }
  });

  it("headers missing or malformed: 401, before the body is read (a body over the limit is not a 413)", async () => {
    const rig = await open("jsonl", { steam: fakeSteam({}) });
    const big = "x".repeat(10_000);
    const routes: [string, string][] = [["POST", "/v1/link/code"], ["POST", "/v1/link/redeem"], ["POST", "/v1/link/steam"], ["DELETE", "/v1/player"]];
    for (const [method, path] of routes) {
      const none = await send(rig, method, path, big, { "content-type": "application/json" });
      expect(none.status, path).toBe(401);
      expect(none.json).toEqual({ error: "unsigned upload: the x-bb-key and x-bb-sig headers are required" });
      const half = await send(rig, method, path, big, { "x-bb-key": (await signedBy(A, "x", LINK_CODE_PREFIX))["x-bb-key"] });
      expect(half.status, path).toBe(401);
      const junk = await send(rig, method, path, big, { "x-bb-key": "abc", "x-bb-sig": "def" });
      expect(junk.status, path).toBe(401);
      expect(String(junk.json?.error)).toMatch(/^x-bb-key: expected base64url of a raw P-256 public key/);
    }
    const read = await send(rig, "GET", `/v1/profile?at=${rig.clock.now}`);
    expect(read.status).toBe(401);
    expect(read.json).toEqual({ error: "unsigned upload: the x-bb-key and x-bb-sig headers are required" });
    // signed, and over the route's limit: now it is read, and it is a 413
    const body = bodyAt(rig.clock.now, { pad: "p".repeat(300) });
    const over = await send(rig, "POST", "/v1/link/code", body, await signedBy(A, body, LINK_CODE_PREFIX));
    expect(over.status).toBe(413);
  });

  it("closed uploads: link/code, link/redeem and link/steam answer 403 without reading the body; DELETE /v1/player and GET /v1/profile still work", async () => {
    const rig = await open("jsonl", { uploads: "closed", steam: fakeSteam({ aa01: "76561198000000001" }) });
    const unsigned = await send(rig, "POST", "/v1/link/code", "x".repeat(10_000)); // not even signed: the gate comes first
    expect(unsigned).toMatchObject({ status: 403, json: { error: "uploads are not open yet" } });
    expect(await requestCode(rig, A)).toMatchObject({ status: 403, json: { error: "uploads are not open yet" } });
    expect(await redeemCode(rig, B, "ABCD-EFGH")).toMatchObject({ status: 403, json: { error: "uploads are not open yet" } });
    expect(await linkSteamCall(rig, A, "aa01", "bb-ghost", 480)).toMatchObject({ status: 403, json: { error: "uploads are not open yet" } });
    expect((await putWire(rig, earnedWire({ runs: 1 }), A)).status).toBe(403); // as ever
    expect(await readProfile(rig, A)).toMatchObject({ status: 200, json: { player: A.playerId, profile: null } });
    const gone = await send(rig, "DELETE", "/v1/player", bodyAt(rig.clock.now), await signedBy(A, bodyAt(rig.clock.now), DELETE_PREFIX));
    expect(gone).toMatchObject({ status: 200, json: { deleted: true } });
  });

  it("`at` more than 10 minutes from the server's clock is 422 on every route, a code is not spent by it, and the edge itself is accepted", async () => {
    const SKEW = `at: more than 10 minutes from the server's clock`;
    const late = AT_WINDOW_MS + 1;
    // link/code
    let rig = await open("jsonl");
    for (const at of [NOW + late, NOW - late]) expect(await requestCode(rig, A, at), String(at)).toMatchObject({ status: 422, json: { error: SKEW } });
    for (const at of [NOW + AT_WINDOW_MS, NOW - AT_WINDOW_MS]) expect((await requestCode(rig, A, at)).status, String(at)).toBe(200);
    // link/redeem: the code is not spent by a refusal of the clock
    rig = await open("jsonl");
    const code = codeOf(await requestCode(rig, A));
    for (const at of [NOW + late, NOW - late]) expect(await redeemCode(rig, B, code, at), String(at)).toMatchObject({ status: 422, json: { error: SKEW } });
    expect((await redeemCode(rig, B, code, NOW + AT_WINDOW_MS)).status).toBe(200);
    // link/steam
    rig = await open("jsonl", { steam: fakeSteam({ aa01: "76561198000000001", aa02: "76561198000000001" }) });
    for (const at of [NOW + late, NOW - late]) expect(await linkSteamCall(rig, A, "aa01", "bb-ghost", 480, at), String(at)).toMatchObject({ status: 422, json: { error: SKEW } });
    expect((await linkSteamCall(rig, A, "aa01", "bb-ghost", 480, NOW - AT_WINDOW_MS)).status).toBe(200);
    // GET /v1/profile
    rig = await open("jsonl");
    for (const at of [NOW + late, NOW - late]) expect(await readProfile(rig, A, at), String(at)).toMatchObject({ status: 422, json: { error: SKEW } });
    expect((await readProfile(rig, A, NOW + AT_WINDOW_MS)).status).toBe(200);
    // DELETE /v1/player: a refused clock deletes nothing
    rig = await open("jsonl");
    expect((await putWire(rig, earnedWire({ runs: 2 }), A)).status).toBe(200);
    const body = (at: number) => bodyAt(at);
    for (const at of [NOW + late, NOW - late]) {
      const r = await send(rig, "DELETE", "/v1/player", body(at), await signedBy(A, body(at), DELETE_PREFIX));
      expect(r, String(at)).toMatchObject({ status: 422, json: { error: SKEW } });
    }
    expect(profileStored(rig, A.playerId)).toBe(true);
    expect(rig.app.links.isGone(A.playerId)).toBe(false);
    const edge = await send(rig, "DELETE", "/v1/player", body(NOW - AT_WINDOW_MS), await signedBy(A, body(NOW - AT_WINDOW_MS), DELETE_PREFIX));
    expect(edge.status).toBe(200);
  });

  it("a body that is not exactly the route's canonical compact JSON is 400; a bad `at` is 422", async () => {
    const rig = await open("jsonl");
    const post = async (path: string, domain: SignDomain, text: string, id: Identity = A): Promise<Reply> => send(rig, "POST", path, text, await signedBy(id, text, domain));
    const now = rig.clock.now;
    const code = (text: string) => post("/v1/link/code", LINK_CODE_PREFIX, text);
    const redeem = (text: string) => post("/v1/link/redeem", LINK_REDEEM_PREFIX, text, B);
    const compact = `canonical form (compact JSON, fixed field order)`;
    expect(await code(`{"at": ${now}}`)).toMatchObject({ status: 400, json: { error: expect.stringContaining(compact) } }); // a space
    expect(await code(` {"at":${now}}`)).toMatchObject({ status: 400 });
    expect(await code(`{"at":${now},"x":1}`)).toMatchObject({ status: 400, json: { error: "body: expected exactly at, in that order" } });
    expect(await code(`{"x":${now}}`)).toMatchObject({ status: 400, json: { error: "body: expected exactly at, in that order" } });
    expect(await code(`{}`)).toMatchObject({ status: 400 });
    for (const text of ["[]", "null", '"text"', "123"]) expect(await code(text), text).toMatchObject({ status: 400, json: { error: "body: expected an object" } });
    for (const text of ["", "not json", "{"]) expect(await code(text), text).toMatchObject({ status: 400, json: { error: "body: not JSON" } });
    expect(await code(`{"at":1e3}`)).toMatchObject({ status: 400 }); // not the form JSON.stringify writes
    // a bad `at` is the clock's refusal
    for (const bad of ['"123"', "-5", "1.5", "null", "true"]) expect(await code(`{"at":${bad}}`), bad).toMatchObject({ status: 422, json: { error: expect.stringMatching(/^at: / ) } });
    // redeem: field order, a missing or non-text code
    expect(await redeem(`{"code":"ABCD-EFGH","at":${now}}`)).toMatchObject({ status: 400, json: { error: "body: expected exactly at, code, in that order" } });
    expect(await redeem(`{"at":${now}}`)).toMatchObject({ status: 400 });
    expect(await redeem(`{"at":${now},"code":5}`)).toMatchObject({ status: 400, json: { error: "code: expected the typed code as text" } });
    expect(await redeem(`{"at":${now},"code":null}`)).toMatchObject({ status: 400 });
    // a body that is not UTF-8, correctly signed over its bytes: 400
    const bytes = Uint8Array.from([0xff, 0xfe, 0x7b, 0x7d]);
    const odd = await send(rig, "POST", "/v1/link/code", bytes, await signedBy(A, bytes, LINK_CODE_PREFIX));
    expect(odd).toMatchObject({ status: 400, json: { error: "request body is not UTF-8" } });
    // none of it stored a thing
    expect(Object.keys(await identityRecords(rig))).toEqual([]);
  });

  it("CORS: DELETE is listed on the preflight of /v1/player only; every other preflight is what it was; a configured origin is echoed", async () => {
    const rig = await open("jsonl");
    const pre = (path: string, method: string, origin = SHORE) =>
      fetch(`${rig.base}${path}`, { method: "OPTIONS", headers: { origin, "access-control-request-method": method, "access-control-request-headers": "content-type,x-bb-key,x-bb-sig" } });
    const del = await pre("/v1/player", "DELETE");
    expect(del.status).toBe(204);
    expect(del.headers.get("access-control-allow-origin")).toBe(SHORE);
    expect(del.headers.get("access-control-allow-methods")).toBe("DELETE, OPTIONS");
    expect(del.headers.get("access-control-allow-headers")).toBe("content-type, x-bb-key, x-bb-sig");
    for (const [path, method] of [["/v1/link/code", "POST"], ["/v1/link/redeem", "POST"], ["/v1/link/steam", "POST"], ["/v1/profile", "GET"], ["/v1/profile", "PUT"], ["/v1/ghosts", "POST"]]) {
      const r = await pre(path, method);
      expect(r.status, path).toBe(204);
      expect(r.headers.get("access-control-allow-methods"), path).toBe("GET, POST, PUT, OPTIONS");
    }
    expect((await pre("/v1/player", "DELETE", "http://evil.example")).status).toBe(403);
    // a DELETE from the configured origin carries the allow-origin header on the real response too
    const body = bodyAt(rig.clock.now);
    const real = await send(rig, "DELETE", "/v1/player", body, { ...(await signedBy(C, body, DELETE_PREFIX)), origin: SHORE });
    expect(real.status).toBe(200);
    expect(real.headers.get("access-control-allow-origin")).toBe(SHORE);
  });

  it("the new routes keep to their methods: 405 for any other", async () => {
    const rig = await open("jsonl", { steam: fakeSteam({}) });
    for (const path of ["/v1/link/code", "/v1/link/redeem", "/v1/link/steam"]) {
      for (const method of ["GET", "PUT", "DELETE"]) expect(await send(rig, method, path), `${method} ${path}`).toMatchObject({ status: 405, json: { error: "use POST" } });
    }
    for (const method of ["GET", "POST", "PUT"]) expect(await send(rig, method, "/v1/player"), method).toMatchObject({ status: 405, json: { error: "use DELETE" } });
    // a bare GET /v1/profile (no signing header, no query) is what it always was: 405 "use PUT"
    expect(await send(rig, "GET", "/v1/profile")).toMatchObject({ status: 405, json: { error: "use PUT" } });
  });
});

// ---------------------------------------------------------------------------------------------------- GET /v1/profile

describe.each(KINDS)("GET /v1/profile?at=<ms> on %s", (kind) => {
  it("200 { player, profile }: null before any profile, the stored one after; signed over the exact query text", async () => {
    const rig = await open(kind);
    expect(await readProfile(rig, A)).toMatchObject({ status: 200, json: { player: A.playerId, profile: null } });
    const wa = earnedWire({ runs: 3, bestDay: 4 });
    expect((await putWire(rig, wa, A)).status).toBe(200);
    const read = await readProfile(rig, A);
    expect(read.status).toBe(200);
    expect(read.text).toBe(JSON.stringify({ player: A.playerId, profile: JSON.parse(encodeWire(wa)) }));
    expect(read.headers.get("cache-control")).toBe("no-store");
    // another player's key reads its own
    expect(await readProfile(rig, B)).toMatchObject({ status: 200, json: { player: B.playerId, profile: null } });
    // a read writes nothing
    expect(Object.keys(await identityRecords(rig))).toEqual([]);
  });

  it("a linked key reads the player's profile and is told the player", async () => {
    const rig = await open(kind);
    const wa = earnedWire({ runs: 8 });
    await putWire(rig, wa, A);
    await linkVia(rig, A, B);
    expect(await readProfile(rig, B)).toMatchObject({ status: 200, json: { player: A.playerId, profile: wa } });
    await rig.restart(); // and from a new process too
    expect(await readProfile(rig, B)).toMatchObject({ status: 200, json: { player: A.playerId, profile: wa } });
  });

  it("a query that is not exactly at=<digits> is 400; a signature over another query is 401; unsigned is 401", async () => {
    const rig = await open(kind);
    const get = async (query: string, signedOver: string = query): Promise<Reply> =>
      send(rig, "GET", `/v1/profile${query ? `?${query}` : ""}`, undefined, await signedBy(A, signedOver, PROFILE_GET_PREFIX));
    const at = rig.clock.now;
    for (const q of ["at=abc", `at=${at}&at=${at}`, `x=1&at=${at}`, `at=${at}&x=1`, `at=`, `at=-5`, `at=1.5`, `AT=${at}`, `at=${"9".repeat(17)}`, ""]) {
      const r = await get(q);
      expect(r.status, JSON.stringify(q)).toBe(400);
      expect(r.json).toEqual({ error: "query: expected exactly at=<milliseconds>" });
    }
    expect((await get(`at=${at}`, `at=${at + 1}`)).status).toBe(401); // the signature covers other bytes
    expect((await send(rig, "GET", `/v1/profile?at=${at}`)).status).toBe(401);
    expect((await get(`at=${at}`)).status).toBe(200);
    expect((await get(`at=${at + 5 * 60_000}`)).status).toBe(200); // inside the bound
    expect((await get(`at=${at + AT_WINDOW_MS + 1}`)).status).toBe(422);
  });
});
