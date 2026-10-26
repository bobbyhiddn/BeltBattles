// VERIFY-IDENT1-FIX2 (REQ-BFG-122) step 4i, written by the independent re-checker (cap_xi): REGRESSIONS WHERE FIX2 TOUCHED SHARED PATHS. FIX2 changed
// server/links.ts only (linkSteam's write order, deletePlayer's Steam-link check, the tombstone reload, ensureFresh). The upload, profile, match, DELETE, link
// and Steam replies must be exactly what they were at the tip the last re-check passed (refs/ident1/prefix2 = 0554b44d4251).
// HOW: `git archive refs/ident1/prefix2` is exported to <repo>/../tmp/fix2/prefix2 (or $VIDENT2_PREFIX; made here if missing; node_modules linked) and that
// tree's own server/app.ts runs in process beside the tip's, both over fresh JSON-lines directories with the same fixed clock. Two scripts of requests are
// sent to both and every reply is compared: status, every header but `date`, and the body (a link code is masked, it is random). The first script is the
// last re-check's 54 requests (a 0.9.13 client's upload, profile PUT and GET, link and redeem, match, DELETE from a device and repeats, error replies,
// preflights); the second is new: the Steam routes (link, repeat, used ticket, refused, Steam down, a device's login, 409s, DELETE, 410).
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import * as childProcess from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DELETE_PREFIX, LINK_REDEEM_PREFIX } from "../src/net/identity";
import { testIdentity } from "./netIdentity";
import { NOW, earnedWire } from "./profileupWire";
import {
  bodyAt, closeRigs, deleteMe, fakeSteam, linkSteamCall, matchAs, openRig, postGhost, putWire, readProfile, redeemCode, requestCode, send, signedBy, uploadFor,
  type Reply, type Rig,
} from "./identRig";

// tsconfig.tests.json carries a small shim for node:child_process and process: these go through any
const execFileSync = (childProcess as unknown as { execFileSync(file: string, args: string[], opts?: Record<string, unknown>): string }).execFileSync;
const R2 = (process as unknown as { cwd(): string }).cwd();
const PREFIX = (process as unknown as { env: Record<string, string | undefined> }).env.VIDENT2_PREFIX ?? join(R2, "..", "tmp", "fix2", "prefix2");

/* eslint-disable @typescript-eslint/no-explicit-any */
let prefixApp: any;
const dirs: string[] = [];
const closers: (() => Promise<void>)[] = [];
const ORIGINS = ["http://127.0.0.1:7778", "https://play.example"];
const quiet = { windowMs: 60_000, max: 1_000_000 };
const S1 = "76561198000000071", S2 = "76561198000000072";

beforeAll(async () => {
  if (!existsSync(join(PREFIX, "server", "app.ts"))) {
    mkdirSync(PREFIX, { recursive: true });
    execFileSync("sh", ["-c", `git archive refs/ident1/prefix2 | tar -x -C "${PREFIX}"`], { cwd: R2 });
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
/** The PREFIX2 server (the export's server/app.ts) over a fresh directory, with a fixed clock and the given options. */
async function openPrefix(over: Record<string, unknown> = {}): Promise<Side> {
  const dir = mkdtempSync(join(tmpdir(), "bb-vpre2-"));
  dirs.push(dir);
  const clock = { now: NOW };
  const app = prefixApp.createGhostServer({ dataDir: dir, log: () => {}, now: () => clock.now, rateLimit: quiet, origins: ORIGINS, trustProxy: "fly", ...over });
  closers.push(() => app.close());
  return { name: "prefix2", rig: { base: `http://127.0.0.1:${await app.listen(0)}`, clock } };
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
const mask = (x: unknown): unknown => {
  if (Array.isArray(x)) return x.map(mask);
  if (x && typeof x === "object") return Object.fromEntries(Object.entries(x).map(([k, v]) => [k, k === "code" ? "<code>" : k === "uptimeS" ? "<s>" : mask(v)]));
  return x;
};
const asStep = (step: string, r: Reply): Step => ({
  step, status: r.status, headers: [...r.headers.entries()].filter(([k]) => k !== "date" && !(step.startsWith("health") && k === "content-length")).sort(), body: mask(r.json ?? r.text),
});

/** The last re-check's script of 54 requests, against one server. */
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
  rec("delete without headers", await send(r, "DELETE", "/v1/player", bodyAt(r.clock.now)));
  rec("delete with a clock 11 minutes off", await send(r, "DELETE", "/v1/player", bodyAt(r.clock.now + 11 * 60_000), await signedBy(d, bodyAt(r.clock.now + 11 * 60_000), DELETE_PREFIX)));
  rec("delete, wrong method", await get("/v1/player"));
  rec("code, wrong domain", await send(r, "POST", "/v1/link/code", bodyAt(r.clock.now), await signedBy(d, bodyAt(r.clock.now), LINK_REDEEM_PREFIX)));
  rec("redeem, wrong method", await get("/v1/link/redeem"));
  rec("steam, off", await linkSteamCall(r, d, "aa01", "bb-ghost", 480));
  for (const origin of ORIGINS) for (const path of ["/v1/link/redeem", "/v1/link/code", "/v1/player", "/v1/profile", "/v1/ghosts"]) {
    rec(`preflight ${path} ${origin}`, await send(r, "OPTIONS", path, undefined, { origin, "access-control-request-method": "POST" }));
  }
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

/** The Steam script (Steam on), against one server: link, repeat, used ticket, refused, Steam down, a device's login, 409s, DELETE, 410. */
async function steamScript(side: Side): Promise<Step[]> {
  const r = side.rig as Rig;
  const [a, b, c, d] = await Promise.all([0, 1, 2, 3].map((n) => testIdentity(n)));
  const out: Step[] = [];
  const rec = (step: string, x: Reply) => (out.push(asStep(step, x)), x);
  rec("a links S1", await linkSteamCall(r, a, "aa01", "bb-ghost", 480));
  rec("a links S1 again (fresh ticket)", await linkSteamCall(r, a, "aa02", "bb-ghost", 480));
  rec("a's first ticket again", await linkSteamCall(r, a, "aa01", "bb-ghost", 480));
  rec("a, a ticket Steam does not know", await linkSteamCall(r, a, "ff00", "bb-ghost", 480));
  rec("a, Steam is down", await linkSteamCall(r, a, "ee01", "bb-ghost", 480));
  rec("a, the wrong App ID", await linkSteamCall(r, a, "aa03", "bb-ghost", 9));
  rec("a, a bad ticket (not hex)", await linkSteamCall(r, a, "zz", "bb-ghost", 480));
  rec("b redeems a's code", await redeemCode(r, b, String((await requestCode(r, a)).json?.code)));
  rec("b (a device) logs in with S1", await linkSteamCall(r, b, "bb01", "bb-ghost", 480));
  rec("c asks a code", await requestCode(r, c));
  rec("d redeems c's code", await redeemCode(r, d, String((await requestCode(r, c)).json?.code)));
  rec("c logs in with S1 (c has a device)", await linkSteamCall(r, c, "cc01", "bb-ghost", 480));
  rec("d (c's device) logs in with S1", await linkSteamCall(r, d, "dd01", "bb-ghost", 480));
  rec("c links S2", await linkSteamCall(r, c, "cc02", "bb-ghost", 480));
  rec("a reads its profile", await readProfile(r, a));
  rec("a deletes (from the device b)", await deleteMe(r, b));
  rec("a logs in after", await linkSteamCall(r, a, "aa03", "bb-ghost", 480));
  rec("b logs in after", await linkSteamCall(r, b, "bb02", "bb-ghost", 480));
  rec("a asks a code after", await requestCode(r, a));
  rec("c deletes", await deleteMe(r, c));
  rec("c deletes again", await deleteMe(r, c));
  rec("d (c's device, link gone) logs in", await linkSteamCall(r, d, "dd02", "bb-ghost", 480));
  rec("c reads after", await readProfile(r, c));
  return out;
}

const accounts = { aa01: S1, aa02: S1, aa03: S1, bb01: S1, bb02: S1, cc01: S1, cc02: S2, dd01: S1, dd02: S1 };
const steamFor = () => {
  const s = fakeSteam(accounts);
  s.unavailable.add("ee01");
  return s;
};

describe("the unchanged replies are unchanged: the tip against the tip the last re-check passed (refs/ident1/prefix2)", () => {
  it("the last re-check's script of 54 requests: every status, header and body equal", async () => {
    const tip = await openTip();
    const pre = await openPrefix();
    const [x, y] = [await script(tip), await script(pre)];
    expect(x.length).toBe(y.length);
    expect(x.length).toBeGreaterThanOrEqual(50);
    for (let i = 0; i < x.length; i++) expect(x[i], `step ${i + 1} "${x[i].step}"`).toEqual(y[i]);
    const statuses = new Set(x.map((s) => s.status));
    for (const want of [200, 201, 401, 403, 405, 410, 422]) expect(statuses.has(want), `the script reached a ${want}`).toBe(true);
    console.log(`VIDENT2 regress: ${x.length} steps equal; statuses seen ${[...statuses].sort().join(",")}`);
  });

  it("the Steam script (Steam on): link, repeat, used ticket, refused, Steam down, wrong App ID, bad ticket, a device's login, 409s, DELETE from a device, 410: every status, header and body equal", async () => {
    const tip = await openTip({ steam: steamFor() });
    const pre = await openPrefix({ steam: steamFor() });
    const [x, y] = [await steamScript(tip), await steamScript(pre)];
    expect(x.length).toBe(y.length);
    for (let i = 0; i < x.length; i++) expect(x[i], `step ${i + 1} "${x[i].step}"`).toEqual(y[i]);
    const statuses = [...new Set(x.map((s) => s.status))].sort();
    for (const want of [200, 400, 403, 409, 410, 502]) expect(statuses, `the Steam script reached a ${want}`).toContain(want);
    console.log(`VIDENT2 regress (Steam): ${x.length} steps equal; statuses seen ${statuses.join(",")}`);
  });
});
