// Ghost client (no UI). fetchGhost never fails: any network error, timeout, bad status,
// empty or invalid answer falls back to fallback.ts. submitGhost never throws either;
// it reports { ok: false } and the run simply continues offline. Every upload is signed with
// the device key (identity.ts); without an identity (a plain-http page) there is no upload.

import { RULES_VERSION } from "../sim/content";
import { migrateV1, type FallbackRequest } from "./fallback"; // BUMP-1I (REQ-BFG-125): fallbackGhost is veteran.ts veteranFallback's two lines now (below)
import { KEY_HEADER, SIG_HEADER, type Identity } from "./identity";
import { ghostDayOk, noBetterRecord } from "./matchmaking";
import { longRunFor } from "./rulesGate"; // RUN-1: the long run's widened day
import { checkSnapshot, encodeSnapshot, type GhostSnapshot, type PoolEntry } from "./snapshot";
import { validateUpload } from "./validate";
import { veteranFallback } from "./veteran"; // BUMP-1I (REQ-BFG-125): the offline pick, with the veteran's lead (outside the generators' closure: nothing on it imports veteran.ts)
import { endlessRecordProblem, isReachable } from "./records"; // SCALE-2d (REQ-BFG-098, D5): a served ghost's record, with SCALE_RIGS on; BUMP-1E (R3.3 a): an endless ghost's record, as the server judges it
import { scaleRules } from "../sim/scale"; // SCALE-2d

/** BUMP-1I (REQ-BFG-125, VETERAN): the request may carry the device's `streak` (runs won in a row; absent counts as 0), typed here and in
 *  veteran.ts, outside the generators' closure (matchmaking.ts's MatchRequest and fallback.ts's FallbackRequest are on it and are not edited). */
export type GhostRequest = FallbackRequest & { streak?: number };

export interface FetchedGhost extends PoolEntry {
  source: "server" | "fallback";
  error?: string; // why the server answer was not used (fallback only)
}

export type SubmitResult = { ok: true; id: string } | { ok: false; status?: number; error: string };

function endpoint(baseUrl: string, path: string): string {
  return baseUrl.replace(/\/+$/, "") + path;
}

export function matchUrl(baseUrl: string, req: GhostRequest): string {
  const q = new URLSearchParams({
    rules: req.rules, day: String(req.day), wins: String(req.wins), lives: String(req.lives),
    player: req.playerId, seen: req.seen.join(","),
  });
  if (req.runs !== undefined) q.set("runs", String(req.runs)); // 0.7.0a D2: finished runs on this device
  if (req.streak !== undefined && req.streak > 0) q.set("streak", String(req.streak)); // BUMP-1I (REQ-BFG-125): runs won in a row on this device; only above 0, so a request without one has the URL it had
  if (req.endless) q.set("mode", "endless"); // ENDLESS-1 (REQ-BFG-059): an endless dusk's request (wins and lives are the endless ones): endless ghosts only
  return endpoint(baseUrl, `/v1/ghosts/match?${q.toString()}`);
}

/** fetch() with a hard deadline covering headers AND body. */
async function fetchText(url: string, init: RequestInit, timeoutMs: number): Promise<{ status: number; text: string }> {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), Math.max(1, timeoutMs));
  try {
    const res = await fetch(url, { ...init, signal: ctl.signal });
    const text = await res.text();
    return { status: res.status, text };
  } finally {
    clearTimeout(timer);
  }
}

function errText(e: unknown): string {
  const name = typeof e === "object" && e !== null ? (e as { name?: unknown }).name : undefined;
  if (name === "AbortError" || name === "TimeoutError") return "timeout"; // DOMException in some runtimes
  return e instanceof Error ? e.message : String(e);
}

/** Check a server answer against the request; returns why it is unusable, or null. */
function problem(body: unknown, req: GhostRequest): string | PoolEntry {
  if (typeof body !== "object" || body === null) return "answer is not an object";
  const { id, snapshot } = body as { id?: unknown; snapshot?: unknown };
  if (typeof id !== "string" || !id) return "answer has no id";
  let s: GhostSnapshot;
  try {
    s = migrateV1(checkSnapshot(snapshot)); // 0.6.2 BELTSIDE: a v1 ghost's gates move beside its belts (D3)
  } catch (e) {
    return `bad snapshot: ${errText(e)}`;
  }
  if (s.rules !== req.rules || s.rules !== RULES_VERSION) return `ghost rules ${s.rules} do not match ${req.rules}`;
  // RUN-1 (REQ-BFG-059, D6): under a long run's rules the server widens a thin day to the nearest EARLIER one: any day up to
  // the request's passes, never a later one; the 10-day rules: the request's own day, as before
  if (!ghostDayOk(s.day, req)) return longRunFor(req.rules) ? `ghost day ${s.day} is past ${req.day}` : `ghost day ${s.day} is not ${req.day}`;
  if (s.playerId === req.playerId) return "server returned our own ghost";
  if (req.seen.includes(id)) return "server returned a ghost already fought this run";
  // ENDLESS-1 (REQ-BFG-059): an endless request takes only an endless ghost and a run's never one (no D1 in endless: nearest endless wins)
  if ((s.mode === "endless") !== (req.endless === true)) return req.endless ? "server returned a run's ghost to an endless request" : "server returned an endless ghost to a run's request";
  // 0.7.0a D1 on the client too: never fight a ghost with a better record (a server without D1 falls back here)
  if (!req.endless && !noBetterRecord(s, req)) return `server returned a ghost with a better record (${s.wins}W ${s.lives} lives)`;
  // SCALE-2d (REQ-BFG-098, REQ-BFG-106; BRIEF-SCALE2d D5): with SCALE_RIGS on a ghost's wins and lives reach the fight (TROPHY
  // CHAIN, GRUDGE ROD), so its record must be one a run carries into this dusk: the server's own check at upload (records.ts
  // isReachable), again here. Off: as before. BUMP-1E (RULING-BUMP1E-R3 R3.3 a, merging ENDLESS-1): a RUN's ghost only: an endless
  // ghost's wins stay at 10 past the victory day (its endless counts are endlessWins and endlessLives), so isReachable would refuse
  // every endless ghost
  if (scaleRules() && !req.endless && !isReachable(s.day, s.wins, s.lives, { lastChance: s.lastChance?.day ?? null, rules: s.rules })) {
    return `server returned a ghost whose record (${s.wins}W ${s.lives} lives) no run carries into dusk ${s.day}`;
  }
  // BUMP-1E (R3.3 a): and an endless ghost under SCALE_RIGS is re-checked the way the server judges it at upload (records.ts
  // endlessRecordProblem, which takes only what the snapshot holds): the run was won on its victory day, and the endless dusks
  // since lead to its endless wins and hearts. Off: as ENDLESS-1 built it (the decoder's bounds alone)
  if (scaleRules() && req.endless) {
    const why = endlessRecordProblem({ rules: s.rules, day: s.day, victoryDay: s.victoryDay ?? 0, endlessWins: s.endlessWins ?? 0, endlessLives: s.endlessLives ?? 0, ...(s.losses !== undefined ? { losses: s.losses } : {}), ...(s.lastChance ? { lastChance: s.lastChance } : {}) });
    if (why) return `server returned an endless ghost whose record no endless leads to (${why})`;
  }
  // never simulate an unvalidated foreign deck; a served ghost is a player's deck: the player mode (0.7.0)
  const v = validateUpload(s.build, s.day, undefined, { ...(s.lastChance ? { lastChance: s.lastChance } : {}), ...(s.road ? { road: s.road } : {}) }); // LC-1: its LAST CHANCE (no seed: served ghosts carry none); NPC-1: its road log
  if (!v.ok) return `ghost deck invalid: ${v.errors[0]}`;
  return { id, snapshot: s };
}

/**
 * Ask the build server for tonight's ghost. Falls back (bundled pool, then warlord
 * stand-in) on any error, timeout, 404 or unusable answer.
 */
export async function fetchGhost(
  baseUrl: string, req: GhostRequest, timeoutMs = 4000, opts: { pool?: readonly PoolEntry[] } = {},
): Promise<FetchedGhost> {
  const fallback = (error: string): FetchedGhost => ({ ...veteranFallback(req, opts.pool), source: "fallback", error }); // BUMP-1I (REQ-BFG-125): was fallbackGhost(req, opts.pool): the same two lines with veteranPick in matchPick's place
  try {
    const { status, text } = await fetchText(matchUrl(baseUrl, req), { method: "GET", headers: { accept: "application/json" } }, timeoutMs);
    if (status === 404) return fallback("no ghost on the server for this day");
    if (status !== 200) return fallback(`server answered HTTP ${status}`);
    if (!text.trim()) return fallback("empty answer");
    const got = problem(JSON.parse(text), req);
    return typeof got === "string" ? fallback(got) : { ...got, source: "server" };
  } catch (e) {
    return fallback(errText(e));
  }
}

/**
 * Upload tonight's snapshot, signed by this device's key. Encoding enforces the strict format and
 * the 16 KB cap; the signature covers exactly the bytes sent (x-bb-key, x-bb-sig). A snapshot whose
 * playerId is not identity.playerId is refused here, without a request: the server would refuse it.
 */
export async function submitGhost(
  baseUrl: string, snapshot: GhostSnapshot, identity: Identity, timeoutMs = 4000,
): Promise<SubmitResult> {
  try {
    if (snapshot.playerId !== identity.playerId) {
      return { ok: false, error: "snapshot.playerId is not this device's player id: not uploaded" };
    }
    const body = new TextEncoder().encode(encodeSnapshot(snapshot));
    const { key, sig } = await identity.sign(body);
    const { status, text } = await fetchText(endpoint(baseUrl, "/v1/ghosts"), {
      method: "POST", headers: { "content-type": "application/json", [KEY_HEADER]: key, [SIG_HEADER]: sig }, body,
    }, timeoutMs);
    let parsed: { id?: unknown; error?: unknown } = {};
    try {
      parsed = text ? JSON.parse(text) : {};
    } catch {
      /* non-JSON error page */
    }
    if ((status === 200 || status === 201) && typeof parsed.id === "string") return { ok: true, id: parsed.id };
    return { ok: false, status, error: typeof parsed.error === "string" ? parsed.error : `HTTP ${status}` };
  } catch (e) {
    return { ok: false, error: errText(e) };
  }
}
