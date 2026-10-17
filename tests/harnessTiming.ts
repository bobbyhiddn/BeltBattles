// CPU time stays stable when other jobs contend for the host. Vitest's longer wall-time
// timeout remains a backstop for a stalled test that never reaches its assertion.
export const HARNESS_HANG_TIMEOUT_MS = 600_000;
export const HARNESS_CPU_BUDGET_MS = 240_000; // STAGE-0911 (RULING-BUMP-R3 Q2, pre-approved, test-only): 240 s of CPU, was 120 s (harness.v2's end-to-end test: 54 s alone, 134 s saturated at BUMP-1D run 4)

export function cpuMsSince(start: ReturnType<typeof process.cpuUsage>): number {
  const used = process.cpuUsage(start);
  return (used.user + used.system) / 1_000;
}
