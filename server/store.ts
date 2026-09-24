// Append-only JSON-lines ghost store: one {"id","at","snapshot"} object per line in
// <dataDir>/ghosts.jsonl, loaded into memory at start and indexed by (rules, day).
// Nothing is ever rewritten in place; a torn or corrupt line is skipped on load.

import { appendFileSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { checkSnapshot, ghostId, type GhostSnapshot, type PoolEntry } from "../src/net/snapshot";

export const STORE_FILE = "ghosts.jsonl";

export class GhostStore {
  readonly file: string;
  skipped = 0; // lines that failed to parse or check on load
  private byId = new Map<string, PoolEntry>();
  private buckets = new Map<string, PoolEntry[]>();

  constructor(readonly dataDir: string) {
    this.file = join(dataDir, STORE_FILE);
  }

  /** Read the file into memory (creating the data directory). Returns the ghost count. */
  load(): number {
    mkdirSync(this.dataDir, { recursive: true });
    if (!existsSync(this.file)) return 0;
    for (const line of readFileSync(this.file, "utf8").split("\n")) {
      if (!line.trim()) continue;
      try {
        const rec = JSON.parse(line) as { snapshot?: unknown };
        const snapshot = checkSnapshot(rec.snapshot);
        this.index({ id: ghostId(snapshot), snapshot });
      } catch {
        this.skipped++;
      }
    }
    return this.byId.size;
  }

  private index(e: PoolEntry): void {
    if (this.byId.has(e.id)) return;
    this.byId.set(e.id, e);
    const k = `${e.snapshot.rules}|${e.snapshot.day}`;
    const b = this.buckets.get(k);
    if (b) b.push(e);
    else this.buckets.set(k, [e]);
  }

  /** Append a (validated) snapshot. Idempotent: resubmitting the same snapshot keeps its id. */
  add(snapshot: GhostSnapshot, at = Date.now()): { id: string; created: boolean } {
    const s = checkSnapshot(snapshot);
    const id = ghostId(s);
    if (this.byId.has(id)) return { id, created: false };
    appendFileSync(this.file, JSON.stringify({ id, at, snapshot: s }) + "\n"); // durable first, then indexed
    this.index({ id, snapshot: s });
    return { id, created: true };
  }

  /** Every stored ghost for one rules version and day (the only ones that can ever match). */
  bucket(rules: string, day: number): readonly PoolEntry[] {
    return this.buckets.get(`${rules}|${day}`) ?? [];
  }

  get size(): number {
    return this.byId.size;
  }
}
