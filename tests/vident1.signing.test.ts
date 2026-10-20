// VERIFY-IDENT1 (REQ-BFG-122) step 4b, written by the independent checker (cap_zeta), not by IDENT-1's author: SIGNING. Every request
// kind is signed in its OWN domain over the exact bytes; the checks here try to make one kind pass for another, to move `at` out of its
// 10 minute bound, to send a re-serialized body, and to send the profile read's query other than the one that was signed.
// What each check tried and what happened is in its name and in the comments. Both backing stores (JSON lines and the Tigris fake).
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  DELETE_PREFIX, LINK_CODE_PREFIX, LINK_REDEEM_PREFIX, LINK_STEAM_PREFIX, PROFILE_GET_PREFIX, PROFILE_PREFIX, UPLOAD_PREFIX,
  type Identity, type SignDomain,
} from "../src/net/identity";
import { encodeWire } from "../src/net/profileWire";
import { encodeSnapshot } from "../src/net/snapshot";
import { AT_WINDOW_MS } from "../server/links";
import { testIdentity } from "./netIdentity";
import { NOW, earnedWire } from "./profileupWire";
import {
  closeRigs, fakeSteam, ghostCount, identityRecords, linkVia, openRig, postGhost, profileStored, putWire, readProfile, redeemCode, requestCode,
  send, signedBy, uploadFor, type Kind, type Opts, type Reply, type Rig,
} from "./identRig";

let A: Identity, B: Identity, C: Identity;
beforeAll(async () => {
  [A, B, C] = await Promise.all([0, 1, 2].map((n) => testIdentity(n)));
});
afterAll(closeRigs);

const KINDS: Kind[] = ["jsonl", "tigris"];
const ALL: SignDomain[] = [UPLOAD_PREFIX, PROFILE_PREFIX, LINK_CODE_PREFIX, LINK_REDEEM_PREFIX, LINK_STEAM_PREFIX, PROFILE_GET_PREFIX, DELETE_PREFIX];
const TICKET = "aa01";
/** A rig whose global limiter stays out of the way, with Steam on (a fake verifier that knows one ticket). */
const open = (kind: Kind, over: Opts = {}) =>
  openRig(kind, { rateLimit: { windowMs: 60_000, max: 1_000_000 }, steam: fakeSteam({ [TICKET]: "76561198000000001" }), ...over });
const j = (r: Reply): Record<string, unknown> => r.json ?? {};
const enc = (s: string): Uint8Array<ArrayBuffer> => new TextEncoder().encode(s);

/** One request of any kind: `body` is what is sent, `over` (default the same bytes) what the signature covers. */
async function call(
  rig: Rig, method: string, path: string, id: Identity, domain: SignDomain, body: string | Uint8Array<ArrayBuffer> | undefined,
  over: string | Uint8Array<ArrayBuffer> | undefined = body,
): Promise<Reply> {
  return send(rig, method, path, body, await signedBy(id, over ?? "", domain));
}

interface Route {
  name: string;
  method: string;
  /** The URL (the GET's query included). */
  url: (r: Rig) => string;
  domain: SignDomain;
  /** The bytes the signature covers: the body, or the query text for the GET. */
  bytes: (r: Rig) => string;
  /** Statuses that show the request got past signature, shape and `at` (the route's own answer). */
  reached: number[];
  hasBody: boolean;
}
const at = (r: Rig) => r.clock.now;
const ROUTES: Route[] = [
  { name: "POST /v1/link/code", method: "POST", url: () => "/v1/link/code", domain: LINK_CODE_PREFIX, bytes: (r) => JSON.stringify({ at: at(r) }), reached: [200], hasBody: true },
  { name: "POST /v1/link/redeem", method: "POST", url: () => "/v1/link/redeem", domain: LINK_REDEEM_PREFIX, bytes: (r) => JSON.stringify({ at: at(r), code: "ZZZZ-ZZZZ" }), reached: [403], hasBody: true },
  { name: "POST /v1/link/steam", method: "POST", url: () => "/v1/link/steam", domain: LINK_STEAM_PREFIX, bytes: (r) => JSON.stringify({ at: at(r), ticket: TICKET, identity: "bb", appid: 480 }), reached: [200], hasBody: true },
  { name: "DELETE /v1/player", method: "DELETE", url: () => "/v1/player", domain: DELETE_PREFIX, bytes: (r) => JSON.stringify({ at: at(r) }), reached: [200], hasBody: true },
  { name: "GET /v1/profile?at=", method: "GET", url: (r) => `/v1/profile?at=${at(r)}`, domain: PROFILE_GET_PREFIX, bytes: (r) => `at=${at(r)}`, reached: [200], hasBody: false },
  { name: "PUT /v1/profile (existing)", method: "PUT", url: () => "/v1/profile", domain: PROFILE_PREFIX, bytes: () => encodeWire(earnedWire({ runs: 3, bestDay: 4 })), reached: [200], hasBody: true },
  { name: "POST /v1/ghosts (existing)", method: "POST", url: () => "/v1/ghosts", domain: UPLOAD_PREFIX, bytes: () => encodeSnapshot(uploadFor(A, A.playerId, { runId: "sign-1" })), reached: [201], hasBody: true },
];
const send1 = (rig: Rig, route: Route, id: Identity, domain: SignDomain = route.domain, over?: string) =>
  call(rig, route.method, route.url(rig), id, domain, route.hasBody ? route.bytes(rig) : undefined, over ?? route.bytes(rig));

/** A world worth protecting: A has a profile, a ghost and a linked key B, and a live link code. */
async function world(kind: Kind) {
  const rig = await open(kind);
  expect((await putWire(rig, earnedWire({ runs: 5, bestDay: 7 }), A)).status).toBe(200);
  expect((await postGhost(rig, A, uploadFor(A))).status).toBe(201);
  expect((await linkVia(rig, A, B)).joined.status).toBe(200);
  expect((await requestCode(rig, A)).status).toBe(200);
  return rig;
}
const snapshotOf = async (rig: Rig) => ({ records: await identityRecords(rig), ghosts: ghostCount(rig), profileA: profileStored(rig, A.playerId) });

describe.each(KINDS)("a signature made in one domain, sent to another route, on %s", (kind) => {
  it("every route refuses every other domain's signature with 401, and nothing changes (7 routes x 6 wrong domains, signed by the player's first key and by its linked key)", async () => {
    const rig = await world(kind);
    const before = await snapshotOf(rig);
    let tried = 0;
    for (const signer of [A, B]) {
      for (const route of ROUTES) {
        for (const domain of ALL.filter((d) => d !== route.domain)) {
          const r = await send1(rig, route, signer, domain);
          expect(r.status, `${route.name} signed in ${JSON.stringify(domain)} by ${signer === A ? "A" : "B"}: ${r.text}`).toBe(401);
          tried++;
        }
      }
    }
    expect(tried).toBe(2 * 7 * 6);
    expect(await snapshotOf(rig)).toEqual(before); // the delete did not delete, the profile PUT wrote nothing, the upload stored nothing
    expect(profileStored(rig, A.playerId)).toBe(true);
    expect(rig.app.links.isGone(A.playerId)).toBe(false);
  });

  it("the right domain gets through to the route's own answer on every route (the control: the 401s above are the domain's doing)", async () => {
    for (const route of ROUTES) {
      const rig = await world(kind);
      const r = await send1(rig, route, A);
      expect(route.reached, `${route.name}: ${r.status} ${r.text}`).toContain(r.status);
    }
  });

  it("a signature over other bytes than the ones sent is 401 on every body route (a body re-serialized after signing, one byte changed, one byte added)", async () => {
    const rig = await world(kind);
    const before = await snapshotOf(rig);
    let tried = 0;
    for (const route of ROUTES.filter((x) => x.hasBody)) {
      const good = route.bytes(rig);
      const pretty = JSON.stringify(JSON.parse(good), null, 2);
      for (const sent of [pretty, good + " ", good.replace("1", "2")]) {
        const r = await call(rig, route.method, route.url(rig), A, route.domain, sent, good); // signed over `good`, sent as `sent`
        expect(r.status, `${route.name}: ${JSON.stringify(sent).slice(0, 60)}`).toBe(401);
        tried++;
      }
    }
    expect(tried).toBe(6 * 3);
    expect(await snapshotOf(rig)).toEqual(before);
    expect(rig.app.links.isGone(A.playerId)).toBe(false);
  });
});

describe.each(KINDS)("`at` and the 10 minute replay bound on %s", (kind) => {
  it("POST /v1/link/code: exactly 10 minutes off is taken, 10 minutes and 1 ms or 1 s off is 422, in both directions", async () => {
    const rig = await open(kind);
    for (const d of [AT_WINDOW_MS, -AT_WINDOW_MS]) {
      const r = await requestCode(rig, A, NOW + d);
      expect(r.status, `at ${d >= 0 ? "+" : ""}${d}: ${r.text}`).toBe(200);
    }
    for (const d of [AT_WINDOW_MS + 1, AT_WINDOW_MS + 1000, -(AT_WINDOW_MS + 1), -(AT_WINDOW_MS + 1000), 3_600_000, -3_600_000]) {
      const r = await requestCode(rig, A, NOW + d);
      expect(r.status, `at ${d >= 0 ? "+" : ""}${d}`).toBe(422);
      expect(String(j(r).error)).toContain("10 minutes");
    }
  });

  it("the bound follows the SERVER's clock, not the first request's: after the clock moves 11 minutes an old `at` is 422 and a new one is 200", async () => {
    const rig = await open(kind);
    const stale = NOW;
    rig.clock.now += 11 * 60_000;
    expect((await requestCode(rig, A, stale)).status).toBe(422);
    expect((await requestCode(rig, A, rig.clock.now)).status).toBe(200);
  });

  it("redeem, delete, Steam and the profile read all hold the bound (10 minutes and 1 s off is 422, both ways) and a 422 spends nothing", async () => {
    const rig = await world(kind);
    const off = [AT_WINDOW_MS + 1000, -(AT_WINDOW_MS + 1000)];
    const code = String(j(await requestCode(rig, A)).code);
    const before = await snapshotOf(rig);
    for (const d of off) {
      expect((await redeemCode(rig, C, code, NOW + d)).status, `redeem ${d}`).toBe(422);
      const del = JSON.stringify({ at: NOW + d });
      expect((await call(rig, "DELETE", "/v1/player", A, DELETE_PREFIX, del)).status, `delete ${d}`).toBe(422);
      const st = JSON.stringify({ at: NOW + d, ticket: TICKET, identity: "bb", appid: 480 });
      expect((await call(rig, "POST", "/v1/link/steam", A, LINK_STEAM_PREFIX, st)).status, `steam ${d}`).toBe(422);
      expect((await readProfile(rig, A, NOW + d)).status, `profile read ${d}`).toBe(422);
    }
    expect(await snapshotOf(rig)).toEqual(before); // not deleted, not linked, no Steam account written
    expect(rig.app.links.isGone(A.playerId)).toBe(false);
    // and none of it was spent: the code still links, the ticket still works
    expect((await redeemCode(rig, C, code)).status).toBe(200);
    const ok = JSON.stringify({ at: NOW, ticket: TICKET, identity: "bb", appid: 480 });
    expect((await call(rig, "POST", "/v1/link/steam", A, LINK_STEAM_PREFIX, ok)).status).toBe(200);
  });

  it("the profile read holds the bound exactly: +10 minutes is 200, +10 minutes and 1 ms is 422; the digits are checked (400 for anything but at=<digits>)", async () => {
    const rig = await open(kind);
    expect((await readProfile(rig, A, NOW + AT_WINDOW_MS)).status).toBe(200);
    expect((await readProfile(rig, A, NOW - AT_WINDOW_MS)).status).toBe(200);
    expect((await readProfile(rig, A, NOW + AT_WINDOW_MS + 1)).status).toBe(422);
    expect((await readProfile(rig, A, NOW - AT_WINDOW_MS - 1)).status).toBe(422);
    for (const q of ["at=", "at=abc", "at=-5", "at=1.5", "at=0x10", "at=12345678901234567", "at=" + NOW + "&x=1", "x=" + NOW, "AT=" + NOW, "at=%31"]) {
      const r = await send(rig, "GET", `/v1/profile?${q}`, undefined, await signedBy(A, q, PROFILE_GET_PREFIX));
      expect(r.status, `${q}: ${r.text}`).toBe(400);
    }
  });

  it("`at` of the wrong kind is refused: a string, a float, a negative, null, true and 1e21 are 422 (the body is canonical, the signature right)", async () => {
    const rig = await open(kind);
    for (const text of [`{"at":"${NOW}"}`, `{"at":${NOW}.5}`, `{"at":-1}`, `{"at":null}`, `{"at":true}`, `{"at":1e+21}`, `{"at":[${NOW}]}`, `{"at":{"ms":${NOW}}}`]) {
      const r = await call(rig, "POST", "/v1/link/code", A, LINK_CODE_PREFIX, text);
      expect([400, 422], `${text} -> ${r.status} ${r.text}`).toContain(r.status);
      expect(r.status, text).not.toBe(200);
    }
    // the ones that parse to a canonical text are 422 exactly (the rest are 400: not the canonical text of what they parse to)
    for (const text of [`{"at":"${NOW}"}`, `{"at":${NOW}.5}`, `{"at":-1}`, `{"at":null}`, `{"at":true}`, `{"at":1e+21}`]) {
      expect((await call(rig, "POST", "/v1/link/code", A, LINK_CODE_PREFIX, text)).status, text).toBe(422);
    }
  });
});

describe.each(KINDS)("a body that is not the canonical bytes on %s", (kind) => {
  const N = NOW;
  const codeVariants = (): [string, string | Uint8Array<ArrayBuffer>][] => [
    ["a leading space", ` {"at":${N}}`],
    ["a trailing newline", `{"at":${N}}\n`],
    ["spaces inside", `{ "at": ${N} }`],
    ["pretty printed", JSON.stringify({ at: N }, null, 2)],
    ["the number spelled 1790000000000.0", `{"at":${N}.0}`],
    ["the number spelled 1.79e12", `{"at":1.79e12}`],
    ["a duplicate key", `{"at":${N},"at":${N}}`],
    ["an extra field", `{"at":${N},"x":1}`],
    ["the key spelled with an escape", `{"\\u0061t":${N}}`],
    ["no fields", `{}`],
    ["an array", `[${N}]`],
    ["a bare number", `${N}`],
    ["null", `null`],
    ["an empty body", ``],
    ["a byte order mark in front", Uint8Array.from([0xef, 0xbb, 0xbf, ...enc(`{"at":${N}}`)])],
    ["a byte that is not UTF-8 at the end", Uint8Array.from([...enc(`{"at":${N}}`), 0xff])],
  ];

  it("link/code and delete: every re-spelling of a right body, signed over its own exact bytes, is 400 (not 401, not a quiet success) and changes nothing", async () => {
    const rig = await world(kind);
    const before = await snapshotOf(rig);
    for (const [method, path, domain] of [["POST", "/v1/link/code", LINK_CODE_PREFIX], ["DELETE", "/v1/player", DELETE_PREFIX]] as const) {
      for (const [why, body] of codeVariants()) {
        const r = await call(rig, method, path, A, domain, body);
        expect(r.status, `${method} ${path}, ${why}: ${r.text}`).toBe(400);
      }
    }
    expect(await snapshotOf(rig)).toEqual(before);
    expect(rig.app.links.isGone(A.playerId)).toBe(false);
  });

  it("redeem: a re-ordered, re-escaped or re-spelled body is 400, a non-text code is 400, and none of them counts as a wrong code (ten of them, then a wrong code is still 403, not 429)", async () => {
    const rig = await world(kind);
    const code = String(j(await requestCode(rig, A)).code);
    const before = await snapshotOf(rig);
    const variants: [string, string][] = [
      ["fields re-ordered", `{"code":"${code}","at":${N}}`],
      ["a letter written as an escape", `{"at":${N},"code":"\\u0041${code.slice(1)}"}`],
      ["a trailing space", `{"at":${N},"code":"${code}"} `],
      ["pretty printed", JSON.stringify({ at: N, code }, null, 1)],
      ["an extra field", `{"at":${N},"code":"${code}","x":1}`],
      ["the code as a number", `{"at":${N},"code":12345678}`],
      ["the code as an array", `{"at":${N},"code":["${code}"]}`],
      ["the code missing", `{"at":${N}}`],
      ["the code null", `{"at":${N},"code":null}`],
      ["the number spelled 1790000000000.0", `{"at":${N}.0,"code":"${code}"}`],
    ];
    for (const [why, body] of variants) {
      const r = await call(rig, "POST", "/v1/link/redeem", C, LINK_REDEEM_PREFIX, body);
      expect(r.status, `${why}: ${r.text}`).toBe(400);
    }
    expect(await snapshotOf(rig)).toEqual(before);
    const wrong = await redeemCode(rig, C, "ZZZZ-ZZZZ");
    expect(wrong.status, wrong.text).toBe(403); // the ten 400s did not count toward the 5-wrong-codes limit
    expect((await redeemCode(rig, C, code)).status).toBe(200); // and the code was never spent
  });

  it("and the other order: a canonical body whose signature was made over a re-serialized copy is 401", async () => {
    const rig = await world(kind);
    const good = JSON.stringify({ at: N });
    const pretty = JSON.stringify({ at: N }, null, 2);
    const r = await call(rig, "POST", "/v1/link/code", A, LINK_CODE_PREFIX, good, pretty);
    expect(r.status, r.text).toBe(401);
  });
});

describe.each(KINDS)("GET /v1/profile signed over one query and sent with another on %s", (kind) => {
  it("the control: the signed query itself is 200 and answers the signer's player", async () => {
    const rig = await world(kind);
    const q = `at=${NOW}`;
    const r = await send(rig, "GET", `/v1/profile?${q}`, undefined, await signedBy(B, q, PROFILE_GET_PREFIX));
    expect(r.status, r.text).toBe(200);
    expect(j(r).player).toBe(A.playerId);
  });

  it("any other query than the signed one is 401: another `at`, an extra parameter in front or behind, a repeated at, a percent-encoded digit, a leading zero, a different case", async () => {
    const rig = await world(kind);
    const signed = `at=${NOW}`;
    const headers = await signedBy(A, signed, PROFILE_GET_PREFIX);
    const others = [
      `at=${NOW + 1}`, `at=${NOW - 1}`, `at=${NOW}&x=1`, `x=1&at=${NOW}`, `at=${NOW}&at=${NOW + 1}`, `at=${NOW}&at=${NOW}`, `at=0${NOW}`, `at=${NOW}%20`,
      `at=%31${String(NOW).slice(1)}`, `AT=${NOW}`, `at=${NOW}#frag`.replace("#frag", ""), `at=${NOW}&`, `&at=${NOW}`,
    ];
    for (const q of others) {
      if (q === signed) continue;
      const r = await send(rig, "GET", `/v1/profile?${q}`, undefined, headers);
      expect(r.status, `${q}: ${r.text}`).toBe(401);
    }
  });

  it("a signature made in another domain over the very same query, and one made by another key, is 401; the same headers on the right query then work", async () => {
    const rig = await world(kind);
    const q = `at=${NOW}`;
    for (const d of ALL.filter((x) => x !== PROFILE_GET_PREFIX)) {
      const r = await send(rig, "GET", `/v1/profile?${q}`, undefined, await signedBy(A, q, d));
      expect(r.status, JSON.stringify(d)).toBe(401);
    }
    const a = await signedBy(A, q, PROFILE_GET_PREFIX);
    const b = await signedBy(C, q, PROFILE_GET_PREFIX);
    const mixed = { ...a, "x-bb-sig": b["x-bb-sig"] }; // A's key with C's signature
    expect((await send(rig, "GET", `/v1/profile?${q}`, undefined, mixed)).status).toBe(401);
    expect((await send(rig, "GET", `/v1/profile?${q}`, undefined, a)).status).toBe(200);
  });

  it("a bare GET with no query and no headers is still the 405 it was; a signing header with no query is 401 or 400, never a profile", async () => {
    const rig = await world(kind);
    const bare = await send(rig, "GET", "/v1/profile");
    expect(bare.status).toBe(405);
    const headers = await signedBy(A, "", PROFILE_GET_PREFIX);
    const noQuery = await send(rig, "GET", "/v1/profile", undefined, headers);
    expect([400, 401]).toContain(noQuery.status);
    expect(noQuery.text).not.toContain("profile\":{");
  });
});

describe.each(KINDS)("the headers and the size limits on %s", (kind) => {
  it("no signing header is 401 before the body is read: a 1 MB body to link/code is 401, not 413; with valid headers the same body is 413", async () => {
    const rig = await world(kind);
    const big = "x".repeat(1_000_000);
    const bare = await send(rig, "POST", "/v1/link/code", big, { "content-type": "application/json" });
    expect(bare.status).toBe(401);
    const headers = await signedBy(A, big, LINK_CODE_PREFIX);
    const signed = await send(rig, "POST", "/v1/link/code", big, headers);
    expect(signed.status).toBe(413);
  });

  it("a missing or malformed x-bb-key / x-bb-sig is 401 on every new route; A's key with B's signature is 401", async () => {
    const rig = await world(kind);
    const body = JSON.stringify({ at: NOW });
    const ok = await signedBy(A, body, LINK_CODE_PREFIX);
    const other = await signedBy(B, body, LINK_CODE_PREFIX);
    const cases: [string, Record<string, string>][] = [
      ["no key", { "content-type": "application/json", "x-bb-sig": ok["x-bb-sig"] }],
      ["no signature", { "content-type": "application/json", "x-bb-key": ok["x-bb-key"] }],
      ["a signature that is not base64url", { ...ok, "x-bb-sig": "!!!!" }],
      ["a key that is too short", { ...ok, "x-bb-key": ok["x-bb-key"].slice(0, 40) }],
      ["a signature that is too short", { ...ok, "x-bb-sig": ok["x-bb-sig"].slice(0, 40) }],
      ["a signature one character too long", { ...ok, "x-bb-sig": ok["x-bb-sig"] + "A" }],
      ["A's key with B's signature", { ...ok, "x-bb-sig": other["x-bb-sig"] }],
      ["the empty header values", { ...ok, "x-bb-key": "", "x-bb-sig": "" }],
    ];
    for (const path of ["/v1/link/code", "/v1/link/redeem", "/v1/link/steam"]) {
      for (const [why, headers] of cases) {
        const r = await send(rig, "POST", path, body, headers);
        expect(r.status, `${path}, ${why}: ${r.text}`).toBe(401);
      }
    }
    for (const [why, headers] of cases) {
      const r = await send(rig, "DELETE", "/v1/player", body, headers);
      expect(r.status, `DELETE, ${why}`).toBe(401);
    }
    expect(rig.app.links.isGone(A.playerId)).toBe(false);
  });

  it("the wrong method on each new URL is 405, whatever the signature", async () => {
    const rig = await world(kind);
    const body = JSON.stringify({ at: NOW });
    for (const [method, path, domain] of [["GET", "/v1/link/code", LINK_CODE_PREFIX], ["PUT", "/v1/link/redeem", LINK_REDEEM_PREFIX], ["POST", "/v1/player", DELETE_PREFIX], ["GET", "/v1/player", DELETE_PREFIX], ["DELETE", "/v1/link/code", LINK_CODE_PREFIX]] as const) {
      const r = await send(rig, method, path, method === "GET" ? undefined : body, await signedBy(A, body, domain));
      expect(r.status, `${method} ${path}`).toBe(405);
    }
    expect(rig.app.links.isGone(A.playerId)).toBe(false);
  });
});
