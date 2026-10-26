// S4 (REQ-BFG-120; BRIEF-S4; LAUNCH-0 REPORT 1.6): ghost-ops, the backup tool. Nothing protected the server's data before this: one Tigris bucket holds every
// player's saved progress (profiles/<playerId>.json), every player ghost and the seed pool. This is the tool's logic, exported so the tests can call it;
// server/opsMain.ts is its command line (server/dist/ghost-ops.mjs, in the Fly image as /app/dist/ghost-ops.mjs). It opens the bucket exactly as ghost-admin does
// (config.ts readStoreConfig: BB_GHOST_STORE=tigris with AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, AWS_ENDPOINT_URL_S3 and BUCKET_NAME) and uses ghost-admin's exit codes.
//
//   snapshot --out <dir> [--prefix <p>] [--concurrency <n>]   copy the WHOLE bucket (prefix "" unless given: the keys IDENT-1 adds, players/, tombstones/, links/ and
//                                                             linkcodes/, come along with no change) into <dir>/<UTC stamp>/objects/<key>, with manifest.json written last
//   verify <snapshotDir> [--exact]                            the snapshot's files against its manifest, then every manifest object against the bucket (same bytes)
//   restore <snapshotDir> [--apply] [--force]                 a dry run unless --apply: write the snapshot into a NEW bucket, private data first, then verify; never deletes
//   check-health <baseUrl>                                    GET <baseUrl>/v1/health/alerts (alerts.ts): one OK line, or one ALERT line per alert
//   tigris-snapshot [--name <n>]                              take a Tigris snapshot of the bucket (the documented CreateBucket request)
//   drill <snapshotDir>                                       the restore drill's local checks against the configured (drill) bucket: PASS or FAIL
//
// Exit codes (ghost-admin's): 0 done; 1 a storage error, a difference or a short write; 2 a usage or settings error. Nothing here prints a secret: no access key, no
// secret key, no signature, and a key under profiles/, players/, links/, linkcodes/ or tombstones/ (it names a player) is shown as its prefix and a star. The snapshot is
// PLAYER DATA: its directories are 0700 and its files 0600. The tool never deletes anything: the bucket client it uses (opsS3.ts) has no delete.

import { lstat, mkdir, readdir, readFile, rename, stat, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { RULES_VERSION } from "../src/sim/content";
import { parseRules } from "../src/net/rulesGate";
import { ConfigError, readStoreConfig } from "./config";
import { countDays, makePlan, TigrisAdmin } from "./ghostAdmin";
import { RawS3, type OpsObject, type OpsStore } from "./opsS3";
import { S3Client, type S3Options } from "./s3";
import { sha256Hex } from "./sigv4";

type Env = Record<string, string | undefined>;
export type Out = (line: string) => void;

export const COMMANDS = ["snapshot", "verify", "restore", "check-health", "tigris-snapshot", "drill"] as const;
export type Command = (typeof COMMANDS)[number];

export const MANIFEST_FORMAT = "ghost-ops-snapshot-1";
export const MANIFEST_FILE = "manifest.json";
export const OBJECTS_DIR = "objects";
/** Keys under these prefixes name a player (or a key linked to one): never printed, only their prefix. */
export const PRIVATE_PREFIXES = ["profiles/", "players/", "links/", "linkcodes/", "tombstones/"] as const;

const message = (e: unknown): string => (e instanceof Error ? e.message : String(e));

/** Text safe to print: a key under a private prefix is shown as its prefix and a star, and control characters (a hostile key, a hostile server) become spaces. */
export function clean(text: string): string {
  return text.replace(/\b(profiles|players|links|linkcodes|tombstones)\/[^\s,;:)"']*/g, "$1/*").replace(/[\u0000-\u001f\u007f]/g, " ");
}

/** A key as the output names it. */
export function shown(key: string): string {
  if (PRIVATE_PREFIXES.some((p) => key.startsWith(p))) return `${key.slice(0, key.indexOf("/") + 1)}*`;
  const q = JSON.stringify(key);
  return q.length > 160 ? `${q.slice(0, 157)}..."` : q;
}

/** Why a key must never become a path: an empty segment, ".", "..", a backslash, a NUL (or any control character) or a leading "/" (null: it is safe). */
export function unsafeKeyReason(key: string): string | null {
  if (key === "") return "empty key";
  if (key.startsWith("/")) return "leading slash";
  if (key.includes("\u0000")) return "NUL byte";
  if (key.includes("\\")) return "backslash";
  if (/[\u0001-\u001f\u007f]/.test(key)) return "control character";
  if (new TextEncoder().encode(key).length > 1024) return "longer than 1024 bytes";
  for (const seg of key.split("/")) {
    if (seg === "") return "empty segment";
    if (seg === "." || seg === "..") return `"${seg}" segment`;
  }
  return null;
}

/** The only place a key becomes a path: <snapshot>/objects/<key>, for a key that passed unsafeKeyReason (so it cannot leave the snapshot directory). */
function localPath(dir: string, key: string): string {
  return join(dir, OBJECTS_DIR, ...key.split("/"));
}

export class UsageError extends Error {
  constructor(msg: string) {
    super(msg);
    this.name = "UsageError";
  }
}

/** A failure the tool reports with its own exit code (1: a storage error, a difference, a damaged snapshot; 2: the wrong directory or bucket). */
export class OpsError extends Error {
  constructor(msg: string, readonly code: 1 | 2 = 1) {
    super(msg);
    this.name = "OpsError";
  }
}

// ---------------------------------------------------------------------------------------------------------------- the command line

export const USAGE = [
  "usage: ghost-ops <command> [options]     (in the image: node /app/dist/ghost-ops.mjs ...)",
  "  snapshot --out <dir> [--prefix <p>] [--concurrency <n>]",
  "        copy every object of the bucket (or of one prefix) into <dir>/<UTC stamp>/objects/<key>, then manifest.json (key, size, sha256, content type, ...).",
  "        The copy is written into <stamp>.partial and renamed when complete. Reads the bucket only.",
  "  verify <snapshotDir> [--exact] [--concurrency <n>]",
  "        the snapshot's files against its manifest (a damaged snapshot fails before the bucket is read), then every manifest object against the bucket,",
  "        byte for byte. Keys in the bucket that the snapshot lacks are listed by prefix; --exact makes them fail too. Reads only.",
  "  restore <snapshotDir> [--apply] [--force] [--concurrency <n>]",
  "        a dry run unless --apply: writes the snapshot's objects into the configured bucket (private data first, ghosts last), then runs verify (--exact when the",
  "        bucket started empty). Refuses a bucket that is not empty unless --force, which skips objects already identical. Never deletes anything.",
  "  check-health <baseUrl> [--timeout <seconds>]",
  "        GET <baseUrl>/v1/health/alerts: one OK line, or one ALERT line per alert. Needs no bucket settings.",
  "  tigris-snapshot [--name <name>]",
  "        take a Tigris snapshot of the bucket (S3 CreateBucket with the X-Tigris-Snapshot header, signed).",
  "  drill <snapshotDir> [--rules <bb-x.y.z>] [--concurrency <n>]",
  "        the restore drill's checks against the configured (drill) bucket: verify --exact, the per-day counts equal the snapshot's, the revalidate dry run deletes 0.",
  "The bucket is the server's: BB_GHOST_STORE=tigris with AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, AWS_ENDPOINT_URL_S3 and BUCKET_NAME. The commands that use it exit 2",
  "on BB_GHOST_STORE=jsonl. --help needs no settings.",
  "Exit: 0 done; 1 a storage error, a difference or a short write (check-health: an alert, or the server cannot be reached); 2 a usage or settings error.",
].join("\n");

export interface OpsArgs {
  command: Command | "help";
  /** verify, restore, drill: the snapshot directory. check-health: the base URL. */
  target?: string;
  out?: string;
  prefix: string;
  concurrency: number;
  exact: boolean;
  apply: boolean;
  force: boolean;
  name?: string;
  timeoutS: number;
  rules: string;
}

const OPTIONS: Record<Command, readonly string[]> = {
  snapshot: ["--out", "--prefix", "--concurrency"],
  verify: ["--exact", "--concurrency"],
  restore: ["--apply", "--force", "--concurrency"],
  "check-health": ["--timeout"],
  "tigris-snapshot": ["--name"],
  drill: ["--rules", "--concurrency"],
};

function uint(v: string, name: string, min: number, max: number): number {
  const n = Number(v);
  if (!/^\d+$/.test(v) || !Number.isInteger(n) || n < min || n > max) throw new UsageError(`${name}: expected an integer in ${min}..${max}, got "${v}"`);
  return n;
}

/** The command line. Throws UsageError. `--help` anywhere is the help. */
export function parseOpsArgs(argv: readonly string[]): OpsArgs {
  const a: OpsArgs = { command: "help", prefix: "", concurrency: 8, exact: false, apply: false, force: false, timeoutS: 15, rules: RULES_VERSION };
  const pos: string[] = [];
  const given = new Set<string>();
  for (let i = 0; i < argv.length; i++) {
    const t = argv[i];
    if (t === "--help" || t === "-h") return a;
    if (t === "--exact" || t === "--apply" || t === "--force") {
      given.add(t);
      a[t.slice(2) as "exact" | "apply" | "force"] = true;
    } else if (t === "--out" || t === "--prefix" || t === "--concurrency" || t === "--name" || t === "--timeout" || t === "--rules") {
      const v = argv[++i];
      if (v === undefined || (v.startsWith("--") && t !== "--prefix")) throw new UsageError(`${t} needs a value`);
      given.add(t);
      if (t === "--out") a.out = v;
      else if (t === "--prefix") a.prefix = v;
      else if (t === "--concurrency") a.concurrency = uint(v, "--concurrency", 1, 64);
      else if (t === "--timeout") a.timeoutS = uint(v, "--timeout", 1, 300);
      else if (t === "--rules") {
        if (!parseRules(v)) throw new UsageError(`--rules ${JSON.stringify(v)} is not a rules version (bb-MAJOR.MINOR.PATCH)`);
        a.rules = v;
      } else {
        if (!/^[A-Za-z0-9._ -]{1,64}$/.test(v)) throw new UsageError("--name: 1-64 characters of A-Z a-z 0-9 . _ space and hyphen");
        a.name = v;
      }
    } else if (t.startsWith("--")) throw new UsageError(`unknown option ${t}`);
    else pos.push(t);
  }
  const command = pos.shift();
  if (command === undefined) throw new UsageError("no command");
  if (command === "help") return a;
  if (!(COMMANDS as readonly string[]).includes(command)) throw new UsageError(`unknown command "${command}": use ${COMMANDS.join(", ")}`);
  a.command = command as Command;
  for (const g of given) if (!OPTIONS[a.command].includes(g)) throw new UsageError(`${g} does not go with ${command}`);
  if (a.command === "verify" || a.command === "restore" || a.command === "drill" || a.command === "check-health") {
    const t = pos.shift();
    if (t === undefined || t === "") throw new UsageError(`${command} needs ${a.command === "check-health" ? "a base URL (https://host)" : "a snapshot directory"}`);
    a.target = t;
  }
  if (pos.length) throw new UsageError(`unexpected argument ${JSON.stringify(pos[0])}`);
  if (a.command === "snapshot") {
    if (a.out === undefined || a.out === "") throw new UsageError("snapshot needs --out <dir>");
    if (a.prefix !== "" && (a.prefix.startsWith("/") || /[\\\u0000-\u001f\u007f]/.test(a.prefix) || a.prefix.split("/").some((s) => s === "." || s === ".."))) {
      throw new UsageError("--prefix: a key prefix with no leading slash, backslash, control character or dot segment");
    }
  }
  return a;
}

// ---------------------------------------------------------------------------------------------------------------- small helpers

const fmtBytes = (n: number): string => (n < 1024 ? `${n} B` : n < 1_048_576 ? `${(n / 1024).toFixed(1)} KB` : n < 1_073_741_824 ? `${(n / 1_048_576).toFixed(1)} MB` : `${(n / 1_073_741_824).toFixed(2)} GB`);
const fmtSecs = (ms: number): string => `${(ms / 1000).toFixed(2)} s`;
const plural = (n: number, word: string): string => `${n} ${word}${n === 1 ? "" : "s"}`;
const topPrefix = (key: string): string => (key.includes("/") ? key.slice(0, key.indexOf("/") + 1) : "(root)");
const norm = (t: string): string => t.trim().toLowerCase();

/** Count and bytes per top-level prefix, in key order. */
function totalsByPrefix(objs: readonly { key: string; size: number }[]): Record<string, { count: number; bytes: number }> {
  const out: Record<string, { count: number; bytes: number }> = {};
  for (const o of [...objs].sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0))) {
    const p = topPrefix(o.key);
    const t = (out[p] ??= { count: 0, bytes: 0 });
    t.count++;
    t.bytes += o.size;
  }
  return out;
}

function sayTotals(say: Out, totals: Record<string, { count: number; bytes: number }>, indent = "  "): void {
  for (const [p, t] of Object.entries(totals)) say(`${indent}${p.padEnd(12)} ${String(t.count).padStart(8)} objects ${fmtBytes(t.bytes).padStart(10)}`);
}

const byPrefixText = (keys: readonly string[]): string => {
  const n = new Map<string, number>();
  for (const k of keys) n.set(topPrefix(k), (n.get(topPrefix(k)) ?? 0) + 1);
  return [...n].sort(([a], [b]) => (a < b ? -1 : 1)).map(([p, c]) => `${p} ${c}`).join(", ");
};

/** Run `fn` over `items`, at most `limit` at a time; `stopped()` is checked before each item starts (a failure elsewhere stops the rest). */
async function eachLimit<T>(items: readonly T[], limit: number, fn: (item: T) => Promise<void>, stopped: () => boolean = () => false): Promise<void> {
  let next = 0;
  const worker = async () => {
    while (!stopped() && next < items.length) await fn(items[next++]);
  };
  await Promise.all(Array.from({ length: Math.max(1, Math.min(limit, items.length)) }, worker));
}

const stampOf = (ms: number): string => new Date(ms).toISOString().replace(/\.\d{3}Z$/, "Z").replace(/[-:]/g, "");

async function exists(path: string): Promise<boolean> {
  try {
    await lstat(path);
    return true;
  } catch {
    return false;
  }
}

const codeOf = (e: unknown): string => {
  const c = (e as { code?: unknown }).code;
  return typeof c === "string" ? c : "error";
};

// ---------------------------------------------------------------------------------------------------------------- the manifest

export interface ManifestObject {
  key: string;
  size: number;
  /** Hex SHA-256 of the object's bytes as the bucket returned them. */
  sha256: string;
  /** The LIST's LastModified as an ISO time, or null. */
  lastModified: string | null;
  contentType: string | null;
}

export interface Manifest {
  format: typeof MANIFEST_FORMAT;
  tool: "ghost-ops";
  bucket: string;
  endpointHost: string;
  prefix: string;
  startedAt: string;
  finishedAt: string;
  count: number;
  bytes: number;
  /** Per top-level prefix ("ghosts/", "profiles/", ...; "(root)" for a key with no slash). */
  prefixes: Record<string, { count: number; bytes: number }>;
  /** Keys the tool would not copy (unsafe keys, keys that cannot be a file): counted here, named in the output. */
  refused: number;
  objects: ManifestObject[];
}

function manifestText(m: Manifest): string {
  const { objects, ...head } = m;
  const h = JSON.stringify(head, null, 2);
  return `${h.slice(0, -2)},\n  "objects": [\n${objects.map((o) => `    ${JSON.stringify(o)}`).join(",\n")}\n  ]\n}\n`;
}

/** The manifest as a snapshot holds it, checked field by field; throws OpsError (the snapshot is damaged) naming what is wrong. */
export function parseManifest(text: string): Manifest {
  let m: unknown;
  try {
    m = JSON.parse(text);
  } catch {
    throw new OpsError(`${MANIFEST_FILE} is not valid JSON: the snapshot is damaged`);
  }
  const o = (typeof m === "object" && m !== null && !Array.isArray(m) ? m : {}) as Record<string, unknown>;
  const bad = (what: string): never => {
    throw new OpsError(`${MANIFEST_FILE}: ${what}: the snapshot is damaged`);
  };
  if (o.format !== MANIFEST_FORMAT) bad(`format is not ${MANIFEST_FORMAT}`);
  for (const f of ["bucket", "endpointHost", "prefix", "startedAt", "finishedAt"] as const) if (typeof o[f] !== "string") bad(`${f} is not a string`);
  if (!Array.isArray(o.objects)) bad("objects is not a list");
  const seen = new Set<string>();
  let bytes = 0;
  for (const raw of o.objects as unknown[]) {
    const x = (typeof raw === "object" && raw !== null ? raw : {}) as Record<string, unknown>;
    if (typeof x.key !== "string") bad("an object has no key");
    if (typeof x.size !== "number" || !Number.isInteger(x.size) || x.size < 0) bad("an object has no size");
    if (typeof x.sha256 !== "string" || !/^[0-9a-f]{64}$/.test(x.sha256)) bad("an object has no sha256");
    if (x.lastModified !== null && typeof x.lastModified !== "string") bad("an object's lastModified is not a string or null");
    if (x.contentType !== null && typeof x.contentType !== "string") bad("an object's contentType is not a string or null");
    if (seen.has(x.key as string)) bad("a key is listed twice");
    seen.add(x.key as string);
    bytes += x.size as number;
  }
  if (o.count !== (o.objects as unknown[]).length) bad(`count ${String(o.count)} is not the ${(o.objects as unknown[]).length} objects listed`);
  if (o.bytes !== bytes) bad(`bytes ${String(o.bytes)} is not the ${bytes} the objects add up to`);
  return o as unknown as Manifest;
}

export interface Snapshot {
  dir: string;
  manifest: Manifest;
  /** Manifest keys that must never become a path, with why: refused, never read or written. */
  unsafe: { key: string; reason: string }[];
  /** The manifest's other objects. */
  safe: ManifestObject[];
}

/** Open a finished snapshot directory: its manifest, checked. */
export async function loadSnapshot(dirArg: string): Promise<Snapshot> {
  const dir = resolve(dirArg);
  let isDir = false;
  try {
    isDir = (await stat(dir)).isDirectory();
  } catch {
    isDir = false;
  }
  if (!isDir) throw new OpsError(`${dirArg} is not a directory`, 2);
  if (dir.endsWith(".partial")) throw new OpsError(`${dirArg} is an unfinished snapshot (.partial: it has no manifest); take a new one`, 1);
  let text: string;
  try {
    text = await readFile(join(dir, MANIFEST_FILE), "utf8");
  } catch {
    throw new OpsError(`${dirArg} has no ${MANIFEST_FILE}: it is not a finished snapshot`, 2);
  }
  const manifest = parseManifest(text);
  const unsafe: Snapshot["unsafe"] = [], safe: ManifestObject[] = [];
  for (const o of manifest.objects) {
    const why = unsafeKeyReason(o.key);
    if (why) unsafe.push({ key: o.key, reason: why });
    else safe.push(o);
  }
  return { dir, manifest, unsafe, safe };
}

// ---------------------------------------------------------------------------------------------------------------- the local check

interface LocalCheck {
  /** Files that are missing, of the wrong size or the wrong bytes, and anything in the tree that is not a plain file or directory. */
  damaged: string[];
  /** Plain files under objects/ that the manifest does not list. */
  extras: string[];
}

async function walk(root: string, rel: string[], files: Set<string>, damaged: string[]): Promise<void> {
  const here = rel.length ? join(root, ...rel) : root;
  for (const d of await readdir(here, { withFileTypes: true })) {
    const key = [...rel, d.name].join("/");
    if (d.isSymbolicLink()) damaged.push(`${shown(key)}  a symbolic link in the snapshot (never followed)`);
    else if (d.isDirectory()) await walk(root, [...rel, d.name], files, damaged);
    else if (d.isFile()) files.add(key);
    else damaged.push(`${shown(key)}  neither a file nor a directory`);
  }
}

/** Every manifest file against its size and sha256, and the objects/ tree against the manifest's key list. Reads local files only. */
export async function checkLocal(snap: Snapshot, concurrency: number): Promise<LocalCheck> {
  const damaged: string[] = [], extras: string[] = [];
  const files = new Set<string>();
  const root = join(snap.dir, OBJECTS_DIR);
  if (await exists(root)) await walk(root, [], files, damaged);
  else if (snap.safe.length) damaged.push(`${OBJECTS_DIR}/  the objects directory is missing`);
  if (damaged.some((d) => d.includes("symbolic link"))) return { damaged, extras }; // nothing is read through a tree that holds a link
  const want = new Set(snap.safe.map((o) => o.key));
  for (const f of [...files].sort()) if (!want.has(f)) extras.push(f);
  await eachLimit(snap.safe, concurrency, async (o) => {
    let bytes: Uint8Array;
    try {
      bytes = await readFile(localPath(snap.dir, o.key));
    } catch (e) {
      damaged.push(`${shown(o.key)}  ${codeOf(e) === "ENOENT" ? "the file is missing" : `the file cannot be read (${codeOf(e)})`}`);
      return;
    }
    if (bytes.length !== o.size) damaged.push(`${shown(o.key)}  the file has ${bytes.length} bytes, the manifest says ${o.size}`);
    else if (sha256Hex(bytes) !== o.sha256) damaged.push(`${shown(o.key)}  the file's sha256 is not the manifest's`);
  });
  damaged.sort();
  return { damaged, extras };
}

function sayList(say: Out, lines: readonly string[], head: string, max = 20): void {
  say(head);
  for (const l of lines.slice(0, max)) say(`  ${l}`);
  if (lines.length > max) say(`  ... and ${lines.length - max} more`);
}

// ---------------------------------------------------------------------------------------------------------------- snapshot

export interface OpsDeps {
  /** Open the bucket. Default: RawS3 over the settings, its retry notes sent to `say`. Tests pass a client with quick retries, or a double. */
  open?: (s3: S3Options, say: Out) => OpsStore;
  now?: () => number;
  fetch?: typeof fetch;
}

export interface SnapshotOptions {
  out: string;
  prefix: string;
  concurrency: number;
}

/** Errors that mean this KEY cannot be a file here (a name too long, a file where a directory must be, a directory where the file must be), not that the disk failed. */
const KEY_FS_CODES = new Set(["ENAMETOOLONG", "ENOTDIR", "EISDIR", "EEXIST", "EINVAL", "ELOOP"]);

/**
 * Copy the bucket (or one prefix of it) into <out>/<UTC stamp>/. Reads the bucket only. The copy is written into <stamp>.partial, manifest.json last, and the directory
 * is renamed when complete, so a cut or failed run leaves only a .partial directory. Resolves 0, or 1 when a key was refused (the snapshot is complete without it).
 * Throws OpsError (exit 1) on a storage error.
 */
export async function snapshot(store: OpsStore, o: SnapshotOptions, say: Out, deps: OpsDeps = {}): Promise<number> {
  const now = deps.now ?? (() => Date.now());
  const startedMs = now();
  const out = resolve(o.out);
  await mkdir(out, { recursive: true, mode: 0o700 });
  let name = stampOf(startedMs);
  for (let n = 2; (await exists(join(out, name))) || (await exists(join(out, `${name}.partial`))); n++) name = `${stampOf(startedMs)}-${n}`;
  const partial = join(out, `${name}.partial`), final = join(out, name);
  say(`ghost-ops snapshot: ${store.where}, ${o.prefix === "" ? "the whole bucket" : `prefix ${JSON.stringify(o.prefix)}`} -> ${final}`);
  const listing = await store.list(o.prefix);
  const refused: { key: string; reason: string }[] = [];
  const todo: OpsObject[] = [];
  for (const x of listing) {
    const why = unsafeKeyReason(x.key);
    if (why) refused.push({ key: x.key, reason: why });
    else todo.push(x);
  }
  todo.sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));
  say(`  listed ${plural(listing.length, "object")}, ${fmtBytes(listing.reduce((s, x) => s + Math.max(0, x.size), 0))}`);
  await mkdir(join(partial, OBJECTS_DIR), { recursive: true, mode: 0o700 });

  const entries: ManifestObject[] = [];
  let vanished = 0, failure: unknown = null;
  await eachLimit(todo, o.concurrency, async (x) => {
    try {
      const got = await store.get(x.key);
      if (got === null) return void vanished++; // deleted since the listing: not in the snapshot, not an error
      const path = localPath(partial, x.key);
      try {
        await mkdir(dirname(path), { recursive: true, mode: 0o700 });
        await writeFile(path, got.bytes, { mode: 0o600, flag: "wx" });
      } catch (e) {
        if (!KEY_FS_CODES.has(codeOf(e))) throw e;
        return void refused.push({ key: x.key, reason: `cannot be stored as a file (${codeOf(e)})` });
      }
      entries.push({
        key: x.key, size: got.bytes.length, sha256: sha256Hex(got.bytes),
        lastModified: x.modified === null ? null : new Date(x.modified).toISOString(), contentType: got.contentType,
      });
      if (entries.length % 5000 === 0) say(`  ${entries.length} of ${todo.length} objects copied`);
    } catch (e) {
      failure ??= e;
    }
  }, () => failure !== null);
  if (failure !== null) {
    throw new OpsError(`${clean(message(failure))}; ${entries.length} of ${todo.length} objects were copied; the unfinished copy stays in ${partial} and is not a snapshot`, 1);
  }
  entries.sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));
  const finishedMs = now();
  const manifest: Manifest = {
    format: MANIFEST_FORMAT, tool: "ghost-ops", bucket: store.bucket, endpointHost: store.host, prefix: o.prefix,
    startedAt: new Date(startedMs).toISOString(), finishedAt: new Date(finishedMs).toISOString(),
    count: entries.length, bytes: entries.reduce((s, e) => s + e.size, 0), prefixes: totalsByPrefix(entries), refused: refused.length, objects: entries,
  };
  await writeFile(join(partial, MANIFEST_FILE), manifestText(manifest), { mode: 0o600, flag: "wx" }); // last
  await rename(partial, final);
  say(`snapshot complete: ${plural(manifest.count, "object")}, ${fmtBytes(manifest.bytes)}, ${fmtSecs(finishedMs - startedMs)}`);
  sayTotals(say, manifest.prefixes);
  if (vanished) say(`  ${plural(vanished, "object")} deleted between the listing and the read: not in the snapshot`);
  if (refused.length) {
    sayList(say, refused.map((r) => `${shown(r.key)}  (${r.reason})`), `REFUSED ${plural(refused.length, "key")}: not copied (exit 1):`);
    return 1;
  }
  return 0;
}

// ---------------------------------------------------------------------------------------------------------------- verify

interface Comparison {
  ok: boolean;
}

/** The snapshot's objects against the bucket: every one present with the same bytes; keys the snapshot lacks listed by prefix (a failure with `exact`). */
async function compareWithStore(store: OpsStore, snap: Snapshot, o: { exact: boolean; concurrency: number }, say: Out): Promise<Comparison> {
  const listing = await store.list(snap.manifest.prefix);
  say(`  bucket holds ${plural(listing.length, "object")}${snap.manifest.prefix === "" ? "" : ` under prefix ${JSON.stringify(snap.manifest.prefix)}`}`);
  const inStore = new Map(listing.map((x) => [x.key, x]));
  const want = new Set(snap.manifest.objects.map((x) => x.key));
  const missing: string[] = [], changed: string[] = [];
  let typeNotes = 0, matched = 0, matchedBytes = 0, failure: unknown = null;
  const present: ManifestObject[] = [];
  for (const e of snap.safe) {
    if (inStore.has(e.key)) present.push(e);
    else missing.push(e.key);
  }
  await eachLimit(present, o.concurrency, async (e) => {
    try {
      const got = await store.get(e.key);
      if (got === null) missing.push(e.key);
      else if (got.bytes.length !== e.size || sha256Hex(got.bytes) !== e.sha256) changed.push(e.key);
      else {
        matched++;
        matchedBytes += e.size;
        if (e.contentType !== null && got.contentType !== null && norm(e.contentType) !== norm(got.contentType)) typeNotes++;
      }
    } catch (err) {
      failure ??= err;
    }
  }, () => failure !== null);
  if (failure !== null) throw new OpsError(clean(message(failure)), 1);
  const missingKeys = [...missing].sort();
  const extras = listing.map((x) => x.key).filter((k) => !want.has(k)).sort();
  say(`  ${matched} of ${snap.safe.length} objects match the snapshot's bytes (${fmtBytes(matchedBytes)})`);
  if (missingKeys.length) sayList(say, missingKeys.map(shown), `  MISSING from the bucket: ${missingKeys.length} (${byPrefixText(missingKeys)})`, 10);
  if (changed.length) sayList(say, changed.sort().map(shown), `  DIFFERENT bytes in the bucket: ${changed.length} (${byPrefixText(changed)})`, 10);
  if (extras.length) say(`  in the bucket but not in the snapshot: ${extras.length} (${byPrefixText(extras)})${o.exact ? ": --exact makes this a failure" : ": not a failure without --exact"}`);
  if (typeNotes) say(`  note: ${plural(typeNotes, "object")} came back with another content type (the bytes are the same)`);
  return { ok: missingKeys.length === 0 && changed.length === 0 && (!o.exact || extras.length === 0) };
}

/**
 * Check a snapshot: first its own files against its manifest (a damaged snapshot fails here, before the bucket is read), then every manifest object against the
 * bucket. Reads only. Resolves 0 when everything matches, 1 on any difference.
 */
export async function verify(store: OpsStore, dir: string, o: { exact: boolean; concurrency: number }, say: Out): Promise<number> {
  const t0 = performance.now();
  const snap = await loadSnapshot(dir);
  say(`ghost-ops verify${o.exact ? " --exact" : ""}: snapshot ${dir} (${plural(snap.manifest.count, "object")}, ${fmtBytes(snap.manifest.bytes)}, taken ${snap.manifest.finishedAt} from bucket ${snap.manifest.bucket} at ${snap.manifest.endpointHost}) against ${store.where}`);
  const local = await checkLocal(snap, o.concurrency);
  const problems = [...snap.unsafe.map((u) => `${shown(u.key)}  an unsafe key in the manifest (${u.reason})`), ...local.damaged, ...local.extras.map((x) => `${shown(x)}  a file the manifest does not list`)];
  if (problems.length) {
    sayList(say, problems, `FAILED: the snapshot itself is damaged (${plural(problems.length, "problem")}); the bucket was not read:`);
    return 1;
  }
  say(`  the snapshot's ${plural(snap.safe.length, "file")} match their manifest sha256`);
  const c = await compareWithStore(store, snap, o, say);
  say(`verify ${c.ok ? "OK" : "FAILED"} in ${fmtSecs(performance.now() - t0)}`);
  return c.ok ? 0 : 1;
}

// ---------------------------------------------------------------------------------------------------------------- restore

/** Private data first (profiles/ and IDENT-1's players/, links/, linkcodes/, tombstones/), then anything else, then player ghosts, then the seed pool (every deploy rebuilds it). */
function rank(key: string): number {
  if (PRIVATE_PREFIXES.some((p) => key.startsWith(p))) return 0;
  if (key.startsWith("ghosts/")) return key.includes("/pool/") ? 3 : 2;
  return 1;
}

/**
 * Write a snapshot into the configured bucket. A dry run unless `apply`. A bucket that is not empty is refused (exit 2) unless `force`, which skips objects whose bytes
 * already match, so a cut restore can be run again. Never deletes. Every file is checked against its manifest sha256 before its PUT (the whole snapshot is checked
 * before the first one), and the object keeps its content type. Then it runs verify (`exact` when the bucket started empty).
 */
export async function restore(store: OpsStore, dir: string, o: { apply: boolean; force: boolean; concurrency: number }, say: Out): Promise<number> {
  const t0 = performance.now();
  const snap = await loadSnapshot(dir);
  say(`ghost-ops restore${o.apply ? "" : " (DRY RUN)"}: snapshot ${dir} (${plural(snap.manifest.count, "object")}, ${fmtBytes(snap.manifest.bytes)}, taken ${snap.manifest.finishedAt} from bucket ${snap.manifest.bucket} at ${snap.manifest.endpointHost}) -> ${store.where}`);
  const local = await checkLocal(snap, o.concurrency);
  if (local.damaged.length) {
    sayList(say, local.damaged, `FAILED: the snapshot is damaged (${plural(local.damaged.length, "problem")}); nothing was written:`);
    return 1;
  }
  if (local.extras.length) say(`  note: ${plural(local.extras.length, "file")} under ${OBJECTS_DIR}/ that the manifest does not list will never be written`);
  if (snap.manifest.bucket === store.bucket && snap.manifest.endpointHost === store.host) {
    say(`  NOTE: the target is the bucket this snapshot was taken from (${store.bucket}): a restore goes into a NEW bucket (check BUCKET_NAME and the secrets); --force would write the snapshot's older bytes over newer objects`);
  }
  if (snap.unsafe.length) sayList(say, snap.unsafe.map((u) => `${shown(u.key)}  (${u.reason})`), `REFUSED ${plural(snap.unsafe.length, "unsafe key")} in the manifest: never written (exit 1):`);
  const target = await store.list("");
  const emptyAtStart = target.length === 0;
  if (!emptyAtStart && !o.force) {
    say(`REFUSED: the bucket is not empty (${plural(target.length, "object")}: ${byPrefixText(target.map((x) => x.key))}). A restore goes into a NEW, empty bucket; --force writes into one that holds a cut restore (it skips what is identical and never deletes).`);
    return 2;
  }
  if (!emptyAtStart) say(`  the bucket holds ${plural(target.length, "object")} (--force): objects with the same bytes are skipped; a different object with the snapshot's key is overwritten`);
  const inTarget = new Map(target.map((x) => [x.key, x]));
  const toWrite: ManifestObject[] = [];
  let skipped = 0, overwrite = 0, failure: unknown = null;
  await eachLimit(snap.safe, o.concurrency, async (e) => {
    const have = inTarget.get(e.key);
    if (!have) return void toWrite.push(e);
    try {
      const got = have.size === e.size ? await store.get(e.key) : null;
      if (got !== null && got.bytes.length === e.size && sha256Hex(got.bytes) === e.sha256) skipped++;
      else {
        overwrite++;
        toWrite.push(e);
      }
    } catch (err) {
      failure ??= err;
    }
  }, () => failure !== null);
  if (failure !== null) throw new OpsError(clean(message(failure)), 1);
  toWrite.sort((a, b) => rank(a.key) - rank(b.key) || (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));
  const writeBytes = toWrite.reduce((s, e) => s + e.size, 0);
  say(`${o.apply ? "writing" : "would write"} ${plural(toWrite.length, "object")}, ${fmtBytes(writeBytes)}${skipped ? `; ${skipped} already identical, skipped` : ""}${overwrite ? `; ${overwrite} would overwrite a different object` : ""}:`);
  sayTotals(say, totalsByPrefix(toWrite));
  const refusedCode = snap.unsafe.length ? 1 : 0;
  if (!o.apply) {
    say(`DRY RUN: nothing was written. --apply writes the ${toWrite.length} object(s) above (private data first, ghosts last) and then verifies${emptyAtStart ? " --exact" : ""}.`);
    return refusedCode;
  }
  let written = 0, writtenBytes = 0;
  failure = null;
  const tWrite = performance.now();
  for (let r = 0; r <= 3 && failure === null; r++) {
    await eachLimit(toWrite.filter((e) => rank(e.key) === r), o.concurrency, async (e) => {
      try {
        const bytes = await readFile(localPath(snap.dir, e.key));
        if (bytes.length !== e.size || sha256Hex(bytes) !== e.sha256) throw new OpsError(`${shown(e.key)}: the file changed since the check (sha256 differs): not written`, 1);
        await store.put(e.key, bytes, e.contentType ?? "application/octet-stream");
        written++;
        writtenBytes += e.size;
        if (written % 5000 === 0) say(`  ${written} of ${toWrite.length} objects written`);
      } catch (err) {
        failure ??= err;
      }
    }, () => failure !== null);
  }
  if (failure !== null) {
    say(`restore stopped: ${written} of ${toWrite.length} objects written; ${clean(message(failure))}. Run it again with --force: it skips what is already there.`);
    return 1;
  }
  say(`restore: ${plural(written, "object")} written (${fmtBytes(writtenBytes)}) in ${fmtSecs(performance.now() - tWrite)}`);
  say(`verifying${emptyAtStart ? " --exact" : ""}:`);
  const c = await compareWithStore(store, snap, { exact: emptyAtStart, concurrency: o.concurrency }, say);
  say(`restore ${c.ok && refusedCode === 0 ? "OK" : "FAILED"} in ${fmtSecs(performance.now() - t0)}`);
  return c.ok ? refusedCode : 1;
}

// ---------------------------------------------------------------------------------------------------------------- check-health

/** GET <baseUrl>/v1/health/alerts: one OK line, or one ALERT line per alert. Exit 0 quiet; 1 an alert, an answer that is not the alerts', or an unreachable server. */
export async function checkHealth(baseUrl: string, timeoutS: number, say: Out, deps: OpsDeps = {}): Promise<number> {
  let u: URL;
  try {
    u = new URL(baseUrl);
  } catch {
    throw new UsageError("check-health: the base URL is not a URL (https://host)");
  }
  if ((u.protocol !== "https:" && u.protocol !== "http:") || u.username || u.password) throw new UsageError("check-health: the base URL must be http(s) and hold no user name or password");
  const url = `${u.origin}${u.pathname.replace(/\/+$/, "")}/v1/health/alerts`;
  const host = u.host;
  const doFetch = deps.fetch ?? ((input, init) => fetch(input, init));
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), timeoutS * 1000);
  let status = 0, text = "";
  try {
    const res = await doFetch(url, { method: "GET", signal: ctl.signal, headers: { accept: "application/json" } });
    status = res.status;
    text = (await res.text()).slice(0, 65_536);
  } catch (e) {
    say(`ALERT ${host}: not reachable (${(e as { name?: string }).name === "AbortError" ? `no answer within ${timeoutS} s` : clean(message(e))})`);
    return 1;
  } finally {
    clearTimeout(timer);
  }
  type Answer = { status?: unknown; alerts?: unknown; uptimeS?: unknown };
  let body = null as Answer | null;
  try {
    const parsed: unknown = JSON.parse(text);
    body = typeof parsed === "object" && parsed !== null ? (parsed as Answer) : null;
  } catch {
    body = null;
  }
  if (status === 200 && body !== null && body.status === "ok") {
    say(`OK ${host}: no alerts${typeof body.uptimeS === "number" ? ` (up ${body.uptimeS} s)` : ""}`);
    return 0;
  }
  if (status === 503 && body !== null && body.status === "alert" && Array.isArray(body.alerts)) {
    const list = body.alerts as { rule?: unknown; detail?: unknown }[];
    for (const a of list) say(`ALERT ${host} ${clean(String(a.rule ?? "?")).slice(0, 60)}: ${clean(String(a.detail ?? "")).slice(0, 300)}`);
    if (!list.length) say(`ALERT ${host}: the server says alert and names none`);
    return 1;
  }
  say(`ALERT ${host}: unexpected answer HTTP ${status}${status === 404 ? " (a server older than /v1/health/alerts?)" : ""}`);
  return 1;
}

// ---------------------------------------------------------------------------------------------------------------- tigris-snapshot

/** Take a Tigris snapshot of the configured bucket: the documented CreateBucket request with the signed X-Tigris-Snapshot header (opsS3.ts takeSnapshot). */
export async function tigrisSnapshot(store: OpsStore, name: string | null, say: Out, deps: OpsDeps = {}): Promise<number> {
  if (!store.takeSnapshot) throw new OpsError("this bucket client cannot take a Tigris snapshot", 2);
  const label = name ?? `ghost-ops-${stampOf((deps.now ?? (() => Date.now()))())}`;
  const r = await store.takeSnapshot(label);
  say(`ghost-ops tigris-snapshot: ${store.where}: snapshot "${label}" taken${r.version ? ` (version ${r.version.replace(/[^0-9A-Za-z._-]/g, "")})` : ""}`);
  return 0;
}

// ---------------------------------------------------------------------------------------------------------------- drill

/** The drill's checks against the configured (drill) bucket: verify --exact against the snapshot, the per-(rules, day) counts equal the snapshot's, and the revalidate dry run deletes nothing. */
export async function drill(store: OpsStore, s3: S3Options, dir: string, o: { rules: string; concurrency: number }, say: Out): Promise<number> {
  const t0 = performance.now();
  say(`ghost-ops drill: snapshot ${dir} against ${store.where}, rules ${o.rules}`);
  const steps: { name: string; ok: boolean }[] = [];
  const code = await verify(store, dir, { exact: true, concurrency: o.concurrency }, say);
  steps.push({ name: "verify --exact: every object present with the snapshot's bytes, nothing extra", ok: code === 0 });
  if (code === 0) {
    const snap = await loadSnapshot(dir);
    const admin = new TigrisAdmin(new S3Client({ ...s3 }));
    const held = await admin.read(o.rules, false);
    const live = countDays(held);
    const fromManifest = countDays({
      other: [],
      records: snap.safe.flatMap((e) => {
        const m = /^ghosts\/([^/]+)\/d(\d\d)\/(pool|player)\/([^/]+)\.json$/.exec(e.key);
        return m && m[1] === o.rules ? [{ ref: e.key, kind: m[3] === "pool" ? ("pool" as const) : ("upload" as const), day: Number(m[2]), id: m[4], playerId: null, text: "", keyed: true }] : [];
      }),
    });
    const same = JSON.stringify(live.days) === JSON.stringify(fromManifest.days);
    say(`  per-day ghost counts for ${o.rules}: ${live.total.pool} seed-pool and ${live.total.uploads} upload object(s) in the bucket; ${same ? "equal to the snapshot's" : "NOT equal to the snapshot's"}`);
    steps.push({ name: "the per-(rules, day) counts equal the snapshot's", ok: same });
    const records = (await admin.read(o.rules, true)).records;
    const plan = makePlan({ command: "revalidate", rules: o.rules, apply: false, pool: false }, { records, other: [] });
    say(`  revalidate (dry run): ${plan.delete.length} of ${plural(records.filter((r) => r.kind === "upload").length, "upload")} would be deleted`);
    steps.push({ name: "revalidate (dry run) deletes 0", ok: plan.delete.length === 0 });
  }
  const pass = steps.every((s) => s.ok);
  for (const s of steps) say(`  ${s.ok ? "PASS" : "FAIL"}  ${s.name}`);
  say(`drill ${pass ? "PASS" : "FAIL"} in ${fmtSecs(performance.now() - t0)}. Still to do by hand: a local server on this bucket passes ghost-probe; then delete the drill bucket.`);
  return pass ? 0 : 1;
}

// ---------------------------------------------------------------------------------------------------------------- the tool

/**
 * The tool: parse, open the configured bucket, run the command. Resolves the exit code: 0 done, 1 a storage error, a difference or a short write, 2 a usage or settings
 * error (nothing read or written). `deps.open` is the bucket opener (tests pass their own).
 */
export async function runOps(argv: readonly string[], env: Env, say: Out, deps: OpsDeps = {}): Promise<number> {
  let args: OpsArgs;
  try {
    args = parseOpsArgs(argv);
  } catch (e) {
    if (!(e instanceof UsageError)) throw e;
    say(`ghost-ops: ${e.message}`);
    say(USAGE);
    return 2;
  }
  if (args.command === "help") {
    say(USAGE);
    return 0;
  }
  try {
    if (args.command === "check-health") return await checkHealth(args.target!, args.timeoutS, say, deps);
    const cfg = readStoreConfig([], env);
    if (cfg.kind !== "tigris") {
      throw new ConfigError(`${args.command} needs BB_GHOST_STORE=tigris (with AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, AWS_ENDPOINT_URL_S3 and BUCKET_NAME): ghost-ops reads and writes the Tigris bucket, and BB_GHOST_STORE is ${env.BB_GHOST_STORE || "unset (the default is jsonl)"}`);
    }
    const store = (deps.open ?? ((s3, out) => new RawS3({ ...s3, log: (l) => out(clean(l)) })))(cfg.s3, say);
    switch (args.command) {
      case "snapshot":
        return await snapshot(store, { out: args.out!, prefix: args.prefix, concurrency: args.concurrency }, say, deps);
      case "verify":
        return await verify(store, args.target!, { exact: args.exact, concurrency: args.concurrency }, say);
      case "restore":
        return await restore(store, args.target!, { apply: args.apply, force: args.force, concurrency: args.concurrency }, say);
      case "tigris-snapshot":
        return await tigrisSnapshot(store, args.name ?? null, say, deps);
      case "drill":
        return await drill(store, cfg.s3, args.target!, { rules: args.rules, concurrency: args.concurrency }, say);
    }
  } catch (e) {
    if (e instanceof UsageError || e instanceof ConfigError) {
      say(`ghost-ops: ${clean(e.message)}`);
      return 2;
    }
    if (e instanceof OpsError) {
      say(`ghost-ops ${args.command}: ${clean(e.message)}`);
      return e.code;
    }
    say(`ghost-ops ${args.command} failed: ${clean(message(e))}`);
    return 1;
  }
  return 1;
}
