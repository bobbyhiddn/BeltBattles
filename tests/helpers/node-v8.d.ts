// CACHE-1: the tests' type shims (server/node.d.ts, tools/node-smoke.d.ts) declare no node:v8; tests/helpers/poolCache.ts
// stores the pools with its structured-clone serializer (it keeps `undefined`, NaN, -0, Map, Set, Date, shared references and key order).
declare module "node:v8" {
  export function serialize(value: unknown): Uint8Array;
  export function deserialize(buffer: Uint8Array): unknown;
}
