// The uploads step's live check (0.8.0 U2 M2; REQ-BFG-016, REQ-BFG-009), a port of 0.7.0 U1's probe (cap_gamma, uploads-070
// d145bc5) to bb-0.8.0, and since BELTS (REQ-BFG-043, REQ-BFG-044) to bb-0.8.3: the same four heroes and the same checks,
// under the rules string BELTS ships (belt slots by level and the hero's two gold upgrades change which decks are legal,
// not who may travel). It does what a player's page does, from outside, against a base URL. It makes a fresh device
// identity with the game's own identity and signing code (src/net/identity.ts loadIdentity over an in-memory key store:
// the private key is generated non-extractable and never leaves this process). Each POST /v1/ghosts sends the canonical
// bytes the game's submitGhost sends (encodeSnapshot), signed with identity.sign. The checks, in order:
//   furnace-signed      the FURNACE start deck, day 1, 0 wins, 5 lives                         -> 201 and its ghost id
//   furnace-unsigned    the same bytes, without x-bb-key and x-bb-sig                          -> 401
//   dishonest-signed    that deck with 100 more hull than day 1's budget pays for              -> 422, validateUpload's budget error
//   unreachable-signed  that honest deck with a record no run carries: day 1, 0 wins, 1 life   -> 422, H2's record error
//   hero-WEAVER, hero-FOUNDRY, hero-BASTION: each hero's honest day-3 reference deck (heroRefBuild) at 1 win and 5 lives,
//                       a record a run carries into dusk 3 (records.ts isReachable)            -> 201 each
//   hero-METRONOME, hero-SIPHON: the same, for the two heroes bb-0.8.3 does not take (0.9.0 adds them). The game's encoder
//                       refuses them, so their bytes are the canonical text built by hand     -> 400, the strict decode's
//                       hero gate naming bb-0.8.3 and the hero
// Exactly four decks are stored, each its own record under the probe's player: FURNACE, WEAVER, FOUNDRY and BASTION.
// Built by `npm run build:server` beside ghost-admin.mjs:  node server/dist/ghost-probe.mjs <base-url> <id-file>
// It writes the probe's player id to <id-file> before the first POST, so the clean-up (ghost-admin.mjs remove-player)
// always has it, and it refuses an <id-file> that already holds an id (that earlier probe's player is not cleaned up yet).
// It prints one line per check (PASS or FAIL, name, expected, got), then the player id, then a summary with the number of
// decks the server stored for this player. Exit 0 only if every check matched; 1 if a check failed or got no answer; 2
// for a usage error (nothing sent). It refuses to run unless this build's RULES_VERSION is bb-0.8.6. There is no secret
// to print: the key is non-extractable, and neither the public key nor a signature is printed. No network but the base
// URL. Its expectations are written out here, not read from the code under test (the rules gate, the record model).

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { KEY_HEADER, SIG_HEADER, loadIdentity, memoryKeyStore } from "../src/net/identity";
import { checkBuildShape, encodeSnapshot, ghostId, SNAPSHOT_VERSION, type GhostSnapshot } from "../src/net/snapshot";
import { RULES_VERSION, type HeroId } from "../src/sim/content";
import { heroRefBuild, heroStartBuild } from "../src/sim/heroBuilds";

/** The rules this probe's expectations are written for: PACKS's (bb-0.8.6; BELTS's bb-0.8.3 and 0.8.0's bb-0.8.0 before, the same heroes). */
export const PROBE_RULES = "bb-0.8.6";
/** The heroes bb-0.8.6 takes, as its hero gate names them (rulesGate.ts RULES_HEROES), written out. */
export const PROBE_ACCEPTED = "FURNACE, WEAVER, FOUNDRY, BASTION";
/** After FURNACE: the heroes whose honest decks must be stored (201), then those bb-0.8.6 refuses (400), in posting order. */
export const STORED_HEROES: readonly HeroId[] = ["weaver", "foundry", "bastion"];
export const REFUSED_HEROES: readonly HeroId[] = ["metronome", "siphon"];
/** The hero rows' dusk: day 3 at 1 win and 5 lives, a record a run carries into dusk 3. */
export const HERO_DUSK = { day: 3, wins: 1, lives: 5 } as const;
/** The unreachable row's dusk: day 1 with 1 life (every run starts day 1 with 5 lives). */
export const UNREACHABLE_DUSK = { day: 1, wins: 0, lives: 1 } as const;
/** The decks the probe stores when every check passes: FURNACE's and STORED_HEROES'. */
export const PROBE_STORED = 1 + STORED_HEROES.length;
export const PROBE_TIMEOUT_MS = 15_000;
export const PROBE_USAGE = "usage: node server/dist/ghost-probe.mjs <base-url> <id-file>   (base url: http(s)://host[:port], no path; an id file that holds no id yet)";
/** The server's answer to a POST without the signing headers (identity.ts uploadHeaderError). */
export const UNSIGNED_ERROR = `unsigned upload: the ${KEY_HEADER} and ${SIG_HEADER} headers are required`;
/** H2's answer to a record no run can carry into that dusk (server/app.ts, POST step 6). */
export const recordError = (d: { day: number; wins: number; lives: number }): string =>
  `record: ${d.wins}W ${d.lives} lives is no record a run carries into dusk ${d.day}`;
/** The strict decode's answer to a hero bb-0.8.6 does not take (snapshot.ts checkSnapshot, rulesGate.ts heroGateProblem). */
export const heroError = (hero: HeroId): string => `snapshot.hero: rules ${PROBE_RULES} accept only ${PROBE_ACCEPTED}, not ${hero.toUpperCase()}`;

export interface ProbeAnswer {
  status: number;
  text: string;
  id?: string;
  error?: string;
  errors?: string[];
}

/** One planned POST: the snapshot, the exact body text, signed or not, and what must come back. */
export interface PlannedPost {
  name: string;
  snapshot: GhostSnapshot;
  text: string;
  signed: boolean;
  expected: string;
  pass: (a: ProbeAnswer) => boolean;
}

export interface ProbeCheck {
  name: string;
  expected: string;
  got: string;
  ok: boolean;
  /** The answer's status; undefined when there was no answer. */
  status?: number;
}

export interface ProbeResult {
  playerId: string;
  checks: ProbeCheck[];
  ok: boolean;
  /** Checks the server answered 201 or 200: decks it holds for this player. */
  stored: number;
}

class ProbeUsageError extends Error {}

/** The base URL as an origin without a trailing slash: http(s), a host, and no path, query, fragment or credentials. */
export function probeBase(raw: string | undefined): string {
  let u: URL;
  try {
    u = new URL(raw ?? "");
  } catch {
    throw new ProbeUsageError(`not a URL: ${JSON.stringify(raw ?? "")}`);
  }
  if ((u.protocol !== "http:" && u.protocol !== "https:") || u.pathname !== "/" || u.search || u.hash || u.username || u.password) {
    throw new ProbeUsageError(`expected a bare http(s) origin such as https://beltbattles.fly.dev, not ${JSON.stringify(raw)}`);
  }
  return u.origin;
}

function errText(e: unknown): string {
  if (!(e instanceof Error)) return String(e);
  if (e.name === "AbortError" || e.name === "TimeoutError") return "timeout";
  const cause = (e as { cause?: unknown }).cause;
  return cause instanceof Error ? `${e.message}: ${cause.message}` : e.message;
}

const utf8 = (text: string): Uint8Array<ArrayBuffer> => new TextEncoder().encode(text);

/**
 * The canonical text of `s` as the game's encoder writes it (encodeSnapshot: the decoder's key order, the build as the
 * strict shape check copies it), built without the encoder's rules gates. Only for heroes the encoder refuses under these
 * rules; for every other snapshot it equals encodeSnapshot(s) (tests/ghost-probe.test.ts).
 */
export function canonicalText(s: GhostSnapshot): string {
  return JSON.stringify({
    v: s.v, rules: s.rules, hero: s.hero, day: s.day, wins: s.wins, lives: s.lives,
    build: checkBuildShape(s.build, "snapshot.build", s.v), runId: s.runId, playerId: s.playerId, createdAt: s.createdAt,
    ...(s.name !== undefined ? { name: s.name } : {}), // PACKS M2: the player's name, last
  });
}

/** PACKS M2 (REQ-BFG-063): the probe's player name: every upload under bb-0.8.6 carries one (POST /v1/ghosts refuses
 *  one without it, 422 "name: missing"). */
export const PROBE_NAME = "PROBE";

/** The snapshot `playerId` uploads at the dusk of `d.day` with `build`, under this build's rules. */
function dusk(playerId: string, hero: HeroId, d: { day: number; wins: number; lives: number }, build: GhostSnapshot["build"], runId: string, now: number): GhostSnapshot {
  return { v: SNAPSHOT_VERSION, rules: RULES_VERSION, hero, day: d.day, wins: d.wins, lives: d.lives, build, runId, playerId, createdAt: now, name: PROBE_NAME };
}

/** The nine POSTs, in order, for `playerId` at time `now`. Pure: no key, no network. */
export function probePlan(playerId: string, now: number): PlannedPost[] {
  const run = `probe-${now}`;
  const plan: PlannedPost[] = [];
  // 1-2. an honest FURNACE deck, as the game's submitGhost sends it (the canonical bytes), signed and then unsigned
  const honest = dusk(playerId, "furnace", { day: 1, wins: 0, lives: 5 }, heroStartBuild("furnace"), run, now);
  const honestText = encodeSnapshot(honest);
  const id = ghostId(honest);
  plan.push({ name: "furnace-signed", snapshot: honest, text: honestText, signed: true, expected: `201 {"id":"${id}"}`, pass: (a) => a.status === 201 && a.id === id });
  plan.push({ name: "furnace-unsigned", snapshot: honest, text: honestText, signed: false, expected: `401 ${UNSIGNED_ERROR}`, pass: (a) => a.status === 401 && a.error === UNSIGNED_ERROR });
  // 3. dishonest: the same deck with 100 hull more than day 1's budget pays for
  const over = dusk(playerId, "furnace", { day: 1, wins: 0, lives: 5 }, { ...honest.build, hullBonus: honest.build.hullBonus + 100 }, `${run}-over`, now);
  plan.push({
    name: "dishonest-signed", snapshot: over, text: encodeSnapshot(over), signed: true, expected: "422 deck failed validation: budget: ...",
    pass: (a) => a.status === 422 && a.error === "deck failed validation" && (a.errors ?? []).some((e) => e.startsWith("budget: ")),
  });
  // 4. unreachable: the honest deck under a record no run carries into that dusk (H2's record check)
  const far = dusk(playerId, "furnace", UNREACHABLE_DUSK, honest.build, `${run}-unreachable`, now);
  const farError = recordError(UNREACHABLE_DUSK);
  plan.push({ name: "unreachable-signed", snapshot: far, text: encodeSnapshot(far), signed: true, expected: `422 ${farError}`, pass: (a) => a.status === 422 && a.error === farError });
  // 5-7. the other heroes bb-0.8.6 takes: their honest day-3 reference decks, each stored as its own record
  for (const hero of STORED_HEROES) {
    const s = dusk(playerId, hero, HERO_DUSK, heroRefBuild(hero, HERO_DUSK.day), `${run}-${hero}`, now);
    const hid = ghostId(s);
    plan.push({ name: `hero-${hero.toUpperCase()}`, snapshot: s, text: encodeSnapshot(s), signed: true, expected: `201 {"id":"${hid}"}`, pass: (a) => a.status === 201 && a.id === hid });
  }
  // 8-9. the heroes bb-0.8.6 refuses: the same honest reference decks, as the canonical text built by hand
  for (const hero of REFUSED_HEROES) {
    const s = dusk(playerId, hero, HERO_DUSK, heroRefBuild(hero, HERO_DUSK.day), `${run}-${hero}`, now);
    const want = heroError(hero);
    plan.push({ name: `hero-${hero.toUpperCase()}`, snapshot: s, text: canonicalText(s), signed: true, expected: `400 ${want}`, pass: (a) => a.status === 400 && a.error === want });
  }
  return plan;
}

/** One POST /v1/ghosts with these exact body bytes. Throws on no answer (a network error or the timeout). */
async function post(base: string, body: Uint8Array<ArrayBuffer>, headers: Record<string, string>, timeoutMs: number): Promise<ProbeAnswer> {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), timeoutMs);
  try {
    const res = await fetch(`${base}/v1/ghosts`, { method: "POST", headers: { "content-type": "application/json", ...headers }, body, signal: ctl.signal });
    const text = await res.text();
    let o: Record<string, unknown> = {};
    try {
      const parsed: unknown = JSON.parse(text);
      if (typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)) o = parsed as Record<string, unknown>;
    } catch {
      /* not JSON: shown as text */
    }
    return {
      status: res.status, text,
      id: typeof o.id === "string" ? o.id : undefined,
      error: typeof o.error === "string" ? o.error : undefined,
      errors: Array.isArray(o.errors) ? o.errors.filter((e): e is string => typeof e === "string") : undefined,
    };
  } finally {
    clearTimeout(timer);
  }
}

/** An answer on one line: the status, then the id, or the error and its first detail, or the body (clipped). */
function shown(a: ProbeAnswer): string {
  const detail = a.id !== undefined ? `{"id":"${a.id}"}` : a.error !== undefined ? `${a.error}${a.errors?.length ? `: ${a.errors[0]}` : ""}` : a.text;
  const one = detail.replace(/\s+/g, " ").trim();
  return `${a.status} ${one.length > 200 ? `${one.slice(0, 197)}...` : one}`;
}

/**
 * The nine checks against `base`. `saveId` gets the probe's player id before the first POST. Resolves every check, each
 * with what was expected and what came back; a POST with no answer is a failed check. Throws only if no identity can be
 * made or `saveId` throws, before any POST.
 */
export async function runProbe(base: string, saveId: (playerId: string) => void, timeoutMs = PROBE_TIMEOUT_MS, now = Date.now()): Promise<ProbeResult> {
  const me = await loadIdentity(memoryKeyStore());
  if (!me) throw new Error("no WebCrypto (crypto.subtle) here: cannot make a device identity");
  saveId(me.playerId);
  const checks: ProbeCheck[] = [];
  for (const p of probePlan(me.playerId, now)) {
    let got: string, ok = false, status: number | undefined;
    try {
      const body = utf8(p.text);
      const headers: Record<string, string> = {};
      if (p.signed) {
        const { key, sig } = await me.sign(body); // the game's own signing: UPLOAD_PREFIX + these exact bytes
        headers[KEY_HEADER] = key;
        headers[SIG_HEADER] = sig;
      }
      const a = await post(base, body, headers, timeoutMs);
      status = a.status;
      got = shown(a);
      ok = p.pass(a);
    } catch (e) {
      got = `no answer (${errText(e)})`;
    }
    checks.push({ name: p.name, expected: p.expected, got, ok, status });
  }
  const stored = checks.filter((c) => c.status === 201 || c.status === 200).length;
  return { playerId: me.playerId, checks, ok: checks.every((c) => c.ok), stored };
}

/** The command line: <base-url> <id-file>. Resolves the exit code (0 every check as expected, 1 not, 2 usage). */
export async function probeMain(argv: readonly string[], out: (line: string) => void, timeoutMs = PROBE_TIMEOUT_MS): Promise<number> {
  let base: string, idFile: string;
  try {
    if (argv.length !== 2) throw new ProbeUsageError(`expected 2 arguments, got ${argv.length}`);
    base = probeBase(argv[0]);
    idFile = argv[1];
    if (!idFile || idFile.startsWith("-")) throw new ProbeUsageError(`the id file must be a path, not ${JSON.stringify(idFile)}`);
    let held = "";
    try {
      held = existsSync(idFile) ? readFileSync(idFile, "utf8").trim() : "";
    } catch {
      throw new ProbeUsageError(`cannot read the id file ${idFile}`);
    }
    if (held) throw new ProbeUsageError(`${idFile} already holds a probe player id: clean that player up first (RUNBOOK section 9), then move the file away`);
  } catch (e) {
    if (!(e instanceof ProbeUsageError)) throw e;
    out(`ghost-probe: ${e.message}`);
    out(PROBE_USAGE);
    return 2;
  }
  if (RULES_VERSION !== PROBE_RULES) {
    out(`ghost-probe: this build's rules are ${RULES_VERSION}, but the probe's expectations are written for ${PROBE_RULES}`);
    return 2;
  }
  out(`probe: POST ${base}/v1/ghosts as a fresh device (rules ${RULES_VERSION}); only the FURNACE, WEAVER, FOUNDRY and BASTION decks may be stored`);
  let r: ProbeResult;
  try {
    r = await runProbe(base, (playerId) => writeFileSync(idFile, `${playerId}\n`), timeoutMs);
  } catch (e) {
    out(`ghost-probe failed before any upload: ${errText(e)}`);
    return 1;
  }
  for (const c of r.checks) out(`${c.ok ? "PASS" : "FAIL"}  ${c.name.padEnd(18)} expected: ${c.expected} | got: ${c.got}`);
  out(`probe player: ${r.playerId}`);
  out(`probe: ${r.checks.filter((c) => c.ok).length} of ${r.checks.length} checks as expected; the server stored ${r.stored} deck(s) for this player (expected ${PROBE_STORED}); the player id is in ${idFile}`);
  return r.ok ? 0 : 1;
}
