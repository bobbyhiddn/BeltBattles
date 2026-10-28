// S6D (REQ-BFG-119): the identity records beside the ghosts, as the ghost-admin commands that delete a player by ID or by idleness
// (server/pruneAdmin.ts) read and delete them. The server's own stores do the reading and the deleting: LinkStore (links, players, tombstones),
// ProfileStore and HistoryStore, over the same directory (JSON lines) or bucket (Tigris) as the ghosts. What those interfaces lack for an
// admin is a LISTING of the profiles and of the history, because the server only ever asks for one player's record by its ID; the two
// listings are here, so server/profileStore.ts and server/historyStore.ts stay as they are.

import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { newestFirst } from "../src/net/historyWire";
import { ID_PATTERN } from "../src/net/snapshot";
import { FileHistoryStore, HISTORY_DIR, HISTORY_KEY, TigrisHistoryStore, parseName, type HistoryName, type HistoryStore } from "./historyStore";
import { FileLinkStore, IDENTITY_DIR, TigrisLinkStore, type LinkStore } from "./linkStore";
import { FileProfileStore, PROFILE_DIR, TigrisProfileStore, type ProfileStore } from "./profileStore";
import type { S3Client } from "./s3";

/** The identity layer's stores for one ghost store, and the two listings an admin needs. */
export interface AdminIdentity {
  readonly links: LinkStore;
  readonly profiles: ProfileStore;
  readonly history: HistoryStore;
  /** Every id that has a profile record (profiles/<id>.json), sorted. */
  profileIds(): Promise<string[]>;
  /** Every id that has run-history entries (history/<id>/...), with its entries newest first. One pass over the store. */
  historyIndex(): Promise<Map<string, HistoryName[]>>;
}

/** The JSON-lines store: <dataDir>/identity, <dataDir>/profiles, <dataDir>/history (what linkStoreFor, profileStoreFor and historyStoreFor give the server). */
export function jsonlIdentity(dataDir: string): AdminIdentity {
  const profileDir = join(dataDir, PROFILE_DIR);
  const historyDir = join(dataDir, HISTORY_DIR);
  const history = new FileHistoryStore(historyDir);
  return {
    links: new FileLinkStore(join(dataDir, IDENTITY_DIR)),
    profiles: new FileProfileStore(profileDir),
    history,
    async profileIds() {
      if (!existsSync(profileDir)) return [];
      return readdirSync(profileDir).filter((n) => n.endsWith(".json")).map((n) => n.slice(0, -".json".length)).filter((id) => ID_PATTERN.test(id)).sort();
    },
    async historyIndex() {
      const out = new Map<string, HistoryName[]>();
      if (!existsSync(historyDir)) return out;
      for (const id of readdirSync(historyDir).filter((n) => ID_PATTERN.test(n)).sort()) {
        const names = await history.list(id);
        if (names.length) out.set(id, names);
      }
      return out;
    },
  };
}

/** The Tigris store: the same bucket, through the ghosts' own S3 client. */
export function tigrisIdentity(s3: S3Client): AdminIdentity {
  const history = new TigrisHistoryStore(s3);
  return {
    links: new TigrisLinkStore(s3),
    profiles: new TigrisProfileStore(s3),
    history,
    async profileIds() {
      const ids: string[] = [];
      for (const o of await s3.listAll("profiles/")) {
        const m = /^profiles\/([A-Za-z0-9_-]{1,64})\.json$/.exec(o.key);
        if (m) ids.push(m[1]);
      }
      return ids.sort();
    },
    async historyIndex() {
      const out = new Map<string, HistoryName[]>();
      for (const o of await s3.listAll(`${HISTORY_DIR}/`)) {
        if (!HISTORY_KEY.test(o.key)) continue; // this store's own check, as TigrisHistoryStore.list has it
        const [, id, name] = o.key.split("/");
        const n = parseName(name);
        if (!n) continue;
        const held = out.get(id);
        if (held) held.push(n);
        else out.set(id, [n]);
      }
      for (const names of out.values()) names.sort(newestFirst);
      return out;
    },
  };
}
