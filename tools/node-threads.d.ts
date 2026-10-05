// Minimal ambient declarations for tools/balance.ts (no @types/node in this repo; see
// server/node.d.ts for the rest of the Node surface the tools use).

declare module "node:worker_threads" {
  export const isMainThread: boolean;
  export const parentPort: {
    on(event: "message", cb: (msg: any) => void): void;
    postMessage(msg: unknown): void;
  } | null;
  export class Worker {
    // FLIP-X2: the options argument (argv) that TUNE-X's sustainBench passes (cherry-picked at step 3b, 16f2486)
    constructor(filename: string | URL, options?: { argv?: readonly unknown[] });
    on(event: "message", cb: (msg: any) => void): this;
    on(event: "error", cb: (err: Error) => void): this;
    removeAllListeners(): this;
    postMessage(msg: unknown): void;
    terminate(): Promise<number>;
  }
}

declare module "node:os" {
  export function availableParallelism(): number;
}
