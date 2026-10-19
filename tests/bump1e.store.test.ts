// BUMP-1E E.3 (REVIEW-STAGE0911 section E): JsonlStore.replacePool keeps a pool line it cannot decode instead of dropping it. A build rolled back
// to this one meets pool lines written by a newer build (a format or rules it does not know); the reseed must not erase them.
import { afterAll, describe, expect, it } from "vitest";
import { appendFileSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { JsonlStore } from "../server/store";

const dirs: string[] = [];
afterAll(() => {
  for (const d of dirs) rmSync(d, { recursive: true, force: true });
});

describe("JsonlStore.replacePool and a pool line it cannot decode (BUMP-1E E.3)", () => {
  it("keeps every undecodable line, byte for byte, and reports nothing removed", async () => {
    const dir = mkdtempSync(join(tmpdir(), "bb-store-"));
    dirs.push(dir);
    const poolFile = join(dir, "pool.jsonl");
    const lines = [
      "not a ghost",
      JSON.stringify({ id: "g0123456789abcd", at: 1, snapshot: { v: 99, rules: "bb-9.9.9", note: "a newer build's snapshot format" } }),
      "{\"id\":\"gfeedfeedfeedfe\",\"at\":2,\"snapshot\":", // cut off mid-write
    ];
    writeFileSync(poolFile, lines.join("\n") + "\n");
    const store = new JsonlStore(dir);
    store.load();
    expect(store.skipped).toBe(3); // the load skips all three (it cannot decode them)
    const r = await store.replacePool("bb-0.12.0", []);
    expect(r).toEqual({ written: 0, unchanged: 0, removed: 0 });
    expect(readFileSync(poolFile, "utf8")).toBe(lines.join("\n") + "\n");
    // and a second, later line a rewrite does append to is still kept beside them
    appendFileSync(poolFile, "more junk\n");
    const again = new JsonlStore(dir);
    again.load();
    expect(await again.replacePool("bb-0.12.0", [])).toEqual({ written: 0, unchanged: 0, removed: 0 });
    expect(readFileSync(poolFile, "utf8")).toBe([...lines, "more junk"].join("\n") + "\n");
  });
});
