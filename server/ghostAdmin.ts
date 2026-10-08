// Ghost store maintenance (0.7.0, R1 M2; REQ-BFG-016, REQ-BFG-009). The genre study's R4: keep a bulk wipe for ghosts by
// version or by exploit, so uploads never open without a way to clean the store. Built like the seed: this module is the
// tool and server/ghostAdminMain.ts its command line (server/dist/ghost-admin.mjs; `npm run ghosts:admin -- ...`). It
// reads the store exactly as the server does (config.ts readStoreConfig: BB_GHOST_STORE, BB_GHOST_DATA or --data, the
// Tigris variables).
//
//   list                      --rules <bb-x.y.z>          per day: seed-pool ghosts, uploads and distinct players
//   revalidate                --rules <bb-x.y.z> [--apply] every upload through the strict decoder (with the rules
//                                                          gate), the exact rules, validateUpload in the player mode and
//                                                          the reachable-record check (src/net/records.ts), plus its id
//                                                          and key; each failure listed with its reasons
//   wipe-uploads              --rules <bb-x.y.z> [--apply] [--pool]   every upload of that rules version
//   remove-player <playerId>  --rules <bb-x.y.z> [--apply] every upload by that player
//
// Safety:
//  - a dry run unless --apply: it prints exactly what --apply would delete, and deletes nothing;
//  - --rules is required, and nothing of another rules version is read or touched;
//  - the seed pool is never deleted, except by wipe-uploads given --pool (the next deploy's seed writes it back);
//  - --apply deletes exactly the records the plan printed: by object key, or by the exact JSON line it read. A record
//    written after the plan is never deleted;
//  - a running server keeps serving a deleted ghost from memory until it reloads its copy: on Tigris after its bucket
//    cache expires (BB_GHOST_CACHE_TTL_S; 600 s on Fly) or a restart; on JSON lines only after a restart, so stop that
//    server while the tool rewrites its files.

import { existsSync, readFileSync, renameSync, unlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { RULES_VERSION } from "../src/sim/content";
import { isReachable } from "../src/net/records";
import { nameProblem } from "../src/net/names"; // PACKS M2 (REQ-BFG-063)
import { parseRules, rulesGateProblem } from "../src/net/rulesGate";
import { decodeSnapshot, ghostId, ID_PATTERN, type GhostSnapshot } from "../src/net/snapshot";
import { validateUpload } from "../src/net/validate";
import { ConfigError, readStoreConfig, type StoreConfig } from "./config";
import { S3Client } from "./s3";
import { POOL_FILE, STORE_FILE, type StoreKind } from "./store";
import { parseKey } from "./tigrisStore";

type Env = Record<string, string | undefined>;

export const COMMANDS = ["list", "revalidate", "wipe-uploads", "remove-player"] as const;
export type Command = (typeof COMMANDS)[number];
export type RecordKind = "pool" | "upload";

/** One stored record as the tool sees it. */
export interface StoredRecord {
  /** What --apply deletes: the object key (Tigris), or "<file>:<line>" (JSON lines). */
  ref: string;
  kind: RecordKind;
  /** Day, ghost id and player as stored: from the key (Tigris), else read leniently from the body. Null: unreadable. */
  day: number | null;
  id: string | null;
  playerId: string | null;
  /** The stored bytes ("" when the command needs no bodies). */
  text: string;
  /** Tigris: the key carries the rules version, day and id the body must match. */
  keyed: boolean;
  /** Tigris: an object under pool/ or player/ whose key is not a ghost key. */
  badKey?: boolean;
}

/** One rules version's records in a store. */
export interface Holdings {
  records: StoredRecord[]; // its seed pool and its uploads
  other: string[]; // Tigris: other objects under its prefix; JSON lines: lines with no readable rules version. Never touched
}

/** A store as the tool reads and deletes it. */
export interface AdminStore {
  readonly kind: StoreKind;
  readonly where: string;
  /** Every seed-pool record and upload of `rules`; nothing of another rules version. `bodies`: read the uploads' bytes. */
  read(rules: string, bodies: boolean): Promise<Holdings>;
  /** Delete exactly these records (as read() returned them). Resolves how many were deleted. */
  remove(records: readonly StoredRecord[]): Promise<number>;
}

const message = (e: unknown) => (e instanceof Error ? e.message : String(e));

/** A record's rules, day, id and player, read without the strict check (a broken record is listed, not refused). */
function lenient(text: string): { rules: string | null; day: number | null; id: string | null; playerId: string | null } {
  let rec: unknown;
  try {
    rec = JSON.parse(text);
  } catch {
    rec = null;
  }
  const o = typeof rec === "object" && rec !== null && !Array.isArray(rec) ? (rec as { id?: unknown; snapshot?: unknown }) : {};
  const s = typeof o.snapshot === "object" && o.snapshot !== null ? (o.snapshot as { rules?: unknown; day?: unknown; playerId?: unknown }) : {};
  return {
    rules: typeof s.rules === "string" ? s.rules : null,
    day: typeof s.day === "number" && Number.isInteger(s.day) ? s.day : null,
    id: typeof o.id === "string" ? o.id : null,
    playerId: typeof s.playerId === "string" ? s.playerId : null,
  };
}

/** Run `fn` over `items`, at most `limit` at a time. */
async function eachLimit<T>(items: readonly T[], limit: number, fn: (item: T) => Promise<void>): Promise<void> {
  let next = 0;
  const worker = async () => {
    while (next < items.length) await fn(items[next++]);
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
}

/** The JSON-lines store (store.ts JsonlStore): pool.jsonl (the seed pool) and ghosts.jsonl (uploads), one record a line. */
export class JsonlAdmin implements AdminStore {
  readonly kind = "jsonl" as const;
  private static readonly FILES: readonly [string, RecordKind][] = [[POOL_FILE, "pool"], [STORE_FILE, "upload"]];

  constructor(readonly dataDir: string) {}

  get where(): string {
    return this.dataDir;
  }

  async read(rules: string): Promise<Holdings> {
    if (!existsSync(this.dataDir)) throw new ConfigError(`no ghost data directory ${this.dataDir} (BB_GHOST_DATA or --data)`);
    const records: StoredRecord[] = [], other: string[] = [];
    for (const [file, kind] of JsonlAdmin.FILES) {
      const path = join(this.dataDir, file);
      if (!existsSync(path)) continue;
      readFileSync(path, "utf8").split("\n").forEach((line, i) => {
        if (!line.trim()) return;
        const f = lenient(line);
        if (f.rules === null) other.push(`${file}:${i + 1}`);
        else if (f.rules === rules) records.push({ ref: `${file}:${i + 1}`, kind, day: f.day, id: f.id, playerId: f.playerId, text: line, keyed: false });
      });
    }
    return { records, other };
  }

  async remove(records: readonly StoredRecord[]): Promise<number> {
    let n = 0;
    for (const [file] of JsonlAdmin.FILES) {
      const mine = records.filter((r) => r.ref.startsWith(`${file}:`));
      if (mine.length) n += this.rewrite(join(this.dataDir, file), mine);
    }
    return n;
  }

  /**
   * Drop the planned lines from one file: a copy without them is written, then renamed over the file (readers see the old
   * file or the new one). A line is dropped only where the plan read it, with the same bytes, so nothing written since is
   * lost; if the file changes while the copy is written (a running server appended), it starts over.
   */
  private rewrite(path: string, mine: readonly StoredRecord[]): number {
    const tmp = `${path}.admin.tmp`;
    for (let attempt = 0; attempt < 5; attempt++) {
      const before = readFileSync(path, "utf8");
      const lines = before.split("\n");
      const drop = new Set<number>();
      for (const r of mine) {
        const i = Number(r.ref.slice(r.ref.lastIndexOf(":") + 1)) - 1;
        if (lines[i] === r.text) drop.add(i);
      }
      writeFileSync(tmp, lines.filter((_, i) => !drop.has(i)).join("\n"));
      if (readFileSync(path, "utf8") !== before) continue;
      renameSync(tmp, path);
      return drop.size;
    }
    unlinkSync(tmp);
    throw new Error(`${path} kept changing while the tool rewrote it; stop the ghost server and run again`);
  }
}

/** The Tigris store (tigrisStore.ts): one object per ghost, ghosts/<rules>/dDD/{pool,player}/<id>.json. */
export class TigrisAdmin implements AdminStore {
  readonly kind = "tigris" as const;

  constructor(readonly s3: S3Client, private readonly concurrency = 16) {}

  get where(): string {
    return this.s3.describe();
  }

  async read(rules: string, bodies: boolean): Promise<Holdings> {
    const prefix = `ghosts/${rules}/`;
    const records: StoredRecord[] = [], other: string[] = [];
    for (const o of await this.s3.listAll(prefix)) {
      const k = parseKey(o.key);
      if (k && k.rules === rules) {
        records.push({ ref: o.key, kind: k.kind === "pool" ? "pool" : "upload", day: k.day, id: k.id, playerId: null, text: "", keyed: true });
        continue;
      }
      // a stray object: under pool/ or player/ it counts as that kind (revalidate fails it); anywhere else it is never touched
      const seg = o.key.slice(prefix.length).split("/");
      const kind: RecordKind | null = seg[1] === "pool" ? "pool" : seg[1] === "player" ? "upload" : null;
      if (kind) records.push({ ref: o.key, kind, day: /^d\d\d$/.test(seg[0]) ? Number(seg[0].slice(1)) : null, id: null, playerId: null, text: "", keyed: true, badKey: true });
      else other.push(o.key);
    }
    const gone = new Set<StoredRecord>();
    if (bodies) {
      await eachLimit(records.filter((r) => r.kind === "upload"), this.concurrency, async (r) => {
        const text = await this.s3.getText(r.ref);
        if (text === null) return void gone.add(r); // deleted since the LIST
        r.text = text;
        r.playerId = lenient(text).playerId;
      });
    }
    return { records: records.filter((r) => !gone.has(r)), other };
  }

  async remove(records: readonly StoredRecord[]): Promise<number> {
    let n = 0;
    await eachLimit(records, this.concurrency, async (r) => {
      await this.s3.delete(r.ref);
      n++;
    });
    return n;
  }
}

/** The configured store, as the tool sees it. */
export function openAdmin(cfg: StoreConfig, log: (line: string) => void = () => {}): AdminStore {
  return cfg.kind === "jsonl" ? new JsonlAdmin(cfg.dataDir) : new TigrisAdmin(new S3Client({ ...cfg.s3, log }));
}

/**
 * Why an upload fails revalidation, every reason; [] when it passes. The checks POST /v1/ghosts runs on an upload (the
 * strict decoder, which carries the rules gate; the exact rules; validateUpload in the player mode), the reachable-record
 * check the seed applies (records.ts), and the record's own integrity: its id, and on Tigris its key. The upload's
 * signature can't be checked again: the server keeps neither the key nor the signature.
 */
export function uploadProblems(r: StoredRecord, rules: string): string[] {
  if (r.badKey) return [`key: ${r.ref} is not a ghost key (ghosts/<rules>/dDD/player/<id>.json)`];
  let rec: unknown;
  try {
    rec = JSON.parse(r.text);
  } catch {
    return ["record: not JSON"];
  }
  if (typeof rec !== "object" || rec === null || Array.isArray(rec)) return ["record: not an {id, at, snapshot} object"];
  const o = rec as { id?: unknown; snapshot?: unknown };
  let s: GhostSnapshot;
  try {
    s = decodeSnapshot(JSON.stringify(o.snapshot ?? null));
  } catch (e) {
    return [`strict decode: ${message(e)}`];
  }
  const out: string[] = [];
  const id = ghostId(s);
  if (o.id !== id) out.push(`record: id ${JSON.stringify(o.id ?? null)} is not the snapshot's ghost id ${id}`);
  if (r.keyed && (r.id !== id || r.day !== s.day)) out.push(`key: ${r.ref} does not match the snapshot (day ${s.day}, ghost ${id})`);
  if (s.rules !== rules) out.push(`rules: the snapshot says ${s.rules}, stored under ${rules}`);
  const gate = rulesGateProblem(s.rules, s.build);
  if (gate) out.push(`rules gate: ${gate}`);
  // Z-PREP (REQ-BFG-073; REVIEW-LC1, carried to the flip): an upload that carries a LAST CHANCE is checked with it, as POST
  // /v1/ghosts checked it (server/app.ts): validateUpload told its seed and its card (the rune's place, the free part's
  // price, the +LAST_CHANCE_HULL grant, the card the seed's offer gave), and the record check is told its LAST CHANCE day,
  // or none (a run at 1 life that never had one carries no record). Z-BUMP (REQ-BFG-073; REVIEW-ZPREP F1): the switch is
  // gone, and the record check asks the record's own rules through the rules gate, as the decoder does (records.ts
  // recordHasLastChance: rulesGate.ts lastChanceGateProblem): a record under rules before LAST_CHANCE_RULES is read
  // without LAST CHANCE (today's isReachable before the flip; `revalidate --rules <older>`), so an honest older record at
  // 1 life is never flagged. A snapshot without the field is validated as before (no seed: REVIEW-ZPREP ruling 3).
  const lc = s.lastChance;
  // NPC-1 (REQ-BFG-077, REQ-BFG-078): an upload with a road log is checked with it, as POST /v1/ghosts checked it (its seed
  // re-derives each drop); one without it (every switch-off upload) is validated exactly as before
  const v = s.road ? validateUpload(s.build, s.day, s.rules, { seed: s.seed, ...(lc ? { lastChance: lc } : {}), road: s.road })
    : lc ? validateUpload(s.build, s.day, s.rules, { seed: s.seed, lastChance: lc }) : validateUpload(s.build, s.day, s.rules);
  if (!v.ok) out.push(`validateUpload: ${v.errors.join("; ")}`);
  const reachable = isReachable(s.day, s.wins, s.lives, { rules: s.rules, lastChance: lc?.day ?? null });
  if (!reachable) out.push(`record: ${s.wins}W ${s.lives} lives is no record a run carries into dusk ${s.day}${lc ? ` after a LAST CHANCE on day ${lc.day}` : ""}`);
  // PACKS M2 (REQ-BFG-063): POST /v1/ghosts takes an upload under RULES_VERSION only with its player's name (a bad name
  // is already the strict decode's refusal above); uploads stored under older rules never carried one
  const named = s.rules === RULES_VERSION ? nameProblem(s.name) : null;
  if (named) out.push(`name: ${named}`);
  return out;
}

export interface AdminArgs {
  command: Command;
  rules: string;
  apply: boolean;
  pool: boolean;
  playerId?: string; // remove-player
}

/** A usage error: nothing is read or deleted; exit code 2. */
export class UsageError extends Error {
  constructor(msg: string) {
    super(msg);
    this.name = "UsageError";
  }
}

export const USAGE = [
  "usage: npm run ghosts:admin -- <command> --rules <bb-x.y.z> [--apply]   (in the image: node /app/dist/ghost-admin.mjs ...)",
  "  list                                per day: seed-pool ghosts, uploads and distinct players",
  "  revalidate [--apply]                every upload through the strict decoder, validateUpload (player mode), the",
  "                                      reachable-record check and the rules gate; lists each failure; --apply deletes them",
  "  wipe-uploads [--apply] [--pool]     every upload of that rules version; --pool: the seed pool too",
  "  remove-player <playerId> [--apply]  every upload by that player",
  "A dry run unless --apply. The store is the server's: BB_GHOST_STORE=jsonl (BB_GHOST_DATA, or --data <dir>) or tigris",
  "(AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, AWS_ENDPOINT_URL_S3, BUCKET_NAME).",
].join("\n");

/** The command line: <command> [<playerId>] --rules <v> [--apply] [--pool] [--data <dir>]. Throws UsageError. */
export function parseArgs(argv: readonly string[]): AdminArgs {
  const pos: string[] = [];
  let rules: string | undefined, apply = false, pool = false;
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--apply") apply = true;
    else if (a === "--pool") pool = true;
    else if (a === "--rules" || a === "--data") {
      const v = argv[++i];
      if (v === undefined || v.startsWith("--")) throw new UsageError(`${a} needs a value`);
      if (a === "--rules") rules = v;
    } else if (a.startsWith("--")) throw new UsageError(`unknown option ${a}`);
    else pos.push(a);
  }
  const command = pos.shift();
  if (!command) throw new UsageError("no command");
  if (!(COMMANDS as readonly string[]).includes(command)) throw new UsageError(`unknown command "${command}": use ${COMMANDS.join(", ")}`);
  if (rules === undefined) throw new UsageError("--rules <bb-x.y.z> is required: the tool only reads and deletes one rules version");
  if (!parseRules(rules)) throw new UsageError(`--rules ${JSON.stringify(rules)} is not a rules version (bb-MAJOR.MINOR.PATCH)`);
  const args: AdminArgs = { command: command as Command, rules, apply, pool };
  if (args.command === "remove-player") {
    const id = pos.shift();
    if (id === undefined || !ID_PATTERN.test(id)) throw new UsageError("remove-player needs a player id (1-64 of A-Z a-z 0-9 _ -)");
    args.playerId = id;
  }
  if (pos.length) throw new UsageError(`unexpected argument ${JSON.stringify(pos[0])}`);
  if (pool && args.command !== "wipe-uploads") throw new UsageError("--pool goes only with wipe-uploads");
  if (apply && args.command === "list") throw new UsageError("list never deletes: drop --apply");
  if (args.command === "revalidate" && rules !== RULES_VERSION) {
    throw new UsageError(`revalidate checks uploads with this build's rules, ${RULES_VERSION}; for ${rules} use wipe-uploads or remove-player`);
  }
  return args;
}

export interface PlanEntry {
  record: StoredRecord;
  why: string;
}

/** What a command deletes, and what it keeps of the rules version. */
export interface Plan {
  args: AdminArgs;
  delete: PlanEntry[];
  keep: { pool: number; uploads: number };
}

/** The plan for revalidate, wipe-uploads or remove-player over one rules version's records. The seed pool is in it only
 *  for wipe-uploads with --pool. */
export function makePlan(args: AdminArgs, h: Holdings): Plan {
  const del: PlanEntry[] = [];
  for (const r of h.records) {
    let why: string | null = null;
    if (args.command === "wipe-uploads") why = r.kind === "upload" || args.pool ? `wipe-uploads${r.kind === "pool" ? " --pool" : ""}` : null;
    else if (r.kind !== "upload") why = null; // revalidate and remove-player never touch the seed pool
    else if (args.command === "revalidate") why = uploadProblems(r, args.rules).join(" | ") || null;
    else if (args.command === "remove-player") why = r.playerId === args.playerId ? `player ${args.playerId}` : null;
    if (why) del.push({ record: r, why });
  }
  const gone = new Set(del.map((d) => d.record));
  const kept = h.records.filter((r) => !gone.has(r));
  return { args, delete: del, keep: { pool: kept.filter((r) => r.kind === "pool").length, uploads: kept.filter((r) => r.kind === "upload").length } };
}

export interface DayCount {
  day: number | null; // null: unreadable
  pool: number;
  uploads: number;
  players: number; // distinct uploaders
}

/** list: per day, the seed-pool ghosts, the uploads and the distinct players who uploaded them; then the totals. */
export function countDays(h: Holdings): { days: DayCount[]; total: DayCount; noPlayer: number } {
  const by = new Map<number | null, { pool: number; uploads: number; players: Set<string> }>();
  const all = new Set<string>();
  let noPlayer = 0;
  for (const r of h.records) {
    const d = by.get(r.day) ?? { pool: 0, uploads: 0, players: new Set<string>() };
    by.set(r.day, d);
    if (r.kind === "pool") d.pool++;
    else {
      d.uploads++;
      if (r.playerId === null) noPlayer++;
      else {
        d.players.add(r.playerId);
        all.add(r.playerId);
      }
    }
  }
  const days = [...by].sort(([a], [b]) => (a ?? 1e9) - (b ?? 1e9)).map(([day, d]) => ({ day, pool: d.pool, uploads: d.uploads, players: d.players.size }));
  const total = { day: null, pool: days.reduce((s, d) => s + d.pool, 0), uploads: days.reduce((s, d) => s + d.uploads, 0), players: all.size };
  return { days, total, noPlayer };
}

const pad = (v: string | number, n: number) => String(v).padStart(n);

function describe(r: StoredRecord): string {
  const player = r.playerId ?? (r.text === "" ? "(not read)" : "?"); // wipe-uploads reads no bodies on Tigris
  return `${r.ref}  ${r.kind === "pool" ? "pool  " : "upload"} day ${r.day ?? "?"}  ghost ${r.id ?? "?"}  player ${player}`;
}

/**
 * The tool: parse, read the configured store, print the listing or the plan, and with --apply delete exactly the plan.
 * Resolves the exit code: 0 done (a dry run too), 1 a storage error or an apply that deleted less than its plan, 2 a usage
 * or settings error (nothing read or deleted). `open` is the store opener (tests pass their own).
 */
export async function runAdmin(argv: readonly string[], env: Env, out: (line: string) => void, open: (cfg: StoreConfig) => AdminStore = (c) => openAdmin(c, out)): Promise<number> {
  let args: AdminArgs, store: AdminStore;
  try {
    args = parseArgs(argv);
    store = open(readStoreConfig(argv, env));
  } catch (e) {
    if (!(e instanceof UsageError || e instanceof ConfigError)) throw e;
    out(`ghosts:admin: ${e.message}`);
    out(USAGE);
    return 2;
  }
  const mode = args.command === "list" ? "read only" : args.apply ? "APPLY" : "DRY RUN";
  out(`ghosts:admin ${args.command}${args.playerId ? ` ${args.playerId}` : ""} --rules ${args.rules}: ${store.kind} store, ${store.where} (${mode})`);
  try {
    const h = await store.read(args.rules, args.command !== "wipe-uploads");
    if (args.command === "list") {
      const { days, total, noPlayer } = countDays(h);
      out("  day   pool  uploads  players");
      for (const d of days) out(`  ${pad(d.day ?? "?", 3)}  ${pad(d.pool, 5)}  ${pad(d.uploads, 7)}  ${pad(d.players, 7)}`);
      out(`  all  ${pad(total.pool, 5)}  ${pad(total.uploads, 7)}  ${pad(total.players, 7)}`);
      if (noPlayer) out(`  ${noPlayer} upload(s) with no readable player: revalidate lists them`);
      if (h.other.length) out(`  ${h.other.length} other record(s) here, never touched: ${h.other.slice(0, 5).join(", ")}${h.other.length > 5 ? ", ..." : ""}`);
      return 0;
    }
    const plan = makePlan(args, h);
    out(`plan: delete ${plan.delete.length} record(s) of ${args.rules}; keep ${plan.keep.pool} seed-pool ghost(s) and ${plan.keep.uploads} upload(s)`);
    for (const d of plan.delete) out(`  delete ${describe(d.record)}  (${d.why})`);
    if (args.command === "wipe-uploads" && !args.pool && plan.keep.pool) out(`  the seed pool (${plan.keep.pool}) stays: --pool would delete it too`);
    if (h.other.length) out(`  ${h.other.length} other record(s) here, never touched`);
    if (!args.apply) {
      out(`DRY RUN: nothing was deleted. --apply deletes exactly the ${plan.delete.length} record(s) above.`);
      return 0;
    }
    const n = plan.delete.length ? await store.remove(plan.delete.map((d) => d.record)) : 0;
    out(`APPLIED: deleted ${n} of ${plan.delete.length} record(s).`);
    if (n) {
      out(store.kind === "tigris"
        ? "  A running server serves a deleted ghost until its bucket cache expires (BB_GHOST_CACHE_TTL_S) or it restarts."
        : "  Restart the ghost server: it holds the deleted ghosts in memory until it reloads its files.");
    }
    if (n < plan.delete.length) out(`  ${plan.delete.length - n} planned record(s) had already changed or gone: run again to see the store as it is now.`);
    return n === plan.delete.length ? 0 : 1;
  } catch (e) {
    if (e instanceof ConfigError) {
      out(`ghosts:admin: ${e.message}`);
      return 2;
    }
    out(`ghosts:admin failed: ${message(e)}`);
    return 1;
  }
}
