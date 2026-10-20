// BUMP-1F P2 (F1 and Q5; BRIEF-BUMP1F): THE SUITE GUARD, a vitest setupFile (test config only: vite.config.ts test.setupFiles).
// A test that turns a switch off and back on in the wrong order can leave ITEMS permuted (the key order every seeded draw reads) or hold the wrong
// def (QUENCH TANK over KINDLING): the next test in that worker is then judged in a world the ship never has, and fails somewhere else, or passes
// for the wrong reason (BUMP-1E found three such nests in run 5, REPORT 8.1 (d)). This guard snapshots ITEMS before every test and fails the test
// that leaves Object.keys(ITEMS) or ITEMS.quench changed, naming what moved. It puts ITEMS back first, so the next test starts clean and only the
// guilty one is red. A test that WANTS another world sets the switch in a beforeEach and puts it back in an afterEach (the guard's hooks wrap
// the file's: its beforeEach runs first and its afterEach last), or runs inside withX(fn, off) synchronously, or inside keepItems (src/sim/itemsKeep.ts).
import { afterEach, beforeEach } from "vitest";
import { ITEMS } from "../../src/sim/content";
import { putItemsBack, snapshotItems, type ItemsSnapshot } from "../../src/sim/itemsKeep";

let was: ItemsSnapshot | undefined;
let quench: unknown;

beforeEach(() => {
  was = snapshotItems();
  quench = ITEMS.quench;
});

afterEach(() => {
  if (!was) return;
  const now = Object.keys(ITEMS);
  const keys = was.keys;
  const moved: string[] = [];
  if (now.length !== keys.length) moved.push(`${keys.length} keys became ${now.length}`);
  else for (let i = 0; i < now.length; i++) if (now[i] !== keys[i]) { moved.push(`key ${i}: ${keys[i]} became ${now[i]}`); break; }
  const quenchMoved = ITEMS.quench !== quench;
  if (quenchMoved) moved.push(`ITEMS.quench is another def (${(ITEMS.quench as { name?: string } | undefined)?.name ?? "none"}, was ${(quench as { name?: string } | undefined)?.name ?? "none"})`);
  if (!moved.length) return;
  putItemsBack(was); // the next test starts from the ITEMS this one found
  throw new Error(`this test left ITEMS changed (${moved.join("; ")}): turn the switches back in the reverse order of turning them off (BUMP-1F F1; src/sim/itemsKeep.ts keepItems)`);
});
