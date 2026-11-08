// Zero-dependency ghost build server on node:http (ROADMAP §3). Local-first: main.ts
// binds 127.0.0.1. Every uploaded deck is re-validated with the game's own deck rules
// and gold budget; the server never trusts a client's claim that its build is legal.
// Storage sits behind the async GhostStore interface (store.ts): JSON lines or Tigris.
//
//   GET  /v1/health                 never touches storage; reports the store kind
//   POST /v1/ghosts                 body: canonical GhostSnapshot JSON, signed by the device key
//                                   (x-bb-key, x-bb-sig; src/net/identity.ts) -> 201 { id } (200 if
//                                   already stored). Refusals, in the order they are checked:
//                                   403 { error } while uploads are closed (the body is not read)
//                                   401 { error } a signing header is missing or malformed (the body
//                                       is not read), or the signature does not match the exact bytes
//                                   400 { error } not a valid snapshot (the strict decode, which carries
//                                       the rules gate: turret slots and belt joins need bb-0.6.2+)
//                                   422 { error } PACKS M2: a name the strict decode refuses, one reason:
//                                       "name: too short", "name: too long", "name: bad characters",
//                                       "name: not allowed" (src/net/names.ts)
//                                   403 { error } snapshot.playerId is not the signing key's playerId
//                                   422 { error } S1: an ENDLESS snapshot past the last online endless day (src/sim/endless.ts
//                                       ENDLESS_ONLINE_LAST_DAY, 25), one cheap reason, before any costly check: "day: 33 is past
//                                       the last online endless day 25". The game never uploads one (past it the foe is the GOD
//                                       stand-in); the deck check below grows about x1.11 a day (8 s of CPU at day 33, 26 s at 41)
//                                   422 { error } foreign rules; PACKS M2: "name: missing" (every upload
//                                       under RULES_VERSION carries its player's name); or the deck fails
//                                       validateUpload (the player mode), with its errors
//                                   422 { error } 0.8.0 H2: a record (wins, lives) no run can carry into
//                                       that day's dusk (src/net/records.ts isReachable), named with
//                                       the day: "record: 0W 1 lives is no record a run carries into
//                                       dusk 1". Nothing is stored
//   GET  /v1/ghosts/match?rules=&day=&wins=&lives=&player=&seen=id1,id2&runs=n -> 200 { id, snapshot } | 404
//                                   0.7.0a: never a ghost with a better record than wins/lives (D1,
//                                   matchmaking.ts eligible); while runs < NEW_PLAYER_RUNS (absent = 0)
//                                   only the seed pool is matched, never an upload (D2). None: 404
//   PUT  /v1/profile                PROFILE-UP (REQ-BFG-074 clause 4): the player's profile, signed in its own domain
//                                   ("bb-profile-1\n" + the body bytes), merged into the signer's record -> 200 { the
//                                   merged profile }. 403 / 401 / 413 / 400 / 422 as documented in profileRoute.ts
//   GET|HEAD / and /index.html      the game page, when staticDir (BB_GHOST_STATIC) is set

import { readFileSync } from "node:fs";
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { join } from "node:path";
import { Rng } from "../src/core/rng";
import { RULES_VERSION } from "../src/sim/content";
import { KEY_HEADER, SIG_HEADER, uploadHeaderError, verifyUpload } from "../src/net/identity";
import { isNewPlayer, matchDays, matchSeed, type MatchRequest } from "../src/net/matchmaking"; // RUN-1 (D6): matchDays, the long run's widening order
import { matchPick } from "../src/net/pick"; // RETUNE-1 T5 (REQ-BFG-092): the one pick, shared with the client's fallback
import { decodeSnapshot, ID_PATTERN, MAX_DAY, MAX_LIVES, MAX_SNAPSHOT_BYTES, NameError, SnapshotError, maxDayFor, type GhostSnapshot } from "../src/net/snapshot";
import { nameProblem } from "../src/net/names"; // PACKS M2 (REQ-BFG-063)
import { endlessRecordProblem, isReachable, lossesProblem } from "../src/net/records"; // ENDLESS-1: an endless snapshot's record
import { validateUpload } from "../src/net/validate";
import { endlessFor, livesCapFor } from "../src/net/rulesGate"; // RETUNE-1 (REQ-BFG-096): the match route's lives bound; ENDLESS-1: and endless' rules
import { ENDLESS_LAST_DAY, ENDLESS_LIVES, ENDLESS_ONLINE_LAST_DAY, ENDLESS_WIN_CAP } from "../src/sim/endless"; // ENDLESS-1: an endless match request's bounds; S1: and the last day an endless snapshot is taken ONLINE
import { putProfile } from "./profileRoute"; // PROFILE-UP (REQ-BFG-074 clause 4)
import { profileStoreFor, type ProfileStore } from "./profileStore";
import { sha256Hex } from "./sigv4";
import { JsonlStore, StorageError, type GhostStore } from "./store";

export const DEFAULT_ORIGINS = ["http://127.0.0.1:7778"]; // the local Shore

/** RUNES-1 (REQ-BFG-058, FIX-6): a stored ghost as the match answer serves it: without its run `seed` (R1e wants it
 *  private; the store keeps it). Every other field as stored. The client's checks then skip the rune offer rule. */
export function servedSnapshot(s: GhostSnapshot): GhostSnapshot {
  if (s.seed === undefined) return s;
  const { seed: _private, ...pub } = s;
  return pub;
}
export const MAX_BODY_BYTES = MAX_SNAPSHOT_BYTES;
const MAX_SEEN = 64;
const MAX_RUNS = 9999; // 0.7.0a D2: the runs a match request may state (intParam reads at most 4 digits)

export interface ServerOptions {
  /** The ghost store. Default: a JsonlStore over dataDir, loaded right away. */
  store?: GhostStore;
  dataDir?: string;
  origins?: string[]; // CORS allow-list (exact origins)
  rateLimit?: { windowMs: number; max: number }; // per client IP, all endpoints
  log?: (line: string) => void;
  /** Mixed into the match seed. Default: the current minute, so a retry gets the same ghost. */
  matchSalt?: () => number | string;
  /**
   * "closed": POST /v1/ghosts and PUT /v1/profile answer 403 without reading the body (seeding still works).
   * Production ran closed until the uploads step (0.8.0 U2: fly.toml BB_GHOST_UPLOADS = "open"); config.ts's default
   * stays closed.
   */
  uploads?: "open" | "closed";
  /**
   * Whose address the rate limit keys on. "fly" (behind Fly's proxy): the
   * Fly-Client-IP header, which Fly's proxy sets or overwrites on every request it forwards, else
   * the socket address. X-Forwarded-For is never used: Fly appends to it, so its first hop is
   * whatever the client sent, and a request without Fly-Client-IP did not come through the proxy,
   * so none of its hops can be trusted either.
   * Default "none": the socket address only; both headers are ignored, so nobody can spoof them.
   * Either way the address stays in the limiter's memory: the request log never prints a client
   * address, so no player IP reaches the host's log stream.
   */
  trustProxy?: "fly" | "none";
  /**
   * Serve <staticDir>/index.html (the single-file game) at GET and HEAD / and /index.html, from
   * the same HTTPS origin as the API. Read once, now; a missing file throws. Other paths outside
   * /v1 stay 404.
   */
  staticDir?: string;
  /** PROFILE-UP: where PUT /v1/profile keeps each player's merged profile. Default: beside the ghosts, in the same
   *  backing store (profileStore.ts profileStoreFor: <dataDir>/profiles, or Tigris profiles/<playerId>.json). */
  profileStore?: ProfileStore;
  /** PROFILE-UP: the clock the profile route reads (updatedAt's range, the record's receivedAt). Default Date.now. */
  now?: () => number;
}

export interface GhostServer {
  server: Server;
  store: GhostStore;
  listen(port: number, host?: string): Promise<number>;
  close(): Promise<void>;
}

class HttpError extends Error {
  constructor(readonly status: number, message: string, readonly extra: Record<string, unknown> = {}) {
    super(message);
  }
}

function send(res: ServerResponse, status: number, body: unknown): void {
  res.statusCode = status;
  res.setHeader("content-type", "application/json; charset=utf-8");
  res.setHeader("cache-control", "no-store");
  res.setHeader("x-content-type-options", "nosniff");
  res.end(JSON.stringify(body));
}

/** The exact body bytes received: at most `max` (413 over it, by content-length or while streaming). */
function readBody(req: IncomingMessage, max: number): Promise<Uint8Array> {
  return new Promise((resolve, reject) => {
    const tooBig = () => new HttpError(413, `request body over ${max} bytes`);
    if (Number(req.headers["content-length"] ?? 0) > max) {
      req.resume();
      reject(tooBig());
      return;
    }
    const chunks: Uint8Array[] = [];
    let total = 0, done = false;
    req.on("data", (c) => {
      if (done) return;
      total += c.length;
      if (total > max) {
        done = true;
        reject(tooBig());
      } else chunks.push(c);
    });
    req.on("end", () => {
      if (done) return;
      done = true;
      const all = new Uint8Array(total);
      let o = 0;
      for (const c of chunks) {
        all.set(c, o);
        o += c.length;
      }
      resolve(all);
    });
    req.on("error", (e) => {
      if (!done) {
        done = true;
        reject(e);
      }
    });
  });
}

/** Body bytes as text: strict UTF-8, else 400. Decoded only after the signature over the bytes checks out. */
function utf8(body: Uint8Array): string {
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(body);
  } catch {
    throw new HttpError(400, "request body is not UTF-8");
  }
}

class RateLimiter {
  private hits = new Map<string, { start: number; n: number }>();
  constructor(readonly windowMs: number, readonly max: number) {}

  allow(ip: string, now: number): boolean {
    if (this.hits.size > 10_000) {
      for (const [k, h] of this.hits) if (now - h.start >= this.windowMs) this.hits.delete(k);
    }
    let h = this.hits.get(ip);
    if (!h || now - h.start >= this.windowMs) {
      h = { start: now, n: 0 };
      this.hits.set(ip, h);
    }
    return ++h.n <= this.max;
  }
}

const IP_TEXT = /^[0-9A-Fa-f:.]{2,45}$/; // an IPv4 or IPv6 literal; anything else is ignored

function firstHeader(req: IncomingMessage, name: string): string {
  const v = req.headers[name];
  return (Array.isArray(v) ? v[0] ?? "" : v ?? "").trim();
}

/** The client address the rate limit keys on (see ServerOptions.trustProxy). Never logged. */
export function clientIp(req: IncomingMessage, trust: "fly" | "none" = "none"): string {
  const socket = req.socket.remoteAddress ?? "unknown";
  if (trust !== "fly") return socket;
  const fly = firstHeader(req, "fly-client-ip");
  return IP_TEXT.test(fly) ? fly : socket; // X-Forwarded-For is never trusted (see ServerOptions.trustProxy)
}

function intParam(q: URLSearchParams, name: string, min: number, max: number): number {
  const v = q.get(name);
  if (v === null || !/^\d{1,4}$/.test(v) || Number(v) < min || Number(v) > max) {
    throw new HttpError(400, `${name}: expected an integer in ${min}..${max}`);
  }
  return Number(v);
}

export function parseMatchQuery(q: URLSearchParams): MatchRequest {
  const rules = q.get("rules") ?? "";
  if (!/^[A-Za-z0-9._-]{1,32}$/.test(rules)) throw new HttpError(400, "rules: expected a rules version");
  const player = q.get("player") ?? "";
  if (!ID_PATTERN.test(player)) throw new HttpError(400, "player: expected an anonymous player id");
  const seenRaw = q.get("seen") ?? "";
  const seen = seenRaw ? seenRaw.split(",") : [];
  if (seen.length > MAX_SEEN || seen.some((s) => !ID_PATTERN.test(s))) {
    throw new HttpError(400, `seen: expected up to ${MAX_SEEN} comma-separated ghost ids`);
  }
  // ENDLESS-1 (REQ-BFG-059, BRIEF-ENDLESS1 3.3, 3.4): `mode=endless` is an endless dusk's request: it reads only endless ghosts, and
  // takes the endless bounds (the day to ENDLESS_LAST_DAY, the endless wins to ENDLESS_WIN_CAP - 1, the hearts to ENDLESS_LIVES);
  // under rules without endless the server refuses it (400), as it refuses the snapshot's endless fields. Any other mode is a 400.
  const mode = q.get("mode");
  if (mode !== null && mode !== "endless") throw new HttpError(400, 'mode: expected "endless" (a run\'s request carries none)');
  const endless = mode === "endless";
  if (endless && !endlessFor(rules)) throw new HttpError(400, "mode: endless is not in this rules version yet");
  return {
    // RUN-1 (REQ-BFG-059, D4): the day bound follows the request's rules (snapshot.ts maxDayFor: LONG_RUN_MAX_DAY, 25, under a
    // long run's rules, else 10); data safety only, a refusal of the request, never of a run. The wins bound is as before:
    // a long run's wins into a dusk never pass 9
    rules, day: intParam(q, "day", 1, endless ? ENDLESS_LAST_DAY : maxDayFor(rules)), wins: intParam(q, "wins", 0, endless ? ENDLESS_WIN_CAP - 1 : MAX_DAY),
    // RETUNE-1 (REQ-BFG-096): the bound follows the request's rules (rulesGate.ts livesCapFor: 10 with hearts, else 9)
    lives: intParam(q, "lives", 0, endless ? ENDLESS_LIVES : livesCapFor(rules, MAX_LIVES)), playerId: player, seen,
    // 0.7.0a D2: the client's finished runs; absent counts as 0 (a new player: seed pool only)
    runs: q.has("runs") ? intParam(q, "runs", 0, MAX_RUNS) : 0,
    ...(endless ? { endless: true as const } : {}),
  };
}

interface Page {
  file: string;
  body: Uint8Array;
  etag: string;
}

/** Read the game page once. The error names the file and what is expected, nothing else. */
export function loadPage(dir: string): Page {
  const file = join(dir, "index.html");
  let body: Uint8Array;
  try {
    body = readFileSync(file);
  } catch (e) {
    const code = (e as { code?: unknown }).code;
    throw new Error(`static page: cannot read ${file}${typeof code === "string" ? ` (${code})` : ""}; BB_GHOST_STATIC must be a directory holding index.html`);
  }
  return { file, body, etag: `"${sha256Hex(body).slice(0, 32)}"` };
}

function sendPage(req: IncomingMessage, res: ServerResponse, page: Page, head: boolean): void {
  res.setHeader("content-type", "text/html; charset=utf-8");
  res.setHeader("cache-control", "no-cache"); // revalidate every time: a deploy is seen at once
  res.setHeader("x-content-type-options", "nosniff");
  res.setHeader("referrer-policy", "no-referrer");
  res.setHeader("etag", page.etag);
  const inm = firstHeader(req, "if-none-match").split(",").map((t) => t.trim().replace(/^W\//, ""));
  if (inm.includes(page.etag)) {
    res.statusCode = 304;
    res.end();
    return;
  }
  res.statusCode = 200;
  res.setHeader("content-length", page.body.length);
  res.end(head ? undefined : page.body);
}

function openJsonl(dataDir: string | undefined, log: (line: string) => void): JsonlStore {
  if (dataDir === undefined) throw new Error("createGhostServer: pass a store or a dataDir");
  const store = new JsonlStore(dataDir);
  const loaded = store.load();
  log(`ghost store ${store.file}: ${loaded} ghosts loaded, ${store.skipped} bad lines skipped`);
  return store;
}

export function createGhostServer(opts: ServerOptions): GhostServer {
  const log = opts.log ?? ((line: string) => console.log(line));
  const origins = new Set(opts.origins ?? DEFAULT_ORIGINS);
  const limiter = new RateLimiter(opts.rateLimit?.windowMs ?? 60_000, opts.rateLimit?.max ?? 120);
  const salt = opts.matchSalt ?? (() => Math.floor(Date.now() / 60_000));
  const store = opts.store ?? openJsonl(opts.dataDir, log);
  const uploads = opts.uploads ?? "open";
  const profiles = opts.profileStore ?? profileStoreFor(store, log); // PROFILE-UP
  const clock = opts.now ?? (() => Date.now()); // PROFILE-UP
  const trustProxy = opts.trustProxy ?? "none";
  const page = opts.staticDir === undefined ? null : loadPage(opts.staticDir);
  if (page) log(`serving the game page ${page.file} (${page.body.length} bytes) at / and /index.html`);
  const started = Date.now();

  async function route(req: IncomingMessage, res: ServerResponse, url: URL): Promise<void> {
    const method = req.method ?? "GET";
    const only = (m: string) => {
      if (method !== m) throw new HttpError(405, `use ${m}`);
    };
    switch (url.pathname) {
      case "/v1/health":
        only("GET");
        // never touches storage: `ghosts` counts what this process holds in memory
        return send(res, 200, {
          ok: true, rules: RULES_VERSION, store: store.kind, ghosts: store.size, uploads,
          uptimeS: Math.round((Date.now() - started) / 1000),
        });
      case "/v1/ghosts": {
        only("POST");
        // 1. before the body is read: nothing is parsed, validated or stored (Node discards the rest)
        if (uploads === "closed") throw new HttpError(403, "uploads are not open yet");
        // 2. both signing headers present and well formed (syntax only), still before the body is read
        const key = firstHeader(req, KEY_HEADER);
        const sig = firstHeader(req, SIG_HEADER);
        const unsigned = uploadHeaderError(key, sig);
        if (unsigned) throw new HttpError(401, unsigned);
        // 3. the exact bytes received, within the limit; the signature must cover exactly them.
        //    verifyUpload (src/net/identity.ts) is the only verification code on this path.
        const body = await readBody(req, MAX_BODY_BYTES);
        const signer = await verifyUpload(body, key, sig);
        if (!signer.ok) throw new HttpError(401, signer.error);
        // 4. strict decode (400). PACKS M2 (REQ-BFG-063): a name the decoder refuses (names.ts nameProblem) is a 422 with
        //    its one reason, "name: too long" etc.; a name that is not a string stays a 400
        let snap: GhostSnapshot;
        try {
          snap = decodeSnapshot(utf8(body));
        } catch (e) {
          if (e instanceof NameError) throw new HttpError(422, e.message);
          throw e;
        }
        // 5. a key uploads only under its own playerId: nobody can post as another player
        if (snap.playerId !== signer.playerId) {
          throw new HttpError(403, "snapshot.playerId is not the player id of the signing key (x-bb-key)");
        }
        // 5b. S1 (BRIEF-S1; LAUNCH-0 run 3, REPORT 1.4 item 6): an ENDLESS snapshot past the last day the game takes part online is refused HERE,
        //     before validateUpload and every other costly check. The game never sends one (online.ts offlineEndless: past
        //     ENDLESS_ONLINE_LAST_DAY the foe is the GOD stand-in and nothing goes up, because the deck check is too slow there), but the
        //     strict decoder takes an endless day to ENDLESS_LAST_DAY (64) and validateUpload's cost grows about x1.11 a day: measured at
        //     0.9.13, one signed day-33 endless POST held this one request thread for 7.7 s (/v1/health waited 7.6 s), and day 41 costs 26 s
        //     of CPU and 221 MB of the 256 MB machine. A hand-built client with a free key could freeze or kill the server, again after
        //     every restart. The day is already decoded, so this costs nothing. A run snapshot is not touched: the decoder bounds its day by
        //     maxDayFor(rules), 25 at most. Endless records, the stores and the match route keep their ENDLESS_LAST_DAY bounds (cheap reads)
        if (snap.mode === "endless" && snap.day > ENDLESS_ONLINE_LAST_DAY) {
          throw new HttpError(422, `day: ${snap.day} is past the last online endless day ${ENDLESS_ONLINE_LAST_DAY}`);
        }
        // 6. rules, the deck, the record (0.8.0 H2), then the store. The stored record is the same as before;
        //    neither the key nor the signature is kept.
        if (snap.rules !== RULES_VERSION) {
          throw new HttpError(422, `rules ${snap.rules} not accepted: this server validates ${RULES_VERSION}`);
        }
        // PACKS M2 (REQ-BFG-063): every upload under this build's rules carries its player's name (pool entries, which
        // are seeded, never uploaded, carry none). The decoder has already refused a bad one; here only its absence
        const named = nameProblem(snap.name);
        if (named) throw new HttpError(422, `name: ${named}`);
        // RETUNE-1 T5 (REQ-BFG-092): only the seed step grades a ghost (the graded pick ranks by it), so an upload carries
        // none (with PICK off the decoder has already refused the field, 400)
        if (snap.grade !== undefined) throw new HttpError(422, "grade: only the seed pool's ghosts carry a grade");
        // 0.7.0: a player's deck, the player mode (road gold, parts, hull). RUNES-1 (REQ-BFG-058): with the snapshot's run
        // seed, so validateBuild re-derives every dawn's rune offer (runes.ts runeProblem); the seed is stored, never served
        // LC-1 (REQ-BFG-073): and its LAST CHANCE (absent on every switch-off snapshot: the decoder refuses the field)
        // NPC-1 (REQ-BFG-077, REQ-BFG-078): and its road log (absent on every switch-off snapshot: the decoder refuses it, 400)
        // FIRSTDAY-1 (REQ-BFG-004, F4): and its first-run flag (absent on every other snapshot: the decoder refuses it
        // while the first-run gate is off, 400), so days 1-2's rune offers are re-derived by F3's rule
        const v = validateUpload(snap.build, snap.day, snap.rules, { seed: snap.seed, ...(snap.lastChance ? { lastChance: snap.lastChance } : {}), ...(snap.road ? { road: snap.road } : {}), ...(snap.firstRun ? { firstRun: true } : {}) });
        if (!v.ok) throw new HttpError(422, "deck failed validation", { errors: v.errors });
        // 0.8.0 H2 (backlog 325): the (wins, lives) record must be one a run can carry into this day's dusk, as the seed
        // and ghosts:admin revalidate already check (same words as revalidate's). Otherwise an honest deck could carry a
        // fake low record and be matched more often (D1 serves only ghosts with no better record). The decoder bounds day
        // 1..10, wins 0..day-1 and lives 1..9, so this stays cheap; a record it refuses keeps its 400.
        // LC-1 (REQ-BFG-073): the record must be reachable with the snapshot's LAST CHANCE (its day, or none): a lastChance
        // whose day can't be a loss to 1 life, or a run at 1 life that never had one, is refused. Z-BUMP: the switch is
        // gone (this was its on side); POST takes RULES_VERSION only, so the record is read by this build's rules
        // RUN-1 (REQ-BFG-059, D4): under a long run's rules the model is the long run's (records.ts longRunRecords: wins <= 9,
        // at most MAX_RUN_DRAWS draws, LAST CHANCE on any day, PATCH UP once per event bag), and the snapshot's `losses`, when it
        // carries one (v3, taken only under those rules), must match: day - 1 = wins + losses + draws. POST takes RULES_VERSION
        // only, so `rules` is this build's, as before
        const lcDay = { lastChance: snap.lastChance?.day ?? null, rules: snap.rules, ...(snap.losses !== undefined ? { losses: snap.losses } : {}) };
        // ENDLESS-1 (REQ-BFG-059, BRIEF-ENDLESS1 3.4): an ENDLESS snapshot (the decoder took its fields under rules with endless only,
        // bounded its day, wins, hearts and LAST CHANCE: 400 otherwise) is judged on the endless model (records.ts endlessRecordProblem):
        // the run was won on its victoryDay, and the endless dusks since lead to its endless wins and hearts: 422 otherwise
        if (snap.mode === "endless") {
          const why = endlessRecordProblem({ rules: snap.rules, day: snap.day, victoryDay: snap.victoryDay!, endlessWins: snap.endlessWins!, endlessLives: snap.endlessLives!, ...(snap.losses !== undefined ? { losses: snap.losses } : {}), ...(snap.lastChance ? { lastChance: snap.lastChance } : {}) });
          if (why) throw new HttpError(422, why);
        } else if (!isReachable(snap.day, snap.wins, snap.lives, lcDay)) {
          const after = snap.lastChance ? ` after a LAST CHANCE on day ${snap.lastChance.day}` : "";
          const lost = snap.losses !== undefined ? ` and ${snap.losses} losses` : "";
          throw new HttpError(422, `record: ${snap.wins}W ${snap.lives} lives${lost} is no record a run carries into dusk ${snap.day}${after}`);
        }
        // RUN-1 (R1.2, T3c): and under a long run's rules the upload STATES its losses (records.ts lossesProblem): without them the
        // record above was judged against any run that reaches it, which cannot tell draws and a PATCH UP from losses. The reason
        // names the field. After the record check, so an unreachable record keeps its "record:" reason; a 10-day upload (the
        // switch off, as shipped) is unchanged. The match route and the pool check ask nothing of this kind
        const unstated = lossesProblem(snap.rules, snap.losses);
        if (unstated) throw new HttpError(422, unstated);
        const { id, created } = await store.add(snap); // 201 only once the write is durable
        return send(res, created ? 201 : 200, { id });
      }
      case "/v1/profile": {
        // PROFILE-UP (REQ-BFG-074 clause 4): the steps are profileRoute.ts's, in POST /v1/ghosts' order (403, 401, 413, 401,
        // 400, 422, then read-merge-write; StorageError -> 503 below). The request log below stays as it is.
        only("PUT");
        const r = await putProfile({
          uploads, key: firstHeader(req, KEY_HEADER), sig: firstHeader(req, SIG_HEADER), readBody: (max) => readBody(req, max),
          store: profiles, now: clock,
        });
        if (r.status !== 200) throw new HttpError(r.status, r.error);
        return send(res, 200, r.profile);
      }
      case "/v1/ghosts/match": {
        only("GET");
        const m = parseMatchQuery(url.searchParams);
        // 0.7.0a D2: a new player is matched against the seed pool only; D1 holds inside pickGhost (eligible)
        // RETUNE-1 T5 (REQ-BFG-092): matchPick, the graded pick under rules with PICK (pick.ts); otherwise pickGhost exactly
        // RUN-1 (REQ-BFG-059, D6): a thin day (no eligible ghost) widens, under a long run's rules, to the nearest EARLIER day with
        // one, never a later: the buckets are read from the request's day down (matchmaking.ts matchDays: its own day only under
        // the 10-day rules, as before). matchPick takes the whole request each time, so the graded pick judges the record by the
        // requester's own day; a bucket with no eligible ghost answers null without touching the rng
        // The request's own day is read alone first (the common case, one bucket); only a thin day reads the earlier ones, all at once
        const scope = isNewPlayer(m) ? "pool" : "all";
        const rng = new Rng(matchSeed(m, salt()));
        const days = matchDays(m);
        let hit = matchPick(await store.bucket(m.rules, days[0], scope), m, rng);
        if (!hit && days.length > 1) {
          for (const bucket of await Promise.all(days.slice(1).map((d) => store.bucket(m.rules, d, scope)))) {
            hit = matchPick(bucket, m, rng);
            if (hit) break;
          }
        }
        if (!hit) throw new HttpError(404, "no ghost for this rules version, day and record yet");
        return send(res, 200, { id: hit.id, snapshot: servedSnapshot(hit.snapshot) }); // RUNES-1 (FIX-6): no seed
      }
      case "/":
      case "/index.html":
        if (!page) throw new HttpError(404, "not found");
        if (method !== "GET" && method !== "HEAD") throw new HttpError(405, "use GET or HEAD");
        return sendPage(req, res, page, method === "HEAD");
      default:
        throw new HttpError(404, "not found");
    }
  }

  const server = createServer((req, res) => {
    const t0 = Date.now();
    const ip = clientIp(req, trustProxy); // the rate limit's key, held in memory only: never logged
    const url = new URL(req.url ?? "/", "http://ghost.local");
    const origin = typeof req.headers.origin === "string" ? req.headers.origin : "";
    const allowed = origin !== "" && origins.has(origin);
    if (allowed) {
      res.setHeader("access-control-allow-origin", origin);
      res.setHeader("access-control-allow-methods", "GET, POST, PUT, OPTIONS"); // PROFILE-UP: PUT /v1/profile
      res.setHeader("access-control-allow-headers", ["content-type", KEY_HEADER, SIG_HEADER].join(", "));
      res.setHeader("access-control-max-age", 600);
    }
    res.setHeader("vary", "Origin");
    const finish = (e?: unknown) => {
      if (e instanceof HttpError) {
        if (e.status === 429) res.setHeader("retry-after", Math.ceil(limiter.windowMs / 1000));
        if (e.status === 413) res.setHeader("connection", "close");
        send(res, e.status, { error: e.message, ...e.extra });
      } else if (e instanceof SnapshotError) {
        send(res, 400, { error: e.message });
      } else if (e instanceof StorageError) {
        log(`storage error: ${e.message}`); // op, key and status only: never credentials
        res.setHeader("retry-after", 5);
        send(res, 503, { error: "ghost storage unavailable, try again shortly" });
      } else if (e !== undefined) {
        log(`error: ${e instanceof Error ? e.stack ?? e.message : String(e)}`);
        if (!res.headersSent) send(res, 500, { error: "internal error" });
      }
      // time, method, path, status and duration only. No client address (the limiter keeps it in
      // memory) and no query string (it carries the anonymous player id): neither is needed here.
      log(`${new Date().toISOString()} ${req.method} ${url.pathname} ${res.statusCode} ${Date.now() - t0}ms`);
    };
    if (req.method === "OPTIONS") {
      if (allowed) {
        res.statusCode = 204;
        res.end();
        return finish();
      }
      return finish(new HttpError(403, "origin not allowed"));
    }
    if (!limiter.allow(ip, t0)) return finish(new HttpError(429, "rate limit exceeded, slow down"));
    route(req, res, url).then(() => finish(), finish);
  });
  server.requestTimeout = 10_000; // slow-body guard
  server.headersTimeout = 5_000;

  return {
    server,
    store,
    listen: (port, host = "127.0.0.1") => new Promise<number>((resolve, reject) => {
      server.once("error", reject);
      server.listen(port, host, () => {
        const a = server.address();
        resolve(typeof a === "object" && a ? a.port : port);
      });
    }),
    close: () => new Promise<void>((resolve) => {
      server.close(() => resolve());
      server.closeAllConnections();
    }),
  };
}
