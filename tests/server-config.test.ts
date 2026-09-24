import { describe, expect, it } from "vitest";
import { ConfigError, openStore, readConfig, TIGRIS_ENV } from "../server/config";

const TIGRIS = {
  BB_GHOST_STORE: "tigris",
  AWS_ACCESS_KEY_ID: "tid_config_test_key_id",
  AWS_SECRET_ACCESS_KEY: "tsec_config_test_secret_value",
  AWS_ENDPOINT_URL_S3: "https://fly.storage.tigris.dev",
  AWS_REGION: "auto",
  BUCKET_NAME: "beltbattles-ghosts",
};

function configError(argv: string[], env: Record<string, string>): string {
  try {
    readConfig(argv, env);
  } catch (e) {
    expect(e).toBeInstanceOf(ConfigError);
    return (e as Error).message;
  }
  throw new Error("expected a ConfigError");
}

describe("server config", () => {
  it("defaults: JSON-lines store in ./ghost-data, 127.0.0.1:7790, the local Shore origin, 120/min", () => {
    const c = readConfig([], {});
    expect(c.store.kind).toBe("jsonl");
    expect(c.store.kind === "jsonl" && c.store.dataDir.endsWith("ghost-data")).toBe(true);
    expect(c).toMatchObject({ host: "127.0.0.1", port: 7790, origins: ["http://127.0.0.1:7778"], rate: 120 });
    expect(readConfig(["--port", "8080", "--host", "0.0.0.0"], {})).toMatchObject({ host: "0.0.0.0", port: 8080 });
    expect(readConfig([], { BB_GHOST_HOST: "0.0.0.0", BB_GHOST_PORT: "8080" })).toMatchObject({ host: "0.0.0.0", port: 8080 });
  });

  it("uploads are open unless BB_GHOST_UPLOADS=closed", () => {
    expect(readConfig([], {}).uploads).toBe("open");
    expect(readConfig([], { BB_GHOST_UPLOADS: "closed" }).uploads).toBe("closed");
    expect(configError([], { BB_GHOST_UPLOADS: "shut" })).toMatch(/BB_GHOST_UPLOADS must be one of open, closed/);
  });

  it("serves no page unless BB_GHOST_STATIC (or --static) names a directory", () => {
    expect(readConfig([], {}).staticDir).toBeUndefined();
    expect(readConfig([], { BB_GHOST_STATIC: "/app/public" }).staticDir).toBe("/app/public");
    expect(readConfig(["--static", "/srv/page"], { BB_GHOST_STATIC: "/app/public" }).staticDir).toBe("/srv/page");
  });

  it("proxy headers are ignored unless BB_GHOST_TRUST_PROXY=fly", () => {
    expect(readConfig([], {}).trustProxy).toBe("none");
    expect(readConfig([], { BB_GHOST_TRUST_PROXY: "fly" }).trustProxy).toBe("fly");
    expect(configError([], { BB_GHOST_TRUST_PROXY: "yes" })).toMatch(/BB_GHOST_TRUST_PROXY must be one of fly, none/);
  });

  it("BB_GHOST_STORE=tigris reads the five variables `fly storage create` sets; virtual-hosted unless told otherwise", () => {
    const c = readConfig([], TIGRIS);
    expect(c.store).toMatchObject({
      kind: "tigris", ttlMs: 60_000,
      s3: { endpoint: "https://fly.storage.tigris.dev", region: "auto", bucket: "beltbattles-ghosts", addressing: "virtual" },
    });
    const p = readConfig([], { ...TIGRIS, BB_GHOST_S3_ADDRESSING: "path", BB_GHOST_CACHE_TTL_S: "5" });
    expect(p.store).toMatchObject({ ttlMs: 5000, s3: { addressing: "path" } });
  });

  it.each(TIGRIS_ENV)("a missing %s stops the start with a message naming it, never a value", (name) => {
    const env: Record<string, string> = { ...TIGRIS };
    delete env[name];
    const msg = configError([], env);
    expect(msg).toContain(name);
    for (const v of Object.values(TIGRIS)) if (v !== "tigris") expect(msg).not.toContain(v);
  });

  it("names every missing variable at once, and refuses bad values without echoing secrets", () => {
    const msg = configError([], { BB_GHOST_STORE: "tigris", AWS_SECRET_ACCESS_KEY: "tsec_should_not_appear" });
    for (const name of ["AWS_ACCESS_KEY_ID", "AWS_ENDPOINT_URL_S3", "AWS_REGION", "BUCKET_NAME"]) expect(msg).toContain(name);
    expect(msg).not.toContain("AWS_SECRET_ACCESS_KEY");
    expect(msg).not.toContain("tsec_should_not_appear");
    expect(configError([], { ...TIGRIS, AWS_ENDPOINT_URL_S3: "fly.storage.tigris.dev/x" })).toMatch(/AWS_ENDPOINT_URL_S3 must be a bare http\(s\) origin/);
    expect(configError([], { ...TIGRIS, BUCKET_NAME: "Bad_Name" })).toMatch(/BUCKET_NAME/);
    expect(configError([], { BB_GHOST_STORE: "s3" })).toMatch(/BB_GHOST_STORE must be one of jsonl, tigris/);
    expect(configError([], { ...TIGRIS, BB_GHOST_S3_ADDRESSING: "vhost" })).toMatch(/BB_GHOST_S3_ADDRESSING/);
    expect(configError(["--port", "99999"], {})).toMatch(/port/);
  });

  it("opening the tigris store does no I/O", () => {
    const logs: string[] = [];
    const store = openStore(readConfig([], TIGRIS).store, (l) => logs.push(l));
    expect(store.kind).toBe("tigris");
    expect(store.size).toBe(0);
    expect(logs.join("\n")).toMatch(/bucket beltbattles-ghosts at fly\.storage\.tigris\.dev \(virtual-hosted\)/);
    expect(logs.join("\n")).not.toMatch(/tsec_|tid_/);
  });
});
