// Minimal ambient declarations for tools/smoke.ts (no @types/node in this repo; see
// server/node.d.ts for the rest of the Node surface). Declarations of the same module merge.

declare module "node:child_process" {
  interface Readable {
    on(event: "data", cb: (chunk: Uint8Array) => void): void;
  }
  export interface ChildProcess {
    stdout: Readable | null;
    stderr: Readable | null;
    on(event: "exit", cb: (code: number | null, signal: string | null) => void): this;
    on(event: "error", cb: (err: Error) => void): this;
    kill(signal?: string): boolean;
  }
  export function spawn(command: string, args: readonly string[], options?: { env?: Record<string, string | undefined>; cwd?: string }): ChildProcess;
}

declare module "node:fs" {
  export function mkdtempSync(prefix: string): string;
  export function rmSync(path: string, opts?: { recursive?: boolean; force?: boolean }): void;
}

declare module "node:os" {
  export function tmpdir(): string;
}
