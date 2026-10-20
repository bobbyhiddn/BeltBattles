// IDENT-1 (REQ-BFG-122): the Steam side of the identity layer. There is no desktop client yet, so this is the server half and a
// verifier interface the route (server/linkRoutes.ts) calls; a test passes a fake verifier and a fake fetch, never the network.
//
// The real verifier asks Steam's Web API (the publisher key, which "can never be used directly by clients"):
//   GET https://partner.steam-api.com/ISteamUserAuth/AuthenticateUserTicket/v1/?key=<publisher key>&appid=<id>&ticket=<hex>&identity=<text>
//   -> { "response": { "params": { "result": "OK", "steamid": "7656..." } } }   or   { "response": { "error": { "errorcode": n, "errordesc": "..." } } }
// It is on only when BB_STEAM_WEB_API_KEY and BB_STEAM_APP_IDS (a comma list: the main and the demo App ID) are both set. The key
// is never logged, never put in an error message and never sent to a client: a failure reports a status or a short reason only.
// A session ticket is single use (Steam's own rule): the route keeps the hash of each ticket it accepted in memory (TicketCache).

import { sha256Hex } from "./sigv4";

export const STEAM_AUTH_URL = "https://partner.steam-api.com/ISteamUserAuth/AuthenticateUserTicket/v1/";

export type SteamResult =
  | { ok: true; steamId: string }
  /** `unavailable`: Steam could not be asked (network, timeout, a 5xx): not the ticket's fault, so the answer is 502. */
  | { ok: false; error: string; unavailable?: boolean };

export interface SteamVerifier {
  /** The App IDs this verifier accepts (the main game and the demo). */
  readonly appIds: readonly number[];
  /** Check a hex session ticket made for `identity` (the string the client gave GetAuthTicketForWebApi) under `appid`. */
  verify(ticketHex: string, identity: string, appid: number): Promise<SteamResult>;
}

export interface SteamConfig {
  webApiKey: string;
  appIds: number[];
}

/** The 64-bit SteamID: 17 digits, starting 7656119 (an individual account in the public universe). */
export const STEAM_ID_PATTERN = /^7656119\d{10}$/;

export function steamConfigFromEnv(env: Record<string, string | undefined>): SteamConfig | null {
  const key = (env.BB_STEAM_WEB_API_KEY ?? "").trim();
  const ids = (env.BB_STEAM_APP_IDS ?? "").trim();
  if (!key || !ids) return null; // off unless both are set
  const appIds = ids.split(",").map((s) => s.trim()).filter(Boolean).map((s) => (/^\d{1,10}$/.test(s) ? Number(s) : NaN));
  if (!appIds.length || appIds.some((n) => !Number.isSafeInteger(n) || n < 1)) {
    throw new Error("BB_STEAM_APP_IDS must be a comma list of App IDs (digits only)"); // the key is never echoed
  }
  return { webApiKey: key, appIds: [...new Set(appIds)] };
}

/** The real verifier over `fetchFn` (the global fetch by default). Never throws; every failure is a value without the key. */
export function steamVerifier(cfg: SteamConfig, fetchFn: typeof fetch = (input, init) => fetch(input, init), timeoutMs = 5000): SteamVerifier {
  return {
    appIds: cfg.appIds,
    async verify(ticketHex, identity, appid) {
      if (!cfg.appIds.includes(appid)) return { ok: false, error: "appid: not one of this game's App IDs" };
      const url = new URL(STEAM_AUTH_URL);
      url.searchParams.set("key", cfg.webApiKey);
      url.searchParams.set("appid", String(appid));
      url.searchParams.set("ticket", ticketHex);
      url.searchParams.set("identity", identity);
      const ctl = new AbortController();
      const timer = setTimeout(() => ctl.abort(), timeoutMs);
      try {
        const res = await fetchFn(url.toString(), { method: "GET", headers: { accept: "application/json" }, signal: ctl.signal });
        if (res.status >= 500) return { ok: false, error: `steam answered HTTP ${res.status}`, unavailable: true };
        let json: unknown;
        try {
          json = JSON.parse(await res.text());
        } catch {
          return { ok: false, error: "steam answered something that is not JSON", unavailable: true };
        }
        const response = (json as { response?: { params?: { result?: unknown; steamid?: unknown }; error?: { errorcode?: unknown } } } | null)?.response;
        const params = response?.params;
        if (params && params.result === "OK" && typeof params.steamid === "string" && STEAM_ID_PATTERN.test(params.steamid)) {
          return { ok: true, steamId: params.steamid };
        }
        if (res.status === 429) return { ok: false, error: "steam is busy", unavailable: true };
        const code = typeof response?.error?.errorcode === "number" ? ` (code ${response.error.errorcode})` : "";
        return { ok: false, error: `steam refused the ticket${code}` };
      } catch (e) {
        const name = typeof e === "object" && e !== null ? (e as { name?: unknown }).name : undefined;
        return { ok: false, error: name === "AbortError" ? "steam did not answer in time" : "steam could not be reached", unavailable: true };
      } finally {
        clearTimeout(timer);
      }
    },
  };
}

/** A ticket is used once: the hashes of the tickets accepted so far, in memory (a restart forgets them; Steam's own ticket
 *  lifetime bounds the replay). Bounded: the oldest go first. */
export class TicketCache {
  private readonly seen = new Map<string, number>();
  constructor(private readonly ttlMs = 6 * 3_600_000, private readonly max = 10_000) {}

  /** True when `ticketHex` was not seen before (and is remembered now); false for a ticket already used. */
  use(ticketHex: string, now: number): boolean {
    const h = sha256Hex(ticketHex.toLowerCase());
    for (const [k, t] of this.seen) {
      if (this.seen.size <= this.max && now - t < this.ttlMs) break; // oldest first: stop at the first that stays
      this.seen.delete(k);
    }
    if (this.seen.has(h)) return false;
    this.seen.set(h, now);
    return true;
  }

  /** A ticket that was not accepted after all (Steam refused it, or could not be asked) may be tried again. */
  release(ticketHex: string): void {
    this.seen.delete(sha256Hex(ticketHex.toLowerCase()));
  }
}
