// VERIFY-IDENT1 (REQ-BFG-122) step 4a, written by the independent checker (cap_zeta): LINK CODES. A used code, the edges of its 10
// minutes, two redeems racing in one process, a new code killing the old, the wrong-code limit and its sliding window, every spelling of a
// code, the store and the log scanned for the code, and 10,000 generated codes. Both backing stores (JSON lines and the Tigris fake).
// A check marked FINDING states the right behaviour and is `it.fails`: it passes while the product is wrong and starts failing the day
// the product is fixed (then drop the `.fails`).
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { LINK_REDEEM_PREFIX, type Identity } from "../src/net/identity";
import { CODE_ALPHABET, CODE_LENGTH, CODE_TTL_MS, hashCode, newCode, normalizeCode } from "../server/links";
import { testIdentity } from "./netIdentity";
import { earnedWire } from "./profileupWire";
import {
  closeRigs, deleteMe, fakeKeys, freshIdentity, identityRecords, linkVia, openRig, postGhost, profileStored, putWire, readProfile, redeemCode, requestCode,
  send, signedBy, theFake, uploadFor, type Kind, type Opts, type Reply, type Rig,
} from "./identRig";

let A: Identity, B: Identity, C: Identity, D: Identity, E: Identity;
beforeAll(async () => {
  [A, B, C, D, E] = await Promise.all([0, 1, 2, 3, 3].map((n, i) => (i === 4 ? freshIdentity() : testIdentity(n))));
});
afterAll(closeRigs);

const KINDS: Kind[] = ["jsonl", "tigris"];
const NOLIMIT = { windowMs: 600_000, max: 1_000_000 };
/** A rig whose global limiter stays out of the way; `redeemLimit` is the production default (5 wrong codes in 10 minutes) unless given. */
const open = (kind: Kind, over: Opts = {}) => openRig(kind, { rateLimit: { windowMs: 60_000, max: 1_000_000 }, ...over });
const REFUSED = { error: "that code did not work" };
const codeOf = (r: Reply): string => String(r.json?.code);
const linkRecords = async (rig: Rig, prefix: string) => Object.keys(await identityRecords(rig)).filter((k) => k.startsWith(prefix));

// ---------------------------------------------------------------------------------------------------------- used, expired, raced
describe.each(KINDS)("a code's life on %s", (kind) => {
  it("a used code is refused to everyone (the redeemer, a stranger, the issuer), with the one refusal, and the refusals change nothing", async () => {
    const rig = await open(kind, { redeemLimit: NOLIMIT });
    const code = codeOf(await requestCode(rig, A));
    expect((await redeemCode(rig, B, code)).status).toBe(200);
    const after = await identityRecords(rig);
    for (const who of [B, C, D, A]) {
      const r = await redeemCode(rig, who, code);
      expect(r.status, r.text).toBe(403);
      expect(r.json).toEqual(REFUSED);
    }
    expect(await identityRecords(rig)).toEqual(after);
    expect((await postGhost(rig, C, uploadFor(C, A.playerId, { runId: "c-1" }))).status).toBe(403); // C is still nobody's device
  });

  it("the edges of the 10 minutes: 1 ms before expiresAt it links, at expiresAt and 1 ms past it the code is gone (and dropped from the store)", async () => {
    for (const [offset, want] of [[-1, 200], [0, 403], [1, 403]] as const) {
      const rig = await open(kind);
      const issued = await requestCode(rig, A);
      const expiresAt = Number(issued.json?.expiresAt);
      expect(expiresAt).toBe(rig.clock.now + CODE_TTL_MS);
      rig.clock.now = expiresAt + offset;
      const r = await redeemCode(rig, B, codeOf(issued));
      expect(r.status, `offset ${offset}: ${r.text}`).toBe(want);
      if (want === 403) {
        expect(r.json).toEqual(REFUSED);
        expect(await linkRecords(rig, "linkcodes/")).toEqual([]); // dropped when met
        expect(await linkRecords(rig, "links/keys/")).toEqual([]); // and it linked nobody
      } else {
        expect(r.json?.player).toBe(A.playerId);
      }
    }
  });

  it("an expired code stays dead when the clock is wound back, and a code issued after it is a different one that works", async () => {
    const rig = await open(kind, { redeemLimit: NOLIMIT });
    const old = codeOf(await requestCode(rig, A));
    const t0 = rig.clock.now;
    rig.clock.now = t0 + CODE_TTL_MS + 5;
    expect((await redeemCode(rig, B, old)).status).toBe(403);
    rig.clock.now = t0 + 10; // wound back to inside the old code's life
    expect((await redeemCode(rig, B, old)).status, "an expired code the server met and dropped does not come back").toBe(403);
    const fresh = codeOf(await requestCode(rig, A));
    expect((await redeemCode(rig, B, fresh)).status).toBe(200);
  });

  it("two redeems of one code racing in one process: exactly one wins and the loser changes nothing (six rounds, both orders, each contender holding a profile of its own)", async () => {
    for (let round = 0; round < 6; round++) {
      const rig = await open(kind);
      const [X, Y] = round % 2 ? [B, C] : [C, B];
      const px = await putWire(rig, earnedWire({ runs: 2, bestDay: 3 }), X);
      const py = await putWire(rig, earnedWire({ runs: 4, bestDay: 5 }), Y);
      expect(px.status).toBe(200);
      expect(py.status).toBe(200);
      expect((await putWire(rig, earnedWire({ runs: 1, bestDay: 2 }), A)).status).toBe(200);
      const code = codeOf(await requestCode(rig, A));
      const [rx, ry] = await Promise.all([redeemCode(rig, X, code), redeemCode(rig, Y, code)]);
      expect([rx.status, ry.status].sort(), `${rx.text} | ${ry.text}`).toEqual([200, 403]);
      const [winner, loser, won, lost, loserPut] = rx.status === 200 ? [X, Y, rx, ry, py] : [Y, X, ry, rx, px];
      expect(lost.json).toEqual(REFUSED);
      expect(won.json?.player).toBe(A.playerId);
      const links = await linkRecords(rig, "links/keys/");
      expect(links, "exactly the winner is linked").toEqual([`links/keys/${winner.playerId}.json`]);
      const players = JSON.parse((await identityRecords(rig))[`players/${A.playerId}.json`]) as { keys: string[]; code?: string };
      expect(players.keys).toEqual([winner.playerId]);
      expect(players.code, "the code is spent").toBeUndefined();
      expect(await linkRecords(rig, "linkcodes/")).toEqual([]);
      // the loser's profile record is exactly what it was; the winner's was merged into A's and removed
      expect(profileStored(rig, loser.playerId)).toBe(true);
      expect(profileStored(rig, winner.playerId)).toBe(false);
      const seen = await readProfile(rig, loser);
      expect(seen.json).toEqual({ player: loser.playerId, profile: loserPut.json });
    }
  });

  it("six keys racing one code: one 200 and five refusals, one key linked, and no key left half-linked", async () => {
    const rig = await open(kind);
    const keys = [B, C, D, E, await freshIdentity(), await freshIdentity()];
    const code = codeOf(await requestCode(rig, A));
    const rs = await Promise.all(keys.map((k) => redeemCode(rig, k, code)));
    expect(rs.map((r) => r.status).sort(), rs.map((r) => r.text).join(" | ")).toEqual([200, 403, 403, 403, 403, 403]);
    const winner = keys[rs.findIndex((r) => r.status === 200)];
    expect(await linkRecords(rig, "links/keys/")).toEqual([`links/keys/${winner.playerId}.json`]);
    for (const k of keys) {
      const up = await postGhost(rig, k, uploadFor(k, A.playerId, { runId: `r-${k.playerId.slice(0, 6)}` }));
      expect(up.status, k === winner ? "winner" : "loser").toBe(k === winner ? 201 : 403);
    }
  });

  it("one key redeeming one code twice at once: one 200, one refusal, linked once", async () => {
    const rig = await open(kind);
    const code = codeOf(await requestCode(rig, A));
    const rs = await Promise.all([redeemCode(rig, B, code), redeemCode(rig, B, code)]);
    expect(rs.map((r) => r.status).sort()).toEqual([200, 403]);
    const players = JSON.parse((await identityRecords(rig))[`players/${A.playerId}.json`]) as { keys: string[] };
    expect(players.keys).toEqual([B.playerId]);
  });

  it("a redeem racing the player's NEXT code: whichever order the server takes, exactly one code is left (the new one), the player's record names it, and B is linked only if its redeem won", async () => {
    for (let i = 0; i < 8; i++) {
      const rig = await open(kind);
      const c1 = codeOf(await requestCode(rig, A));
      const redeemFirst = i % 2 === 0;
      const p1 = redeemFirst ? redeemCode(rig, B, c1) : requestCode(rig, A);
      const p2 = redeemFirst ? requestCode(rig, A) : redeemCode(rig, B, c1);
      const [x, y] = await Promise.all([p1, p2]);
      const redeem = redeemFirst ? x : y;
      const issue = redeemFirst ? y : x;
      expect(issue.status, issue.text).toBe(200);
      const c2 = codeOf(issue);
      const records = await identityRecords(rig);
      const want = `linkcodes/${hashCode(normalizeCode(c2)!)}.json`;
      expect(Object.keys(records).filter((k) => k.startsWith("linkcodes/")), `round ${i}`).toEqual([want]);
      expect((JSON.parse(records[`players/${A.playerId}.json`]) as { code?: string }).code).toBe(hashCode(normalizeCode(c2)!));
      expect(Object.keys(records).includes(`links/keys/${B.playerId}.json`), `round ${i}: B linked iff its redeem was a 200`).toBe(redeem.status === 200);
      if (redeem.status !== 200) expect(redeem.status).toBe(403);
      expect((await redeemCode(rig, C, c2)).status, "the new code works").toBe(200);
    }
  });

  it("each new code kills the one before it: of three only the last works; a code from another key of the same player kills the player's live code too", async () => {
    const rig = await open(kind, { redeemLimit: NOLIMIT });
    const c1 = codeOf(await requestCode(rig, A));
    const c2 = codeOf(await requestCode(rig, A));
    const c3 = codeOf(await requestCode(rig, A));
    expect(new Set([c1, c2, c3]).size).toBe(3);
    expect(await linkRecords(rig, "linkcodes/")).toEqual([`linkcodes/${hashCode(normalizeCode(c3)!)}.json`]);
    expect((await redeemCode(rig, C, c1)).status).toBe(403);
    expect((await redeemCode(rig, C, c2)).status).toBe(403);
    expect((await redeemCode(rig, C, c3)).status).toBe(200);
    // B is a device of A now: a code B asks for replaces the code A asked for (one live code per PLAYER)
    expect((await linkVia(rig, A, B)).joined.status).toBe(200);
    const fromA = codeOf(await requestCode(rig, A));
    const fromB = codeOf(await requestCode(rig, B));
    expect((await redeemCode(rig, D, fromA)).status).toBe(403);
    expect((await redeemCode(rig, D, fromB)).status).toBe(200);
    expect(await linkRecords(rig, "linkcodes/")).toEqual([]);
  });

});

describe.each(KINDS)("FINDING: a stale code from a key that has since joined another player, on %s", (kind) => {
  // X shows a code (a lone key is its own player), then X redeems A's code and becomes A's device. X's code used to stay live for up to 10
  // minutes, and Z redeemed it. The right answer is a refusal, or Z joining A (X's player is A now): never a player record of X, which is no
  // longer a player. FIXED by IDENT-1 FIX (F1): `join` deletes the joining key's own live code, so the stale code is the plain refusal
  // (the `.fails` of the checker's run is dropped).
  it("Z must not become a device of X; and the two worse consequences: X's device is tombstoned when Z deletes, and X's own profile is orphaned", async () => {
    const rig = await open(kind, { redeemLimit: NOLIMIT });
    const X = await freshIdentity(), Z = await freshIdentity();
    const stale = codeOf(await requestCode(rig, X));
    expect((await linkVia(rig, A, X)).joined.status).toBe(200); // X now belongs to A
    const z = await redeemCode(rig, Z, stale);
    const records = await identityRecords(rig);
    const link = records[`links/keys/${Z.playerId}.json`];
    const nested = link !== undefined && (JSON.parse(link) as { player: string }).player === X.playerId;
    console.log(`VIDENT1 stale code: Z got ${z.status} ${z.text}; Z's link record ${link}; players/X.json ${records[`players/${X.playerId}.json`]}`);
    expect(nested, "Z is a device of the 'player' X, which is itself a device of A").toBe(false);
  });

  // REWRITTEN by IDENT-1 FIX (F1): the checker's version recorded the wrong outcome as it was (Z became a device of X, Z's delete tombstoned
  // X, a living device of A) and returned early once the product was fixed. This one asserts the fixed outcome.
  it("(the consequence, fixed) Z, who held X's old code, is refused and is nobody's device; Z deleting 'its player' is a delete of Z alone: X, a living device of A, still uploads under A", async () => {
    const rig = await open(kind, { redeemLimit: NOLIMIT });
    const X = await freshIdentity(), Z = await freshIdentity();
    const stale = codeOf(await requestCode(rig, X));
    expect((await linkVia(rig, A, X)).joined.status).toBe(200); // X now belongs to A
    const z = await redeemCode(rig, Z, stale);
    expect(z.status, z.text).toBe(403);
    expect(z.json).toEqual(REFUSED);
    expect(await linkRecords(rig, "links/keys/"), "only X is linked, and to A").toEqual([`links/keys/${X.playerId}.json`]);
    expect((await postGhost(rig, X, uploadFor(X, A.playerId, { runId: "x-1" }))).status, "X is a working device of A").toBe(201);
    expect((await deleteMe(rig, Z)).status).toBe(200); // Z is a lone key: this deletes Z's own player and nobody else
    const after = await postGhost(rig, X, uploadFor(X, A.playerId, { runId: "x-2" }));
    expect(after.status, "A's device X still uploads: a stranger who held X's old code could not delete 'player X'").toBe(201);
    expect(rig.app.links.isGone(A.playerId), "A itself was not deleted").toBe(false);
    expect(rig.app.links.isGone(X.playerId), "X was not deleted").toBe(false);
    expect(rig.app.links.isGone(Z.playerId), "Z deleted itself").toBe(true);
  });
});

// ---------------------------------------------------------------------------------------------------------- the limit
describe.each(KINDS)("the wrong-code limit on %s", (kind) => {
  it("the 6th try within 10 minutes is a 429 even with the right code (not spent by it), 429s are not failures, and the window slides", async () => {
    const rig = await open(kind); // production default: 5 wrong codes per 10 minutes per address
    const t0 = rig.clock.now;
    const wrongs = ["ZZZZ-ZZZZ", "AAAA-AAAA", "short", "0000-0000", "QQQQ-QQQQ"];
    for (let i = 0; i < 5; i++) {
      rig.clock.now = t0 + i * 100_000; // t0, +100 s, +200 s, +300 s, +400 s
      const r = await redeemCode(rig, C, wrongs[i]);
      expect(r.status, `wrong try ${i + 1}: ${r.text}`).toBe(403);
    }
    rig.clock.now = t0 + 450_000;
    const code = codeOf(await requestCode(rig, A)); // alive until +1050 s
    const blocked = await redeemCode(rig, C, code);
    expect(blocked.status, blocked.text).toBe(429);
    expect(blocked.headers.get("retry-after")).toBe("150"); // the first failure leaves the window at t0 + 600 s
    for (let i = 0; i < 6; i++) expect((await redeemCode(rig, i % 2 ? D : B, code)).status, "any key from the address").toBe(429); // 429s do not count
    rig.clock.now = t0 + 599_999;
    expect((await redeemCode(rig, C, code)).status, "1 ms before the first failure leaves").toBe(429);
    rig.clock.now = t0 + 600_000;
    expect((await redeemCode(rig, C, "ZZZZ-ZZZZ")).status, "the first failure has left: one more wrong try is allowed").toBe(403);
    expect((await redeemCode(rig, C, code)).status, "and that one makes five again").toBe(429);
    rig.clock.now = t0 + 700_000; // the +100 s failure leaves: four remain
    const good = await redeemCode(rig, C, code);
    expect(good.status, good.text).toBe(200);
    expect(good.json?.player).toBe(A.playerId);
  });

  it("a right code does not clear the count: four wrong, one right, one wrong, and the next right code is a 429; only wrong codes count (ten 409s and ten unsigned tries never block)", async () => {
    const rig = await open(kind);
    const code = codeOf(await requestCode(rig, A));
    for (let i = 0; i < 4; i++) expect((await redeemCode(rig, C, "ZZZZ-ZZZ" + "ABCD"[i])).status).toBe(403);
    expect((await redeemCode(rig, B, code)).status).toBe(200);
    expect((await redeemCode(rig, D, "QQQQ-QQQQ")).status).toBe(403); // the fifth failure
    const next = codeOf(await requestCode(rig, A));
    expect((await redeemCode(rig, E, next)).status).toBe(429);
    // other outcomes never count: a fresh rig, ten 409s (B is linked elsewhere) and ten unsigned tries
    const rig2 = await open(kind);
    expect((await linkVia(rig2, D, B)).joined.status).toBe(200); // B belongs to D
    const live = codeOf(await requestCode(rig2, A));
    for (let i = 0; i < 10; i++) expect((await redeemCode(rig2, B, live)).status).toBe(409);
    for (let i = 0; i < 10; i++) expect((await send(rig2, "POST", "/v1/link/redeem", JSON.stringify({ at: rig2.clock.now, code: "ZZZZ-ZZZZ" }))).status).toBe(401);
    expect((await redeemCode(rig2, C, live)).status, "the code was never spent and the address never blocked").toBe(200);
  });

  it("the limit is per address: with trustProxy fly one address is blocked and another is not; with trustProxy none a rotating fly-client-ip header buys nothing", async () => {
    const from = async (rig: Rig, id: Identity, code: string, ip: string) => {
      const body = JSON.stringify({ at: rig.clock.now, code });
      return send(rig, "POST", "/v1/link/redeem", body, { ...(await signedBy(id, body, LINK_REDEEM_PREFIX)), "fly-client-ip": ip });
    };
    const fly = await open(kind, { trustProxy: "fly" });
    const code = codeOf(await requestCode(fly, A));
    for (let i = 0; i < 5; i++) expect((await from(fly, C, "ZZZZ-ZZZZ", "10.0.0.1")).status).toBe(403);
    expect((await from(fly, C, code, "10.0.0.1")).status).toBe(429);
    expect((await from(fly, B, code, "10.0.0.2")).status, "another address is not blocked").toBe(200);
    const none = await open(kind, { trustProxy: "none" });
    const code2 = codeOf(await requestCode(none, A));
    for (let i = 0; i < 5; i++) expect((await from(none, C, "ZZZZ-ZZZZ", `10.1.0.${i + 1}`)).status).toBe(403);
    expect((await from(none, C, code2, "10.1.0.99")).status, "a spoofed address header is ignored").toBe(429);
  });

  it.fails("FINDING: the limit is checked before the wrong code is counted, so a burst of parallel tries all get through: 40 parallel wrong codes should leave at most 5 answered 403", async () => {
    const rig = await open(kind);
    const keys = await Promise.all(Array.from({ length: 8 }, () => freshIdentity()));
    const rs = await Promise.all(Array.from({ length: 40 }, (_, i) => redeemCode(rig, keys[i % keys.length], `ZZZZ-ZZ${String.fromCharCode(65 + (i % 26))}${i % 10 < 2 ? "A" : "B"}`)));
    const refused = rs.filter((r) => r.status === 403).length;
    console.log(`VIDENT1 parallel burst on ${kind}: ${refused} of 40 parallel wrong codes answered 403; statuses ${[...new Set(rs.map((r) => r.status))].join(",")}; then a sequential try is ${(await redeemCode(rig, keys[0], "ZZZZ-ZZZZ")).status}`);
    expect(refused, `${refused} of 40 parallel wrong codes were answered 403 (the limit is 5); the rest: ${rs.filter((r) => r.status !== 403).map((r) => r.status).join(",")}`).toBeLessThanOrEqual(5);
  });
});

// ---------------------------------------------------------------------------------------------------------- spelling
describe.each(KINDS)("typing variants on %s", (kind) => {
  const spellings = (c: string): [string, string][] => {
    const n = c.replace("-", "");
    return [
      ["as shown", c], ["lower case", c.toLowerCase()], ["no dash", n], ["no dash, lower", n.toLowerCase()], ["a space for the dash", `${n.slice(0, 4)} ${n.slice(4)}`],
      ["spaces around", `  ${c}  `], ["a dash between every symbol", n.split("").join("-")], ["a space between every symbol", n.split("").join(" ")],
      ["a tab for the dash", `${n.slice(0, 4)}\t${n.slice(4)}`], ["a trailing newline", `${c}\n`], ["two dashes", `${n.slice(0, 4)}--${n.slice(4)}`],
      ["a no-break space for the dash", `${n.slice(0, 4)} ${n.slice(4)}`], ["mixed case", n.split("").map((ch, i) => (i % 2 ? ch.toLowerCase() : ch)).join("")],
    ];
  };

  it("every spelling of a live code links, to the same player, and only once", async () => {
    const rig = await open(kind, { redeemLimit: NOLIMIT });
    const probe = codeOf(await requestCode(rig, A));
    for (const [why] of spellings(probe)) {
      const code = codeOf(await requestCode(rig, A));
      const typed = spellings(code).find(([w]) => w === why)![1];
      const k = await freshIdentity();
      const r = await redeemCode(rig, k, typed);
      expect(r.status, `${why} (${JSON.stringify(typed)}): ${r.text}`).toBe(200);
      expect(r.json?.player).toBe(A.playerId);
      expect((await redeemCode(rig, await freshIdentity(), typed)).status, `${why}: used`).toBe(403);
    }
  });

  it("a different code is never taken for the live one: one symbol changed (every position), two symbols swapped, reversed, one too long, one too short, a look-alike letter, none of them links and the live code is still good", async () => {
    // a fixed code, so the look-alikes can be written down: bytes 0..7 are the symbols A B C D E F G H
    const rig = await open(kind, { redeemLimit: NOLIMIT, codeRandom: () => Uint8Array.from([0, 1, 2, 3, 4, 5, 6, 7, 0, 0, 0, 0, 0, 0, 0, 0]) });
    const live = codeOf(await requestCode(rig, A));
    expect(live).toBe("ABCD-EFGH");
    const wrong: [string, string][] = [];
    const n = "ABCDEFGH";
    for (let i = 0; i < 8; i++) {
      const next = CODE_ALPHABET[(CODE_ALPHABET.indexOf(n[i]) + 1) % 31];
      wrong.push([`symbol ${i + 1} changed to ${next}`, n.slice(0, i) + next + n.slice(i + 1)]);
    }
    wrong.push(["two swapped", "BACDEFGH"], ["reversed", "HGFEDCBA"], ["one too long", n + "J"], ["one too short", n.slice(0, 7)], ["empty", ""], ["only the dash", "-"]);
    wrong.push(["Cyrillic A for A", "АBCDEFGH"], ["Greek Alpha for A", "ΑBCDEFGH"], ["full-width letters", "ＡＢＣＤＥＦＧＨ"]);
    wrong.push(["0 for O is not a symbol", "ABCDEFG0"], ["1 for I is not a symbol", "1BCDEFGH"], ["25 spaces then the code is longer than 32", " ".repeat(30) + n]);
    wrong.push(["the code twice", n + n], ["the code with a NUL", "ABCD\u0000EFGH"], ["a zero-width space inside", "ABCD​EFGH"]);
    for (const [why, typed] of wrong) {
      const r = await redeemCode(rig, await freshIdentity(), typed);
      expect(r.status, `${why}: ${r.text}`).toBe(403);
      expect(r.json).toEqual(REFUSED);
    }
    expect(await linkRecords(rig, "links/keys/")).toEqual([]);
    expect((await redeemCode(rig, B, "abcd efgh")).status, "the live code survived every wrong try").toBe(200);
  });

  it("the sharp s: typed text that upper-cases to the live code is the live code (a spelling, not a second code); it cannot reach any other code", async () => {
    // bytes 0..5 then 15, 15 = A B C D E F S S, so a typed "ABCDEFß" reads as ABCDEFSS. Fine: that IS the code, spelled with one letter.
    const rig = await open(kind, { redeemLimit: NOLIMIT, codeRandom: () => Uint8Array.from([0, 1, 2, 3, 4, 5, 15, 15, 0, 0, 0, 0, 0, 0, 0, 0]) });
    const live = codeOf(await requestCode(rig, A));
    expect(live).toBe("ABCD-EFSS");
    const r = await redeemCode(rig, B, "abcdefß");
    expect(r.status, r.text).toBe(200);
    expect(r.json?.player).toBe(A.playerId);
  });
});

// ---------------------------------------------------------------------------------------------------------- not in the store, not in the log
describe.each(KINDS)("the code is nowhere it should not be, on %s", (kind) => {
  /** Every byte the store holds, as text with the file or object names in front. */
  function everythingStored(rig: Rig): string {
    const parts: string[] = [];
    if (rig.kind === "jsonl") {
      const walk = (dir: string) => {
        for (const name of readdirSync(dir)) {
          const p = join(dir, name);
          if (statSync(p).isDirectory()) walk(p);
          else parts.push(p.slice(rig.dir.length), readFileSync(p, "utf8"));
        }
      };
      if (existsSync(rig.dir)) walk(rig.dir);
    } else {
      for (const key of fakeKeys(rig, "")) parts.push(key, theFake().getObject(rig.bucket, key) ?? "");
    }
    return parts.join("\n");
  }

  it("issue, wrong tries, a right redeem, a reuse and an expiry: the store, the log and every refusal hold neither the code, nor its other spellings, nor either half of it", async () => {
    const rig = await open(kind, { redeemLimit: NOLIMIT });
    const issued = await requestCode(rig, A);
    const code = codeOf(issued);
    const norm = normalizeCode(code)!;
    const forms = [code, norm, code.toLowerCase(), norm.toLowerCase(), norm.slice(0, 4), norm.slice(4), norm.slice(0, 4).toLowerCase(), norm.slice(4).toLowerCase()];
    const replies: string[] = [];
    const mid = everythingStored(rig); // while the code is live
    replies.push((await redeemCode(rig, C, "ZZZZ-ZZZZ")).text, (await redeemCode(rig, C, "short")).text);
    replies.push((await redeemCode(rig, B, code)).text, (await redeemCode(rig, D, code)).text);
    const second = codeOf(await requestCode(rig, A));
    rig.clock.now += CODE_TTL_MS + 1;
    replies.push((await redeemCode(rig, D, second)).text);
    const norm2 = normalizeCode(second)!;
    const all = [mid, everythingStored(rig), rig.log.join("\n"), replies.join("\n")].join("\n");
    for (const f of [...forms, second, norm2, second.toLowerCase(), norm2.slice(0, 4), norm2.slice(4)]) {
      expect(all.includes(f), `${JSON.stringify(f)} appears in the store, the log or a reply`).toBe(false);
    }
    // what the store does hold for the live code is the tagged hash, as 64 lowercase hex
    expect(mid).toContain(hashCode(norm));
    expect(mid).not.toContain(hashCode.toString()); // (a sanity check that the scan reads text)
    // every log line about the identity routes is the usual one: time, method, path, status, duration; nothing else
    for (const l of rig.log.filter((x) => / \/v1\/link\//.test(x))) expect(l, l).toMatch(/^\S+ (GET|POST|PUT|DELETE) \/v1\/link\/[a-z]+ \d{3} \d+ms$/);
  });
});

// ---------------------------------------------------------------------------------------------------------- the generator
describe("10,000 codes from the generator", () => {
  it("each is 8 symbols of the 31, none repeats, no symbol is skewed overall or in any position (chi-square, df 30)", () => {
    const N = 10_000;
    const total = new Map<string, number>();
    const byPos = Array.from({ length: CODE_LENGTH }, () => new Map<string, number>());
    const seen = new Set<string>();
    for (let i = 0; i < N; i++) {
      const c = newCode();
      expect(c).toMatch(new RegExp(`^[${CODE_ALPHABET}]{${CODE_LENGTH}}$`));
      seen.add(c);
      for (let p = 0; p < CODE_LENGTH; p++) {
        total.set(c[p], (total.get(c[p]) ?? 0) + 1);
        byPos[p].set(c[p], (byPos[p].get(c[p]) ?? 0) + 1);
      }
    }
    expect(seen.size, "10,000 codes, 10,000 different").toBe(N);
    expect([...total.keys()].sort().join("")).toBe([...CODE_ALPHABET].sort().join(""));
    const chi = (m: Map<string, number>, expected: number) => [...CODE_ALPHABET].reduce((s, ch) => s + ((m.get(ch) ?? 0) - expected) ** 2 / expected, 0);
    expect(chi(total, (N * CODE_LENGTH) / 31), "overall").toBeLessThan(70); // p about 6e-5 for a fair draw
    byPos.forEach((m, p) => expect(chi(m, N / 31), `position ${p + 1}`).toBeLessThan(80));
    const counts = [...CODE_ALPHABET].map((ch) => total.get(ch) ?? 0);
    expect(Math.max(...counts) / Math.min(...counts), "most / least frequent symbol").toBeLessThan(1.15);
  });

  it("without modulo bias, exactly: the 248 usable bytes give every symbol exactly 8 times, and a byte of 248 or more is never used", () => {
    const tally = new Map<string, number>();
    for (let b = 0; b < 248; b++) {
      const code = newCode(() => Uint8Array.from({ length: 16 }, () => b));
      expect(code).toBe(CODE_ALPHABET[b % 31].repeat(CODE_LENGTH));
      tally.set(code[0], (tally.get(code[0]) ?? 0) + 1);
    }
    expect([...tally.values()].every((n) => n === 8) && tally.size === 31).toBe(true);
    for (let b = 248; b < 256; b++) {
      let call = 0;
      const code = newCode(() => (call++ === 0 ? Uint8Array.from({ length: 16 }, () => b) : Uint8Array.from({ length: 16 }, () => 0)));
      expect(code, `byte ${b} was skipped`).toBe("A".repeat(CODE_LENGTH));
    }
  });
});
