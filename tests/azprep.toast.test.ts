// AZ-PREP (REQ-BFG-077, REQ-BFG-078; BRIEF-AZPREP 2 (d); REVIEW-NPC1 N1): no merge toast over a result card. A screen with its
// result card up (the battle screen, from the fight's end until the card closes: Screen.holdsMerges) holds the queued merge
// toasts (save.ts nextFuseToast's `held`), untouched; the next screen shows them, in order. Every NPC win can drop a part
// (NPC_DAY), and a drop that merges queued "MERGED: ..." over the card's "+4 GOLD" line; a 0.9.7 Hard pick's merge did too.
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { newRun } from "../src/game/run";
import { nextFuseToast } from "../src/game/save";

const ROOT = new URL("..", import.meta.url).pathname;

describe("AZ-PREP (d): no merge toast over a result card (REVIEW-NPC1 N1)", () => {
  it("held, the queued toasts wait untouched; the next screen takes them in order; the battle screen holds them from the fight's end until its card closes", () => {
    const run = newRun("furnace", 5, "azprep-toast");
    const queued = ["MERGED: SCRAP CANNON ★2", "MERGED · 1 BELT REMOVED"];
    run.fuseFx = [...queued];
    expect(nextFuseToast(run, false, true)).toBeUndefined();
    expect(run.fuseFx).toEqual(queued);
    expect([nextFuseToast(run, false), nextFuseToast(run, false, false), nextFuseToast(run, false)]).toEqual([...queued, undefined]);
    // the battle screen's flag (its outro and its result card) and the game loop's read of it
    const battle = readFileSync(join(ROOT, "src/screens/battle.ts"), "utf8"), game = readFileSync(join(ROOT, "src/game/game.ts"), "utf8");
    expect(battle).toContain('get holdsMerges(): boolean {\n    return this.phase === "outro" || this.phase === "result";\n  }');
    expect(game).toContain("nextFuseToast(this.run, !!this.screen.mergeNotice, !!this.screen.holdsMerges)");
  });
});
