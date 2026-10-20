// VERIFY-IDENT1 (REQ-BFG-122) step 4f, written by the independent checker (cap_zeta): STEAM, WITH FAKES ONLY (a fake verifier and a fake
// fetch; no network, no key, no account). With either env var unset the route is 501 before anything else; a ticket used twice is refused
// the second time; Steam unreachable is 502 and the ticket can be used again; the Web API key never shows in a reply, an error or a log
// line, whatever Steam or the network does; and the rules for a known Steam account. Both backing stores.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { LINK_STEAM_PREFIX, type Identity } from "../src/net/identity";
import { ConfigError, readConfig } from "../server/config";
import { STEAM_AUTH_URL, TicketCache, steamConfigFromEnv, steamVerifier, type SteamVerifier } from "../server/steamAuth";
import { testIdentity } from "./netIdentity";
import { NOW } from "./profileupWire";
import {
  closeRigs, deleteMe, fakeSteam, freshIdentity, identityRecords, linkSteamCall, linkVia, openRig, postGhost, putWire, requestCode, send, signedBy,
  uploadFor, type Kind, type Opts, type Reply, type Rig,
} from "./identRig";
import { earnedWire } from "./profileupWire";

let A: Identity, B: Identity, C: Identity, D: Identity;
beforeAll(async () => {
  [A, B, C, D] = await Promise.all([0, 1, 2, 3].map((n) => testIdentity(n)));
});
afterAll(closeRigs);

const KINDS: Kind[] = ["jsonl", "tigris"];
const open = (kind: Kind, over: Opts = {}) => openRig(kind, { rateLimit: { windowMs: 60_000, max: 1_000_000 }, ...over });
const j = (r: Reply): Record<string, unknown> => r.json ?? {};
const S1 = "76561198000000001", S2 = "76561198000000002", S3 = "76561198000000003";
const KEY = "SENTINEL_KEY_9f8e7d6c5b4a3210";
const steamRecords = async (rig: Rig) => Object.keys(await identityRecords(rig)).filter((k) => k.startsWith("links/steam/"));

describe("with either env var unset the route is 501, before anything else", () => {
  it("steamConfigFromEnv: off unless BOTH are set (and not blank); a bad App ID list is an error that never holds the key", () => {
    expect(steamConfigFromEnv({})).toBeNull();
    expect(steamConfigFromEnv({ BB_STEAM_WEB_API_KEY: KEY })).toBeNull();
    expect(steamConfigFromEnv({ BB_STEAM_APP_IDS: "480" })).toBeNull();
    expect(steamConfigFromEnv({ BB_STEAM_WEB_API_KEY: "  ", BB_STEAM_APP_IDS: "480" })).toBeNull();
    expect(steamConfigFromEnv({ BB_STEAM_WEB_API_KEY: KEY, BB_STEAM_APP_IDS: " " })).toBeNull();
    expect(steamConfigFromEnv({ BB_STEAM_WEB_API_KEY: "", BB_STEAM_APP_IDS: "" })).toBeNull();
    expect(steamConfigFromEnv({ BB_STEAM_WEB_API_KEY: KEY, BB_STEAM_APP_IDS: "480, 481 ,480" })).toEqual({ webApiKey: KEY, appIds: [480, 481] });
    for (const bad of ["abc", "0", "-1", "4.5", "99999999999", "480,,x", "480;481", ","]) {
      let message: string | null = null;
      let accepted: unknown = null;
      try {
        accepted = steamConfigFromEnv({ BB_STEAM_WEB_API_KEY: KEY, BB_STEAM_APP_IDS: bad });
      } catch (e) {
        message = e instanceof Error ? e.message : String(e);
      }
      expect(accepted, `BB_STEAM_APP_IDS=${JSON.stringify(bad)} must not be accepted`).toBeNull();
      expect(message, `BB_STEAM_APP_IDS=${JSON.stringify(bad)} must stop the start`).not.toBeNull();
      expect(message, `BB_STEAM_APP_IDS=${JSON.stringify(bad)}: the key is never in the message`).not.toContain(KEY);
    }
  });

  it("readConfig: the steam block is null unless both are set; a bad list is a ConfigError whose text holds no key", () => {
    const base = ["--data", "/tmp/none"];
    const env = (e: Record<string, string>) => ({ BB_GHOST_STORE: "jsonl", ...e });
    expect(readConfig(base, env({})).steam).toBeNull();
    expect(readConfig(base, env({ BB_STEAM_WEB_API_KEY: KEY })).steam).toBeNull();
    expect(readConfig(base, env({ BB_STEAM_APP_IDS: "480" })).steam).toBeNull();
    expect(readConfig(base, env({ BB_STEAM_WEB_API_KEY: KEY, BB_STEAM_APP_IDS: "480,481" })).steam).toEqual({ webApiKey: KEY, appIds: [480, 481] });
    let thrown: unknown;
    try {
      readConfig(base, env({ BB_STEAM_WEB_API_KEY: KEY, BB_STEAM_APP_IDS: "four-eighty" }));
    } catch (e) {
      thrown = e;
    }
    expect(thrown).toBeInstanceOf(ConfigError);
    expect(String((thrown as Error).message)).not.toContain(KEY);
  });

  it.each(KINDS)("%s: with Steam off, POST /v1/link/steam is 501 'steam linking is not configured' whatever it carries: nothing, junk, a good signature, a huge body, uploads closed", async (kind) => {
    const rig = await open(kind); // no steam option: as main.ts starts it without both env vars
    const good = JSON.stringify({ at: NOW, ticket: "aa01", identity: "bb", appid: 480 });
    const cases: [string, string | undefined, Record<string, string>][] = [
      ["nothing at all", undefined, {}],
      ["junk headers and a junk body", "not json", { "x-bb-key": "x", "x-bb-sig": "y" }],
      ["a good signature in the right domain", good, await signedBy(A, good, LINK_STEAM_PREFIX)],
      ["a good signature in the wrong domain", good, await signedBy(A, good, "bb-link-code-1\n")],
      ["a 1 MB body", "x".repeat(1_000_000), { "content-type": "application/json" }],
    ];
    for (const [why, body, headers] of cases) {
      const r = await send(rig, "POST", "/v1/link/steam", body, headers);
      expect(r.status, `${why}: ${r.text}`).toBe(501);
      expect(r.json).toEqual({ error: "steam linking is not configured" });
    }
    await rig.restart({ rateLimit: { windowMs: 60_000, max: 1_000_000 }, uploads: "closed" });
    const closed = await send(rig, "POST", "/v1/link/steam", good, await signedBy(A, good, LINK_STEAM_PREFIX));
    expect(closed.status, "uploads closed does not come first").toBe(501);
    expect(await steamRecords(rig)).toEqual([]);
  });
});

describe.each(KINDS)("a ticket is used once, on %s", (kind) => {
  it("the second use is refused (the same key, another key, the ticket spelled in capitals); the verifier was asked once; nothing else linked", async () => {
    const steam = fakeSteam({ aa01: S1, bb02: S2 });
    const rig = await open(kind, { steam });
    const first = await linkSteamCall(rig, A, "aa01", "bb-ghost", 480);
    expect(first.status, first.text).toBe(200);
    expect(j(first).player).toBe(A.playerId);
    for (const [who, ticket] of [[A, "aa01"], [B, "aa01"], [B, "AA01"], [C, "Aa01"]] as const) {
      const r = await linkSteamCall(rig, who, ticket, "bb-ghost", 480);
      expect(r.status, `${ticket}: ${r.text}`).toBe(403);
      expect(r.json).toEqual({ error: "that Steam ticket was used already" });
    }
    expect(steam.calls.filter((c) => c.ticket.toLowerCase() === "aa01")).toHaveLength(1);
    expect(await steamRecords(rig)).toEqual([`links/steam/${S1}.json`]);
    expect((await linkSteamCall(rig, B, "bb02", "bb-ghost", 480)).status, "a different ticket is a different use").toBe(200);
  });

  it("two parallel requests with one new ticket: one 200, one 403, one question to Steam", async () => {
    const steam = fakeSteam({ aa01: S1 });
    const rig = await open(kind, { steam });
    const rs = await Promise.all([linkSteamCall(rig, A, "aa01", "x", 480), linkSteamCall(rig, B, "aa01", "x", 480), linkSteamCall(rig, C, "aa01", "x", 480)]);
    expect(rs.map((r) => r.status).sort(), rs.map((r) => r.text).join(" | ")).toEqual([200, 403, 403]);
    expect(steam.calls).toHaveLength(1);
  });

  it("the ticket's own shape is checked first: bad hex, an odd length, too long, a bad identity, a bad App ID are 400; a foreign App ID is 403 and spends nothing", async () => {
    const steam = fakeSteam({ aa01: S1 });
    const rig = await open(kind, { steam });
    const bad: [string, string, string, unknown, number][] = [
      ["not hex", "zz11", "x", 480, 400], ["odd length", "aa0", "x", 480, 400], ["one byte short", "a", "x", 480, 400], ["empty", "", "x", 480, 400],
      ["over 4096 hex digits", "a".repeat(4098), "x", 480, 400], ["identity with a space", "aa01", "has space", 480, 400], ["empty identity", "aa01", "", 480, 400],
      ["identity over 64", "aa01", "i".repeat(65), 480, 400], ["App ID 0", "aa01", "x", 0, 400], ["App ID negative", "aa01", "x", -480, 400],
      ["App ID a float", "aa01", "x", 480.5, 400], ["App ID as text", "aa01", "x", "480", 400], ["a foreign App ID", "aa01", "x", 9999, 403],
    ];
    for (const [why, ticket, identity, appid, want] of bad) {
      const r = await linkSteamCall(rig, A, ticket, identity, appid as number);
      expect(r.status, `${why}: ${r.text}`).toBe(want);
    }
    expect(steam.calls, "Steam was never asked about any of them").toHaveLength(0);
    expect((await linkSteamCall(rig, A, "aa01", "x", 480)).status, "and the ticket was never spent").toBe(200);
  });

  it("a restart forgets the used tickets (they live in memory), so only Steam's own refusal of a reused ticket stops a replay after a restart", async () => {
    // a verifier that behaves like Steam: a ticket works once
    const spent = new Set<string>();
    const steam: SteamVerifier = {
      appIds: [480],
      async verify(ticket) {
        if (spent.has(ticket)) return { ok: false, error: "steam refused the ticket (code 3)" };
        spent.add(ticket);
        return { ok: true, steamId: S1 };
      },
    };
    const rig = await open(kind, { steam });
    expect((await linkSteamCall(rig, A, "cc03", "x", 480)).status).toBe(200);
    expect((await linkSteamCall(rig, A, "cc03", "x", 480)).status, "same process: our own cache").toBe(403);
    await rig.restart({ rateLimit: { windowMs: 60_000, max: 1_000_000 }, steam });
    const after = await linkSteamCall(rig, A, "cc03", "x", 480);
    expect(after.status, "after a restart our cache is empty; Steam's answer decides").toBe(403);
    expect(String(j(after).error)).toContain("steam refused");
  });
});

describe.each(KINDS)("Steam unreachable, on %s", (kind) => {
  it("502 and the ticket can still be used; nothing is written; a Steam refusal is a 403 and the ticket is free again too", async () => {
    const steam = fakeSteam({ aa01: S1 });
    const rig = await open(kind, { steam });
    for (let i = 0; i < 3; i++) {
      steam.unavailable.add("aa01");
      const r = await linkSteamCall(rig, A, "aa01", "x", 480);
      expect(r.status, r.text).toBe(502);
      expect(r.json).toEqual({ error: "Steam could not be asked just now, try again shortly" });
      expect(await steamRecords(rig)).toEqual([]);
    }
    const ok = await linkSteamCall(rig, A, "aa01", "x", 480);
    expect(ok.status, `after three 502s the same ticket still works: ${ok.text}`).toBe(200);
    const refused = await linkSteamCall(rig, B, "ee05", "x", 480); // unknown to the fake: Steam refuses it
    expect(refused.status, refused.text).toBe(403);
    expect(String(j(refused).error)).toContain("steam refused");
    steam.calls.length = 0;
    const again = await linkSteamCall(rig, B, "ee05", "x", 480);
    expect(again.status).toBe(403);
    expect(steam.calls, "a refused ticket is asked about again (not remembered as used)").toHaveLength(1);
  });

  const reply = (status: number, body: unknown, raw = false) => async () => new Response(raw ? String(body) : JSON.stringify(body), { status });
  const OK = { response: { params: { result: "OK", steamid: S1 } } };

  it("the real verifier over a fake fetch: network error, HTTP 500, 503, 429, non-JSON and a hang are all 502 (ticket reusable); Steam's refusal and a bad SteamID are 403; an OK answer links", async () => {
    const outcomes: [string, (...a: never[]) => Promise<Response>, number][] = [
      ["a network error", async () => { throw new TypeError(`fetch failed: ${STEAM_AUTH_URL}?key=${KEY}&appid=480`); }, 502],
      ["HTTP 500", reply(500, "boom", true), 502],
      ["HTTP 503", reply(503, { error: "busy" }), 502],
      ["HTTP 429", reply(429, { response: {} }), 502],
      ["HTTP 200 that is not JSON", reply(200, "<html>captive portal</html>", true), 502],
      ["a hang (fetch honours its abort signal, as the real one does)", ((_url: string, init?: RequestInit) => new Promise<Response>((_, reject) => {
        init?.signal?.addEventListener("abort", () => reject(Object.assign(new Error("This operation was aborted"), { name: "AbortError" })));
      })) as unknown as () => Promise<Response>, 502],
      ["Steam says the ticket is bad", reply(200, { response: { error: { errorcode: 3, errordesc: `Invalid ticket for key ${KEY}` } } }), 403],
      ["Steam answers OK with a bad SteamID", reply(200, { response: { params: { result: "OK", steamid: "123" } } }), 403],
      ["Steam answers a result that is not OK", reply(200, { response: { params: { result: "Fail", steamid: S1 } } }), 403],
    ];
    const log: string[] = [];
    const texts: string[] = [];
    for (const [why, fetchFn, want] of outcomes) {
      const verifier = steamVerifier({ webApiKey: KEY, appIds: [480] }, fetchFn as unknown as typeof fetch, 80);
      const rig = await open(kind, { steam: verifier });
      const t0 = Date.now();
      const r = await linkSteamCall(rig, A, "dd04", "x", 480);
      texts.push(r.text, JSON.stringify([...r.headers.entries()]));
      log.push(...rig.log);
      expect(r.status, `${why}: ${r.text}`).toBe(want);
      expect(Date.now() - t0, `${why}: answered in good time`).toBeLessThan(5000);
      const again = await linkSteamCall(rig, A, "dd04", "x", 480);
      expect(String(j(again).error ?? ""), `${why}: the ticket was not spent, so the second try is answered by Steam's side again, not 'used already'`).not.toContain("used already");
      expect(again.status, `${why}: the second try gets the same answer as the first`).toBe(want);
      texts.push(again.text);
      log.push(...rig.log);
      await rig.close();
    }
    const ok = steamVerifier({ webApiKey: KEY, appIds: [480] }, reply(200, OK) as unknown as typeof fetch);
    const rig = await open(kind, { steam: ok });
    const linked = await linkSteamCall(rig, A, "dd04", "x", 480);
    expect(linked.status, linked.text).toBe(200);
    texts.push(linked.text);
    log.push(...rig.log);
    // the key: in no reply, no header, no error, no log line, in any common spelling
    const everything = [...texts, ...log, JSON.stringify(await identityRecords(rig))].join("\n");
    for (const form of [KEY, encodeURIComponent(KEY), KEY.toLowerCase(), btoa(KEY), "SENTINEL"]) {
      expect(everything.includes(form), `${form} appears in a reply, a log line or the store`).toBe(false);
    }
  });

  it("the real verifier asks Steam as documented: GET partner.steam-api.com ... AuthenticateUserTicket/v1 with key, appid, ticket and identity, and reads response.params.steamid; the key only goes out in that one request", async () => {
    const seen: { url: string; method: string }[] = [];
    const fetchFn = (async (input: string, init?: RequestInit) => {
      seen.push({ url: String(input), method: String(init?.method) });
      return new Response(JSON.stringify(OK), { status: 200 });
    }) as unknown as typeof fetch;
    const rig = await open(kind, { steam: steamVerifier({ webApiKey: KEY, appIds: [480, 481] }, fetchFn) });
    const r = await linkSteamCall(rig, A, "ab12", "my-identity", 481);
    expect(r.status, r.text).toBe(200);
    expect(seen).toHaveLength(1);
    const u = new URL(seen[0].url);
    expect(`${u.origin}${u.pathname}`).toBe(STEAM_AUTH_URL);
    expect(u.hostname).toBe("partner.steam-api.com");
    expect(seen[0].method).toBe("GET");
    expect(Object.fromEntries(u.searchParams.entries())).toEqual({ key: KEY, appid: "481", ticket: "ab12", identity: "my-identity" });
    expect(r.text).not.toContain(KEY);
  });
});

describe.each(KINDS)("a known Steam account, on %s", (kind) => {
  it("a known SteamID links the signing key to that account's player under the redeem rules: a lone key joins; a player with devices (409) and a key with another Steam account (409) do not; again is a no-op", async () => {
    const steam = fakeSteam({ a1a1: S1, a1b1: S1, a1c1: S1, a1d1: S1, a2a2: S2, a3a3: S3 });
    const rig = await open(kind, { steam });
    expect((await putWire(rig, earnedWire({ runs: 7, bestDay: 6 }), A)).status).toBe(200);
    const linkA = await linkSteamCall(rig, A, "a1a1", "x", 480);
    expect(linkA.status, linkA.text).toBe(200);
    expect(j(linkA).player).toBe(A.playerId);
    const again = await linkSteamCall(rig, A, "a1b1", "x", 480);
    expect(again.status, "the account is A's already: a no-op").toBe(200);
    expect(j(again).player).toBe(A.playerId);
    const joined = await linkSteamCall(rig, B, "a1c1", "x", 480);
    expect(joined.status, joined.text).toBe(200);
    expect(j(joined).player, "B (a lone key) joins the Steam account's player").toBe(A.playerId);
    expect((await postGhost(rig, B, uploadFor(B, A.playerId, { runId: "s-1" }))).status).toBe(201);
    // C already has a device of its own: a Steam account cannot re-point it
    expect((await linkVia(rig, C, D)).joined.status).toBe(200);
    const before = await identityRecords(rig);
    const c = await linkSteamCall(rig, C, "a1d1", "x", 480);
    expect(c.status, c.text).toBe(409);
    expect(await identityRecords(rig)).toEqual(before);
    // E has its own Steam account; another account's player cannot absorb it
    const E = await freshIdentity();
    expect((await linkSteamCall(rig, E, "a2a2", "x", 480)).status).toBe(200);
    // an UNKNOWN second account on a player that has one is simply added to that player (links.ts linkSteam: "an unknown one maps the
    // Steam id to the key's own canonical player"): E's player now holds both accounts
    const e = await linkSteamCall(rig, E, "a3a3", "x", 480);
    expect(e.status, e.text).toBe(200);
    const rec = JSON.parse((await identityRecords(rig))[`players/${E.playerId}.json`]) as { steam: string[] };
    expect(rec.steam.slice().sort()).toEqual([S2, S3]);
  });

  it("deleting the player removes its Steam links; the account can then start a new player", async () => {
    const steam = fakeSteam({ a1a1: S1, a9a9: S1, a9b9: S1 });
    const rig = await open(kind, { steam });
    expect((await linkSteamCall(rig, A, "a1a1", "x", 480)).status).toBe(200);
    expect(await steamRecords(rig)).toEqual([`links/steam/${S1}.json`]);
    expect((await deleteMe(rig, A)).status).toBe(200);
    expect(await steamRecords(rig), "the Steam link went with the player").toEqual([]);
    // the deleted key is dead (410); a new key may link the same account and gets a player of its own
    expect((await linkSteamCall(rig, A, "a9a9", "x", 480)).status).toBe(410);
    const F = await freshIdentity();
    const f = await linkSteamCall(rig, F, "a9b9", "x", 480);
    expect(f.status, f.text).toBe(200);
    expect(j(f).player).toBe(F.playerId);
    expect((await requestCode(rig, F)).status).toBe(200);
  });
});

describe("TicketCache", () => {
  it("a ticket is remembered for 6 hours by default, then may be used again; the cache is bounded and drops the oldest first", () => {
    const c = new TicketCache(1000, 3);
    expect(c.use("aa", 0)).toBe(true);
    expect(c.use("aa", 10)).toBe(false);
    expect(c.use("AA", 20)).toBe(false);
    expect(c.use("aa", 1000)).toBe(true); // 1000 ms later it is forgotten
    for (const [i, t] of ["b1", "b2", "b3", "b4"].entries()) expect(c.use(t, 2000 + i)).toBe(true);
    expect(c.use("b1", 2010), "over the bound the oldest went").toBe(true);
    c.release("b4");
    expect(c.use("b4", 2011)).toBe(true);
  });
});
