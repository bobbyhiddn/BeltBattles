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
    socket: { remoteAddress?: string };
    on(event: "data", cb: (chunk: Uint8Array) => void): this;
    on(event: "end" | "close", cb: () => void): this;
    on(event: "error", cb: (err: Error) => void): this;
    resume(): this;
  }
  export interface ServerResponse {
    statusCode: number;
    headersSent: boolean;
    setHeader(name: string, value: string | number): this;
    end(body?: string): this;
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
  export function writeFileSync(path: string, data: string): void;
  export function appendFileSync(path: string, data: string): void;
  export function existsSync(path: string): boolean;
}

declare module "node:path" {
  export function join(...parts: string[]): string;
  export function resolve(...parts: string[]): string;
  export function dirname(path: string): string;
}

declare const process: {
  argv: string[];
  env: Record<string, string | undefined>;
  exit(code?: number): never;
  on(event: "SIGINT" | "SIGTERM", cb: () => void): void;
};
