// Minimal ambient Node declarations for server/ and tools/. The repo ships no
// @types/node and this job may not add dependencies, so this covers exactly the Node
// surface those files use; `npm run typecheck:server` type-checks them against it.

declare module "node:http" {
  export interface IncomingHttpHeaders {
    [name: string]: string | string[] | undefined;
  }
  export interface IncomingMessage {
    method?: string;
    url?: string;
    headers: IncomingHttpHeaders;
    socket: { remoteAddress?: string; destroy(): void };
    on(event: "data", cb: (chunk: Uint8Array) => void): this;
    on(event: "end" | "close", cb: () => void): this;
    on(event: "error", cb: (err: Error) => void): this;
    resume(): this;
  }
  export interface ServerResponse {
    statusCode: number;
    headersSent: boolean;
    setHeader(name: string, value: string | number): this;
    end(body?: string | Uint8Array): this;
  }
  export interface AddressInfo {
    address: string;
    family: string;
    port: number;
  }
  export interface Server {
    requestTimeout: number;
    headersTimeout: number;
    listen(port: number, host: string, cb?: () => void): this;
    close(cb?: (err?: Error) => void): this;
    closeAllConnections(): void;
    address(): AddressInfo | string | null;
    once(event: "error", cb: (err: Error) => void): this;
  }
  export function createServer(handler: (req: IncomingMessage, res: ServerResponse) => void): Server;
}

declare module "node:fs" {
  export function mkdirSync(path: string, opts?: { recursive?: boolean }): string | undefined;
  export function readFileSync(path: string, encoding: "utf8"): string;
  export function readFileSync(path: string): Uint8Array;
  export function writeFileSync(path: string, data: string | Uint8Array): void;
  export function appendFileSync(path: string, data: string): void;
  export function existsSync(path: string): boolean;
  export function renameSync(from: string, to: string): void;
  export function unlinkSync(path: string): void; // 0.7.0 R1: ghostAdmin.ts
}

declare module "node:crypto" {
  interface Digest {
    update(data: string | Uint8Array): this;
    digest(): Uint8Array;
    digest(encoding: "hex" | "base64"): string;
  }
  export function createHash(algorithm: string): Digest;
  export function createHmac(algorithm: string, key: string | Uint8Array): Digest;
}

declare module "node:path" {
  export function join(...parts: string[]): string;
  export function resolve(...parts: string[]): string;
  export function dirname(path: string): string;
}

// S2 (server/main.ts: where the deck-check worker's script sits, beside the bundle)
declare module "node:url" {
  export function fileURLToPath(url: string | URL): string;
}

// S2 (server/validateWorker.ts, server/validator.ts, server/app.ts /v1/health): the heap limit V8 gives this thread
declare module "node:v8" {
  export function getHeapStatistics(): { heap_size_limit: number; used_heap_size: number; total_heap_size: number };
}

declare const process: {
  argv: string[];
  env: Record<string, string | undefined>;
  execPath: string;
  version: string;
  exitCode: number | undefined;
  exit(code?: number): never;
  on(event: "SIGINT" | "SIGTERM", cb: () => void): void;
  memoryUsage(): { rss: number; heapTotal: number; heapUsed: number; external: number; arrayBuffers: number }; // S2: /v1/health's memory
};

// S4 (server/ops.ts, server/opsS3.ts, server/alerts.ts and tests/s4.*): the promise-based fs the backup tool uses, and the machine's memory. Appended only.
declare module "node:fs/promises" {
  export interface Stats {
    size: number;
    mode: number;
    isFile(): boolean;
    isDirectory(): boolean;
    isSymbolicLink(): boolean;
  }
  export interface Dirent {
    name: string;
    isFile(): boolean;
    isDirectory(): boolean;
    isSymbolicLink(): boolean;
  }
  export function mkdir(path: string, opts?: { recursive?: boolean; mode?: number }): Promise<string | undefined>;
  export function readFile(path: string): Promise<Uint8Array<ArrayBuffer>>;
  export function readFile(path: string, encoding: "utf8"): Promise<string>;
  export function writeFile(path: string, data: string | Uint8Array, opts?: { mode?: number; flag?: string }): Promise<void>;
  export function rename(from: string, to: string): Promise<void>;
  export function readdir(path: string, opts: { withFileTypes: true }): Promise<Dirent[]>;
  export function readdir(path: string): Promise<string[]>;
  export function lstat(path: string): Promise<Stats>;
  export function stat(path: string): Promise<Stats>;
  export function rm(path: string, opts?: { recursive?: boolean; force?: boolean }): Promise<void>;
  export function mkdtemp(prefix: string): Promise<string>;
}

declare module "node:os" {
  export function totalmem(): number; // alerts.ts: the machine's memory (a Fly VM reports its own size); tools/node-smoke.d.ts has tmpdir
}
