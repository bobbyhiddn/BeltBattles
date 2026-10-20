// IDENT-1 (REQ-BFG-122): fixtures for the identity tests. Not a test file itself. A server in process over either backing store (the
// JSON-lines directory, or Tigris on the in-process fake S3) that can be RESTARTED over the same storage, a fixed clock, and signed
// requests in every domain (src/net/identity.ts) built the way the client builds them.

import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  DELETE_PREFIX, KEY_HEADER, LINK_CODE_PREFIX, LINK_REDEEM_PREFIX, LINK_STEAM_PREFIX, PROFILE_GET_PREFIX, PROFILE_PREFIX, SIG_HEADER, UPLOAD_PREFIX,
  type Identity, type SignDomain,
} from "../src/net/identity";
import { encodeWire, type WireProfile } from "../src/net/profileWire";
import { encodeSnapshot, type GhostSnapshot } from "../src/net/snapshot";
import { HEARTS_START } from "../src/sim/hearts";
import { createGhostServer, type GhostServer, type ServerOptions } from "../server/app";
import type { FakeS3 } from "../tools/fakeS3";
import { upSnap } from "./netHelpers";
import { ownedBy } from "./netIdentity";
import { startFake, tigrisFor } from "./netStores";
import { NOW } from "./profileupWire";

export type Kind = "jsonl" | "tigris";
export type Opts = Omit<ServerOptions, "store" | "dataDir">;

export interface Rig {
  kind: Kind;
  /** The fake S3 bucket (tigris) or "" . */
  bucket: string;
  /** The data directory (jsonl) or "". */
  dir: string;
  app: GhostServer;
  base: string;
  log: string[];
  clock: { now: number };
  /** Close the server and open a new one over the same storage (a restart: nothing in memory survives). */
  restart(over?: Opts): Promise<void>;
  close(): Promise<void>;
}

let fake: FakeS3 | null = null;
let buckets = 0;
const dirs: string[] = [];
const opened: Rig[] = [];

/** A server over fresh, empty storage of the given kind, with a fixed clock (rig.clock.now) and its log captured. */
export async function openRig(kind: Kind, over: Opts = {}): Promise<Rig> {
  const log: string[] = [];
  const clock = { now: NOW };
  let dir = "";
  let bucket = "";
  if (kind === "jsonl") {
    dir = mkdtempSync(join(tmpdir(), "bb-ident-"));
    dirs.push(dir);
  } else {
    fake ??= await startFake();
    bucket = `bb-ident-${++buckets}`;
    fake.createBucket(bucket);
  }
  const make = (o: Opts): GhostServer => {
    const opts = { log: (l: string) => log.push(l), now: () => clock.now, ...o };
    return kind === "jsonl" ? createGhostServer({ ...opts, dataDir: dir }) : createGhostServer({ ...opts, store: tigrisFor(fake!, bucket) });
  };
  const rig = { kind, log, clock, bucket, dir } as Rig;
  rig.app = make(over);
  rig.base = `http://127.0.0.1:${await rig.app.listen(0)}`;
  rig.restart = async (o = over) => {
    await rig.app.close();
    rig.app = make(o);
    rig.base = `http://127.0.0.1:${await rig.app.listen(0)}`;
  };
  rig.close = () => rig.app.close();
  opened.push(rig);
  return rig;
}

/** Close every server and the fake S3; remove the temp directories. Call it in afterAll. */
export async function closeRigs(): Promise<void> {
  for (const r of opened.splice(0)) await r.close().catch(() => {});
  if (fake) await fake.close();
  fake = null;
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
}

/** The raw object keys the fake S3 holds under a prefix, for a tigris rig's bucket. */
export function fakeKeys(rig: Rig, prefix: string): string[] {
  return fake && rig.kind === "tigris" ? fake.keys(rig.bucket, prefix) : [];
}

/** The fake S3 itself (a tigris rig's), for tests that break it. */
export function theFake(): FakeS3 {
  if (!fake) throw new Error("no fake S3 is open");
  return fake;
}

export interface Reply {
  status: number;
  text: string;
  json: Record<string, unknown> | null;
  headers: Headers;
}

export async function send(r: Pick<Rig, "base">, method: string, path: string, body?: string | Uint8Array<ArrayBuffer>, headers: Record<string, string> = {}): Promise<Reply> {
  const res = await fetch(`${r.base}${path}`, { method, headers, ...(body === undefined ? {} : { body }) });
  const text = await res.text();
  let json: Record<string, unknown> | null = null;
  try {
    json = text ? (JSON.parse(text) as Record<string, unknown>) : null;
  } catch {
    json = null;
  }
  return { status: res.status, text, json, headers: res.headers };
}

/** Headers for `body` signed by `id` in `domain`. */
export async function signedBy(id: Identity, body: string | Uint8Array<ArrayBuffer>, domain: SignDomain): Promise<Record<string, string>> {
  const bytes = typeof body === "string" ? new TextEncoder().encode(body) : body;
  const { key, sig } = await id.sign(bytes, domain);
  return { "content-type": "application/json", [KEY_HEADER]: key, [SIG_HEADER]: sig };
}

/** The canonical body `{"at":<ms>,...fields}` the identity routes take. */
export const bodyAt = (at: number, fields: Record<string, unknown> = {}): string => JSON.stringify({ at, ...fields });

/** POST/DELETE a canonical body signed in `domain`. */
async function signedCall(r: Rig, method: string, path: string, domain: SignDomain, id: Identity, fields: Record<string, unknown> = {}, at = r.clock.now): Promise<Reply> {
  const body = bodyAt(at, fields);
  return send(r, method, path, body, await signedBy(id, body, domain));
}

export const requestCode = (r: Rig, id: Identity, at?: number) => signedCall(r, "POST", "/v1/link/code", LINK_CODE_PREFIX, id, {}, at);
export const redeemCode = (r: Rig, id: Identity, code: string, at?: number) => signedCall(r, "POST", "/v1/link/redeem", LINK_REDEEM_PREFIX, id, { code }, at);
export const deleteMe = (r: Rig, id: Identity, at?: number) => signedCall(r, "DELETE", "/v1/player", DELETE_PREFIX, id, {}, at);
export const linkSteamCall = (r: Rig, id: Identity, ticket: string, identity: string, appid: number, at?: number) =>
  signedCall(r, "POST", "/v1/link/steam", LINK_STEAM_PREFIX, id, { ticket, identity, appid }, at);

/** GET /v1/profile?at=<ms>, signed over the query text. */
export async function readProfile(r: Rig, id: Identity, at = r.clock.now): Promise<Reply> {
  const query = `at=${at}`;
  return send(r, "GET", `/v1/profile?${query}`, undefined, await signedBy(id, query, PROFILE_GET_PREFIX));
}

/** PUT /v1/profile with `w` signed by `id`. */
export async function putWire(r: Rig, w: WireProfile, id: Identity): Promise<Reply> {
  const body = encodeWire(w);
  return send(r, "PUT", "/v1/profile", body, await signedBy(id, body, PROFILE_PREFIX));
}

/** The snapshot an upload of day 1 carries, under `playerId` (default: the identity's own, as every 0.9.13 client has it). */
export function uploadFor(id: Identity, playerId: string = id.playerId, over: Partial<GhostSnapshot> = {}): GhostSnapshot {
  return { ...ownedBy(upSnap({ lives: HEARTS_START, losses: 0, ...over }), id), playerId };
}

/** POST /v1/ghosts of `snap`, signed by `id` (the ghost domain). */
export async function postGhost(r: Rig, id: Identity, snap: GhostSnapshot): Promise<Reply> {
  const body = encodeSnapshot(snap);
  return send(r, "POST", "/v1/ghosts", body, await signedBy(id, body, UPLOAD_PREFIX));
}

/** GET /v1/ghosts/match for day 1 as `player`, a player with enough runs to be matched against uploads (not only the seed pool). */
export async function matchAs(r: Rig, player: string, over: Record<string, string> = {}): Promise<Reply> {
  const q = new URLSearchParams({ rules: upSnap().rules, day: "1", wins: "0", lives: String(HEARTS_START), player, seen: "", runs: "9", ...over });
  return send(r, "GET", `/v1/ghosts/match?${q.toString()}`);
}
