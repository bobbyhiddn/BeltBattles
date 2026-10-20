// IDENT-1 step 8, the server half (REQ-BFG-122; BRIEF-IDENT1): POST /v1/link/steam and server/steamAuth.ts. There is no desktop client
// yet, so every test uses a fake verifier or a fake fetch and never the network. The route is off (501) unless BB_STEAM_WEB_API_KEY
// and BB_STEAM_APP_IDS are both set; an unknown Steam id maps to the signer's player and a known one links the signing key to that
// id's player (the redeem rules); a ticket is used once; the Web API key is never in a log line, an error or a response.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { LINK_STEAM_PREFIX, type Identity } from "../src/net/identity";
import { mergeWire } from "../src/net/profileWire";
import { ConfigError, readConfig } from "../server/config";
import { STEAM_AUTH_URL, STEAM_ID_PATTERN, TicketCache, steamConfigFromEnv, steamVerifier } from "../server/steamAuth";
import { testIdentity } from "./netIdentity";
import { NOW, earnedWire } from "./profileupWire";
import {
  bodyAt, closeRigs, deleteMe, fakeSteam, freshIdentity, identityRecords, linkSteamCall, linkVia, openRig, postGhost, profileStored, putWire, readProfile, requestCode,
  send, signedBy, uploadFor, type Kind, type Opts, type Reply, type Rig,
} from "./identRig";

let A: Identity, B: Identity, C: Identity, D: Identity;
beforeAll(async () => {
  [A, B, C, D] = await Promise.all([0, 1, 2, 3].map((n) => testIdentity(n)));
});
afterAll(closeRigs);

const KINDS: Kind[] = ["jsonl", "tigris"];
const BASE: Opts = { rateLimit: { windowMs: 60_000, max: 1_000_000 } };
const open = (kind: Kind, over: Opts = {}) => openRig(kind, { ...BASE, ...over });
const S1 = "76561198000000001";
const S2 = "76561198000000002";
const KEY = "STEAMKEY-SECRET-0123456789ABCDEF";
const NOT_CONFIGURED = { error: "steam linking is not configured" };
const j = (r: Reply): Record<string, unknown> => r.json ?? {};

/** A raw, correctly signed POST /v1/link/steam with exactly these fields (so a test can send a field of the wrong type). */
async function rawSteam(rig: Rig, id: Identity, fields: Record<string, unknown>, at = rig.clock.now): Promise<Reply> {
  const body = bodyAt(at, fields);
  return send(rig, "POST", "/v1/link/steam", body, await signedBy(id, body, LINK_STEAM_PREFIX));
}

// --------------------------------------------------------------------------------------------------------------- while off

describe("while Steam linking is not configured", () => {
  it("501 \"steam linking is not configured\" before anything else: unsigned, signed, malformed and with uploads closed alike", async () => {
    for (const over of [{}, { uploads: "closed" as const }]) {
      const rig = await open("jsonl", over);
      expect(await send(rig, "POST", "/v1/link/steam", "x".repeat(20_000))).toMatchObject({ status: 501, json: NOT_CONFIGURED }); // not even signed, nor read
      expect(await linkSteamCall(rig, A, "aa01", "bb-ghost", 480)).toMatchObject({ status: 501, json: NOT_CONFIGURED });
      expect(await rawSteam(rig, A, { ticket: 5 })).toMatchObject({ status: 501, json: NOT_CONFIGURED });
      expect(await rawSteam(rig, A, { ticket: "aa01", identity: "x", appid: 480 }, 5)).toMatchObject({ status: 501 }); // a bad clock too
      expect(Object.keys(await identityRecords(rig))).toEqual([]);
    }
  });

  it("the other routes work without it, and GET /v1/health does not mention Steam", async () => {
    const rig = await open("jsonl");
    expect((await requestCode(rig, A)).status).toBe(200);
    const health = await send(rig, "GET", "/v1/health");
    expect(health.status).toBe(200);
    expect(health.text).not.toMatch(/steam/i);
  });
});

// ------------------------------------------------------------------------------------------------------ with a verifier

describe.each(KINDS)("POST /v1/link/steam with a verifier on %s", (kind) => {
  it("an unknown Steam id maps to the signer's player, and survives a restart; a known one links a second device to it, merging its profile", async () => {
    const steam = fakeSteam({ aa01: S1, aa02: S1, aa03: S2, aa04: S1 });
    const rig = await open(kind, { steam });
    const wa = earnedWire({ runs: 6, bestDay: 4 });
    const wb = earnedWire({ runs: 3, bestDay: 9, duskWins: 12 }, { won: ["weaver"] }, { updatedAt: NOW + 1_000 });
    expect((await putWire(rig, wa, A)).status).toBe(200);
    const first = await linkSteamCall(rig, A, "aa01", "bb-ghost", 480);
    expect(first).toMatchObject({ status: 200, json: { player: A.playerId, profile: wa } });
    expect(Object.keys(first.json ?? {})).toEqual(["player", "profile"]);
    const records = await identityRecords(rig);
    expect(JSON.parse(records[`links/steam/${S1}.json`])).toEqual({ player: A.playerId, at: NOW });
    expect(JSON.parse(records[`players/${A.playerId}.json`])).toMatchObject({ keys: [], steam: [S1] });
    expect(steam.calls).toEqual([{ ticket: "aa01", identity: "bb-ghost", appid: 480 }]);
    expect(JSON.stringify(records)).not.toContain("aa01"); // the ticket is never stored

    await rig.restart({ ...BASE, steam });
    // a new PC: lone key B, with a profile of its own, shows the same Steam account (the demo App ID this time)
    expect((await putWire(rig, wb, B)).status).toBe(200);
    const second = await linkSteamCall(rig, B, "aa02", "bb-ghost", 481);
    expect(second).toMatchObject({ status: 200, json: { player: A.playerId, profile: mergeWire(wa, wb) } });
    expect(profileStored(rig, B.playerId)).toBe(false); // merged into the player's, then removed
    expect((await postGhost(rig, B, uploadFor(B, A.playerId))).status).toBe(201); // and B uploads under the player
    expect(await readProfile(rig, B)).toMatchObject({ status: 200, json: { player: A.playerId, profile: mergeWire(wa, wb) } });
    // the owner presenting its own account again changes nothing
    const before = await identityRecords(rig);
    expect(await linkSteamCall(rig, A, "aa04", "bb-ghost", 480)).toMatchObject({ status: 200, json: { player: A.playerId } });
    expect(await identityRecords(rig)).toEqual(before);
    // a second Steam account on the same player is fine
    expect((await linkSteamCall(rig, A, "aa03", "bb-ghost", 480)).status).toBe(200);
    expect(JSON.parse((await identityRecords(rig))[`players/${A.playerId}.json`])).toMatchObject({ steam: [S1, S2], keys: [B.playerId] });
  });

  it("a known Steam id does not re-point a key that is linked elsewhere, or one whose player has other keys: 409, and nothing changes", async () => {
    const steam = fakeSteam({ aa01: S1, aa02: S1, aa03: S1, aa04: S1 });
    const rig = await open(kind, { steam });
    const [E, F] = [await freshIdentity(), await freshIdentity()];
    expect((await linkSteamCall(rig, A, "aa01", "bb-ghost", 480)).status).toBe(200);
    expect((await linkVia(rig, E, B)).joined.status).toBe(200); // B belongs to E
    expect((await linkVia(rig, D, F)).joined.status).toBe(200); // D has a key, F
    const before = await identityRecords(rig);
    expect(await linkSteamCall(rig, B, "aa02", "bb-ghost", 480)).toMatchObject({ status: 409, json: { error: "this device is already linked to another player" } });
    expect(await linkSteamCall(rig, D, "aa03", "bb-ghost", 480)).toMatchObject({ status: 409, json: { error: "this device already has linked devices or a Steam account" } });
    expect(await identityRecords(rig)).toEqual(before);
    expect((await postGhost(rig, B, uploadFor(B, E.playerId, { runId: "b-1" }))).status).toBe(201); // B is still E's
    expect((await postGhost(rig, B, uploadFor(B, A.playerId, { runId: "b-2" }))).status).toBe(403);
    // a lone key still joins
    expect((await linkSteamCall(rig, C, "aa04", "bb-ghost", 480)).status).toBe(200);
  });

  it("a ticket is used once: the second time, by anybody, is 403 and Steam is not asked again", async () => {
    const steam = fakeSteam({ aa01: S1, aa02: S2 });
    const rig = await open(kind, { steam });
    expect((await linkSteamCall(rig, A, "aa01", "bb-ghost", 480)).status).toBe(200);
    expect(await linkSteamCall(rig, A, "aa01", "bb-ghost", 480)).toMatchObject({ status: 403, json: { error: "that Steam ticket was used already" } });
    expect(await linkSteamCall(rig, B, "aa01", "bb-ghost", 480)).toMatchObject({ status: 403, json: { error: "that Steam ticket was used already" } });
    expect(await linkSteamCall(rig, B, "AA01", "bb-ghost", 480)).toMatchObject({ status: 403 }); // hex is not case sensitive
    expect(steam.calls).toHaveLength(1);
    expect((await linkSteamCall(rig, B, "aa02", "bb-ghost", 480)).status).toBe(200); // another ticket is another matter
  });

  it("Steam unavailable is 502 and the ticket may be tried again; Steam refusing a ticket is 403 and it may be tried again too", async () => {
    const steam = fakeSteam({ aa01: S1 });
    const rig = await open(kind, { steam });
    steam.unavailable.add("aa01");
    expect(await linkSteamCall(rig, A, "aa01", "bb-ghost", 480)).toMatchObject({ status: 502, json: { error: "Steam could not be asked just now, try again shortly" } });
    expect((await linkSteamCall(rig, A, "aa01", "bb-ghost", 480)).status).toBe(200); // released: the same ticket works now
    expect(steam.calls).toHaveLength(2);
    const refused = await linkSteamCall(rig, A, "ff99", "bb-ghost", 480);
    expect(refused).toMatchObject({ status: 403, json: { error: "steam refused the ticket (code 3)" } });
    expect((await linkSteamCall(rig, A, "ff99", "bb-ghost", 480)).status).toBe(403); // asked again, refused again (not "used already")
    expect(steam.calls.filter((c) => c.ticket === "ff99")).toHaveLength(2);
    expect(Object.keys(await identityRecords(rig)).filter((k) => k.includes("steam"))).toEqual([`links/steam/${S1}.json`]);
  });

  it("an App ID outside the list is 403 and Steam is not asked; a key the player deleted is 410", async () => {
    const steam = fakeSteam({ aa01: S1 });
    const rig = await open(kind, { steam });
    expect(await linkSteamCall(rig, A, "aa01", "bb-ghost", 999)).toMatchObject({ status: 403, json: { error: "appid: not one of this game's App IDs" } });
    expect(steam.calls).toHaveLength(0);
    expect((await deleteMe(rig, A)).status).toBe(200);
    expect(await linkSteamCall(rig, A, "aa01", "bb-ghost", 480)).toMatchObject({ status: 410 });
    expect(Object.keys(await identityRecords(rig)).filter((k) => k.startsWith("links/steam/"))).toEqual([]);
  });
});

describe("the route's request checks", () => {
  it("a ticket that is not hex, an identity with spaces, an App ID that is not a number, a wrong field order: 400, and Steam is not asked", async () => {
    const steam = fakeSteam({ aa01: S1 });
    const rig = await open("jsonl", { steam });
    const ok = { ticket: "aa01", identity: "bb-ghost", appid: 480 };
    const cases: [string, Record<string, unknown>, string][] = [
      ["a ticket that is not hex", { ...ok, ticket: "zz" }, "ticket: expected a hex session ticket"],
      ["an odd number of hex digits", { ...ok, ticket: "abc" }, "ticket: expected a hex session ticket"],
      ["an empty ticket", { ...ok, ticket: "" }, "ticket: expected a hex session ticket"],
      ["a ticket over 4096 hex digits", { ...ok, ticket: "a".repeat(4098) }, "ticket: expected a hex session ticket"],
      ["a ticket that is a number", { ...ok, ticket: 12 }, "ticket: expected a hex session ticket"],
      ["an identity with a space", { ...ok, identity: "a b" }, "identity: expected 1 to 64 printable characters, no spaces"],
      ["an empty identity", { ...ok, identity: "" }, "identity: expected 1 to 64 printable characters, no spaces"],
      ["an identity of 65 characters", { ...ok, identity: "x".repeat(65) }, "identity: expected 1 to 64 printable characters, no spaces"],
      ["an identity that is not ASCII", { ...ok, identity: "café" }, "identity: expected 1 to 64 printable characters, no spaces"],
      ["an App ID as text", { ...ok, appid: "480" }, "appid: expected a Steam App ID"],
      ["App ID 0", { ...ok, appid: 0 }, "appid: expected a Steam App ID"],
      ["a fractional App ID", { ...ok, appid: 1.5 }, "appid: expected a Steam App ID"],
      ["a negative App ID", { ...ok, appid: -480 }, "appid: expected a Steam App ID"],
      ["fields in another order", { identity: "bb-ghost", ticket: "aa01", appid: 480 }, "body: expected exactly at, ticket, identity, appid, in that order"],
      ["a field short", { ticket: "aa01", identity: "bb-ghost" }, "body: expected exactly at, ticket, identity, appid, in that order"],
      ["a field over", { ...ok, extra: 1 }, "body: expected exactly at, ticket, identity, appid, in that order"],
    ];
    for (const [name, fields, error] of cases) expect(await rawSteam(rig, A, fields), name).toMatchObject({ status: 400, json: { error } });
    expect(steam.calls).toHaveLength(0);
    // a signed body over 8 KB is read as far as the limit and refused
    const big = bodyAt(rig.clock.now, { ...ok, ticket: "a".repeat(8200) });
    expect((await send(rig, "POST", "/v1/link/steam", big, await signedBy(A, big, LINK_STEAM_PREFIX))).status).toBe(413);
    // the boundary: 4096 hex digits are a ticket
    expect(await rawSteam(rig, A, { ...ok, ticket: "a".repeat(4096) })).toMatchObject({ status: 403, json: { error: "steam refused the ticket (code 3)" } }); // unknown to the fake: asked, refused
    expect(steam.calls).toHaveLength(1);
  });
});

// -------------------------------------------------------------------------------------------------- the real verifier

interface Call {
  url: string;
  init: RequestInit | undefined;
}

/** A fetch that records its calls and answers with `respond`. */
function fakeFetch(respond: (url: string, init?: RequestInit) => Response | Promise<Response>): { fetch: typeof fetch; calls: Call[] } {
  const calls: Call[] = [];
  const f = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
    calls.push({ url, init });
    return respond(url, init);
  }) as typeof fetch;
  return { fetch: f, calls };
}

const ok = (steamid: string): Response =>
  new Response(JSON.stringify({ response: { params: { result: "OK", steamid, ownersteamid: steamid, vacbanned: false, publisherbanned: false } } }), { status: 200 });

describe("the real verifier, over a fake fetch", () => {
  const cfg = { webApiKey: KEY, appIds: [480, 481] };

  it("asks partner.steam-api.com's AuthenticateUserTicket with key, appid, ticket and identity, and reads response.params.steamid", async () => {
    const f = fakeFetch(() => ok(S1));
    const v = steamVerifier(cfg, f.fetch);
    expect(v.appIds).toEqual([480, 481]);
    expect(await v.verify("aa01", "bb-ghost", 480)).toEqual({ ok: true, steamId: S1 });
    expect(f.calls).toHaveLength(1);
    const u = new URL(f.calls[0].url);
    expect(`${u.origin}${u.pathname}`).toBe("https://partner.steam-api.com/ISteamUserAuth/AuthenticateUserTicket/v1/");
    expect(STEAM_AUTH_URL).toBe("https://partner.steam-api.com/ISteamUserAuth/AuthenticateUserTicket/v1/");
    expect([...u.searchParams.keys()].sort()).toEqual(["appid", "identity", "key", "ticket"]);
    expect(u.searchParams.get("key")).toBe(KEY);
    expect(u.searchParams.get("appid")).toBe("480");
    expect(u.searchParams.get("ticket")).toBe("aa01");
    expect(u.searchParams.get("identity")).toBe("bb-ghost");
    expect(f.calls[0].init?.method).toBe("GET");
    expect(f.calls[0].init?.body).toBeUndefined();
    // the demo App ID is the same game
    expect(await v.verify("aa02", "bb-ghost", 481)).toEqual({ ok: true, steamId: S1 });
    expect(new URL(f.calls[1].url).searchParams.get("appid")).toBe("481");
  });

  it("an App ID that is not the game's is refused without asking Steam", async () => {
    const f = fakeFetch(() => ok(S1));
    const v = steamVerifier(cfg, f.fetch);
    expect(await v.verify("aa01", "bb-ghost", 999)).toEqual({ ok: false, error: "appid: not one of this game's App IDs" });
    expect(f.calls).toHaveLength(0);
  });

  it("every answer but a clean OK is a value: a refusal, or Steam unavailable; none carries the key", async () => {
    const answers: [string, (url: string) => Response | Promise<Response>, { ok: false; unavailable?: true; error: RegExp }][] = [
      ["an error object", () => new Response('{"response":{"error":{"errorcode":3,"errordesc":"Invalid ticket"}}}', { status: 200 }), { ok: false, error: /^steam refused the ticket \(code 3\)$/ }],
      ["a result that is not OK", () => new Response('{"response":{"params":{"result":"Failure"}}}', { status: 200 }), { ok: false, error: /^steam refused the ticket$/ }],
      ["a steamid that is not a SteamID", () => new Response('{"response":{"params":{"result":"OK","steamid":"123"}}}', { status: 200 }), { ok: false, error: /^steam refused the ticket$/ }],
      ["a steamid that is a number", () => new Response('{"response":{"params":{"result":"OK","steamid":76561198000000001}}}', { status: 200 }), { ok: false, error: /^steam refused the ticket$/ }],
      ["an empty object", () => new Response("{}", { status: 200 }), { ok: false, error: /^steam refused the ticket$/ }],
      ["HTTP 500", () => new Response("oops", { status: 500 }), { ok: false, unavailable: true, error: /^steam answered HTTP 500$/ }],
      ["HTTP 503", () => new Response("down", { status: 503 }), { ok: false, unavailable: true, error: /^steam answered HTTP 503$/ }],
      ["HTTP 429", () => new Response("{}", { status: 429 }), { ok: false, unavailable: true, error: /^steam is busy$/ }],
      ["text that is not JSON", () => new Response("<html>hi</html>", { status: 200 }), { ok: false, unavailable: true, error: /^steam answered something that is not JSON$/ }],
      ["a thrown error that names the request", (url) => { throw new Error(`connect ECONNREFUSED ${url}`); }, { ok: false, unavailable: true, error: /^steam could not be reached$/ }],
      ["a rejection that names the key", (url) => Promise.reject(new TypeError(`fetch failed: ${url}`)), { ok: false, unavailable: true, error: /^steam could not be reached$/ }],
    ];
    for (const [name, respond, want] of answers) {
      const f = fakeFetch(respond);
      const r = await steamVerifier(cfg, f.fetch).verify("aa01", "bb-ghost", 480);
      expect(r.ok, name).toBe(false);
      if (r.ok) continue;
      expect(r.error, name).toMatch(want.error);
      expect(r.unavailable === true, name).toBe(want.unavailable === true);
      expect(JSON.stringify(r), name).not.toContain(KEY);
    }
  });

  it("a Steam that does not answer in time is unavailable (the request is aborted), and says only that", async () => {
    const f = fakeFetch((_url, init) => new Promise<Response>((_resolve, reject) => {
      init?.signal?.addEventListener("abort", () => reject(Object.assign(new Error(`aborted ${KEY}`), { name: "AbortError" })));
    }));
    const r = await steamVerifier(cfg, f.fetch, 30).verify("aa01", "bb-ghost", 480);
    expect(r).toEqual({ ok: false, error: "steam did not answer in time", unavailable: true });
    expect(f.calls[0].init?.signal?.aborted).toBe(true);
  });

  it("through the route: the Web API key is in no response and no log line, whatever Steam does", async () => {
    const responders: ((url: string) => Response)[] = [
      () => ok(S1),
      () => new Response('{"response":{"error":{"errorcode":5,"errordesc":"x"}}}', { status: 200 }),
      () => new Response("down", { status: 502 }),
      () => new Response("<html>", { status: 200 }),
      (url) => {
        throw new Error(`connect ECONNREFUSED ${url}`);
      },
    ];
    let n = 0;
    const f = fakeFetch((url) => responders[n++](url));
    const rig = await open("jsonl", { steam: steamVerifier(cfg, f.fetch) });
    const texts: string[] = [];
    const statuses: number[] = [];
    for (let i = 0; i < responders.length; i++) {
      const r = await linkSteamCall(rig, A, `deadbeef0${i}`, "bb-ghost", 480);
      statuses.push(r.status);
      texts.push(r.text);
    }
    expect(statuses).toEqual([200, 403, 502, 502, 502]);
    expect(f.calls).toHaveLength(5);
    expect(f.calls.every((c) => new URL(c.url).searchParams.get("key") === KEY)).toBe(true); // it was sent to Steam, and only there
    const everything = [...texts, ...rig.log, JSON.stringify(await identityRecords(rig))].join("\n");
    expect(everything).not.toContain(KEY);
    expect(everything).not.toContain(encodeURIComponent(KEY));
    expect(everything).not.toContain("deadbeef"); // nor a ticket
    expect(texts[1]).toBe('{"error":"steam refused the ticket (code 5)"}'); // Steam's own words (errordesc) are not passed on
  });
});

// ------------------------------------------------------------------------------------------------------------- config

describe("BB_STEAM_WEB_API_KEY and BB_STEAM_APP_IDS", () => {
  it("Steam linking is on only when both are set", () => {
    expect(steamConfigFromEnv({})).toBeNull();
    expect(steamConfigFromEnv({ BB_STEAM_WEB_API_KEY: KEY })).toBeNull();
    expect(steamConfigFromEnv({ BB_STEAM_APP_IDS: "480" })).toBeNull();
    expect(steamConfigFromEnv({ BB_STEAM_WEB_API_KEY: "", BB_STEAM_APP_IDS: "480" })).toBeNull();
    expect(steamConfigFromEnv({ BB_STEAM_WEB_API_KEY: "   ", BB_STEAM_APP_IDS: "480" })).toBeNull();
    expect(steamConfigFromEnv({ BB_STEAM_WEB_API_KEY: KEY, BB_STEAM_APP_IDS: "" })).toBeNull();
    expect(steamConfigFromEnv({ BB_STEAM_WEB_API_KEY: ` ${KEY} `, BB_STEAM_APP_IDS: "480" })).toEqual({ webApiKey: KEY, appIds: [480] });
    expect(steamConfigFromEnv({ BB_STEAM_WEB_API_KEY: KEY, BB_STEAM_APP_IDS: "480, 481 ,480,," })).toEqual({ webApiKey: KEY, appIds: [480, 481] });
  });

  it("a bad App ID list is an error that never echoes the key", () => {
    for (const ids of ["480,abc", "0", "-5", "480;481", "4.8", "99999999999", "0x1e0"]) {
      let message = "";
      try {
        steamConfigFromEnv({ BB_STEAM_WEB_API_KEY: KEY, BB_STEAM_APP_IDS: ids });
      } catch (e) {
        message = e instanceof Error ? e.message : String(e);
      }
      expect(message, ids).toBe("BB_STEAM_APP_IDS must be a comma list of App IDs (digits only)");
      expect(message).not.toContain(KEY);
    }
  });

  it("readConfig carries it as `steam`, null while off, and a bad list stops the start with a ConfigError that does not name the key", () => {
    expect(readConfig([], {}).steam).toBeNull();
    expect(readConfig([], { BB_STEAM_WEB_API_KEY: KEY }).steam).toBeNull();
    expect(readConfig([], { BB_STEAM_WEB_API_KEY: KEY, BB_STEAM_APP_IDS: "480,481" }).steam).toEqual({ webApiKey: KEY, appIds: [480, 481] });
    let error: unknown = null;
    try {
      readConfig([], { BB_STEAM_WEB_API_KEY: KEY, BB_STEAM_APP_IDS: "nope" });
    } catch (e) {
      error = e;
    }
    expect(error).toBeInstanceOf(ConfigError);
    expect((error as Error).message).toBe("BB_STEAM_APP_IDS must be a comma list of App IDs (digits only)");
    expect((error as Error).message).not.toContain(KEY);
  });

  it("a SteamID is 17 digits starting 7656119", () => {
    expect(STEAM_ID_PATTERN.test(S1)).toBe(true);
    for (const bad of ["", "123", "76561198", "7656119800000000", "765611980000000012", "86561198000000001", "7656119800000000x"]) expect(STEAM_ID_PATTERN.test(bad), bad).toBe(false);
  });
});

describe("TicketCache", () => {
  it("a ticket is accepted once (any case); release lets it try again; it is forgotten after its time", () => {
    const c = new TicketCache(1000, 100);
    expect(c.use("aa01", 0)).toBe(true);
    expect(c.use("aa01", 1)).toBe(false);
    expect(c.use("AA01", 2)).toBe(false);
    c.release("Aa01");
    expect(c.use("aa01", 3)).toBe(true);
    expect(c.use("aa01", 999 + 3)).toBe(false); // 999 ms after it was used
    expect(c.use("aa01", 1003)).toBe(true); // 1000 ms: forgotten
  });

  it("holds a bounded number: the oldest go first", () => {
    const c = new TicketCache(1_000_000, 3);
    for (let i = 1; i <= 5; i++) expect(c.use(`aa0${i}`, i)).toBe(true);
    expect(c.use("aa05", 6)).toBe(false); // the newest is still held
    expect(c.use("aa01", 7)).toBe(true); // the oldest was let go
  });
});
