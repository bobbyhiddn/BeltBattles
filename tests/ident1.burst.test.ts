// IDENT-1 FIX (REQ-BFG-122), finding F2 of VERIFY-IDENT1 run 3: the wrong-code limit was not atomic. `blocked()` ran before the awaits of
// POST /v1/link/redeem and the failure was counted after them, so a burst of parallel tries from one address all passed the check
// (40 parallel wrong codes: 6 answered 403 on JSON lines and 19 on Tigris, with a limit of 5). Now the check and the count of a try are one
// synchronous step before the first await (FailureLimiter.tryCount), and the count is given back (giveBack) unless the try ends as a wrong
// code, an await that throws included. Everything else holds as the checker tested it (tests/vident1.codes.test.ts, tests/ident1.codes.test.ts).
// The count lives in each machine's memory, so across machines each machine counts its own: pinned below.
import http from "node:http";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { LINK_REDEEM_PREFIX, type Identity } from "../src/net/identity";
import { CODE_ALPHABET } from "../server/links";
import type { LinkStore } from "../server/linkStore";
import { FailureLimiter, REDEEM_FAILS } from "../server/linkRoutes";
import { StorageError } from "../server/store";
import { testIdentity } from "./netIdentity";
import {
  bodyAt, closeRigs, freshIdentity, identityRecords, linkVia, openRig, openSibling, redeemCode, requestCode, send, signedBy, type Kind, type Opts, type Reply,
  type Rig,
} from "./identRig";

let A: Identity, B: Identity, D: Identity;
beforeAll(async () => {
  [A, B, D] = await Promise.all([0, 1, 3].map((n) => testIdentity(n)));
});
afterAll(closeRigs);

const KINDS: Kind[] = ["jsonl", "tigris"];
/** A rig with the production limit (5 wrong codes per 10 minutes per address) and the global limiter out of the way. */
const open = (kind: Kind, over: Opts = {}) => openRig(kind, { rateLimit: { windowMs: 60_000, max: 1_000_000 }, trustProxy: "fly", ...over });
const codeOf = (r: Reply): string => String(r.json?.code);
const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));
/** `node:http`'s client side, which server/node.d.ts does not declare (it declares the server side only). */
interface RawRequest {
  write(chunk: string): void;
  destroy(): void;
  on(event: "error", cb: () => void): void;
}
const rawHttp = http as unknown as {
  request(opts: { host: string; port: number; method: string; path: string; headers: Record<string, string> }): RawRequest;
};
/** A well-formed code nobody holds. */
const wrong = (i: number): string => `ZZZZ-${CODE_ALPHABET[i % 31]}${CODE_ALPHABET[(i * 7 + 3) % 31]}ZZ`;

interface Job {
  body: string;
  headers: Record<string, string>;
}
/** Signed, ready-to-send redeem requests from `ip`, built before any is sent so that the sends go out together. */
async function jobs(rig: Rig, ip: string, who: (i: number) => Identity, codes: string[]): Promise<Job[]> {
  return Promise.all(codes.map(async (code, i) => {
    const body = bodyAt(rig.clock.now, { code });
    return { body, headers: { ...(await signedBy(who(i), body, LINK_REDEEM_PREFIX)), "fly-client-ip": ip } };
  }));
}
const fire = (rig: Rig, js: Job[]): Promise<Reply[]> => Promise.all(js.map((j) => send(rig, "POST", "/v1/link/redeem", j.body, j.headers)));
const tally = (rs: Reply[]): Record<number, number> => rs.reduce<Record<number, number>>((m, r) => ((m[r.status] = (m[r.status] ?? 0) + 1), m), {});

/** Five more wrong codes from `ip` are all 403 and the sixth is 429: the address has its whole allowance. */
async function fullAllowance(rig: Rig, ip: string, id: Identity): Promise<void> {
  for (let i = 0; i < 5; i++) {
    const [j] = await jobs(rig, ip, () => id, [wrong(100 + i)]);
    expect((await fire(rig, [j]))[0].status, `wrong try ${i + 1} of the full allowance`).toBe(403);
  }
  const [j] = await jobs(rig, ip, () => id, [wrong(200)]);
  expect((await fire(rig, [j]))[0].status, "and the sixth is 429").toBe(429);
}

describe("FailureLimiter: the check and the count are one step, and a count can be given back", () => {
  it("tryCount counts up to the limit and then answers false without counting; giveBack frees exactly one place", () => {
    const l = new FailureLimiter(1000, 3);
    expect([l.tryCount("ip", 10), l.tryCount("ip", 10), l.tryCount("ip", 11)]).toEqual([true, true, true]);
    expect(l.blocked("ip", 12)).toBe(true);
    expect(l.tryCount("ip", 12), "over the limit: refused, and not counted").toBe(false);
    expect(l.retryAfter("ip", 12)).toBe(1); // (10 + 1000 - 12) ms rounds up to one second
    l.giveBack("ip", 10); // one of the two tries made at 10
    expect(l.blocked("ip", 12)).toBe(false);
    expect(l.tryCount("ip", 12)).toBe(true);
    expect(l.tryCount("ip", 12), "the place given back was used once").toBe(false);
    expect(l.tryCount("other", 12), "another address has its own count").toBe(true);
  });

  it("giveBack of a count that has left the window, of an unknown address or of an unknown time takes nothing from the others", () => {
    const l = new FailureLimiter(1000, 2);
    expect(l.tryCount("ip", 0)).toBe(true);
    expect(l.tryCount("ip", 500)).toBe(true);
    expect(l.tryCount("ip", 1000), "the first count left the window at 1000: one place is free").toBe(true);
    l.giveBack("ip", 0); // already gone
    l.giveBack("nobody", 0);
    l.giveBack("ip", 777);
    expect(l.blocked("ip", 1000), "still two counts (500 and 1000): the stale give-backs took nothing").toBe(true);
  });

  it("the limit and the window are the production defaults unless given", () => {
    const l = new FailureLimiter();
    expect([l.windowMs, l.max]).toEqual([REDEEM_FAILS.windowMs, REDEEM_FAILS.max]);
    expect([l.windowMs, l.max]).toEqual([600_000, 5]);
  });
});

describe.each(KINDS)("a burst of parallel tries from one address, on %s", (kind) => {
  it("40 parallel wrong codes: exactly 5 answered 403 and 35 are 429 with a retry-after; the next try is 429 and a right code is not spent by a 429", async () => {
    const rig = await open(kind);
    const keys = await Promise.all(Array.from({ length: 8 }, () => freshIdentity()));
    const live = codeOf(await requestCode(rig, A));
    const rs = await fire(rig, await jobs(rig, "10.0.0.1", (i) => keys[i % keys.length], Array.from({ length: 40 }, (_, i) => wrong(i))));
    expect(tally(rs), rs.map((r) => r.text).join(" | ")).toEqual({ 403: 5, 429: 35 });
    for (const r of rs.filter((x) => x.status === 429)) {
      expect(r.json).toEqual({ error: "too many wrong codes, try again later" });
      expect(r.headers.get("retry-after")).toBe("600");
    }
    const [next] = await jobs(rig, "10.0.0.1", () => keys[0], [wrong(41)]);
    expect((await fire(rig, [next]))[0].status).toBe(429);
    const [right] = await jobs(rig, "10.0.0.1", () => B, [live]);
    expect((await fire(rig, [right]))[0].status, "the right code from the blocked address").toBe(429);
    const [other] = await jobs(rig, "10.0.0.2", () => B, [live]);
    const ok = (await fire(rig, [other]))[0];
    expect(ok.status, "the same code from another address: it was never spent").toBe(200);
    expect(ok.json?.player).toBe(A.playerId);
  });

  it("the count is per address: five addresses each bursting 8 wrong codes get exactly 5 refusals and 3 blocks each", async () => {
    const rig = await open(kind);
    const keys = await Promise.all(Array.from({ length: 4 }, () => freshIdentity()));
    const ips = ["10.1.0.1", "10.1.0.2", "10.1.0.3", "10.1.0.4", "10.1.0.5"];
    const all = (await Promise.all(ips.map((ip, n) => jobs(rig, ip, (i) => keys[i % keys.length], Array.from({ length: 8 }, (_, i) => wrong(n * 8 + i)))))).flat();
    const rs = await fire(rig, all);
    for (const [n, ip] of ips.entries()) {
      expect(tally(rs.slice(n * 8, n * 8 + 8)), ip).toEqual({ 403: 5, 429: 3 });
    }
  });

  it("tries that do not end as a wrong code give their count back, even in parallel: 12 parallel 409s and 12 parallel bad signatures leave the whole allowance", async () => {
    const rig = await open(kind);
    expect((await linkVia(rig, D, B)).joined.status).toBe(200); // B belongs to D: B redeeming A's code is a 409
    const live = codeOf(await requestCode(rig, A));
    const a = await fire(rig, await jobs(rig, "10.2.0.1", () => B, Array.from({ length: 12 }, () => live)));
    for (const r of a) expect([409, 429], r.text).toContain(r.status); // 429: a place held by a try still in flight when it arrived
    expect(a.map((r) => r.status), "the first try in is a 409").toContain(409);
    // a signature made for another body: 401 after the body is read
    const forged = await Promise.all(Array.from({ length: 12 }, async (_, i) => {
      const body = bodyAt(rig.clock.now, { code: wrong(i) });
      const other = bodyAt(rig.clock.now, { code: wrong(i + 50) });
      return { body, headers: { ...(await signedBy(B, other, LINK_REDEEM_PREFIX)), "fly-client-ip": "10.2.0.1" } };
    }));
    const b = await fire(rig, forged);
    for (const r of b) expect([401, 429], r.text).toContain(r.status);
    expect(b.map((r) => r.status)).toContain(401);
    // all of them are over: nothing is held, and nothing was counted
    await fullAllowance(rig, "10.2.0.1", B);
    expect((await redeemCode(rig, B, live)).status, "(another address, the real one of the test client) the live code is untouched by all of it").toBe(409);
  });

  it("a try whose await throws gives its count back: a store that fails (503) never uses up the allowance", async () => {
    const rig = await open(kind);
    const key = await freshIdentity();
    const store = rig.app.links.store as { get: LinkStore["get"]; list: LinkStore["list"] };
    const get = store.get.bind(store), list = store.list.bind(store);
    // 1. the first read of the tombstones fails: ensureFresh throws, after the count was taken
    store.list = async () => {
      throw new StorageError("identity list failed: HTTP 500");
    };
    try {
      const rs = await fire(rig, await jobs(rig, "10.3.0.1", () => key, Array.from({ length: 4 }, (_, i) => wrong(i))));
      expect(rs.map((r) => r.status), "tombstones unreadable: 503").toEqual([503, 503, 503, 503]);
    } finally {
      store.list = list;
    }
    // 2. the code lookup fails inside the redeem
    store.get = async (k: string) => {
      if (k.startsWith("linkcodes/")) throw new StorageError("identity read failed: HTTP 500");
      return get(k);
    };
    try {
      for (let round = 0; round < 3; round++) {
        const rs = await fire(rig, await jobs(rig, "10.3.0.1", () => key, Array.from({ length: 4 }, (_, i) => wrong(10 + i))));
        for (const r of rs) expect([503, 429], r.text).toContain(r.status);
        expect(rs.map((r) => r.status)).toContain(503);
      }
    } finally {
      store.get = get;
    }
    await fullAllowance(rig, "10.3.0.1", key);
  });

  it("a client that goes away in the middle of its body gives its count back: while it hangs it holds its place, afterwards the address has it again", async () => {
    const rig = await open(kind, { redeemLimit: { windowMs: 600_000, max: 1 } }); // a limit of ONE, so a held place shows
    const key = await freshIdentity();
    const ip = "10.6.0.1";
    const [job] = await jobs(rig, ip, () => key, [wrong(1)]);
    const [again] = await jobs(rig, ip, () => key, [wrong(2)]);
    const url = new URL(rig.base);
    const hung = rawHttp.request({
      host: url.hostname, port: Number(url.port), method: "POST", path: "/v1/link/redeem", headers: { ...job.headers, "content-length": String(job.body.length) },
    });
    hung.on("error", () => {}); // the client destroys its own socket below
    hung.write(job.body.slice(0, 5)); // the headers and 5 of the body's bytes: the server waits for the rest, holding the only place
    // Wait until the server has registered the half-sent request (IDENT-1 FIX2: this was sleep(60), which a loaded host can overrun). The probe is
    // an unsigned redeem from the same address: while the place is free it is a 401 that gives its count back (it takes nothing, and it is over inside
    // one turn of the event loop, so it cannot be the one that holds the place when the hung request arrives); once the place is held it is a 429.
    let probe = 0;
    for (let i = 0; i < 200 && probe !== 429; i++) {
      if (i > 0) await sleep(25);
      probe = (await send(rig, "POST", "/v1/link/redeem", undefined, { "fly-client-ip": ip })).status;
    }
    expect(probe, "the server registered the half-sent request (within 5 s)").toBe(429);
    expect((await fire(rig, [again]))[0].status, "while the first hangs, its place is taken").toBe(429);
    hung.destroy(); // the client goes away
    let after = 0;
    for (let i = 0; i < 40 && after !== 403; i++) {
      await sleep(25);
      after = (await fire(rig, [again]))[0].status;
    }
    expect(after, "the place came back: a wrong code is a plain 403 again, not a 429").toBe(403);
    expect((await fire(rig, [again]))[0].status, "and that one counted: the limit of one is used").toBe(429);
  });

  it("the closed gate's 403 (uploads closed) is not a wrong code and does not count", async () => {
    const rig = await open(kind, { uploads: "closed" });
    const key = await freshIdentity();
    const rs = await fire(rig, await jobs(rig, "10.4.0.1", () => key, Array.from({ length: 10 }, (_, i) => wrong(i))));
    for (const r of rs) expect([403, 429], r.text).toContain(r.status);
    expect(rs.map((r) => r.json?.error)).toContain("uploads are not open yet");
    for (let i = 0; i < 10; i++) {
      const [j] = await jobs(rig, "10.4.0.1", () => key, [wrong(i)]);
      const r = (await fire(rig, [j]))[0];
      expect(r.status, `sequential try ${i + 1}: still the closed gate's 403, never 429`).toBe(403);
      expect(r.json).toEqual({ error: "uploads are not open yet" });
    }
  });
});

describe.each(KINDS)("what holds across machines, on %s", (kind) => {
  it("each machine counts its own wrong codes (the limiter is in memory): five on one machine block that machine only; the other has its own five", async () => {
    const rig = await open(kind);
    const key = await freshIdentity();
    const sibling = await openSibling(rig, { rateLimit: { windowMs: 60_000, max: 1_000_000 }, trustProxy: "fly" });
    const live = codeOf(await requestCode(rig, A));
    const hit = async (machine: Rig, code: string) => (await fire(machine, await jobs(machine, "10.5.0.1", () => key, [code])))[0].status;
    for (let i = 0; i < 5; i++) expect(await hit(rig, wrong(i))).toBe(403);
    expect(await hit(rig, wrong(9)), "this machine: blocked").toBe(429);
    for (let i = 0; i < 5; i++) expect(await hit(sibling, wrong(20 + i)), `the other machine, wrong try ${i + 1}`).toBe(403);
    expect(await hit(sibling, wrong(29)), "the other machine: now blocked too").toBe(429);
    // the code itself is shared (it is in the store): the right code from a machine that has room links, whichever machine it is
    const third = await openSibling(rig, { rateLimit: { windowMs: 60_000, max: 1_000_000 }, trustProxy: "fly" });
    expect(await hit(third, live), "a third machine, which has counted nothing").toBe(200);
    expect(Object.keys(await identityRecords(rig)).filter((k) => k.startsWith("links/keys/"))).toEqual([`links/keys/${key.playerId}.json`]);
  });
});
