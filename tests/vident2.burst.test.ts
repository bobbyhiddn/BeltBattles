// VERIFY-IDENT1-FIX2 (REQ-BFG-122) step 4e, written by the independent re-checker (cap_xi): THE POLL IN tests/ident1.burst.test.ts "a client that goes away
// in the middle of its body" (IDENT-1 FIX2 replaced sleep(60) with a poll of an unsigned redeem from the same address: a 401 while the place is free, a 429
// once the half-sent request holds it; 200 tries, 25 ms apart). Three questions, answered by running the same poll against the production server:
//   1  can it PASS when the server has not registered the half-sent request (a false pass)?          -> no: with the request never sent the poll ends on 401
//   2  can it FAIL on a slow host, before its 5 s deadline?                                            -> no: a request that arrives 2.5 s late is still seen
//   3  does the probe itself use up the place or the allowance?                                        -> no: 30 probes later the wrong code still gets its 403
// (The poll below is a copy of the one in ident1.burst; the real test is run 5 times in a row by the re-check, separately.)
import http from "node:http";
import { afterAll, describe, expect, it } from "vitest";
import { LINK_REDEEM_PREFIX } from "../src/net/identity";
import { CODE_ALPHABET } from "../server/links";
import { bodyAt, closeRigs, freshIdentity, openRig, send, signedBy, type Kind, type Opts, type Reply, type Rig } from "./identRig";

afterAll(closeRigs);

const KINDS: Kind[] = ["jsonl", "tigris"];
const open = (kind: Kind, over: Opts = {}) => openRig(kind, { rateLimit: { windowMs: 60_000, max: 1_000_000 }, trustProxy: "fly", ...over });
const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));
const wrong = (i: number): string => `ZZZZ-${CODE_ALPHABET[i % 31]}${CODE_ALPHABET[(i * 7 + 3) % 31]}ZZ`;
interface RawRequest {
  write(chunk: string): void;
  destroy(): void;
  on(event: "error", cb: () => void): void;
}
const rawHttp = http as unknown as { request(opts: { host: string; port: number; method: string; path: string; headers: Record<string, string> }): RawRequest };

async function job(rig: Rig, ip: string, code: string) {
  const key = await freshIdentity();
  const body = bodyAt(rig.clock.now, { code });
  return { body, headers: { ...(await signedBy(key, body, LINK_REDEEM_PREFIX)), "fly-client-ip": ip } };
}
const fire = (rig: Rig, j: { body: string; headers: Record<string, string> }): Promise<Reply> => send(rig, "POST", "/v1/link/redeem", j.body, j.headers);

/** The poll of ident1.burst, as it is there: up to 200 tries, 25 ms apart; stops at the first 429. */
async function poll(rig: Rig, ip: string): Promise<{ probe: number; tries: number; ms: number }> {
  const t0 = Date.now();
  let probe = 0, tries = 0;
  for (let i = 0; i < 200 && probe !== 429; i++) {
    if (i > 0) await sleep(25);
    tries++;
    probe = (await send(rig, "POST", "/v1/link/redeem", undefined, { "fly-client-ip": ip })).status;
  }
  return { probe, tries, ms: Date.now() - t0 };
}

function hang(rig: Rig, j: { body: string; headers: Record<string, string> }, writeAfterMs: number | null): { destroy(): void } {
  const url = new URL(rig.base);
  const req = rawHttp.request({ host: url.hostname, port: Number(url.port), method: "POST", path: "/v1/link/redeem", headers: { ...j.headers, "content-length": String(j.body.length) } });
  req.on("error", () => {});
  let timer: ReturnType<typeof setTimeout> | undefined;
  if (writeAfterMs === 0) req.write(j.body.slice(0, 5));
  else if (writeAfterMs !== null) timer = setTimeout(() => req.write(j.body.slice(0, 5)), writeAfterMs);
  return { destroy: () => (clearTimeout(timer), req.destroy()) };
}

describe.each(KINDS)("the poll of ident1.burst, on %s", (kind) => {
  it("1. the half-sent request is NEVER sent: the poll ends after 200 tries (5 s or more) on a 401, so the test's own expect(429) would fail: it cannot pass without the request", async () => {
    const rig = await open(kind, { redeemLimit: { windowMs: 600_000, max: 1 } });
    const r = await poll(rig, "10.7.0.1");
    expect([r.probe, r.tries]).toEqual([401, 200]);
    expect(r.ms, "200 tries 25 ms apart").toBeGreaterThanOrEqual(4_900);
  }, 60_000);

  it("2. a SLOW host: the half-sent request reaches the server 2.5 s late; the poll keeps trying and sees the 429 (a sleep(60) would have given up long before)", async () => {
    const rig = await open(kind, { redeemLimit: { windowMs: 600_000, max: 1 } });
    const j = await job(rig, "10.7.0.2", wrong(1));
    const h = hang(rig, j, 2_500);
    try {
      const r = await poll(rig, "10.7.0.2");
      expect(r.probe).toBe(429);
      expect(r.tries, "after about 100 tries").toBeGreaterThan(40);
      expect(r.ms).toBeGreaterThanOrEqual(2_400);
      expect(r.ms, "and well inside the deadline").toBeLessThan(5_000);
    } finally {
      h.destroy();
    }
  }, 60_000);

  it("2b. the normal case: the request arrives at once; the poll needs only a few tries", async () => {
    const rig = await open(kind, { redeemLimit: { windowMs: 600_000, max: 1 } });
    const j = await job(rig, "10.7.0.3", wrong(1));
    const h = hang(rig, j, 0);
    try {
      const r = await poll(rig, "10.7.0.3");
      expect(r.probe).toBe(429);
      expect(r.tries, "a few tries").toBeLessThanOrEqual(20);
    } finally {
      h.destroy();
    }
  });

  it("3. the probe takes nothing: 30 unsigned probes in a row from an address with a limit of ONE, and the wrong code that follows still gets its plain 403 (then the 429)", async () => {
    const rig = await open(kind, { redeemLimit: { windowMs: 600_000, max: 1 } });
    const ip = "10.7.0.4";
    for (let i = 0; i < 30; i++) expect((await send(rig, "POST", "/v1/link/redeem", undefined, { "fly-client-ip": ip })).status, `probe ${i + 1}`).toBe(401);
    expect((await fire(rig, await job(rig, ip, wrong(2)))).status, "the allowance of one is whole").toBe(403);
    expect((await fire(rig, await job(rig, ip, wrong(3)))).status, "and that one counted").toBe(429);
  });

  it("4. the probes cannot be what holds the place when the hung request arrives: 30 probes in parallel with a hung request still end on 429 only because of the hung one (a second address is not affected)", async () => {
    const rig = await open(kind, { redeemLimit: { windowMs: 600_000, max: 1 } });
    const j = await job(rig, "10.7.0.5", wrong(1));
    const h = hang(rig, j, 0);
    try {
      expect((await poll(rig, "10.7.0.5")).probe).toBe(429);
      const other = await Promise.all(Array.from({ length: 30 }, () => send(rig, "POST", "/v1/link/redeem", undefined, { "fly-client-ip": "10.7.0.6" })));
      expect(other.map((r) => r.status), "probes from another address are all 401, never 429").toEqual(Array(30).fill(401));
    } finally {
      h.destroy();
    }
  });
});
