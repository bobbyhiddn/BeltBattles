// S6D (REQ-BFG-119): fixtures for the ghost-admin tests of delete-player, find-player, prune-ghosts, prune-idle and weekly. Not a test file itself.
// A World is one store (the JSON-lines directory, or a bucket of the in-process fake S3) planted straight into storage - ghosts with their receipt
// time, profiles, links, player records, tombstones, run history - and the tool as the command line runs it, with a clock the test sets.

import { createHash } from "node:crypto";
import { appendFileSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import type { StoreConfig } from "../server/config";
import { openAdmin, runAdmin, type AdminStore } from "../server/ghostAdmin";
import { FileHistoryStore, TigrisHistoryStore, type HistoryStore } from "../server/historyStore";
import { FileLinkStore, TigrisLinkStore, type LinkStore } from "../server/linkStore";
import { FileProfileStore, TigrisProfileStore, type ProfileStore } from "../server/profileStore";
import { objectKey, parseKey } from "../server/tigrisStore";
import type { FakeS3 } from "../tools/fakeS3";
import { FAKE_CREDS, s3For } from "./netStores";
import { freshWire } from "./profileupWire";

export type Kind = "jsonl" | "tigris";
export const DAY = 86_400_000;
/** The tool's "now" in these tests: 2026-10-28 12:00 UTC. */
export const NOW = Date.UTC(2026, 9, 28, 12, 0, 0);
export const R1 = "bb-0.12.0";
export const R2 = "bb-0.11.0";

/** A 43-character player id like a real one (base64url of a SHA-256), made from a number. */
export const idOf = (n: number | string): string =>
  createHash("sha256").update(`s6d-player-${n}`).digest("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, ""); // base64url (this repo's node:crypto shim has no "base64url")

export interface World {
  kind: Kind;
  argv: string[];
  env: Record<string, string>;
  links: LinkStore;
  profiles: ProfileStore;
  history: HistoryStore;
  /** A player upload under `rules`, stored with the receipt time `at` (undefined: a record that has none). */
  upload(rules: string, day: number, id: string, playerId: string, at: number | undefined, extra?: { name?: string; hero?: string }): void;
  /** A seed-pool ghost (its `at` is an old createdAt, whatever it is). */
  pool(rules: string, day: number, id: string, at?: number): void;
  profile(id: string, receivedAt: number): Promise<void>;
  keyLink(keyId: string, player: string, at: number): Promise<void>;
  playerRec(player: string, keys: string[], at: number, extra?: { steam?: string[]; code?: string }): Promise<void>;
  steamLink(steamId: string, player: string, at: number): Promise<void>;
  tombstone(player: string, ids: string[], at?: number): Promise<void>;
  /** A run-history entry of `player`, finished at `finishedAt`. */
  entry(player: string, finishedAt: number, entryId: string): Promise<void>;
  /** A stray object/file: `key` as statePath() names it (links/..., profiles/..., history/...), with this text (a record that is not a record). */
  raw(key: string, text: string): void;
  /** Every upload and pool record still stored: "kind rules id", sorted. */
  ids(): string[];
  /** Everything stored: the whole data directory (path -> text), or the whole bucket (key -> text). */
  state(): Record<string, string>;
}

const dirs: string[] = [];
let seq = 0;

/** Remove the temp directories (call it in afterAll). */
export function removeWorlds(): void {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
}

const record = (id: string, rules: string, day: number, playerId: string, at: number | undefined, extra: { name?: string; hero?: string } = {}): string =>
  JSON.stringify({ id, ...(at === undefined ? {} : { at }), snapshot: { rules, day, playerId, ...extra } });

/** Every file under `dir`, relative path -> text. */
export function walk(dir: string, base = dir, out: Record<string, string> = {}): Record<string, string> {
  if (!existsSync(dir)) return out;
  for (const n of readdirSync(dir).sort()) {
    const p = join(dir, n);
    if (statSync(p).isDirectory()) walk(p, base, out);
    else out[p.slice(base.length + 1)] = readFileSync(p, "utf8");
  }
  return out;
}

/** Where the identity record `key` (links/keys/<id>.json, players/..., tombstones/..., profiles/..., history/...) sits in a world's state. */
export function statePath(kind: Kind, key: string): string {
  return kind === "jsonl" && /^(links|players|linkcodes|tombstones)\//.test(key) ? `identity/${key}` : key;
}

/** The ghost records' receipt times differ from run to run when a real server wrote them (its store reads the real clock): zero them to compare. */
export function withoutReceiptTimes(state: Record<string, string>): Record<string, string> {
  return Object.fromEntries(Object.entries(state).map(([k, v]) => [k, /^(ghosts|pool)[./]/.test(k) ? v.replace(/"at":\d+/g, '"at":0') : v]));
}

/** Every object of a bucket of the fake S3, key -> text. */
export function bucketState(fake: FakeS3, bucket: string): Record<string, string> {
  return Object.fromEntries(fake.keys(bucket).map((k) => [k, fake.getObject(bucket, k)!]));
}

/** "kind rules id" of every ghost record in a data directory or a bucket. */
export function ghostIds(state: Record<string, string>, kind: Kind): string[] {
  if (kind === "tigris") {
    return Object.keys(state).filter((k) => k.startsWith("ghosts/")).map((k) => {
      const p = parseKey(k)!;
      return `${p.kind} ${p.rules} ${p.id}`;
    }).sort();
  }
  return (["pool.jsonl", "ghosts.jsonl"] as const).flatMap((f) =>
    (state[f] ?? "").split("\n").filter((l) => l.trim()).map((l) => {
      const o = JSON.parse(l) as { id: string; snapshot: { rules: string } };
      return `${f === "pool.jsonl" ? "pool" : "player"} ${o.snapshot.rules} ${o.id}`;
    })).sort();
}

export function world(kind: Kind, fake: FakeS3): World {
  if (kind === "tigris") {
    const bucket = `bb-s6d-${++seq}`;
    fake.createBucket(bucket);
    const s3 = s3For(fake, bucket);
    const links = new TigrisLinkStore(s3), profiles = new TigrisProfileStore(s3), history = new TigrisHistoryStore(s3);
    const w: World = {
      kind, argv: [],
      env: {
        BB_GHOST_STORE: "tigris", AWS_ACCESS_KEY_ID: FAKE_CREDS.accessKeyId, AWS_SECRET_ACCESS_KEY: FAKE_CREDS.secretAccessKey,
        AWS_ENDPOINT_URL_S3: fake.endpoint, BUCKET_NAME: bucket, BB_GHOST_S3_ADDRESSING: "path",
      },
      links, profiles, history,
      upload: (rules, day, id, p, at, extra) => fake.putObject(bucket, objectKey("player", rules, day, id), record(id, rules, day, p, at, extra)),
      pool: (rules, day, id, at = 5) => fake.putObject(bucket, objectKey("pool", rules, day, id), record(id, rules, day, "pool-player", at)),
      profile: (id, receivedAt) => profiles.put(id, { profile: freshWire(), receivedAt }),
      keyLink: (keyId, player, at) => links.put(`links/keys/${keyId}.json`, JSON.stringify({ player, at })),
      playerRec: (player, keys, at, extra = {}) => links.put(`players/${player}.json`, JSON.stringify({ keys, steam: extra.steam ?? [], at, ...(extra.code ? { code: extra.code } : {}) })),
      steamLink: (steamId, player, at) => links.put(`links/steam/${steamId}.json`, JSON.stringify({ player, at })),
      tombstone: (player, ids, at = 7) => links.put(`tombstones/${player}.json`, JSON.stringify({ at, ids })),
      entry: (player, finishedAt, entryId) => history.put(player, { finishedAt, id: entryId }, "{}"),
      raw: (key, text) => fake.putObject(bucket, key, text),
      ids: () => ghostIds(bucketState(fake, bucket), kind),
      state: () => bucketState(fake, bucket),
    };
    return w;
  }
  const dir = mkdtempSync(join(tmpdir(), "bb-s6d-"));
  dirs.push(dir);
  const links = new FileLinkStore(join(dir, "identity")), profiles = new FileProfileStore(join(dir, "profiles")), history = new FileHistoryStore(join(dir, "history"));
  return {
    kind, argv: ["--data", dir], env: { BB_GHOST_STORE: "jsonl" },
    links, profiles, history,
    upload: (rules, day, id, p, at, extra) => appendFileSync(join(dir, "ghosts.jsonl"), record(id, rules, day, p, at, extra) + "\n"),
    pool: (rules, day, id, at = 5) => appendFileSync(join(dir, "pool.jsonl"), record(id, rules, day, "pool-player", at) + "\n"),
    profile: (id, receivedAt) => profiles.put(id, { profile: freshWire(), receivedAt }),
    keyLink: (keyId, player, at) => links.put(`links/keys/${keyId}.json`, JSON.stringify({ player, at })),
    playerRec: (player, keys, at, extra = {}) => links.put(`players/${player}.json`, JSON.stringify({ keys, steam: extra.steam ?? [], at, ...(extra.code ? { code: extra.code } : {}) })),
    steamLink: (steamId, player, at) => links.put(`links/steam/${steamId}.json`, JSON.stringify({ player, at })),
    tombstone: (player, ids, at = 7) => links.put(`tombstones/${player}.json`, JSON.stringify({ at, ids })),
    entry: (player, finishedAt, entryId) => history.put(player, { finishedAt, id: entryId }, "{}"),
    raw: (key, text) => {
      const file = join(dir, statePath("jsonl", key));
      mkdirSync(dirname(file), { recursive: true });
      writeFileSync(file, text);
    },
    ids: () => ghostIds(walk(dir), kind),
    state: () => walk(dir),
  };
}

/**
 * An `open` for admin(): the real store the settings name (JSON lines or Tigris on the fake S3), with some of its methods replaced - a read that throws, a removal that deletes less,
 * a link store that fails on its second delete. The same wrapper serves both stores, so a failure case is tested on both.
 */
export function wrapped(over: (real: AdminStore) => Partial<AdminStore>): (cfg: StoreConfig) => AdminStore {
  return (cfg) => {
    const real = openAdmin(cfg);
    const base: AdminStore = {
      kind: real.kind, where: real.where,
      read: (rules, bodies) => real.read(rules, bodies), remove: (records) => real.remove(records),
      rulesVersions: () => real.rulesVersions!(), tombstoned: () => real.tombstoned!(),
      history: (ids) => real.history!(ids), removeHistory: (held) => real.removeHistory!(held), identity: () => real.identity!(),
    };
    return { ...base, ...over(real) };
  };
}

/** The tool as the command line runs it, with the clock at `now`: its output lines, its exit code, and the items it lists with "  delete ". */
export async function admin(
  w: Pick<World, "argv" | "env">,
  args: string[],
  now = NOW,
  open?: (cfg: never) => AdminStore,
): Promise<{ code: number; out: string[]; text: string; planned: string[] }> {
  const out: string[] = [];
  const code = await runAdmin([...args, ...w.argv], w.env, (l) => out.push(l), open as Parameters<typeof runAdmin>[3], () => now);
  return { code, out, text: out.join("\n"), planned: out.filter((l) => l.startsWith("  delete ")).map((l) => l.slice("  delete ".length)) };
}
