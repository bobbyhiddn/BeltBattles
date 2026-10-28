// S6D (REQ-BFG-119): the operator's privacy decisions of 2026-10-27/28 as ghost-admin commands (server/ghostAdmin.ts is the tool, this module
// its five new commands; the periods are server/retention.ts):
//
//   delete-player <id> [--apply]    a player the operator names by player ID, by a key id linked to a player, or by the code OPTIONS > MY PLAYER ID
//                                   shows (src/net/playerCode.ts). --apply does what DELETE /v1/player does THROUGH THE SAME CODE (Links.deletePlayer:
//                                   the tombstone first, then the profile of every id, the key links, the Steam links, the live code, the player
//                                   record and the run history), then removes the player's uploads in every rules version as purge-tombstoned does.
//   find-player <name> [--tag XX]   read only: every player ID whose stored uploads carry that name - how the operator finds a player who lost every
//                                   device and can only say their name, their hero and when they played.
//   prune-ghosts [--days N]         every upload, in every rules version, that the server received more than N days ago (180). Never the seed pool.
//   prune-idle [--days N]           every player with no server-side sign of play for more than N days (730 = 24 months), deleted as delete-player does.
//   weekly                          prune-idle, then purge-tombstoned, then prune-ghosts, with the defaults: the one command the weekly machine runs.
//
// THE TIME OF AN UPLOAD is the record's own `at`, the server's receipt time (server/store.ts add(): `at = Date.now()`; server/tigrisStore.ts the same, in
// the object's body), on both stores. Not the S3 LIST's LastModified: the tool reads every upload's body anyway (to learn whose it is: purge-tombstoned and
// remove-player do), a copied or re-written object changes its LastModified and not its `at`, server/s3.ts's LIST parser does not carry the time, and the
// fake S3 answers every LastModified alike. An upload whose `at` cannot be read is never deleted by age (it is counted and said).
//
// THE LAST PLAY of a player is the newest of the server-side signs of play held for the player and EVERY id linked to it (a key linked to the player, a
// key the player's record lists, an id one tombstone names): the profile's receivedAt (PUT /v1/profile, server/profileStore.ts); the newest upload's receipt
// time; the newest run-history entry (the object name holds its finishedAt, which the server bounds to its own clock when it takes the entry); the time of
// each key-link and Steam-link record (links/keys/<id>.json, links/steam/<id>.json: when the device or account was linked) and of the player record
// (players/<P>.json: written at a link, and at SHOW MY CODE). A player with a tombstone is never judged again. A player is idle when its last play is
// MORE than N days before now (so exactly N days is not idle). A player whose last play cannot be dated, or who has an unreadable profile, or whose ids
// do not name exactly one player, is left alone and said. A player with no stored record but uploads is not judged (its uploads age out by prune-ghosts).
//
// THE CLOCK GUARD: prune-ghosts, prune-idle and weekly refuse (exit 1, nothing deleted) when the store holds a receipt time later than now plus
// CLOCK_GUARD_MS (one day): a clock set far ahead would make every record look old.

import { nameTag, normalizeName } from "../src/net/names";
import { parsePlayerCode, playerCode } from "../src/net/playerCode";
import { ID_PATTERN } from "../src/net/snapshot";
import type { AdminIdentity } from "./adminIdentity";
import type { AdminArgs, AdminStore, Holdings, Plan, PurgeStats, StoredRecord } from "./ghostAdmin"; // types only: ghostAdmin.ts imports this module
import { nameOf, type HistoryName } from "./historyStore";
import { Links, decodeKeyLink, decodePlayer, decodeTombstone, tombstoneIds, type KeyLink, type PlayerRecord, type Tombstone } from "./links";
import { CLOCK_GUARD_MS, DAY_MS, GHOST_RETENTION_DAYS, IDLE_RETENTION_DAYS, STALE_STORE_DAYS } from "./retention";

export const RETENTION_COMMANDS = ["delete-player", "find-player", "prune-ghosts", "prune-idle", "weekly"] as const;
export type RetentionCommand = (typeof RETENTION_COMMANDS)[number];
export const isRetention = (c: string): c is RetentionCommand => (RETENTION_COMMANDS as readonly string[]).includes(c);

export const RETENTION_USAGE = [
  "  delete-player <id> [--apply]        delete one player as DELETE /v1/player does (tombstone, profile, links, run history), then its uploads in every",
  "                                      rules version; <id> is a player ID, a key id linked to a player, or the code OPTIONS > MY PLAYER ID shows",
  "  find-player <name> [--tag XX]       read only: every player ID whose stored uploads carry that name, with its tag, code, uploads and newest upload",
  `  prune-ghosts [--days N] [--apply]   every upload, in every rules version, that the server received more than N days ago (default ${GHOST_RETENTION_DAYS})`,
  `  prune-idle [--days N] [--apply]     every player with no server-side sign of play for more than N days (default ${IDLE_RETENTION_DAYS}), deleted as delete-player does`,
  "  weekly [--apply]                    prune-idle, then purge-tombstoned, then prune-ghosts, with the defaults: the one command the weekly machine runs",
  "  (these five take no --rules: they read every rules version. The three that delete by age refuse when a receipt time in the store is more than a day after now, and",
  `   with --apply when the newest one is more than ${STALE_STORE_DAYS} days before now, unless --stale-ok: a wrong clock. A bare -- ends the options, for a player ID that starts with two dashes)`,
];

/** What this module borrows from server/ghostAdmin.ts (which imports this module, so it cannot import that one's values). */
export interface Toolkit {
  makePlan: (args: AdminArgs, h: Holdings, tombstoned?: ReadonlySet<string>) => Plan;
  describe: (r: StoredRecord) => string;
  purgeTombstoned: (args: AdminArgs, store: AdminStore, out: (line: string) => void, stats?: PurgeStats) => Promise<number>;
}

type Out = (line: string) => void;
type Clock = () => number;

/** A time after the start of the year 2100 is a damaged record, not a clock reading: it is no sign of play, no age to delete by and no reason for the clock guard to refuse (the upload or player is kept and said). */
export const PLAUSIBLE_LATEST = Date.UTC(2100, 0, 1);
const plausible = (at: number | null | undefined): at is number => typeof at === "number" && Number.isSafeInteger(at) && at >= 0 && at <= PLAUSIBLE_LATEST;

const iso = (ms: number): string => (Number.isFinite(ms) && Math.abs(ms) <= 8.64e15 ? new Date(ms).toISOString().replace(/\.\d{3}Z$/, "Z") : "an impossible time"); // total: a damaged time must not crash a run
const days = (ms: number): number => Math.floor(ms / DAY_MS);

// ---------------------------------------------------------------------------------------------------------------- the command line

/** The command line of the five commands (called by ghostAdmin.parseArgs after it knows the command); `fail` makes its UsageError. */
export function parseRetention(
  command: RetentionCommand,
  pos: string[],
  f: { rules?: string; apply: boolean; pool: boolean; days?: string; tag?: string; staleOk?: boolean },
  fail: (message: string) => Error,
): AdminArgs {
  if (f.rules !== undefined) throw fail(`--rules does not go with ${command}: it reads every rules version`);
  if (f.pool) throw fail("--pool goes only with wipe-uploads");
  if (f.staleOk && command !== "prune-ghosts" && command !== "prune-idle" && command !== "weekly") throw fail("--stale-ok goes only with prune-ghosts, prune-idle and weekly");
  const args: AdminArgs = { command, rules: "", apply: f.apply, pool: false, ...(f.staleOk ? { staleOk: true } : {}) };
  if (f.tag !== undefined && command !== "find-player") throw fail("--tag goes only with find-player");
  if (f.days !== undefined && command !== "prune-ghosts" && command !== "prune-idle") throw fail("--days goes only with prune-ghosts and prune-idle");
  if (command === "delete-player") {
    const id = pos.shift();
    if (id === undefined) throw fail("delete-player needs a player ID, a key id linked to a player, or the code OPTIONS > MY PLAYER ID shows");
    if (id.length > 64 || !(ID_PATTERN.test(id) || parsePlayerCode(id) !== null)) {
      throw fail(`delete-player: ${JSON.stringify(id)} is neither a player ID (1-64 of A-Z a-z 0-9 _ -) nor a player code (XXXX-XXXX-XXXX-XXXX)`);
    }
    args.target = id;
  } else if (command === "find-player") {
    if (f.apply) throw fail("find-player never deletes: drop --apply");
    const name = normalizeName(pos.splice(0, pos.length).join(" "));
    if (!name) throw fail("find-player needs the name to look for");
    args.name = name;
    if (f.tag !== undefined) {
      if (!/^[0-9A-Fa-f]{2}$/.test(f.tag)) throw fail(`--tag ${JSON.stringify(f.tag)} is not a tag (two hex digits, as in ANNA#4F)`);
      args.tag = f.tag.toUpperCase();
    }
  } else if (command === "prune-ghosts" || command === "prune-idle") {
    const n = f.days === undefined ? (command === "prune-ghosts" ? GHOST_RETENTION_DAYS : IDLE_RETENTION_DAYS) : /^\d{1,5}$/.test(f.days) ? Number(f.days) : NaN;
    if (!Number.isInteger(n) || n < 1 || n > 36_500) throw fail(`--days ${JSON.stringify(f.days)} is not a whole number of days from 1 to 36500`);
    args.days = n;
  }
  if (pos.length) throw fail(`unexpected argument ${JSON.stringify(pos[0])}`);
  return args;
}

// ---------------------------------------------------------------------------------------------------------------- the inventory

/** One upload as the tool holds it: the rules version it is stored under and the record (with its receipt time `at`, name, hero). */
export interface Upload {
  rules: string;
  record: StoredRecord;
}

/** What the store holds about players: the uploads of every rules version (never the seed pool) and the identity records. */
export interface Inventory {
  uploads: Upload[];
  tombstones: Map<string, Tombstone>; // tombstones/<P>.json -> P
  tombstoned: Set<string>; // every id any tombstone names, and every P
  keyLinks: Map<string, KeyLink>; // links/keys/<id>.json
  steamLinks: Map<string, KeyLink>; // links/steam/<steamId>.json
  players: Map<string, PlayerRecord>; // players/<P>.json
  profiles: Map<string, number | null>; // profiles/<id>.json -> receivedAt (null: there but unreadable)
  history: Map<string, HistoryName[]>; // history/<id>/...
  /** Identity records that could not be read (they date nothing and are never followed). */
  skipped: number;
}

export interface Parts {
  uploads?: boolean;
  links?: boolean;
  /** true: every profile is read, for its receivedAt (prune-idle); "ids": only which ids have one (delete-player needs no time). */
  profiles?: boolean | "ids";
  history?: boolean;
}

/** Run `fn` over `items`, at most `limit` at a time. */
async function eachLimit<T>(items: readonly T[], limit: number, fn: (item: T) => Promise<void>): Promise<void> {
  let next = 0;
  const worker = async () => {
    while (next < items.length) await fn(items[next++]);
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
}

const idOfKey = (key: string): string => key.slice(key.lastIndexOf("/") + 1, -".json".length);

export async function readInventory(store: AdminStore, ident: AdminIdentity | null, parts: Parts): Promise<Inventory> {
  const inv: Inventory = { uploads: [], tombstones: new Map(), tombstoned: new Set(), keyLinks: new Map(), steamLinks: new Map(), players: new Map(), profiles: new Map(), history: new Map(), skipped: 0 };
  if (parts.uploads) {
    if (!store.rulesVersions) throw new Error("this store cannot list rules versions");
    for (const rules of await store.rulesVersions()) {
      const h = await store.read(rules, "fields"); // the fields every command asks of an upload, no body kept (a run holds every upload at once)
      for (const record of h.records) if (record.kind === "upload") inv.uploads.push({ rules, record });
    }
  }
  if (parts.links) {
    if (!ident) throw new Error("this store has no identity records to read");
    const links = ident.links;
    await eachLimit(await links.list("tombstones/"), 16, async (k) => {
      const t = decodeTombstone(await links.get(k));
      if (!t) inv.skipped++;
      else {
        inv.tombstones.set(idOfKey(k), t);
        inv.tombstoned.add(idOfKey(k));
        for (const id of t.ids) inv.tombstoned.add(id);
      }
    });
    await eachLimit(await links.list("links/keys/"), 16, async (k) => {
      const l = decodeKeyLink(await links.get(k));
      if (l) inv.keyLinks.set(idOfKey(k), l);
      else inv.skipped++;
    });
    await eachLimit(await links.list("links/steam/"), 16, async (k) => {
      const l = decodeKeyLink(await links.get(k));
      if (l) inv.steamLinks.set(idOfKey(k), l);
      else inv.skipped++;
    });
    await eachLimit(await links.list("players/"), 16, async (k) => {
      const p = decodePlayer(await links.get(k));
      if (p) inv.players.set(idOfKey(k), p);
      else inv.skipped++;
    });
  }
  if (parts.profiles) {
    if (!ident) throw new Error("this store has no identity records to read");
    const profiles = ident.profiles;
    await eachLimit(await ident.profileIds(), 16, async (id) => {
      if (parts.profiles === "ids") return void inv.profiles.set(id, null);
      try {
        inv.profiles.set(id, (await profiles.get(id))?.receivedAt ?? null);
      } catch {
        inv.profiles.set(id, null); // a profile of a newer version, or one the store cannot read now: it dates nothing and keeps its player
        inv.skipped++;
      }
    });
  }
  if (parts.history) {
    if (!ident) throw new Error("this store has no identity records to read");
    inv.history = await ident.historyIndex();
  }
  return inv;
}

// ---------------------------------------------------------------------------------------------------------------- the clock guard

/** The newest receipt time the inventory holds, and what holds it. "uploads": uploads only; "all": every record with a server-side time. */
export function latestReceipt(inv: Inventory, scope: "uploads" | "all"): { at: number; what: string } | null {
  const best = { at: -1, what: "" };
  const see = (at: number | null | undefined, what: string) => {
    if (plausible(at) && at > best.at) Object.assign(best, { at, what });
  };
  for (const u of inv.uploads) see(u.record.at, `upload ${u.record.ref}`);
  if (scope === "all") {
    for (const [id, at] of inv.profiles) see(at, `profile ${id}`);
    for (const [id, l] of inv.keyLinks) see(l.at, `key link ${id}`);
    for (const [id, l] of inv.steamLinks) see(l.at, `Steam link ${id}`);
    for (const [id, p] of inv.players) see(p.at, `player record ${id}`);
    for (const [id, t] of inv.tombstones) see(t.at, `tombstone ${id}`);
  }
  return best.at < 0 ? null : best;
}

/**
 * The refusal text when the clock looks wrong; null when it looks right. (1) The store holds a receipt time later than now plus a day: the clock is BEHIND the store. (2) With
 * --apply (and no --stale-ok), the newest receipt time is more than STALE_STORE_DAYS before now: either nobody has played for that long or the clock is far AHEAD, which would
 * make every record look old; a dry run is never refused for it (its clock line says so).
 */
export function clockProblem(inv: Inventory, now: number, scope: "uploads" | "all", run?: { apply: boolean; staleOk?: boolean }): string | null {
  const late = latestReceipt(inv, scope);
  if (late && late.at > now + CLOCK_GUARD_MS) {
    return `refused: the store holds a receipt time of ${iso(late.at)} (${late.what}), later than now (${iso(now)}) plus one day. This machine's clock is wrong, or the store came from one whose clock was. Nothing was deleted; fix the clock and run again.`;
  }
  if (late && run?.apply && !run.staleOk && now - late.at > STALE_STORE_DAYS * DAY_MS) {
    return `refused: the newest receipt time in the store is ${iso(late.at)} (${late.what}), ${days(now - late.at)} days before now (${iso(now)}), more than ${STALE_STORE_DAYS} days. Either nobody has played for that long, or this machine's clock is far ahead and --apply would delete records that are not due. Nothing was deleted. Check the clock; if the store really is that quiet, run again with --stale-ok.`;
  }
  return null;
}

/**
 * What the run believes the time is, and the newest receipt time it saw: the guard above catches a clock BEHIND the store, never one far AHEAD (every record then looks old
 * and nothing in the store can say so), so this line is printed on every run for a reader, with a NOTE when the newest record is more than 60 days old.
 */
export function clockLine(inv: Inventory, now: number, scope: "uploads" | "all"): string {
  const late = latestReceipt(inv, scope);
  const base = `clock: now ${iso(now)}; ${late ? `the newest receipt time in the store is ${iso(late.at)} (${late.what})` : "the store holds no receipt time"}.`;
  const age = late ? days(now - late.at) : 0;
  return age > 60 ? `${base} NOTE: that is ${age} days ago. If the game has been played since, this machine's clock is ahead and every record looks older than it is: check the clock before any --apply.` : base;
}

// ---------------------------------------------------------------------------------------------------------------- players: groups and resolving an id

/** Every id that is one player: the player, the keys linked to it, the ids its tombstone names. */
export interface Group {
  members: Set<string>;
  /** The ids that could be the player: its tombstone's name, else the members that are no linked key. Exactly one for a clear case. */
  roots: string[];
  tombstoned: boolean;
  /** Whether the server holds a record of it besides uploads (a profile, links, a player record, history). */
  hasState: boolean;
}

export function groupsOf(inv: Inventory): Map<string, Group> {
  const parent = new Map<string, string>();
  const find = (x: string): string => {
    let p = parent.get(x);
    if (p === undefined) {
      parent.set(x, x);
      return x;
    }
    while (p !== parent.get(p)) {
      parent.set(p, parent.get(parent.get(p)!)!);
      p = parent.get(p)!;
    }
    return p;
  };
  const union = (a: string, b: string) => {
    const ra = find(a), rb = find(b);
    if (ra !== rb) parent.set(ra, rb);
  };
  const state = new Set<string>(); // ids with a record besides uploads
  const has = (id: string) => {
    find(id);
    state.add(id);
  };
  for (const id of inv.profiles.keys()) has(id);
  for (const id of inv.history.keys()) has(id);
  for (const [id, l] of inv.keyLinks) {
    has(id);
    has(l.player);
    union(id, l.player);
  }
  for (const l of inv.steamLinks.values()) has(l.player);
  for (const [id, p] of inv.players) {
    has(id);
    for (const k of p.keys) union(id, k);
  }
  for (const [id, t] of inv.tombstones) {
    find(id);
    for (const k of t.ids) union(id, k);
  }
  for (const u of inv.uploads) if (u.record.playerId) find(u.record.playerId);
  const byRoot = new Map<string, Group>();
  for (const id of [...parent.keys()]) {
    const r = find(id);
    const g = byRoot.get(r) ?? { members: new Set<string>(), roots: [], tombstoned: false, hasState: false };
    g.members.add(id);
    if (inv.tombstoned.has(id)) g.tombstoned = true;
    if (state.has(id)) g.hasState = true;
    byRoot.set(r, g);
  }
  // a key is an id that its own link names a player for, or that a player record lists (a crash between the two writes of a link leaves a listed key
  // with no link: server/links.ts join); the player of a group is what is no key
  const listed = new Set<string>();
  for (const [id, p] of inv.players) for (const k of p.keys) if (k !== id) listed.add(k);
  const out = new Map<string, Group>();
  for (const g of byRoot.values()) {
    g.roots = g.tombstoned ? [...g.members].filter((m) => inv.tombstones.has(m)).sort() : [...g.members].filter((m) => !inv.keyLinks.has(m) && !listed.has(m)).sort();
    for (const m of g.members) out.set(m, g);
  }
  return out;
}

/** What judgeIdle asks again and again for every player, indexed once for an inventory (a scan of every upload for each player would be quadratic). */
interface Index {
  /** The newest receipt time of the uploads that carry a player id, and whether one of them has none that can be read. */
  uploadAt: Map<string, { at: number; undated: boolean }>;
  steamAt: Map<string, { steamId: string; at: number }[]>;
}
const indexes = new WeakMap<Inventory, Index>();
function indexOf(inv: Inventory): Index {
  let idx = indexes.get(inv);
  if (idx) return idx;
  idx = { uploadAt: new Map(), steamAt: new Map() };
  for (const u of inv.uploads) {
    const pid = u.record.playerId;
    if (pid == null) continue;
    const e = idx.uploadAt.get(pid) ?? { at: -1, undated: false };
    if (!plausible(u.record.at)) e.undated = true;
    else if (u.record.at > e.at) e.at = u.record.at;
    idx.uploadAt.set(pid, e);
  }
  for (const [steamId, l] of inv.steamLinks) idx.steamAt.set(l.player, [...(idx.steamAt.get(l.player) ?? []), { steamId, at: l.at }]);
  indexes.set(inv, idx);
  return idx;
}

export type Resolved = { ok: true; group: Group; player: string; how: string } | { ok: false; why: string };

/** The one player a typed id stands for: a player ID or a linked key id known to the store, or the code MY PLAYER ID shows. */
export function resolveTarget(inv: Inventory, arg: string, groups: Map<string, Group>): Resolved {
  const hits = new Map<Group, string[]>();
  const hit = (g: Group, how: string) => hits.set(g, [...(hits.get(g) ?? []), how]);
  const direct = ID_PATTERN.test(arg) ? groups.get(arg) : undefined;
  if (direct) hit(direct, arg);
  const code = parsePlayerCode(arg);
  if (code) {
    for (const [id, g] of groups) if (ID_PATTERN.test(id) && playerCode(id) === code) hit(g, `code:${id}`);
  }
  if (hits.size === 0) return { ok: false, why: `refused: ${JSON.stringify(arg)} matches no player this store holds (not a player ID, a linked key id or a MY PLAYER ID code of any id it knows). Nothing was deleted.` };
  if (hits.size > 1) {
    const names = [...hits.keys()].map((g) => g.roots.join("/") || "?");
    return { ok: false, why: `refused: ${JSON.stringify(arg)} matches ${hits.size} different players (${names.join(", ")}). Nothing was deleted; give the player ID of the one you mean.` };
  }
  const [group, hows] = [...hits][0];
  if (group.roots.length !== 1) {
    return { ok: false, why: `refused: ${JSON.stringify(arg)} is one of ${group.members.size} linked ids and the store does not say which is the player (${group.roots.join(", ") || "none can be"}). Nothing was deleted.` };
  }
  const player = group.roots[0];
  const first = hows[0];
  const given = first.startsWith("code:") ? `the code ${parsePlayerCode(arg)} of ${first.slice(5) === player ? "this player" : `its key ${first.slice(5)}`}` : first === player ? "a player ID" : `a key id linked to player ${player}`;
  return { ok: true, group, player, how: `${given}${group.tombstoned ? "; this player is already deleted (its tombstone exists), so this finishes whatever is left" : ""}` };
}

// ---------------------------------------------------------------------------------------------------------------- delete-player

/** Everything a delete of one player removes, as Links.deletePlayer and purge-tombstoned would, read from the inventory. */
export interface DeletePlan {
  player: string;
  group: Group;
  prior: Tombstone | null;
  /** The ids the tombstone names (links.ts tombstoneIds), then any linked key of the group the player record forgot. */
  ids: string[];
  strays: string[];
  profiles: string[];
  keyLinks: string[];
  steamLinks: string[];
  code: boolean;
  playerRecord: boolean;
  history: { id: string; name: HistoryName }[];
  uploads: Upload[];
}

/** The uploads of these ids, chosen by the very selection purge-tombstoned makes for tombstoned ids (ghostAdmin.makePlan), once for the whole set, grouped by player id. */
function uploadsByPlayer(inv: Inventory, ids: ReadonlySet<string>, tk: Toolkit): Map<string, Upload[]> {
  const out = new Map<string, Upload[]>();
  const versions = [...new Set(inv.uploads.map((u) => u.rules))].sort();
  for (const rules of versions) {
    const mine = inv.uploads.filter((u) => u.rules === rules);
    const plan = tk.makePlan({ command: "purge-tombstoned", rules, apply: false, pool: false }, { records: mine.map((u) => u.record), other: [] }, ids);
    const gone = new Set(plan.delete.map((d) => d.record));
    for (const u of mine) {
      if (!gone.has(u.record)) continue;
      const pid = u.record.playerId as string; // makePlan selects an upload only by its player id
      out.set(pid, [...(out.get(pid) ?? []), u]);
    }
  }
  return out;
}

/** `uploads`: the uploads of every player about to be deleted, grouped by player id (uploadsByPlayer); planDelete takes those of its own ids. */
export function planDelete(inv: Inventory, group: Group, player: string, tk: Toolkit, uploads?: Map<string, Upload[]>): DeletePlan {
  const rec = inv.players.get(player) ?? null;
  const prior = inv.tombstones.get(player) ?? null;
  const base = tombstoneIds(player, player, rec, prior);
  const strays = [...group.members].filter((m) => !base.includes(m) && inv.keyLinks.get(m)?.player === player).sort();
  const ids = [...base, ...strays];
  const idSet = new Set(ids);
  const byPlayer = uploads ?? uploadsByPlayer(inv, idSet, tk);
  return {
    player, group, prior, ids, strays,
    profiles: ids.filter((id) => inv.profiles.has(id)),
    keyLinks: ids.filter((id) => id !== player && inv.keyLinks.has(id)),
    steamLinks: (rec?.steam ?? []).filter((s) => {
      const l = inv.steamLinks.get(s);
      return l !== undefined && idSet.has(l.player);
    }),
    code: rec?.code !== undefined,
    playerRecord: rec !== null,
    history: ids.flatMap((id) => (inv.history.get(id) ?? []).map((name) => ({ id, name }))),
    uploads: ids.flatMap((id) => byPlayer.get(id) ?? []),
  };
}

/** How many things a delete removes (the "record(s)" of its DRY RUN line). */
const countOf = (p: DeletePlan): number => p.profiles.length + p.keyLinks.length + p.steamLinks.length + (p.code ? 1 : 0) + (p.playerRecord ? 1 : 0) + p.history.length + p.uploads.length;

function printDelete(p: DeletePlan, out: Out, tk: Toolkit): void {
  out(p.prior
    ? `  tombstone: tombstones/${p.player}.json exists (written ${iso(p.prior.at)}); it is rewritten, still naming ${p.ids.length} id(s): ${p.ids.join(" ")}`
    : `  tombstone: tombstones/${p.player}.json is written first, naming ${p.ids.length} id(s): ${p.ids.join(" ")}`);
  for (const id of p.profiles) out(`  delete profile ${id}`);
  for (const id of p.keyLinks) out(`  delete key link ${id}`);
  for (const id of p.steamLinks) out(`  delete Steam link ${id}`);
  if (p.code) out("  delete the live link code");
  if (p.playerRecord) out(`  delete player record ${p.player}`);
  for (const h of p.history) out(`  delete history/${h.id}/${nameOf(h.name)}`);
  for (const u of p.uploads) out(`  delete ${tk.describe(u.record)}  (upload of the deleted player ${u.record.playerId})`);
  out(`  seed pool: never touched; ${p.uploads.length} upload(s) in ${new Set(p.uploads.map((u) => u.rules)).size} rules version(s)`);
}

/** The same delete DELETE /v1/player makes (Links.deletePlayer), for one player; the uploads are removed by the caller. */
async function deleteThroughLinks(p: DeletePlan, ident: AdminIdentity, clock: Clock, out: Out): Promise<void> {
  const links = new Links(ident.links, ident.profiles, { now: clock, history: ident.history, log: (line) => out(`  ${line}`) });
  await links.deletePlayer(p.player);
  for (const s of p.strays) await links.deletePlayer(s); // a key the player's record forgot: its own delete finishes it
}

const NOTE_AFTER_DELETE = [
  "  A running server learns of the tombstone at its next tombstone refresh (within 60 s) and then serves no ghost of these ids; ghosts it has cached",
  "  are served until its bucket cache expires (BB_GHOST_CACHE_TTL_S; 600 s on Fly) or it restarts (JSON lines: only a restart).",
];

async function deletePlayerCommand(args: AdminArgs, store: AdminStore, ident: AdminIdentity, out: Out, clock: Clock, tk: Toolkit): Promise<number> {
  const inv = await readInventory(store, ident, { uploads: true, links: true, profiles: "ids", history: true }); // the time of a profile is not needed to delete
  const r = resolveTarget(inv, args.target ?? "", groupsOf(inv));
  if (!r.ok) {
    out(r.why);
    return 1;
  }
  out(`resolved: player ${r.player} (given as ${r.how})`);
  if (inv.skipped) out(`note: ${inv.skipped} identity record(s) could not be read and were skipped`);
  const plan = planDelete(inv, r.group, r.player, tk);
  printDelete(plan, out, tk);
  if (!args.apply) {
    out(`DRY RUN: nothing was deleted. --apply writes the tombstone and deletes exactly the ${countOf(plan)} record(s) above.`);
    return 0;
  }
  await deleteThroughLinks(plan, ident, clock, out);
  const n = plan.uploads.length ? await store.remove(plan.uploads.map((u) => u.record)) : 0;
  out(`APPLIED: the tombstone is written and the profile, links, player record and run history are deleted (as DELETE /v1/player does); deleted ${n} of ${plan.uploads.length} upload(s).`);
  for (const line of NOTE_AFTER_DELETE) out(line);
  if (n < plan.uploads.length) out(`  ${plan.uploads.length - n} planned upload(s) had already changed or gone: run again to see the store as it is now.`);
  return n === plan.uploads.length ? 0 : 1;
}

// ---------------------------------------------------------------------------------------------------------------- find-player

async function findPlayerCommand(args: AdminArgs, store: AdminStore, ident: AdminIdentity, out: Out): Promise<number> {
  const inv = await readInventory(store, ident, { uploads: true, links: true });
  const want = normalizeName(args.name ?? "");
  const byPlayer = new Map<string, Upload[]>();
  let notIds = 0; // uploads of that name whose player id is no id (an old or damaged record): they cannot be shown by id or deleted by it
  for (const u of inv.uploads) {
    const id = u.record.playerId;
    if (id === null || id === undefined || u.record.name == null || normalizeName(u.record.name) !== want) continue;
    if (!ID_PATTERN.test(id)) {
      notIds++;
      continue;
    }
    if (args.tag !== undefined && nameTag(id) !== args.tag) continue;
    const held = byPlayer.get(id);
    if (held) held.push(u);
    else byPlayer.set(id, [u]);
  }
  const newestOf = (ups: Upload[]) => ups.reduce((m, u) => (plausible(u.record.at) && u.record.at > m ? u.record.at : m), 0);
  const rows = [...byPlayer].map(([id, ups]) => ({ id, ups, newest: newestOf(ups) })).sort((a, b) => b.newest - a.newest || (a.id < b.id ? -1 : 1));
  out(`find-player ${JSON.stringify(want)}${args.tag ? ` --tag ${args.tag}` : ""}: ${rows.length} player ID(s) have a stored upload with that name${args.tag ? " and tag" : ""}`);
  for (const row of rows) {
    const heroes = [...new Set(row.ups.map((u) => u.record.hero ?? "?"))].sort();
    const versions = [...new Set(row.ups.map((u) => u.rules))].sort();
    const link = inv.keyLinks.get(row.id);
    const dead = inv.tombstoned.has(row.id);
    out(`  player ${row.id}  tag ${nameTag(row.id)}  code ${playerCode(row.id)}  uploads ${row.ups.length}  newest ${row.newest > 0 ? iso(row.newest) : "unknown"}  heroes ${heroes.join(",")}  rules ${versions.join(",")}  tombstoned ${dead ? "yes" : "no"}${link ? `  linked to player ${link.player}` : ""}`);
  }
  if (notIds) out(`  ${notIds} more upload(s) with that name carry a player id that is not an id (1-64 of A-Z a-z 0-9 _ -); they are not listed. prune-ghosts ages them out`);
  if (rows.length === 0) {
    out(args.tag !== undefined
      ? "  no stored upload with that name carries that tag: leave --tag out to see every player with the name"
      : "  no stored upload carries that name (a player who never uploaded a ghost, or whose ghosts are older than the retention period, has none: ask for their player ID)");
  }
  return 0;
}

// ---------------------------------------------------------------------------------------------------------------- prune-ghosts

export interface GhostPlan {
  cutoff: number;
  delete: Upload[];
  keep: number;
  /** Uploads whose receipt time cannot be read: never deleted by age. */
  undated: number;
}

export function planGhosts(inv: Inventory, now: number, daysOld: number, skip: ReadonlySet<StoredRecord> = new Set()): GhostPlan {
  const cutoff = now - daysOld * DAY_MS;
  const plan: GhostPlan = { cutoff, delete: [], keep: 0, undated: 0 };
  for (const u of inv.uploads) {
    if (skip.has(u.record)) continue;
    const at = u.record.at;
    if (!plausible(at)) plan.undated++;
    else if (at < cutoff) plan.delete.push(u);
    else plan.keep++;
  }
  return plan;
}

function printGhosts(plan: GhostPlan, now: number, daysOld: number, out: Out, tk: Toolkit): void {
  out(`uploads received before ${iso(plan.cutoff)} (more than ${daysOld} days ago) are deleted: ${plan.delete.length} of ${plan.delete.length + plan.keep + plan.undated}`);
  for (const rules of [...new Set(plan.delete.map((u) => u.rules))].sort()) out(`${rules}: delete ${plan.delete.filter((u) => u.rules === rules).length} upload(s)`);
  for (const u of plan.delete) out(`  delete ${tk.describe(u.record)}  (received ${iso(u.record.at!)}, ${days(now - u.record.at!)} days ago)`);
  out(`plan: delete ${plan.delete.length} upload(s); keep ${plan.keep}; the seed pool is never touched${plan.undated ? `; ${plan.undated} upload(s) with no readable receipt time are kept` : ""}`);
}

async function pruneGhostsCommand(args: AdminArgs, store: AdminStore, out: Out, clock: Clock, tk: Toolkit): Promise<number> {
  const now = clock();
  const daysOld = args.days ?? GHOST_RETENTION_DAYS;
  const inv = await readInventory(store, null, { uploads: true });
  const refused = clockProblem(inv, now, "uploads", args);
  if (refused) {
    out(refused);
    return 1;
  }
  out(clockLine(inv, now, "uploads"));
  const plan = planGhosts(inv, now, daysOld);
  printGhosts(plan, now, daysOld, out, tk);
  if (!args.apply) {
    out(`DRY RUN: nothing was deleted. --apply deletes exactly the ${plan.delete.length} record(s) above.`);
    return 0;
  }
  const n = plan.delete.length ? await store.remove(plan.delete.map((u) => u.record)) : 0;
  out(`APPLIED: deleted ${n} of ${plan.delete.length} record(s).`);
  if (n) {
    out(store.kind === "tigris"
      ? "  A running server serves a deleted ghost until its bucket cache expires (BB_GHOST_CACHE_TTL_S) or it restarts."
      : "  Restart the ghost server: it holds the deleted ghosts in memory until it reloads its files.");
  }
  if (n < plan.delete.length) out(`  ${plan.delete.length - n} planned record(s) had already changed or gone: run again to see the store as it is now.`);
  return n === plan.delete.length ? 0 : 1;
}

// ---------------------------------------------------------------------------------------------------------------- prune-idle

export interface IdleVerdict {
  group: Group;
  player: string;
  lastPlay: number;
  basis: string;
}

export interface IdleResult {
  considered: number;
  idle: IdleVerdict[];
  kept: number;
  /** Players left alone because they could not be judged, with the reason. */
  unjudged: string[];
}

/** The last play of one player: the newest server-side sign over every id of the group, and which sign it is. null: nothing dated. */
export function lastPlayOf(inv: Inventory, group: Group): { at: number; basis: string; undatable: boolean } | null {
  const best = { at: -1, basis: "" };
  let undatable = false;
  const see = (at: number | null | undefined, basis: string) => {
    if (typeof at !== "number") return;
    if (!plausible(at)) undatable = true; // a damaged time: the player cannot be judged
    else if (at > best.at) Object.assign(best, { at, basis });
  };
  const idx = indexOf(inv);
  for (const id of group.members) {
    if (inv.profiles.has(id)) {
      const at = inv.profiles.get(id);
      if (at === null || at === undefined) undatable = true;
      else see(at, `the profile of ${id} (receivedAt)`);
    }
    const l = inv.keyLinks.get(id);
    if (l) see(l.at, `the key link of ${id}`);
    const p = inv.players.get(id);
    if (p) see(p.at, `the player record of ${id}`);
    for (const h of inv.history.get(id) ?? []) see(h.finishedAt, `a run in the history of ${id} (finishedAt)`);
    for (const s of idx.steamAt.get(id) ?? []) see(s.at, `the Steam link ${s.steamId}`);
    const up = idx.uploadAt.get(id);
    if (up) {
      if (up.undated) undatable = true;
      if (up.at >= 0) see(up.at, `an upload of ${id} (received)`);
    }
  }
  return best.at < 0 && !undatable ? null : { at: best.at, basis: best.basis, undatable };
}

export function judgeIdle(inv: Inventory, now: number, daysIdle: number): IdleResult {
  const cutoff = now - daysIdle * DAY_MS;
  const res: IdleResult = { considered: 0, idle: [], kept: 0, unjudged: [] };
  const seen = new Set<Group>();
  for (const g of groupsOf(inv).values()) {
    if (seen.has(g)) continue;
    seen.add(g);
    if (g.tombstoned || !g.hasState) continue; // a deleted player is never idle again; a player with only uploads ages out by prune-ghosts
    res.considered++;
    if (g.roots.length !== 1) {
      res.unjudged.push(`${[...g.members].sort().join(" ")}: the store does not say which of these ids is the player (${g.roots.join(", ") || "none can be"})`);
      continue;
    }
    const last = lastPlayOf(inv, g);
    if (last === null || last.undatable) {
      res.unjudged.push(`${g.roots[0]}: ${last === null ? "no server-side sign of play can be dated" : "a record that dates it cannot be read"}`);
      continue;
    }
    if (last.at < cutoff) res.idle.push({ group: g, player: g.roots[0], lastPlay: last.at, basis: last.basis });
    else res.kept++;
  }
  res.idle.sort((a, b) => (a.player < b.player ? -1 : 1));
  return res;
}

/** The delete plan of each idle player; the uploads of all of them are chosen in one pass (a pass for each player would be quadratic in the uploads). */
function plansFor(inv: Inventory, idle: readonly IdleVerdict[], tk: Toolkit): { v: IdleVerdict; plan: DeletePlan }[] {
  const everyId = new Set(idle.flatMap((v) => [...v.group.members]));
  const byPlayer = idle.length ? uploadsByPlayer(inv, everyId, tk) : new Map<string, Upload[]>();
  return idle.map((v) => ({ v, plan: planDelete(inv, v.group, v.player, tk, byPlayer) }));
}

/** prune-idle. `quiet`: only the refusal is said here (weekly prints its own summary line); `inv`: the store as weekly has just read it. */
async function pruneIdleCommand(args: AdminArgs, store: AdminStore, ident: AdminIdentity, out: Out, clock: Clock, tk: Toolkit, quiet = false, read?: Inventory): Promise<{ code: number; players: number; uploads: number }> {
  const now = clock();
  const daysIdle = args.days ?? IDLE_RETENTION_DAYS;
  const inv = read ?? await readInventory(store, ident, { uploads: true, links: true, profiles: true, history: true });
  const refused = clockProblem(inv, now, "all", args);
  if (refused) {
    out(refused);
    return { code: 1, players: 0, uploads: 0 };
  }
  const res = judgeIdle(inv, now, daysIdle);
  const plans = plansFor(inv, res.idle, tk);
  const uploads = plans.flatMap((p) => p.plan.uploads);
  if (!quiet) {
    out(clockLine(inv, now, "all"));
    if (inv.skipped) out(`note: ${inv.skipped} identity record(s) could not be read and were skipped`);
    out(`players with stored records: ${res.considered}; idle (no server-side sign of play since ${iso(now - daysIdle * DAY_MS)}, more than ${daysIdle} days): ${res.idle.length}; kept: ${res.kept}${res.unjudged.length ? `; left alone because they cannot be judged: ${res.unjudged.length}` : ""}`);
    for (const line of res.unjudged) out(`  kept (not judged) ${line}`);
    for (const { v, plan } of plans) {
      out(`idle player ${v.player}: last play ${iso(v.lastPlay)} (${v.basis}), ${days(now - v.lastPlay)} days ago; ${v.group.members.size} id(s)`);
      printDelete(plan, out, tk);
    }
  }
  const total = plans.reduce((s, p) => s + countOf(p.plan), 0);
  if (!args.apply) {
    if (!quiet) out(`DRY RUN: nothing was deleted. --apply deletes exactly the ${res.idle.length} player(s) above (${total} record(s)), each as delete-player does.`);
    return { code: 0, players: res.idle.length, uploads: uploads.length };
  }
  for (const { plan } of plans) await deleteThroughLinks(plan, ident, clock, out);
  const n = uploads.length ? await store.remove(uploads.map((u) => u.record)) : 0; // one removal for every player's uploads: a JSON-lines ref is a line number
  if (!quiet) {
    out(`APPLIED: deleted ${res.idle.length} idle player(s) as delete-player does; deleted ${n} of ${uploads.length} upload(s).`);
    if (res.idle.length) for (const line of NOTE_AFTER_DELETE) out(line);
    if (n < uploads.length) out(`  ${uploads.length - n} planned upload(s) had already changed or gone: run again to see the store as it is now.`);
  }
  return { code: n === uploads.length ? 0 : 1, players: res.idle.length, uploads: n };
}

// ---------------------------------------------------------------------------------------------------------------- weekly

/**
 * prune-idle, then purge-tombstoned, then prune-ghosts, with the defaults. A dry run reads the store once and prints one plan and ONE DRY RUN line; --apply
 * runs the three in that order, each on a fresh read of the store, and prints one summary line for each. The three are independent: a step that fails does
 * not stop the next (each is safe alone), and the exit code is 1 if any step failed. The clock guard refuses before anything is deleted.
 */
async function weeklyCommand(args: AdminArgs, store: AdminStore, ident: AdminIdentity, out: Out, clock: Clock, tk: Toolkit): Promise<number> {
  const now = clock();
  const idleArgs: AdminArgs = { ...args, command: "prune-idle", days: IDLE_RETENTION_DAYS };
  // the third step reads the uploads only (after the first two removed some), so it is not judged for a quiet store again: the guard below judged every record at the start
  const ghostArgs: AdminArgs = { ...args, command: "prune-ghosts", days: GHOST_RETENTION_DAYS, staleOk: true };
  const purgeArgs: AdminArgs = { command: "purge-tombstoned", rules: "", apply: args.apply, pool: false };
  const guard = await readInventory(store, ident, { uploads: true, links: true, profiles: true, history: true });
  const refused = clockProblem(guard, now, "all", args);
  if (refused) {
    out(refused);
    return 1;
  }
  out(clockLine(guard, now, "all"));
  if (guard.skipped) out(`note: ${guard.skipped} identity record(s) could not be read and were skipped`);
  if (!args.apply) {
    out(`weekly 1/3 prune-idle (${IDLE_RETENTION_DAYS} days):`);
    const idle = judgeIdle(guard, now, IDLE_RETENTION_DAYS);
    const plans = plansFor(guard, idle.idle, tk);
    out(`  players with stored records: ${idle.considered}; idle: ${idle.idle.length}; kept: ${idle.kept}${idle.unjudged.length ? `; left alone because they cannot be judged: ${idle.unjudged.length}` : ""}`);
    for (const { v, plan } of plans) {
      out(`  idle player ${v.player}: last play ${iso(v.lastPlay)} (${v.basis}), ${days(now - v.lastPlay)} days ago`);
      printDelete(plan, (l) => out(`  ${l}`), tk);
    }
    const removed = new Set<StoredRecord>(plans.flatMap((p) => p.plan.uploads.map((u) => u.record)));
    out("weekly 2/3 purge-tombstoned:");
    const stats: PurgeStats = { tombstoned: 0, planned: 0, deleted: 0, historyPlanned: 0, historyDeleted: 0 };
    const code = await tk.purgeTombstoned(purgeArgs, store, (l) => {
      if (!l.startsWith("DRY RUN:") && !l.startsWith("  and the ")) out(`  ${l}`);
    }, stats);
    for (const u of guard.uploads) if (u.record.playerId != null && guard.tombstoned.has(u.record.playerId)) removed.add(u.record);
    out(`weekly 3/3 prune-ghosts (${GHOST_RETENTION_DAYS} days):`);
    const ghosts = planGhosts(guard, now, GHOST_RETENTION_DAYS, removed);
    printGhosts(ghosts, now, GHOST_RETENTION_DAYS, (l) => out(`  ${l}`), tk);
    const total = plans.reduce((s, p) => s + countOf(p.plan), 0) + stats.planned + stats.historyPlanned + ghosts.delete.length;
    out(`DRY RUN: nothing was deleted. --apply runs the three steps above in that order: ${idle.idle.length} idle player(s), ${stats.planned} upload(s) and ${stats.historyPlanned} history object(s) of already deleted players, ${ghosts.delete.length} upload(s) older than ${GHOST_RETENTION_DAYS} days (${total} record(s) in all).`);
    return code === 0 ? 0 : 1;
  }
  let failed = 0;
  const step = (n: number, name: string, text: string, code: number) => {
    out(`weekly ${n}/3 ${name}: ${text}${code === 0 ? "" : " (FAILED: exit 1)"}`);
    if (code !== 0) failed++;
  };
  try {
    const r = await pruneIdleCommand(idleArgs, store, ident, out, clock, tk, true, guard);
    step(1, "prune-idle", `deleted ${r.players} idle player(s) (more than ${IDLE_RETENTION_DAYS} days without play) and ${r.uploads} of their upload(s)`, r.code);
  } catch (e) {
    step(1, "prune-idle", `failed: ${e instanceof Error ? e.message : String(e)}`, 1);
  }
  try {
    const stats: PurgeStats = { tombstoned: 0, planned: 0, deleted: 0, historyPlanned: 0, historyDeleted: 0 };
    const code = await tk.purgeTombstoned(purgeArgs, store, () => {}, stats);
    step(2, "purge-tombstoned", `deleted ${stats.deleted} of ${stats.planned} upload(s) and ${stats.historyDeleted} of ${stats.historyPlanned} history object(s) of the ${stats.tombstoned} id(s) in tombstones`, code);
  } catch (e) {
    step(2, "purge-tombstoned", `failed: ${e instanceof Error ? e.message : String(e)}`, 1);
  }
  try {
    const inv = await readInventory(store, null, { uploads: true });
    const late = clockProblem(inv, clock(), "uploads", ghostArgs);
    if (late) step(3, "prune-ghosts", late, 1);
    else {
      const plan = planGhosts(inv, clock(), GHOST_RETENTION_DAYS);
      const n = plan.delete.length ? await store.remove(plan.delete.map((u) => u.record)) : 0;
      step(3, "prune-ghosts", `deleted ${n} of ${plan.delete.length} upload(s) received more than ${GHOST_RETENTION_DAYS} days ago${plan.undated ? ` (${plan.undated} with no readable receipt time kept)` : ""}`, n === plan.delete.length ? 0 : 1);
    }
  } catch (e) {
    step(3, "prune-ghosts", `failed: ${e instanceof Error ? e.message : String(e)}`, 1);
  }
  out(failed === 0 ? "weekly: done, all three steps succeeded" : `weekly: finished with ${failed} failed step(s)`);
  return failed === 0 ? 0 : 1;
}

// ---------------------------------------------------------------------------------------------------------------- the dispatch

/** Run one of the five commands (called by ghostAdmin.runAdmin after its first line). Resolves the exit code: 0 done (a dry run too), 1 a refusal, a storage error or less deleted than planned. */
export async function runRetention(args: AdminArgs, store: AdminStore, out: Out, clock: Clock, tk: Toolkit): Promise<number> {
  const needIdentity = (): AdminIdentity => {
    if (!store.identity) throw new Error("this store cannot read the identity records");
    return store.identity();
  };
  switch (args.command) {
    case "delete-player":
      return deletePlayerCommand(args, store, needIdentity(), out, clock, tk);
    case "find-player":
      return findPlayerCommand(args, store, needIdentity(), out);
    case "prune-ghosts":
      return pruneGhostsCommand(args, store, out, clock, tk);
    case "prune-idle":
      return (await pruneIdleCommand(args, store, needIdentity(), out, clock, tk)).code;
    case "weekly":
      return weeklyCommand(args, store, needIdentity(), out, clock, tk);
    default:
      throw new Error(`not a retention command: ${args.command}`);
  }
}
