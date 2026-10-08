// 0.7.0a async play (REQ-BFG-016, REQ-BFG-009; docs/ASYNC.md "0.7.0a: what the game does online"): the game's side
// of the ghost server, behind the server URL setting. The Prime's decisions:
//  D3  No server URL by default: the game plays offline exactly as 0.6.2 (the same dusk foes, no identity, no
//      IndexedDB, no request, no new storage key). The URL comes from ?server=<url> (https, or http for localhost and
//      127.0.0.1; saved under SERVER_KEY; ?server=off clears it) or the build's VITE_GHOST_SERVER ("" by default;
//      "same-origin" = the page's own origin). Without one, no session exists and nothing here runs.
//  D4  Never block on the network: the ghost fetch has FETCH_TIMEOUT_MS (4 s), then 0.6.2's own stand-in; the
//      upload is fire and forget.
//  D2  The match request carries `runs`, this device's finished runs (RUNS_KEY, written only online).
// With a URL, one Online session per page load:
//  1. identity: loadIdentity(indexedDbKeyStore()) once. Null (no WebCrypto, or a plain-http origin other than
//     localhost): the session is `failed` and the game plays offline, as 0.6.2.
//  2. fetch tonight's ghost as soon as the day has no stored foe (tick, every frame): fetchGhost(url, { rules, day,
//     wins, lives, playerId, seen, hero, seed: battleSeed, runs }, 4000). The answer is stored in run.dusk
//     (day.ts storeOnlineFoe: a server ghost as a kind "ghost" DuskFoe, else standInFoe) and the run saved, so the
//     NEXT BATTLE card shows it and a reload fights the same foe. The record rule (D1) can only make the request
//     stricter if lives rise later that day (PATCH UP), never looser.
//  3. at dusk (the build committed, before the fight): submitDusk uploads ghostOf(run, now, playerId) once per dusk,
//     only if validateUpload (the player mode) accepts it, without awaiting it; a refusal is a console.debug line;
//     403 (closed), 401, 422 and network errors are silent.
//  4. a finished run (won or lost) counts toward D2 (countRun).

import { RULES_VERSION } from "../sim/content";
import { fetchGhost, submitGhost, type FetchedGhost, type GhostRequest, type SubmitResult } from "../net/ghostClient";
import { indexedDbKeyStore, loadIdentity, type Identity } from "../net/identity";
import { validateUpload } from "../net/validate";
import { ghostOf, storedFoe, storeOnlineFoe } from "./day";
import { battleSeed, saveRun, type Run } from "./run";
import { online, setSession, type Session } from "./session";

/** Where ?server=<url> is saved (D3: written only when the page is opened with ?server=). */
export const SERVER_KEY = "beltbattles.server.v1";
/** D2: this device's finished runs, { runs, last } (last: the runId counted last). Written only online. */
export const RUNS_KEY = "beltbattles.runs.v1";
/** D4: the ghost fetch's deadline; then 0.6.2's own stand-in. */
export const FETCH_TIMEOUT_MS = 4000;
/** The upload's deadline (fire and forget: nothing waits for it). */
export const UPLOAD_TIMEOUT_MS = 4000;
/** The build's server URL (D3): VITE_GHOST_SERVER, "" by default (offline). */
export const BUILD_SERVER: string = import.meta.env.VITE_GHOST_SERVER ?? "";

type Store = Pick<Storage, "getItem" | "setItem" | "removeItem">;

const LOCAL_HOSTS = ["localhost", "127.0.0.1", "[::1]"];

/** A server URL the game may use, normalized (origin + path, no trailing slash, no query), or null: https, or http
 *  only for localhost and 127.0.0.1 (D3); no credentials. "same-origin" means `origin` (the page's own). */
export function normalizeServerUrl(raw: string, origin = ""): string | null {
  const text = raw.trim() === "same-origin" ? origin : raw.trim();
  if (!text) return null;
  let u: URL;
  try {
    u = new URL(text);
  } catch {
    return null;
  }
  const local = LOCAL_HOSTS.includes(u.hostname);
  if (u.protocol !== "https:" && !(u.protocol === "http:" && local)) return null;
  if (u.username || u.password) return null;
  return (u.origin + u.pathname).replace(/\/+$/, "");
}

/** D3: the server URL for this page load, or null (offline, as 0.6.2). ?server=<url> wins and is saved under
 *  SERVER_KEY; ?server=off clears the saved one and plays offline; a bad ?server= value is ignored. Then the saved
 *  URL, then the build's VITE_GHOST_SERVER. Nothing is written unless the page carries ?server=. */
export function resolveServerUrl(search: string, store: Store | null, opts: { build?: string; origin?: string } = {}): string | null {
  const build = opts.build ?? BUILD_SERVER, origin = opts.origin ?? "";
  const q = new URLSearchParams(search).get("server");
  if (q !== null) {
    if (q.trim().toLowerCase() === "off") {
      try {
        store?.removeItem(SERVER_KEY);
      } catch {
        /* storage unavailable */
      }
      return null;
    }
    const url = normalizeServerUrl(q, origin);
    if (url) {
      try {
        store?.setItem(SERVER_KEY, url);
      } catch {
        /* storage unavailable: this page load only */
      }
      return url;
    }
    console.debug(`[beltbattles] ?server=${q}: not an https URL (http only for localhost): ignored`);
  }
  let saved: string | null = null;
  try {
    saved = store?.getItem(SERVER_KEY) ?? null;
  } catch {
    saved = null;
  }
  return (saved ? normalizeServerUrl(saved, origin) : null) ?? normalizeServerUrl(build, origin);
}

export interface OnlineDeps {
  fetchGhost: typeof fetchGhost;
  submitGhost: typeof submitGhost;
  /** Step 1: the device identity, once (default: loadIdentity(indexedDbKeyStore())). */
  identity: () => Promise<Identity | null>;
  store: Pick<Storage, "getItem" | "setItem"> | null; // RUNS_KEY
  now: () => number;
  save: (run: Run) => void;
}

function browserStore(): Store | null {
  try {
    return typeof localStorage !== "undefined" ? localStorage : null;
  } catch {
    return null;
  }
}

export function defaultDeps(): OnlineDeps {
  return {
    fetchGhost, submitGhost,
    identity: () => loadIdentity(indexedDbKeyStore()),
    store: browserStore(), now: () => Date.now(), save: (run) => saveRun(run),
  };
}

const keyOf = (run: Run) => `${run.runId}|${run.day}`;

/** One page load's online session (only when a server URL is set). */
export class Online implements Session {
  /** undefined while loading; null: no identity, so the game plays offline (step 1). */
  identity: Identity | null | undefined = undefined;
  /** Tooling (bb.online()) and tests: the last answer and upload. */
  lastFetch: FetchedGhost | null = null;
  lastUpload: SubmitResult | { ok: false; error: string; refused: true } | null = null;
  fetches = 0;
  uploads = 0;
  private inflight: string | null = null; // "runId|day" being fetched
  private result: { key: string; ghost: FetchedGhost | null } | null = null; // null ghost: the stand-in

  constructor(readonly url: string, private readonly deps: OnlineDeps = defaultDeps()) {
    deps.identity().then((id) => (this.identity = id), () => (this.identity = null));
  }

  /** Online for real: an identity, so ghosts are fetched and decks uploaded. */
  get active(): boolean {
    return !!this.identity;
  }

  /** No identity (step 1): the game plays offline, as 0.6.2. */
  get failed(): boolean {
    return this.identity === null;
  }

  /** Tonight's ghost is still being looked for (the NEXT BATTLE card says so). */
  searching(run: Run): boolean {
    return !this.failed && !run.over && !storedFoe(run);
  }

  /** D2: finished runs on this device. */
  runs(): number {
    try {
      const v = JSON.parse(this.deps.store?.getItem(RUNS_KEY) ?? "null") as { runs?: unknown } | null;
      return v && typeof v.runs === "number" && Number.isInteger(v.runs) && v.runs >= 0 ? v.runs : 0;
    } catch {
      return 0;
    }
  }

  /** D2: a finished run (won or lost) counts once. */
  countRun(run: Run): void {
    if (!run.over || !this.active) return;
    try {
      const v = JSON.parse(this.deps.store?.getItem(RUNS_KEY) ?? "null") as { last?: unknown } | null;
      if (v && v.last === run.runId) return;
      this.deps.store?.setItem(RUNS_KEY, JSON.stringify({ runs: this.runs() + 1, last: run.runId }));
    } catch {
      /* storage unavailable: the count just doesn't grow */
    }
  }

  /** The match request for the run's current dusk (step 3). */
  request(run: Run): GhostRequest {
    return {
      rules: RULES_VERSION, day: run.day, wins: run.wins, lives: Math.max(1, run.lives), playerId: this.identity!.playerId,
      seen: [...(run.seenGhosts ?? [])], hero: run.hero, seed: battleSeed(run), runs: this.runs(),
    };
  }

  /** Every frame (game.ts): store a finished fetch's answer in the run, or start tonight's fetch (step 2). */
  tick(run: Run | null): void {
    if (!run || run.over || !this.active || storedFoe(run)) return;
    const key = keyOf(run);
    if (this.result?.key === key) {
      storeOnlineFoe(run, this.result.ghost);
      this.deps.save(run);
      return;
    }
    if (this.inflight === key) return;
    this.inflight = key;
    this.fetches++;
    const req = this.request(run);
    this.deps.fetchGhost(this.url, req, FETCH_TIMEOUT_MS).then((ghost) => {
      this.lastFetch = ghost;
      this.result = { key, ghost };
    }, () => {
      this.result = { key, ghost: null }; // fetchGhost never rejects; belt and braces: the stand-in
    }).finally(() => {
      if (this.inflight === key) this.inflight = null;
    });
  }

  /** The stored foe, or (no answer yet) the stand-in now: never wait (the reveal event, the dusk gate's deadline). */
  settle(run: Run): void {
    this.tick(run);
    if (!storedFoe(run)) storeOnlineFoe(run, null);
  }

  /** Step 3, at dusk: upload tonight's deck once per dusk, if the player mode accepts it. Fire and forget. */
  submitDusk(run: Run): void {
    if (!this.identity || run.uploaded === run.day) return;
    run.uploaded = run.day;
    const snap = ghostOf(run, this.deps.now(), this.identity.playerId);
    const v = validateUpload(snap.build, snap.day, snap.rules, { seed: snap.seed, ...(snap.lastChance ? { lastChance: snap.lastChance } : {}), ...(snap.road ? { road: snap.road } : {}) }); // RUNES-1: the server's own rune check (LC-1: and its LAST CHANCE; NPC-1: and its road log)
    if (!v.ok) {
      console.debug(`[beltbattles] tonight's deck is not uploaded: ${v.errors[0] ?? "refused"}`);
      this.lastUpload = { ok: false, error: v.errors[0] ?? "refused", refused: true };
      return;
    }
    this.uploads++;
    this.deps.submitGhost(this.url, snap, this.identity, UPLOAD_TIMEOUT_MS).then((r) => {
      this.lastUpload = r; // 403 (closed), 401, 422 and network errors stay silent
    }, () => {});
  }
}

/** Start the page's session (main.ts, only with a server URL; session.ts holds it). Tests pass their own deps. */
export function startOnline(url: string, deps?: OnlineDeps): Online {
  const s = new Online(url, deps);
  setSession(s);
  return s;
}

/** The page's session as an Online (tooling), or null. */
export function onlineSession(): Online | null {
  const s = online();
  return s instanceof Online ? s : null;
}

/** Tests: back to offline. */
export function stopOnline(): void {
  setSession(null);
}
