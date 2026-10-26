// VERIFY-IDENT1-FIX1 (REQ-BFG-122) step 4b, written by the independent re-checker (cap_xi): ATTACKS ON THE F2 FIX. The wrong-code limit now counts a
// try BEFORE the first await (FailureLimiter.tryCount) and gives the count back (giveBack) unless the try ends as a wrong code (a 403 from the redeem).
// Here: bursts from one address that mix right and wrong codes (what is left must be exactly 5 minus the 403s: nothing leaked, nothing given back
// twice, a 429 never spends a code); floods of tries that never reach the redeem; a join that fails in the store after its code was spent (503);
// a body that hangs until the SERVER ends the connection; two addresses behind trustProxy fly; the limiter's own edges and the decisions of the fix.
// Both backing stores (JSON lines, and Tigris on the fake S3).
import http from "node:http";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { LINK_REDEEM_PREFIX, type Identity } from "../src/net/identity";
import { CODE_ALPHABET } from "../server/links";
import type { LinkStore } from "../server/linkStore";
import { FailureLimiter, REDEEM_FAILS } from "../server/linkRoutes";
import { StorageError } from "../server/store";
import { testIdentity } from "./netIdentity";
import { bodyAt, closeRigs, freshIdentity, identityRecords, openRig, requestCode, send, signedBy, type Kind, type Opts, type Reply, type Rig } from "./identRig";

let A: Identity, B: Identity, D: Identity;
beforeAll(async () => {
  [A, B, D] = await Promise.all([0, 1, 3].map((n) => testIdentity(n)));
});
afterAll(closeRigs);

const KINDS: Kind[] = ["jsonl", "tigris"];
/** A rig with the production limit (5 wrong codes per 10 minutes per address), the global limiter out of the way, and trustProxy fly. */
const open = (kind: Kind, over: Opts = {}) => openRig(kind, { rateLimit: { windowMs: 60_000, max: 1_000_000 }, trustProxy: "fly", ...over });
const codeOf = (r: Reply): string => String(r.json?.code);
const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));
/** A well-formed code nobody holds. */
const wrong = (i: number): string => `ZZZZ-${CODE_ALPHABET[i % 31]}${CODE_ALPHABET[(i * 7 + 3) % 31]}ZZ`;
/** `node:http`'s client side, which server/node.d.ts does not declare (it declares the server side only). */
interface RawRequest {
  write(chunk: string): void;
  destroy(): void;
  on(event: "error", cb: () => void): void;
}
const rawHttp = http as unknown as {
  request(opts: { host: string; port: number; method: string; path: string; headers: Record<string, string> }): RawRequest;
};
function seeded(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 2 ** 32;
  };
}
function shuffled<T>(xs: T[], rnd: () => number): T[] {
  const a = xs.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

interface Job {
  body: string;
  headers: Record<string, string>;
}
/** Signed redeem requests from `ip`, built before any is sent so that the sends go out together. */
async function jobs(rig: Rig, ip: string, who: (i: number) => Identity, codes: string[]): Promise<Job[]> {
  return Promise.all(codes.map(async (code, i) => {
    const body = bodyAt(rig.clock.now, { code });
    return { body, headers: { ...(await signedBy(who(i), body, LINK_REDEEM_PREFIX)), "fly-client-ip": ip } };
  }));
}
const fire = (rig: Rig, js: Job[]): Promise<Reply[]> => Promise.all(js.map((j) => send(rig, "POST", "/v1/link/redeem", j.body, j.headers)));
const tally = (rs: Reply[]): Record<number, number> => rs.reduce<Record<number, number>>((m, r) => ((m[r.status] = (m[r.status] ?? 0) + 1), m), {});
/** One redeem, alone, from `ip`. */
async function one(rig: Rig, ip: string, id: Identity, code: string): Promise<Reply> {
  const [j] = await jobs(rig, ip, () => id, [code]);
  return (await fire(rig, [j]))[0];
}
/** How many more wrong codes `ip` is allowed: sequential wrong tries until the first 429 (this uses the allowance up). */
async function allowanceLeft(rig: Rig, ip: string, id: Identity, cap = 12): Promise<number> {
  let n = 0;
  for (let i = 0; i < cap; i++) {
    const r = await one(rig, ip, id, wrong(300 + i));
    if (r.status === 429) return n;
    expect(r.status, r.text).toBe(403);
    n++;
  }
  return n;
}

describe.each(KINDS)("F2: bursts from one address, on %s", (kind) => {
  it("right and wrong codes in one parallel burst, shuffled, four rounds: at most 5 answered 403, a right try is 200 or 429, a wrong one 403 or 429, a 429 never spends a code, and the allowance left is exactly 5 minus the 403s", async () => {
    const counts: number[] = [];
    for (let round = 0; round < 4; round++) {
      const rig = await open(kind);
      const owners = [A, B, D];
      const codes = await Promise.all(owners.map(async (o) => codeOf(await requestCode(rig, o))));
      const joiners = await Promise.all(owners.map(() => freshIdentity()));
      const noise = await Promise.all(Array.from({ length: 4 }, () => freshIdentity()));
      type Try = { who: Identity; code: string; owner: number };
      const tries: Try[] = [
        ...joiners.map((who, i) => ({ who, code: codes[i], owner: i })),
        ...Array.from({ length: 12 }, (_, i) => ({ who: noise[i % noise.length], code: wrong(round * 20 + i), owner: -1 })),
      ];
      const order = shuffled(tries, seeded(round + 7));
      const ip = "10.7.0.1";
      const rs = await fire(rig, await jobs(rig, ip, (i) => order[i].who, order.map((t) => t.code)));
      const n403 = rs.filter((r) => r.status === 403).length;
      counts.push(n403);
      expect(n403, `round ${round}: ${JSON.stringify(tally(rs))}`).toBeLessThanOrEqual(5);
      order.forEach((t, i) => {
        if (t.owner >= 0) expect([200, 429], `round ${round}, right try ${i}: ${rs[i].text}`).toContain(rs[i].status);
        else expect([403, 429], `round ${round}, wrong try ${i}: ${rs[i].text}`).toContain(rs[i].status);
      });
      // every 200 is a linked key of the right owner, and only those are linked
      const records = await identityRecords(rig);
      const won = order.filter((_, i) => rs[i].status === 200);
      for (const t of won) expect(JSON.parse(records[`links/keys/${t.who.playerId}.json`]).player, `round ${round}`).toBe(owners[t.owner].playerId);
      expect(Object.keys(records).filter((k) => k.startsWith("links/keys/")), `round ${round}`).toHaveLength(won.length);
      // a right try answered 429 never spent its code: it works from another address
      for (const [i, t] of order.entries()) {
        if (t.owner < 0 || rs[i].status !== 429) continue;
        const again = await one(rig, "10.7.0.2", t.who, t.code);
        expect(again.status, `round ${round}: the code of a 429'd right try is unspent: ${again.text}`).toBe(200);
      }
      // nothing leaked and nothing was given back twice: what the address has left is exactly 5 minus its 403s
      expect(await allowanceLeft(rig, ip, noise[0]), `round ${round}: after ${n403} wrong codes`).toBe(5 - n403);
    }
    console.log(`VIDENT1FIX F2 mixed bursts on ${kind}: 403s per round ${counts.join(", ")}`);
  });

  it("a flood of tries that never reach the redeem (no signing headers, a bad signature, a body that is not canonical, a clock 11 minutes off, a body over the limit) holds no place afterwards: the whole allowance is there", async () => {
    const rig = await open(kind);
    const key = await freshIdentity();
    const ip = "10.8.0.1";
    const now = rig.clock.now;
    const groups: { name: string; want: number; js: Job[] }[] = [
      { name: "no signing headers", want: 401, js: Array.from({ length: 30 }, (_, i) => ({ body: bodyAt(now, { code: wrong(i) }), headers: { "fly-client-ip": ip } })) },
      {
        name: "a signature made for another body", want: 401,
        js: await Promise.all(Array.from({ length: 30 }, async (_, i) => ({
          body: bodyAt(now, { code: wrong(i) }),
          headers: { ...(await signedBy(key, bodyAt(now, { code: wrong(i + 90) }), LINK_REDEEM_PREFIX)), "fly-client-ip": ip },
        }))),
      },
      {
        name: "a body that is not canonical", want: 400,
        js: await Promise.all(Array.from({ length: 30 }, async (_, i) => {
          const body = JSON.stringify({ at: now, code: wrong(i) }, null, 1);
          return { body, headers: { ...(await signedBy(key, body, LINK_REDEEM_PREFIX)), "fly-client-ip": ip } };
        })),
      },
      {
        name: "a clock 11 minutes off", want: 422,
        js: await Promise.all(Array.from({ length: 30 }, async (_, i) => {
          const body = bodyAt(now + 11 * 60_000, { code: wrong(i) });
          return { body, headers: { ...(await signedBy(key, body, LINK_REDEEM_PREFIX)), "fly-client-ip": ip } };
        })),
      },
      {
        name: "a body over the limit", want: 413,
        js: await Promise.all(Array.from({ length: 10 }, async (_, i) => {
          const body = bodyAt(now, { code: wrong(i), pad: "p".repeat(700) });
          return { body, headers: { ...(await signedBy(key, body, LINK_REDEEM_PREFIX)), "fly-client-ip": ip } };
        })),
      },
    ];
    const all = groups.flatMap((g) => g.js);
    const rs = await fire(rig, all);
    let at = 0;
    for (const g of groups) {
      const mine = rs.slice(at, at + g.js.length);
      at += g.js.length;
      for (const r of mine) expect([g.want, 429], `${g.name}: ${r.text}`).toContain(r.status); // 429: a place held by a try still in flight (note N5)
      if (g.name === "no signing headers") expect(mine.every((r) => r.status === 401), "answered without one await: never holds a place").toBe(true);
    }
    // each kind, alone, is refused as it should be (so the flood above was not all 429s by accident), and gives its count back
    for (const g of groups) {
      const r = (await fire(rig, [g.js[0]]))[0];
      expect(r.status, `${g.name}, alone: ${r.text}`).toBe(g.want);
    }
    expect(await allowanceLeft(rig, ip, key), "and not one of the 135 left a count behind").toBe(5);
  });

  it("a join that fails in the store AFTER its code was spent (503) gives its count back: eight of them and the address still has its whole allowance; the keys then link normally", async () => {
    const rig = await open(kind);
    const ip = "10.9.0.1";
    const keys = await Promise.all(Array.from({ length: 8 }, () => freshIdentity()));
    const store = rig.app.links.store as { put: LinkStore["put"] };
    const real = store.put.bind(store);
    store.put = async (k: string, t: string) => {
      if (k.startsWith("links/keys/")) throw new StorageError("identity write failed: HTTP 500");
      return real(k, t);
    };
    try {
      for (const [i, k] of keys.entries()) {
        const code = codeOf(await requestCode(rig, A)); // each request kills the last, so the code is asked just before its use
        const r = await one(rig, ip, k, code);
        expect(r.status, `failing join ${i + 1}: ${r.text}`).toBe(503);
      }
    } finally {
      store.put = real;
    }
    expect(await allowanceLeft(rig, ip, keys[0])).toBe(5);
    // the store is healthy again, the same address (its allowance used up by the wrong codes above) is blocked, a fresh address links
    const code = codeOf(await requestCode(rig, A));
    expect((await one(rig, ip, keys[1], code)).status, "the used-up address: 429, the code is not spent").toBe(429);
    const ok = await one(rig, "10.9.0.2", keys[1], code);
    expect([ok.status, ok.json?.player]).toEqual([200, A.playerId]);
  });

  it("two addresses and a third: each bursting address gets exactly 5 refusals and the rest 429, interleaved in one parallel burst; a right code from the third address in the middle is a 200", async () => {
    const rig = await open(kind);
    const [k1, k2, k3] = [await freshIdentity(), await freshIdentity(), await freshIdentity()];
    const live = codeOf(await requestCode(rig, A));
    const a = await jobs(rig, "10.1.1.1", () => k1, Array.from({ length: 20 }, (_, i) => wrong(i)));
    const b = await jobs(rig, "10.1.1.2", () => k2, Array.from({ length: 20 }, (_, i) => wrong(40 + i)));
    const [c] = await jobs(rig, "10.1.1.3", () => k3, [live]);
    const mixed: Job[] = [];
    for (let i = 0; i < 20; i++) {
      mixed.push(a[i], b[i]);
      if (i === 9) mixed.push(c);
    }
    const rs = await fire(rig, mixed);
    const ofIp = (ip: string) => rs.filter((_, i) => mixed[i].headers["fly-client-ip"] === ip);
    expect(tally(ofIp("10.1.1.1")), "first address").toEqual({ 403: 5, 429: 15 });
    expect(tally(ofIp("10.1.1.2")), "second address").toEqual({ 403: 5, 429: 15 });
    expect(ofIp("10.1.1.3").map((r) => r.status), "third address").toEqual([200]);
  });
});

describe.each(KINDS)("single use under a real race WITH the production limiter, on %s", (kind) => {
  it("six keys race one code, from one address and from six addresses: exactly one 200, five refusals (403, or 429 from one address), one key linked, the code gone, nobody half-linked", async () => {
    for (const spread of [false, true]) {
      const rig = await open(kind);
      const keys = await Promise.all(Array.from({ length: 6 }, () => freshIdentity()));
      const code = codeOf(await requestCode(rig, A));
      const js = await Promise.all(keys.map(async (k, i) => {
        const body = bodyAt(rig.clock.now, { code });
        return { body, headers: { ...(await signedBy(k, body, LINK_REDEEM_PREFIX)), "fly-client-ip": spread ? `10.30.0.${i + 1}` : "10.30.0.1" } };
      }));
      const rs = await fire(rig, js);
      const t = tally(rs);
      expect(t[200], `${spread ? "six addresses" : "one address"}: ${JSON.stringify(t)}`).toBe(1);
      for (const r of rs) expect([200, 403, 429], r.text).toContain(r.status);
      if (spread) expect(t, "six addresses: no address is near its limit").toEqual({ 200: 1, 403: 5 });
      const records = await identityRecords(rig);
      expect(Object.keys(records).filter((k) => k.startsWith("links/keys/")), "one key linked").toHaveLength(1);
      expect(JSON.parse(records[`players/${A.playerId}.json`]).keys, "and A lists exactly it").toHaveLength(1);
      expect(Object.keys(records).filter((k) => k.startsWith("linkcodes/")), "the code is spent").toEqual([]);
    }
  });
});

describe.each(KINDS)("F2: a body that hangs, on %s", (kind) => {
  it("N5: each hung body holds one place of its address: with the limit's worth of them a sixth caller is 429 with the whole window as retry-after though no wrong code was ever sent; when the SERVER ends the connections every place comes back", async () => {
    const rig = await open(kind); // production limit: 5
    const key = await freshIdentity();
    const ip = "10.10.0.1";
    const url = new URL(rig.base);
    const hung: RawRequest[] = [];
    for (let i = 0; i < REDEEM_FAILS.max; i++) {
      const [job] = await jobs(rig, ip, () => key, [wrong(i)]);
      const req = rawHttp.request({ host: url.hostname, port: Number(url.port), method: "POST", path: "/v1/link/redeem", headers: { ...job.headers, "content-length": String(job.body.length) } });
      req.on("error", () => {});
      req.write(job.body.slice(0, 4)); // the headers and 4 of the body's bytes: the server waits for the rest
      hung.push(req);
    }
    await sleep(120);
    const live = codeOf(await requestCode(rig, A));
    const blocked = await one(rig, ip, key, live);
    expect(blocked.status, "a RIGHT code from the address that holds five hung bodies").toBe(429);
    expect(blocked.headers.get("retry-after"), "the whole window, though the block lasts only as long as the hang").toBe("600");
    expect(await identityRecords(rig).then((r) => Object.keys(r).filter((k) => k.startsWith("links/keys/"))), "and the code was not spent").toEqual([]);
    rig.app.server.closeAllConnections(); // what the 10 s slow-body guard does to such a connection, now
    let status = 0;
    for (let i = 0; i < 60 && status !== 200; i++) {
      await sleep(25);
      status = await one(rig, ip, key, live).then((r) => r.status, () => -1); // -1: a connection the server just closed; try again
    }
    expect(status, "after the server ended the five connections the same right code works from the same address").toBe(200);
    for (const h of hung) h.destroy();
    const other = await freshIdentity();
    expect(await allowanceLeft(rig, ip, other), "and the allowance is whole: not one count was left behind by a hung body").toBe(5);
  });
});

describe("F2: the limiter's edges and the fix's decisions", () => {
  it("two tries in the same millisecond, one wrong (kept) and one right (given back): exactly one count remains; a give-back with nothing to take changes nothing; blocked() and tryCount() agree", () => {
    const l = new FailureLimiter(1000, 2);
    expect(l.tryCount("ip", 50)).toBe(true); // the wrong one, in flight
    expect(l.tryCount("ip", 50)).toBe(true); // the right one, in flight
    expect(l.blocked("ip", 50)).toBe(true);
    expect(l.tryCount("ip", 50), "full: refused and not counted").toBe(false);
    l.giveBack("ip", 50); // the right one ends
    expect(l.blocked("ip", 50)).toBe(false);
    expect(l.tryCount("ip", 51), "one place is free again").toBe(true);
    expect(l.blocked("ip", 51), "and now the wrong one's count and this one's are the two").toBe(true);
    l.giveBack("ip", 777);
    l.giveBack("nobody", 50);
    expect(l.blocked("ip", 51), "a give-back of a time nobody counted takes nothing").toBe(true);
    // the window: the wrong one's count leaves at 50 + 1000
    expect(l.blocked("ip", 1049)).toBe(true);
    expect(l.blocked("ip", 1050), "the count at 50 is out of the window at 1050; the one at 51 stays until 1051").toBe(false);
    expect(l.blocked("ip", 1051)).toBe(false);
  });

  it("decision 4: the old fail() is gone (it was the bug), blocked() stays and agrees with tryCount(); the production defaults are 5 per 10 minutes", () => {
    expect((FailureLimiter.prototype as unknown as Record<string, unknown>).fail).toBeUndefined();
    expect(typeof FailureLimiter.prototype.blocked).toBe("function");
    expect(typeof FailureLimiter.prototype.tryCount).toBe("function");
    expect(typeof FailureLimiter.prototype.giveBack).toBe("function");
    expect(REDEEM_FAILS).toEqual({ windowMs: 600_000, max: 5 });
    const l = new FailureLimiter();
    for (let i = 0; i < 5; i++) expect(l.tryCount("ip", 1)).toBe(true);
    expect(l.blocked("ip", 1)).toBe(true);
    expect(l.tryCount("ip", 1)).toBe(false);
    expect(l.retryAfter("ip", 1)).toBe(600);
  });
});
