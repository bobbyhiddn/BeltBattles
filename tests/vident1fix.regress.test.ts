// VERIFY-IDENT1-FIX1 (REQ-BFG-122) step 4f, written by the independent re-checker (cap_xi): REGRESSIONS WHERE THE FIX TOUCHED SHARED PATHS. The fix
// changed server/links.ts (the readers' limit, the tombstone reader, redeem, join, linkSteam) and server/linkRoutes.ts (the limiter). The upload, the
// profile, the match and the DELETE replies must be exactly what they were at the tip run 3 checked (refs/ident1/prefix = 3d80dbf0ee00); only the
// link replies named in FIX-REPORT section 5 may differ.
// HOW: `git archive refs/ident1/prefix` is exported to <repo>/../tmp/prefix (or $VIDENT1FIX_PREFIX; made here if missing; node_modules linked) and
// that tree's own server/app.ts runs in process beside the tip's, both over fresh JSON-lines directories with the same fixed clock. One script of
// requests is sent to both and every reply is compared: status, every header but `date`, and the body (a link code and its expiry are masked, they
// are random). Then the three places where the replies MUST differ are shown: a stale code (F1), the 65th key (F3), a parallel burst (F2).
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import * as childProcess from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DELETE_PREFIX, LINK_REDEEM_PREFIX, type Identity } from "../src/net/identity";
import { testIdentity } from "./netIdentity";
import { NOW, earnedWire } from "./profileupWire";
import {
  bodyAt, closeRigs, deleteMe, freshIdentity, linkSteamCall, matchAs, openRig, postGhost, putWire, readProfile, redeemCode, requestCode, send, signedBy, uploadFor,
  type Reply, type Rig,
} from "./identRig";

// tsconfig.tests.json carries a small shim for node:child_process and process: these go through any
const execFileSync = (childProcess as unknown as { execFileSync(file: string, args: string[], opts?: Record<string, unknown>): string }).execFileSync;
const R2 = (process as unknown as { cwd(): string }).cwd();
const PREFIX = (process as unknown as { env: Record<string, string | undefined> }).env.VIDENT1FIX_PREFIX ?? join(R2, "..", "tmp", "prefix");

/* eslint-disable @typescript-eslint/no-explicit-any */
let prefixApp: any;
const dirs: string[] = [];
const closers: (() => Promise<void>)[] = [];
const ORIGINS = ["http://127.0.0.1:7778", "https://play.example"];
const quiet = { windowMs: 60_000, max: 1_000_000 };

beforeAll(async () => {
  if (!existsSync(join(PREFIX, "server", "app.ts"))) {
    mkdirSync(PREFIX, { recursive: true });
    execFileSync("sh", ["-c", `git archive refs/ident1/prefix | tar -x -C "${PREFIX}"`], { cwd: R2 });
  }
  if (!existsSync(join(PREFIX, "node_modules"))) execFileSync("ln", ["-s", join(R2, "node_modules"), join(PREFIX, "node_modules")]);
  prefixApp = await import(/* @vite-ignore */ join(PREFIX, "server", "app.ts"));
}, 300_000);
afterAll(async () => {
  for (const c of closers.splice(0)) await c().catch(() => {});
  await closeRigs();
  for (const d of dirs) rmSync(d, { recursive: true, force: true });
});

interface Side {
  rig: Pick<Rig, "base" | "clock">;
  name: string;
}
/** The PREFIX server (the export's server/app.ts) over a fresh directory, with the tip rig's clock and options. */
async function openPrefix(over: Record<string, unknown> = {}): Promise<Side> {
  const dir = mkdtempSync(join(tmpdir(), "bb-vpre-"));
  dirs.push(dir);
  const clock = { now: NOW };
  const app = prefixApp.createGhostServer({ dataDir: dir, log: () => {}, now: () => clock.now, rateLimit: quiet, origins: ORIGINS, trustProxy: "fly", ...over });
  closers.push(() => app.close());
  return { name: "prefix", rig: { base: `http://127.0.0.1:${await app.listen(0)}`, clock } };
}
async function openTip(over: Record<string, unknown> = {}): Promise<Side> {
  const rig = await openRig("jsonl", { rateLimit: quiet, origins: ORIGINS, trustProxy: "fly", ...over });
  return { name: "tip", rig };
}

interface Step {
  step: string;
  status: number;
  headers: [string, string][];
  body: unknown;
}
/** A code and its expiry are random or clock-made: masked, so that the two servers' replies compare byte for byte otherwise. */
const mask = (x: unknown): unknown => {
  if (Array.isArray(x)) return x.map(mask);
  if (x && typeof x === "object") return Object.fromEntries(Object.entries(x).map(([k, v]) => [k, k === "code" ? "<code>" : k === "uptimeS" ? "<s>" : mask(v)]));
  return x;
};
const asStep = (step: string, r: Reply): Step => ({
  // the health reply's length moves with its uptime digits, so its content-length is left out (its body is compared, uptime masked)
  step, status: r.status, headers: [...r.headers.entries()].filter(([k]) => k !== "date" && !(step.startsWith("health") && k === "content-length")).sort(), body: mask(r.json ?? r.text),
});

/** The same script against one server. `r` is only used as {base, clock}. */
async function script(side: Side): Promise<Step[]> {
  const r = side.rig as Rig;
  const [a, b, c, d] = await Promise.all([0, 1, 2, 3].map((n) => testIdentity(n)));
  const out: Step[] = [];
  const rec = (step: string, x: Reply) => (out.push(asStep(step, x)), x);
  const recMasked = (step: string, x: Reply) => (out.push({ ...asStep(step, x), body: x.json?.snapshot ? "<a ghost>" : mask(x.json ?? x.text), headers: [] }), x);
  const get = async (path: string, headers: Record<string, string> = {}) => send(r, "GET", path, undefined, headers);
  rec("health", await get("/v1/health"));
  rec("a uploads", await postGhost(r, a, uploadFor(a, a.playerId, { runId: "a-1" })));
  rec("a uploads again", await postGhost(r, a, uploadFor(a, a.playerId, { runId: "a-1" })));
  rec("b uploads", await postGhost(r, b, uploadFor(b, b.playerId, { runId: "b-1" })));
  rec("a puts a profile", await putWire(r, earnedWire({ runs: 5, bestDay: 7 }, { won: ["furnace"] }), a));
  rec("b puts a profile", await putWire(r, earnedWire({ runs: 9, bestDay: 3 }, { won: ["weaver"] }), b));
  rec("a reads its profile", await readProfile(r, a));
  rec("a code for a", await requestCode(r, a));
  rec("c redeems a wrong code", await redeemCode(r, c, "ZZZZ-ZZZZ"));
  rec("c redeems a code that is no code", await redeemCode(r, c, "nope"));
  const code1 = String((await requestCode(r, a)).json?.code);
  rec("c redeems a's code", await redeemCode(r, c, code1));
  rec("c redeems it again", await redeemCode(r, c, code1));
  rec("b (a lone key with a profile) redeems a fresh code", await redeemCode(r, b, String((await requestCode(r, a)).json?.code)));
  rec("c reads the profile", await readProfile(r, c));
  rec("c uploads under a", await postGhost(r, c, uploadFor(c, a.playerId, { runId: "c-1" })));
  rec("c uploads under its own id", await postGhost(r, c, uploadFor(c, c.playerId, { runId: "c-2" })));
  rec("c uploads under d", await postGhost(r, c, uploadFor(c, d.playerId, { runId: "c-3" })));
  rec("a uploads under c", await postGhost(r, a, uploadFor(a, c.playerId, { runId: "a-2" })));
  rec("d uploads", await postGhost(r, d, uploadFor(d, d.playerId, { runId: "d-1" })));
  rec("c puts a profile", await putWire(r, earnedWire({ runs: 12 }), c));
  rec("a reads the merged profile", await readProfile(r, a));
  rec("match as a", await matchAs(r, a.playerId));
  rec("match as c", await matchAs(r, c.playerId));
  recMasked("match as d", await matchAs(r, d.playerId)); // several ghosts are eligible: which one is the server's draw, so only its kind is compared
  // error replies of the identity routes that did not change
  rec("delete without headers", await send(r, "DELETE", "/v1/player", bodyAt(r.clock.now)));
  rec("delete with a clock 11 minutes off", await send(r, "DELETE", "/v1/player", bodyAt(r.clock.now + 11 * 60_000), await signedBy(d, bodyAt(r.clock.now + 11 * 60_000), DELETE_PREFIX)));
  rec("delete, wrong method", await get("/v1/player"));
  rec("code, wrong domain", await send(r, "POST", "/v1/link/code", bodyAt(r.clock.now), await signedBy(d, bodyAt(r.clock.now), LINK_REDEEM_PREFIX)));
  rec("redeem, wrong method", await get("/v1/link/redeem"));
  rec("steam, off", await linkSteamCall(r, d, "aa01", "bb-ghost", 480));
  for (const origin of ORIGINS) for (const path of ["/v1/link/redeem", "/v1/link/code", "/v1/player", "/v1/profile", "/v1/ghosts"]) {
    rec(`preflight ${path} ${origin}`, await send(r, "OPTIONS", path, undefined, { origin, "access-control-request-method": "POST" }));
  }
  // deletion: from a DEVICE (c), then again, then everything that follows
  rec("c deletes (a device)", await deleteMe(r, c));
  rec("c deletes again", await deleteMe(r, c));
  rec("a deletes again", await deleteMe(r, a));
  rec("a uploads after", await postGhost(r, a, uploadFor(a, a.playerId, { runId: "a-3" })));
  rec("c uploads after", await postGhost(r, c, uploadFor(c, a.playerId, { runId: "c-4" })));
  rec("b uploads after", await postGhost(r, b, uploadFor(b, b.playerId, { runId: "b-2" })));
  rec("a reads after", await readProfile(r, a));
  rec("a puts a profile after", await putWire(r, earnedWire({ runs: 2 }), a));
  rec("a asks a code after", await requestCode(r, a));
  rec("d redeems a dead code", await redeemCode(r, d, code1));
  recMasked("match as d after", await matchAs(r, d.playerId));
  rec("d uploads after (not affected)", await postGhost(r, d, uploadFor(d, d.playerId, { runId: "d-2" })));
  rec("d deletes", await deleteMe(r, d));
  rec("health after", await get("/v1/health"));
  return out;
}

describe("the unchanged replies are unchanged: the tip against the checked tip (refs/ident1/prefix)", () => {
  it("one script of 54 requests (upload, profile PUT and GET, link and redeem, match, DELETE from a device and repeats, error replies, preflights): every status, header and body equal", async () => {
    const tip = await openTip();
    const pre = await openPrefix();
    const [x, y] = [await script(tip), await script(pre)];
    expect(x.length).toBe(y.length);
    expect(x.length).toBeGreaterThanOrEqual(50);
    for (let i = 0; i < x.length; i++) expect(x[i], `step ${i + 1} "${x[i].step}"`).toEqual(y[i]);
    const statuses = new Set(x.map((s) => s.status));
    for (const want of [200, 201, 401, 403, 405, 410, 422]) expect(statuses.has(want), `the script reached a ${want}`).toBe(true);
    console.log(`VIDENT1FIX regress: ${x.length} steps equal; statuses seen ${[...statuses].sort().join(",")}`);
  });
});

describe("the three places where the link replies MUST differ, and only there", () => {
  it("F1: a stale code. The prefix makes a device of a device (200); the tip refuses it (403)", async () => {
    const out: Record<string, number> = {};
    for (const side of [await openPrefix(), await openTip()]) {
      const r = side.rig as Rig;
      const [A, X, Z] = [await testIdentity(0), await freshIdentity(), await freshIdentity()];
      const stale = String((await requestCode(r, X)).json?.code);
      expect((await redeemCode(r, X, String((await requestCode(r, A)).json?.code))).status).toBe(200); // X becomes A's device
      out[side.name] = (await redeemCode(r, Z, stale)).status;
    }
    expect(out).toEqual({ prefix: 200, tip: 403 });
  });

  it("F3: the 65th key. The prefix writes a record nobody can read (200); the tip refuses (409)", async () => {
    const out: Record<string, number[]> = {};
    for (const side of [await openPrefix(), await openTip()]) {
      const r = side.rig as Rig;
      const A = await testIdentity(0);
      const keys = await Promise.all(Array.from({ length: 66 }, () => freshIdentity()));
      const statuses: number[] = [];
      for (const k of keys) statuses.push((await redeemCode(r, k, String((await requestCode(r, A)).json?.code))).status);
      out[side.name] = [statuses.slice(0, 64).every((s) => s === 200) ? 200 : -1, statuses[64], statuses[65]];
    }
    expect(out).toEqual({ prefix: [200, 200, 200], tip: [200, 409, 409] });
  });

  it("F2: 40 parallel wrong codes from one address. The prefix lets more than the limit through; the tip answers exactly 5 with 403", async () => {
    const out: Record<string, number> = {};
    for (const side of [await openPrefix(), await openTip()]) {
      const r = side.rig as Rig;
      const keys: Identity[] = await Promise.all(Array.from({ length: 8 }, () => freshIdentity()));
      const js = await Promise.all(Array.from({ length: 40 }, async (_, i) => {
        const body = bodyAt(r.clock.now, { code: `ZZZZ-ZZ${String.fromCharCode(65 + (i % 26))}${i % 10 < 2 ? "A" : "B"}` });
        return { body, headers: { ...(await signedBy(keys[i % keys.length], body, LINK_REDEEM_PREFIX)), "fly-client-ip": "10.0.0.1" } };
      }));
      const rs = await Promise.all(js.map((j) => send(r, "POST", "/v1/link/redeem", j.body, j.headers)));
      out[side.name] = rs.filter((x) => x.status === 403).length;
    }
    // the prefix's figure depends on scheduling (run 3 measured 6 on JSON lines and 19 on Tigris): it is reported, not asserted
    console.log(`VIDENT1FIX F2 differential: 40 parallel wrong codes -> ${out.prefix} answered 403 at the prefix, ${out.tip} at the tip`);
    expect(out.tip).toBe(5);
    expect(out.prefix).toBeGreaterThanOrEqual(5);
  });
});
