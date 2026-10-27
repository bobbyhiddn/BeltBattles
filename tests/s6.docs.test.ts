// S6 (REQ-BFG-119) Goal 6: docs/ASYNC.md's "## Privacy" section is true to the code (the chosen name, the run history, the phone's key copy), points to the
// policy, and says nothing the policy page contradicts; deploy/RUNBOOK.md has the two post-deploy check lines (not run here: they would touch production).
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { NAME_MAX, NAME_MIN } from "../src/net/names";
import { POOL_MAX } from "../src/game/ghosts";
import { HISTORY_LOCAL_MAX, HISTORY_PLAYER_MAX } from "../src/net/historyWire";
import { MAX_PROFILE_BYTES } from "../src/net/profileWire";
import { CODE_TTL_MS } from "../server/links";
import { PRIVACY_URL } from "../src/net/privacyLink";

const ROOT = new URL("..", import.meta.url).pathname;
const read = (rel: string): string => readFileSync(join(ROOT, rel), "utf8");

const doc = read("docs/ASYNC.md");
const start = doc.indexOf("\n## Privacy\n");
const privacy = doc.slice(start + 1, doc.indexOf("\n## Hosting options", start)).replace(/\s+/g, " ");

describe("S6 Goal 6: docs/ASYNC.md '## Privacy'", () => {
  it("is one section, between '## Identity and signed uploads' and '## Hosting options', and points to the policy", () => {
    expect(start).toBeGreaterThan(doc.indexOf("\n## Identity and signed uploads"));
    expect(privacy.startsWith("## Privacy The statement for players is the privacy policy that the game server itself serves, at https://beltbattles.fly.dev/privacy")).toBe(true);
    expect(privacy).toContain(PRIVACY_URL);
    expect(privacy).toContain("server/pages/privacy.html");
    expect(privacy).toContain("tests/s6.pages.test.ts");
    expect(privacy).toContain("node scripts/s6/contact.mjs");
    expect(doc.match(/^## Privacy$/gm)).toHaveLength(1);
  });

  it("the name: snapshots DO carry one (snapshot.name, PACKS M2), 2 to 10 characters, shown to other players as NAME#TAG; the old 'hold no names' is gone", () => {
    expect(privacy).not.toContain("Snapshots hold no names, no accounts and no IP addresses."); // the old sentence; the new text names it only as the old one
    expect(privacy).toContain("(This section used to say that snapshots hold no names; that was true before bb-0.8.6.)");
    expect(privacy).toContain("A ghost carries a name");
    expect(privacy).toContain("a snapshot holds `name`");
    expect(privacy).toContain(`(${NAME_MIN} to ${NAME_MAX} of A-Z, 0-9, space, hyphen)`);
    expect(privacy).toContain("NAME#TAG");
    expect(privacy).toContain("except the run seed (`servedSnapshot`)");
    // the code agrees
    expect(read("src/net/snapshot.ts")).toMatch(/\n\s+name\?: string;/);
    expect(read("src/game/day.ts")).toContain("...(name ? { name } : {})");
    expect(read("server/app.ts")).toContain("const named = nameProblem(snap.name);");
    expect(read("server/app.ts")).toMatch(/export function servedSnapshot[\s\S]*const \{ seed: _private, \.\.\.pub \} = s;/);
  });

  it("the phone's key copy: Capacitor Preferences (UserDefaults, SharedPreferences), not the Keychain, and backups may carry it", () => {
    expect(privacy).toContain("Capacitor Preferences (UserDefaults on iOS, SharedPreferences on Android: private to the app, not the Keychain or the Keystore");
    expect(privacy).toContain("Device backups may carry that copy: iOS backs up UserDefaults, and the Android app allows Auto Backup (`android:allowBackup=\"true\"`)");
    expect(privacy).toContain("**On the web** the private key is non-extractable");
    expect(read("android/app/src/main/AndroidManifest.xml")).toContain('android:allowBackup="true"');
    expect(read("src/net/identityMirror.ts")).toContain("NOT the\n// Keychain or the Keystore");
  });

  it("the run history paragraph (IDENT-2) is kept: sent only after SHOW MY CODE or ENTER A CODE, removed by DELETE MY ONLINE DATA", () => {
    expect(privacy).toContain("IDENT-2 (run history, REQ-BFG-122 clause 4): a device that has shown or entered a link code (or linked its Steam account) also sends its finished runs");
    expect(privacy).toContain("A device that has never shown or entered a code sends none of it");
    expect(privacy).toContain("`DELETE /v1/player` removes it with the rest");
  });

  it("retention and deletion: no expiry in the code; the bounds are the code's constants; the deletion removes what links.ts deletePlayer removes", () => {
    expect(privacy).toContain("Nothing on the server expires because time has passed");
    expect(privacy).toContain(`a link code (${CODE_TTL_MS / 60_000} minutes)`);
    expect(privacy).toContain(`the newest ${HISTORY_PLAYER_MAX} entries`);
    expect(privacy).toContain(`(${HISTORY_LOCAL_MAX} runs, ${POOL_MAX} ghosts)`);
    expect(privacy).toContain(`at most ${MAX_PROFILE_BYTES / 1024} KB`);
    expect(privacy).toContain("`ghost-admin purge-tombstoned --apply` removes the stored ghosts (run it by hand: nothing schedules it");
    const links = read("server/links.ts");
    expect(links).toContain("removals.push(() => this.dropHistory(ids));");
    expect(links).toContain("if (rec?.code) removals.push(() => this.store.delete(codeKey(rec.code!)));");
    expect(links).toContain("await this.store.put(tombKey(player), JSON.stringify({ at: prior?.at ?? this.now(), ids }));");
    // no scheduled job and no expiry anywhere in server/ or the deploy kit
    expect(read("fly.toml")).not.toMatch(/\[\[?(cron|schedule)|schedule\s*=|purge/i);
    expect(read("Dockerfile")).not.toMatch(/cron|purge/i);
  });

  it("where it runs: Fly.io iad and Tigris, as fly.toml says", () => {
    expect(privacy).toContain("Fly.io, region `iad` (Ashburn, Virginia, US), with the objects in Tigris");
    expect(read("fly.toml")).toContain('primary_region = "iad"');
    expect(read("fly.toml")).toContain('BB_GHOST_STORE = "tigris"');
    expect(read("deploy/RUNBOOK.md")).toContain("fly storage create -a beltbattles -n beltbattles-ghosts --yes"); // no location option: Tigris' default (global)
  });

  it("the other sections of the document are not touched by this job: the tombstone paragraph and the snapshot format are as IDENT-2 left them", () => {
    expect(doc).toContain("**The tombstone set**");
    expect(doc).toContain("## Snapshot format (v2)");
    expect(doc).toContain("`{ v: 2, rules, hero, day, wins, lives, build, runId, playerId, createdAt }` (`SNAPSHOT_VERSION` = 2)");
  });
});

describe("S6 Goal 6: deploy/RUNBOOK.md has the two post-deploy check lines", () => {
  const rb = read("deploy/RUNBOOK.md");
  it("a curl for /privacy and one for /support, in section 5's live checks, each saying 404 until the placeholders are filled and 200 after", () => {
    const sec5 = rb.slice(rb.indexOf("## 5. Live checks (one call)"), rb.indexOf("## 6. Cold start"));
    const l1 = "S6 (REQ-BFG-119), the privacy page: `curl -sS -o /dev/null -w '%{http_code}\\n' https://beltbattles.fly.dev/privacy` prints `404` while the page still holds its placeholders (`node scripts/s6/contact.mjs --check` lists them) and `200` after `node scripts/s6/contact.mjs --email <address> --name <text>`, a commit and a deploy.";
    const l2 = "S6, the support page: `curl -sS -o /dev/null -w '%{http_code}\\n' https://beltbattles.fly.dev/support` prints `404` until then and `200` after.";
    expect(sec5).toContain(`\n${l1}\n${l2}\n`);
    expect(rb.split("\n").filter((l) => l.includes("fly.dev/privacy") || l.includes("fly.dev/support"))).toEqual([l1, l2]);
  });
});
