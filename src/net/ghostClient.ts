// Ghost client (no UI). fetchGhost never fails: any network error, timeout, bad status,
// empty or invalid answer falls back to fallback.ts. submitGhost never throws either;
// it reports { ok: false } and the run simply continues offline.

import { RULES_VERSION } from "../sim/content";
import { fallbackGhost, type FallbackRequest } from "./fallback";
import { checkSnapshot, encodeSnapshot, type GhostSnapshot, type PoolEntry } from "./snapshot";
import { validateBuild } from "./validate";

export type GhostRequest = FallbackRequest;

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
    s = checkSnapshot(snapshot);
  } catch (e) {
    return `bad snapshot: ${errText(e)}`;
  }
  if (s.rules !== req.rules || s.rules !== RULES_VERSION) return `ghost rules ${s.rules} do not match ${req.rules}`;
  if (s.day !== req.day) return `ghost day ${s.day} is not ${req.day}`;
  if (s.playerId === req.playerId) return "server returned our own ghost";
  if (req.seen.includes(id)) return "server returned a ghost already fought this run";
  const v = validateBuild(s.build, s.day); // never simulate an unvalidated foreign deck
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
  const fallback = (error: string): FetchedGhost => ({ ...fallbackGhost(req, opts.pool), source: "fallback", error });
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

/** Upload tonight's snapshot. Encoding enforces the strict format and the 16 KB cap. */
export async function submitGhost(baseUrl: string, snapshot: GhostSnapshot, timeoutMs = 4000): Promise<SubmitResult> {
  try {
    const body = encodeSnapshot(snapshot);
    const { status, text } = await fetchText(endpoint(baseUrl, "/v1/ghosts"), {
      method: "POST", headers: { "content-type": "application/json" }, body,
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
