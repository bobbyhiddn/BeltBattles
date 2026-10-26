// Minimal ambient declarations for tools/balance.ts (no @types/node in this repo; see
// server/node.d.ts for the rest of the Node surface the tools use).

declare module "node:worker_threads" {
  export const isMainThread: boolean;
  export const parentPort: {
    on(event: "message", cb: (msg: any) => void): void;
    postMessage(msg: unknown): void;
  } | null;
  // S2 (server/validator.ts, server/validateWorker.ts): the data the deck-check worker is started with
  export const workerData: any;
  // S2: Worker's resourceLimits (Node 20 and 22; a process-wide --max-old-space-size overrides maxOldGenerationSizeMb)
  export interface ResourceLimits {
    maxOldGenerationSizeMb?: number;
    maxYoungGenerationSizeMb?: number;
    codeRangeSizeMb?: number;
    stackSizeMb?: number;
  }
  export class Worker {
    // FLIP-X2: the options argument (argv) that TUNE-X's sustainBench passes (cherry-picked at step 3b, 16f2486)
    // S2: workerData and resourceLimits (the deck-check worker's heap limit)
    constructor(filename: string | URL, options?: { argv?: readonly unknown[]; workerData?: unknown; resourceLimits?: ResourceLimits });
    on(event: "message", cb: (msg: any) => void): this;
    on(event: "error", cb: (err: Error & { code?: string }) => void): this;
    on(event: "exit", cb: (exitCode: number) => void): this; // S2
    removeAllListeners(): this;
    postMessage(msg: unknown): void;
    terminate(): Promise<number>;
    unref(): void; // S2: an idle deck-check worker never keeps the process alive
    readonly threadId: number; // S2
  }
}

declare module "node:os" {
  export function availableParallelism(): number;
}
