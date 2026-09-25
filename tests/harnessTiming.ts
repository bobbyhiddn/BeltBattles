// CPU time stays stable when other jobs contend for the host. Vitest's longer wall-time
// timeout remains a backstop for a stalled test that never reaches its assertion.
export const HARNESS_HANG_TIMEOUT_MS = 600_000;
export const HARNESS_CPU_BUDGET_MS = 120_000;

export function cpuMsSince(start: ReturnType<typeof process.cpuUsage>): number {
  const used = process.cpuUsage(start);
  return (used.user + used.system) / 1_000;
}
