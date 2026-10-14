// HULL-ON (REQ-BFG-097; cap's ruling 12a42239093fb6ec): GUARD ships on (the flip), so its content patch runs at load.
// guard.ts imports only runes.ts's types, and runes.ts hands its RUNES over as the last statement of its load
// (guardRunes), so the guarded runes take the switch's state whatever loads first. Each case runs in a fresh module graph
// (vi.resetModules, then dynamic imports): runes.ts first (it reaches guard.ts through deck.ts), or guard.ts first.
// Before the fix, GUARD = true crashed ~30 test files at load ("Cannot read properties of undefined (reading
// 'rivet_hoard')"): RETUNE-1's deferral caught only the TDZ ReferenceError, and Vitest's module runner reads undefined.
import { describe, expect, it, vi } from "vitest";

/** The guarded runes' amounts with GUARD on (guard.ts GUARD_RUNES) and off (runes.ts's own: 60 / 80 / 10). */
const ON = { rivet_hoard: 180, last_wall: 140, seam_rivets: 30 };
const OFF = { rivet_hoard: 60, last_wall: 80, seam_rivets: 10 };

type Runes = typeof import("../src/sim/runes");
type Guard = typeof import("../src/sim/guard");
const amounts = (runes: Runes): Record<string, number> => Object.fromEntries(Object.keys(ON).map((id) => [id, runes.RUNES[id].amount.n]));

function check(runes: Runes, guard: Guard): void {
  expect(guard.GUARD).toBe(true);
  expect(guard.guardRules()).toBe(true);
  expect(amounts(runes)).toEqual(ON);
  expect(guard.withGuard(() => amounts(runes), false)).toEqual(OFF);
  expect(amounts(runes)).toEqual(ON);
}

describe("HULL-ON: GUARD's runes take the switch at load, whatever module loads first (ruling 12a42239093fb6ec)", () => {
  it("runes.ts first, in a fresh module graph", async () => {
    vi.resetModules();
    const runes = await import("../src/sim/runes");
    const guard = await import("../src/sim/guard");
    check(runes, guard);
  });

  it("guard.ts first, in a fresh module graph", async () => {
    vi.resetModules();
    const guard = await import("../src/sim/guard");
    const runes = await import("../src/sim/runes");
    check(runes, guard);
  });
});
