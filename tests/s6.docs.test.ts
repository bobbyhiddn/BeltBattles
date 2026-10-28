// S6 (REQ-BFG-119) Goal 6: docs/ASYNC.md's "## Privacy" section is true to the code (the chosen name, the run history, the phone's key copy), points to the
// policy, and says nothing the policy page contradicts; deploy/RUNBOOK.md has the two post-deploy check lines (not run here: they would touch production).
// S6D (REQ-BFG-119) Goals 4 and 6: the same documents say what the code now does - the retention periods are server/retention.ts's constants, the five new
// ghost-admin commands are COMMANDS and every line the RUNBOOK documents for them is a command line the tool accepts and prints what the RUNBOOK says, the weekly
// machine's create line (documented only, never run) keeps its traps out, each Fly.io docs page it rests on is cited with the date read - and the stores' age answers
// in store/listing/ follow from the code. Nothing here calls the network or touches production: the tool runs on a temp JSON-lines directory.
import { describe, expect, it } from "vitest";
import { appendFileSync, mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { NAME_MAX, NAME_MIN } from "../src/net/names";
import { POOL_MAX } from "../src/game/ghosts";
import { HISTORY_LOCAL_MAX, HISTORY_PLAYER_MAX } from "../src/net/historyWire";
import { MAX_PROFILE_BYTES } from "../src/net/profileWire";
import { CODE_TTL_MS } from "../server/links";
import { PRIVACY_URL } from "../src/net/privacyLink";
import { PLAYER_CODE_BITS, PLAYER_CODE_SYMBOLS, playerCode } from "../src/net/playerCode";
import { COMMANDS, parseArgs, runAdmin } from "../server/ghostAdmin";
import { CLEANUP_PROMISE_DAYS, CLOCK_GUARD_MS, GHOST_RETENTION_DAYS, IDLE_RETENTION_DAYS, IDLE_RETENTION_MONTHS, WEEKLY_CLEANUP_DAYS } from "../server/retention";

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

  it("retention and deletion (S6D): the periods are server/retention.ts's constants; the weekly clean-up deletes as the player's own delete does; the bounds that stay are the code's", () => {
    // S6D replaced S6's 'Nothing on the server expires because time has passed' and 'run it by hand: nothing schedules it' with the operator's decisions
    expect(privacy).not.toContain("Nothing on the server expires because time has passed");
    expect(privacy).not.toContain("nothing schedules it");
    expect(privacy).toContain("made the operator's decisions of 2026-10-27/28 code");
    expect(privacy).toContain("The periods are the constants of `server/retention.ts`, and `tests/s6.pages.test.ts` ties the policy's numbers to them.");
    expect(privacy).toContain(`A ghost (an upload) is kept ${GHOST_RETENTION_DAYS} days after the server received it`);
    expect(privacy).toContain(`or for ${IDLE_RETENTION_MONTHS} months (counted as ${IDLE_RETENTION_DAYS} days) without a server-side sign of play`);
    expect(privacy).toContain("then the weekly clean-up deletes them exactly as the player's own delete does (`Links.deletePlayer`)");
    expect(privacy).toContain("the next online game starts a new player while the progress on the device stays");
    expect(privacy).toContain("The deletion record (the tombstone) and the request log are not expired by this code.");
    expect(privacy).toContain("The clean-up is `ghost-admin weekly --apply` (`prune-idle`, then `purge-tombstoned`, then `prune-ghosts`)");
    expect(privacy).toContain(`within ${CLEANUP_PROMISE_DAYS} days (twice the schedule)`);
    expect(CLEANUP_PROMISE_DAYS).toBe(2 * WEEKLY_CLEANUP_DAYS); // a weekly run can be late or fail: the promise is twice the schedule
    expect(privacy).toContain("the next weekly run removes the stored ghosts");
    // the bounds that did not change
    expect(privacy).toContain(`a link code (${CODE_TTL_MS / 60_000} minutes)`);
    expect(privacy).toContain(`the newest ${HISTORY_PLAYER_MAX} entries`);
    expect(privacy).toContain(`(${HISTORY_LOCAL_MAX} runs, ${POOL_MAX} ghosts)`);
    expect(privacy).toContain(`at most ${MAX_PROFILE_BYTES / 1024} KB`);
    // the delete the clean-up and the admin tool share is the one DELETE /v1/player makes
    const links = read("server/links.ts");
    expect(links).toContain("removals.push(() => this.dropHistory(ids));");
    expect(links).toContain("if (rec?.code) removals.push(() => this.store.delete(codeKey(rec.code!)));");
    expect(links).toContain("await this.store.put(tombKey(player), JSON.stringify({ at: prior?.at ?? this.now(), ids }));");
    expect(links).toContain("const ids = tombstoneIds(player, signer, rec, prior);");
    expect(read("server/pruneAdmin.ts")).toContain("await links.deletePlayer(p.player);");
    // the weekly machine is NOT created by the app's own files: no scheduled job in fly.toml or the Dockerfile (deploy/RUNBOOK.md documents it)
    expect(read("fly.toml")).not.toMatch(/\[\[?(cron|schedule)|schedule\s*=|purge|ghost-admin/i);
    expect(read("Dockerfile")).not.toMatch(/cron|purge|ghost-admin/i);
  });

  it("MY PLAYER ID (S6D): the doc says what src/net/playerCode.ts makes - 16 capitals and digits, 80 bits, four groups - and the row is in the OPTIONS card's code", () => {
    expect(PLAYER_CODE_BITS).toBe(80);
    expect(PLAYER_CODE_SYMBOLS).toBe(16);
    expect(playerCode("AbCdEfGhIjKlMnOpQrStUvWxYz0123456789-_ABCDE")).toMatch(/^([0-9A-HJKMNP-TV-Z]{4}-){3}[0-9A-HJKMNP-TV-Z]{4}$/); // no I, L, O or U
    expect(privacy).toContain("**MY PLAYER ID.** OPTIONS, MY PLAYER ID (`src/screens/linkCards.ts`) shows the player a code made from their player ID (`src/net/playerCode.ts`: the first 80 bits of the ID as 16 capitals and digits, without I, L, O or U, in four groups, XXXX-XXXX-XXXX-XXXX");
    expect(privacy).toContain("and the NAME#TAG other players see. The card only shows what the device holds and sends nothing.");
    expect(privacy).toContain("the operator finds the player with `ghost-admin find-player` and deletes it with `ghost-admin delete-player`, which takes the player ID, a linked key id or the code");
    expect(read("src/screens/linkCards.ts")).toContain('"MY PLAYER ID"');
    expect(read("src/net/playerCode.ts")).toContain('"0123456789ABCDEFGHJKMNPQRSTVWXYZ"');
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

// ------------------------------------------------------------------------------------------------------------------ S6D Goal 4: the RUNBOOK and ASYNC.md

const NEW_COMMANDS = ["delete-player", "find-player", "prune-ghosts", "prune-idle", "weekly"] as const;
const flat = (s: string): string => s.replace(/\s+/g, " ");

/** The tool as the CLI runs it, on a temp JSON-lines directory: its exit code and output lines. No network, no production. */
async function tool(argv: string[], dir: string): Promise<{ code: number; out: string[] }> {
  const out: string[] = [];
  const code = await runAdmin([...argv, "--data", dir], { BB_GHOST_STORE: "jsonl" }, (l) => out.push(l));
  return { code, out };
}

describe("S6D Goal 4: deploy/RUNBOOK.md section 7 - the commands, the weekly clean-up, a lost-device request", () => {
  const rb = read("deploy/RUNBOOK.md");
  const sec7 = rb.slice(rb.indexOf("## 7. The ghost admin tool"), rb.indexOf("## 8. Re-seed, rollback, teardown"));
  const weekly = sec7.slice(sec7.indexOf("### The weekly clean-up"), sec7.indexOf("### A lost-device request"));
  const lost = sec7.slice(sec7.indexOf("### A lost-device request"));

  it("section 7 holds the commands, then the weekly clean-up, then the lost-device request, in that order, before section 8; the weekly part says it is documented only", () => {
    const a = sec7.indexOf("**The S6D commands, one by one**"), b = sec7.indexOf("### The weekly clean-up"), c = sec7.indexOf("### A lost-device request");
    expect(a).toBeGreaterThan(0);
    expect(b).toBeGreaterThan(a);
    expect(c).toBeGreaterThan(b);
    expect(rb.indexOf("## 8. Re-seed, rollback, teardown")).toBeGreaterThan(rb.indexOf("### A lost-device request"));
    expect(weekly).toContain("(S6D; documented only)");
    expect(flat(weekly)).toContain("**This subsection is documented only: nothing in it has been run, and fly.toml, the Dockerfile and the other files under deploy/ do not change for it.**");
    expect(flat(weekly)).toContain("**the machine must exist from that release on**, or the policy promises a clean-up that nobody runs");
    expect(lost).toContain("(S6D; documented only)");
  });

  it("each command the docs rely on is one of ghost-admin's COMMANDS, documented as a dry run and then with --apply; every ghost-admin line in section 7 is a command line the tool accepts", () => {
    for (const c of [...NEW_COMMANDS, "purge-tombstoned"]) expect(COMMANDS, c).toContain(c);
    for (const c of ["delete-player <id>", "purge-tombstoned", "prune-ghosts", "prune-idle", "weekly"]) {
      expect(sec7, `${c}: the dry run`).toContain(`ghost-admin.mjs ${c}'`);
      expect(sec7, `${c}: with --apply`).toContain(`ghost-admin.mjs ${c} --apply'`);
    }
    expect(sec7, "find-player only reads").toContain("ghost-admin.mjs find-player <NAME> --tag <XX>'");
    expect(sec7).not.toContain("find-player <NAME> --tag <XX> --apply");
    const lines = [...sec7.matchAll(/ghost-admin\.mjs ([^'\n]+)'/g)].map((m) => m[1]);
    expect(lines.length).toBeGreaterThanOrEqual(15); // the four S4-era lines, the eleven S6D lines, the weekly and lost-device lines
    for (const raw of lines) {
      const line = raw.replace(/<playerId>|<id or code>|<id>/g, "p1").replace(/<NAME>/g, "ANNA").replace(/<XX>/g, "4F");
      expect(line, raw).not.toContain("<");
      const args = parseArgs(line.split(" "));
      expect(args.apply, raw).toBe(line.endsWith("--apply"));
      if ((NEW_COMMANDS as readonly string[]).includes(args.command) || args.command === "purge-tombstoned") expect(args.rules, `${raw}: no --rules`).toBe("");
    }
  });

  it("the weekly machine's create line: the app's image, a weekly schedule, on-fail restarts, the Tigris store, the command `weekly --apply` - and none of the traps the text names", () => {
    const create = weekly.split("\n").find((l) => l.trim().startsWith("fly machine run "));
    expect(create, "one create line").toBeDefined();
    const line = create!.trim();
    expect(line.startsWith("fly machine run <IMAGE REF> -a beltbattles ")).toBe(true);
    for (const f of ["--name weekly-cleanup", "--region iad", "--schedule weekly", "--restart on-fail", "--vm-size shared-cpu-1x", "--vm-memory 512", "--env BB_GHOST_STORE=tigris"]) expect(line, f).toContain(f);
    expect(line.endsWith(" -- node /app/dist/ghost-admin.mjs weekly --apply")).toBe(true);
    expect(parseArgs(line.slice(line.indexOf("ghost-admin.mjs ") + "ghost-admin.mjs ".length).split(" "))).toMatchObject({ command: "weekly", apply: true });
    // --rm would destroy it after its first run; --restart always (the default) would restart it the moment it ended; metadata would hand it to fly deploy; secrets stay out of the line
    expect(line).not.toMatch(/--rm\b|--restart (always|no)\b|--metadata|fly_process_group|fly_platform_version|--port|--env (AWS_|BUCKET)|SECRET/);
    const w = flat(weekly);
    expect(w).toContain("Do not add the `fly_platform_version` and `fly_process_group` metadata");
    expect(w).toContain("Never pass them with `--env`");
    expect(w).toContain("**It reads the app's secrets**");
    expect(w).toContain("Setting an app secret also updates, and so restarts, every Machine of the app");
  });

  it("the Fly.io pages the weekly machine rests on are cited with their URL and the date read (nothing is fetched or run here)", () => {
    const w = flat(weekly);
    const urls = [
      "https://docs.fly.io/machines/flyctl/fly-machine-run", "https://docs.fly.io/blueprints/task-scheduling", "https://docs.fly.io/machines/api/machines-resource",
      "https://docs.fly.io/apps/secrets", "https://docs.fly.io/machines/guides-examples/machine-restart-policy", "https://docs.fly.io/machines/guides-examples/managing-machines-with-the-api",
      "https://docs.fly.io/launch/deploy", "https://docs.fly.io/flyctl/cmd/fly_machine_update", "https://docs.fly.io/flyctl/cmd/fly_machine_status",
      "https://docs.fly.io/flyctl/cmd/fly_logs", "https://docs.fly.io/flyctl/cmd/fly_machine_destroy", "https://docs.fly.io/flyctl/cmd/fly_ssh_console",
    ];
    for (const u of urls) expect(w, u).toContain(`${u}, read 2026-10-28`);
    // two Machines in the app: the console lines must name the app's own
    expect(w).toContain("**Once it exists, the app has two Machines.**");
    expect(w).toContain("`fly ssh console -a beltbattles --machine <the app Machine's id, from fly machine list> -C '...'`");
    // what a later app update does, as those pages say it
    expect(w).toContain("By default, `fly machine run` creates Machines that are ignored by Fly Launch features like `fly deploy`, `fly status`, and `fly scale`");
    expect(w).toContain("**A later app update does not move it.**");
    expect(w).toContain("**Move it after every release that changes server/**");
    expect(w).toContain("**a pause is a removal**");
  });

  it("the numbers in the RUNBOOK are server/retention.ts's; the two delays are links.ts's and fly.toml's", () => {
    const w = flat(weekly), s = flat(sec7);
    expect(w).toContain(`an upload goes ${GHOST_RETENTION_DAYS} days after the server received it`);
    expect(w).toContain(`a player with no sign of play for ${IDLE_RETENTION_MONTHS} months is deleted`);
    expect(w).toContain(`within ${CLEANUP_PROMISE_DAYS} days (\`GHOST_RETENTION_DAYS\`, \`IDLE_RETENTION_DAYS\` and \`CLEANUP_PROMISE_DAYS\` in server/retention.ts)`);
    expect(s).toContain(`\`prune-ghosts [--days N]\` (default ${GHOST_RETENTION_DAYS}, \`GHOST_RETENTION_DAYS\`)`);
    expect(s).toContain(`\`prune-idle [--days N]\` (default ${IDLE_RETENTION_DAYS}, \`IDLE_RETENTION_DAYS\`: the decision's ${IDLE_RETENTION_MONTHS} months, counted as ${IDLE_RETENTION_DAYS} days)`);
    expect(w).toContain(`Fly's task-scheduling guide`);
    expect(w).toContain(`The policy promises ${CLEANUP_PROMISE_DAYS} days (twice the schedule)`);
    expect(CLEANUP_PROMISE_DAYS).toBe(2 * WEEKLY_CLEANUP_DAYS);
    expect(CLOCK_GUARD_MS).toBe(86_400_000);
    expect(s).toContain("when the store holds a receipt time later than now plus one day");
    const src = read("server/retention.ts");
    for (const [name, v] of [["GHOST_RETENTION_DAYS", GHOST_RETENTION_DAYS], ["IDLE_RETENTION_MONTHS", IDLE_RETENTION_MONTHS], ["IDLE_RETENTION_DAYS", IDLE_RETENTION_DAYS], ["WEEKLY_CLEANUP_DAYS", WEEKLY_CLEANUP_DAYS], ["CLEANUP_PROMISE_DAYS", CLEANUP_PROMISE_DAYS]] as const) {
      expect(src, name).toContain(`export const ${name} = ${v};`);
    }
    expect([GHOST_RETENTION_DAYS, IDLE_RETENTION_MONTHS, IDLE_RETENTION_DAYS, WEEKLY_CLEANUP_DAYS, CLEANUP_PROMISE_DAYS]).toEqual([180, 24, 730, 7, 14]);
    // the two delays: a server learns of another process's tombstone within 60 s; a cached ghost lives to BB_GHOST_CACHE_TTL_S (600 s) or a restart
    expect(s).toContain("within 60 s: `TOMBSTONE_TTL_MS` in server/links.ts");
    expect(read("server/links.ts")).toContain("const TOMBSTONE_TTL_MS = 60_000;");
    expect(s).toContain("`BB_GHOST_CACHE_TTL_S`, 600 s in fly.toml");
    expect(read("fly.toml")).toContain('BB_GHOST_CACHE_TTL_S = "600"');
  });

  it("what the RUNBOOK says the tool prints is what it prints (an empty temp store, then one planted player): the weekly lines, delete-player's resolved/refused/DRY RUN lines, find-player's line, the delays", async () => {
    const dir = mkdtempSync(join(tmpdir(), "bb-s6d-docs-"));
    try {
      const w = flat(weekly), s = flat(sec7);
      const applied = await tool(["weekly", "--apply"], dir);
      expect(applied.code, applied.out.join("\n")).toBe(0);
      expect(applied.out[0]).toBe(`ghosts:admin weekly (every rules version): jsonl store, ${dir} (APPLY)`);
      const text = applied.out.join("\n");
      expect(text).toMatch(/weekly 1\/3 prune-idle: deleted \d+ idle player\(s\) \(more than 730 days without play\) and \d+ of their upload\(s\)/);
      expect(text).toMatch(/weekly 2\/3 purge-tombstoned: deleted \d+ of \d+ upload\(s\) and \d+ of \d+ history object\(s\) of the \d+ id\(s\) in tombstones/);
      expect(text).toMatch(/weekly 3\/3 prune-ghosts: deleted \d+ of \d+ upload\(s\) received more than 180 days ago/);
      expect(applied.out[applied.out.length - 1]).toBe("weekly: done, all three steps succeeded");
      for (const f of [
        "ghosts:admin weekly (every rules version): tigris store,", "(APPLY)", "weekly 1/3 prune-idle: deleted", `idle player(s) (more than ${IDLE_RETENTION_DAYS} days without play)`, "of their upload(s)",
        "weekly 2/3 purge-tombstoned: deleted", "history object(s) of the", "id(s) in tombstones", "weekly 3/3 prune-ghosts: deleted", `upload(s) received more than ${GHOST_RETENTION_DAYS} days ago`,
        "weekly: done, all three steps succeeded", "weekly: finished with N failed step(s)",
      ]) expect(w, f).toContain(f);
      expect(read("server/pruneAdmin.ts")).toContain("weekly: finished with ${failed} failed step(s)");
      expect(w).toContain("a line starting `refused:` (the clock guard) needs action");

      const dry = await tool(["weekly"], dir);
      expect(dry.code).toBe(0);
      expect(dry.out.join("\n")).toContain("idle: 0");
      expect(dry.out.join("\n")).toContain("plan: delete 0 upload(s)");
      expect(dry.out[dry.out.length - 1]).toMatch(/^DRY RUN: nothing was deleted\. --apply runs the three steps above in that order/);
      expect(w).toContain("plans `idle: 0` and `plan: delete 0 upload(s)`");

      // one planted player: an upload by "p1" (the lenient shape the tool reads), named ANNA, hero furnace
      appendFileSync(join(dir, "ghosts.jsonl"), `${JSON.stringify({ id: "g1", at: 5, snapshot: { rules: "bb-0.12.0", day: 1, playerId: "p1", name: "ANNA", hero: "furnace" } })}\n`);
      const none = await tool(["delete-player", "nobody"], dir);
      expect(none.code).toBe(1);
      expect(none.out.filter((l) => l.startsWith("refused:"))).toHaveLength(1);
      expect(s).toContain("it prints one line starting `refused:`, deletes nothing and exits 1");
      const dryDel = await tool(["delete-player", "p1"], dir);
      expect(dryDel.code, dryDel.out.join("\n")).toBe(0);
      expect(dryDel.out.some((l) => l.startsWith("resolved: player p1 (given as "))).toBe(true);
      expect(dryDel.out.some((l) => l.startsWith("  tombstone: tombstones/p1.json is written first"))).toBe(true);
      expect(dryDel.out.some((l) => l.startsWith("  seed pool: never touched"))).toBe(true);
      expect(dryDel.out[dryDel.out.length - 1]).toMatch(/^DRY RUN: nothing was deleted\. --apply writes the tombstone and deletes exactly the 1 record\(s\) above\.$/);
      expect(s).toContain("Before the plan it prints `resolved: player <P> (given as ...)`");
      const code = playerCode("p1");
      const byCode = await tool(["delete-player", code.toLowerCase().replace(/-/g, "")], dir); // any case, dashes or not
      expect(byCode.out.some((l) => l.startsWith(`resolved: player p1 (given as the code ${code} of this player`))).toBe(true);

      const find = await tool(["find-player", "anna"], dir); // names are compared as the server stores them: capitals
      expect(find.code).toBe(0);
      expect(find.out.some((l) => new RegExp(`^  player p1  tag [0-9A-F]{2}  code ${code}  uploads 1  newest [0-9T:Z-]+  heroes furnace  rules bb-0.12.0  tombstoned no$`).test(l)), find.out.join("\n")).toBe(true);
      expect(parseArgs(["find-player", "anna"]).command).toBe("find-player");
      expect(() => parseArgs(["find-player", "anna", "--apply"])).toThrow("never deletes"); // "only reads (`--apply` is refused)"
      expect(s).toContain("`find-player <NAME> [--tag <XX>]` only reads (`--apply` is refused)");

      const del = await tool(["delete-player", "p1", "--apply"], dir);
      expect(del.code, del.out.join("\n")).toBe(0);
      const delText = del.out.join("\n");
      expect(delText).toContain("deleted 1 of 1 upload(s)");
      expect(delText).toContain("within 60 s"); // the delays the RUNBOOK and ASYNC.md name
      expect(delText).toContain("BB_GHOST_CACHE_TTL_S; 600 s on Fly");
      expect((await tool(["delete-player", "p1", "--apply"], dir)).code, "a second --apply is a success").toBe(0);
      expect(s).toContain("A delete of a player who is deleted already is a success that finishes whatever is left.");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("a lost-device request: find-player first (it only reads), then delete-player as a dry run, then the same line with --apply; the refusal and the check on identity are named", () => {
    const l = flat(lost);
    expect(l.indexOf("find-player")).toBeGreaterThan(-1);
    expect(l.indexOf("find-player")).toBeLessThan(l.indexOf("delete-player"));
    expect(l.indexOf("ghost-admin.mjs delete-player <id or code>'")).toBeLessThan(l.indexOf("The same line with `--apply`"));
    for (const f of [
      "The dry run, and read it", "resolved: player <P> (given as ...)", "A line starting `refused:`", "anyone who met their ghost can learn the player ID",
      "the progress on that device stays", "OPTIONS, MY PLAYER ID shows a code made from it", "`linked to player <P>`",
    ]) expect(l, f).toContain(f);
  });
});

describe("S6D Goal 4: docs/ASYNC.md '## Operations: the ghost admin tool (0.7.0)' - the new commands, in its style", () => {
  const at = doc.indexOf("\n## Operations: the ghost admin tool (0.7.0)\n");
  const ops = flat(doc.slice(at, doc.indexOf("\n## PUT /v1/profile", at)));

  it("is one section, between '## Running on Fly + Tigris' and '## PUT /v1/profile'", () => {
    expect(at).toBeGreaterThan(doc.indexOf("\n## Running on Fly + Tigris\n"));
    expect(doc.match(/^## Operations: the ghost admin tool \(0\.7\.0\)$/gm)).toHaveLength(1);
    expect(doc.indexOf("\n## PUT /v1/profile")).toBeGreaterThan(at);
    expect(ops.length).toBeGreaterThan(3000);
  });

  it("the five new commands (and purge-tombstoned) are ghost-admin's COMMANDS, each in the section's command block and in its table", () => {
    for (const c of [...NEW_COMMANDS, "purge-tombstoned"]) {
      expect(COMMANDS, c).toContain(c);
      expect(ops, `${c}: its npm run line`).toContain(`ghosts:admin -- ${c}`);
    }
    for (const row of ["| `purge-tombstoned` |", "| `delete-player <id>` |", "| `find-player <name>` |", "| `prune-ghosts` |", "| `prune-idle` |", "| `weekly` |"]) expect(ops, row).toContain(row);
  });

  it("the periods are server/retention.ts's; the time of an upload is its own `at`; exactly the period old is kept; the clock guard refuses", async () => {
    expect(ops).toContain(`more than \`--days N\` ago (default ${GHOST_RETENTION_DAYS})`);
    expect(ops).toContain(`more than \`--days N\` (default ${IDLE_RETENTION_DAYS})`);
    expect(ops).toContain(`(\`prune-idle\`; ${IDLE_RETENTION_DAYS} days, \`IDLE_RETENTION_DAYS\`, the operator's ${IDLE_RETENTION_MONTHS} months)`);
    expect(ops).toContain(`received more than ${GHOST_RETENTION_DAYS} days before now (\`GHOST_RETENTION_DAYS\`; exactly ${GHOST_RETENTION_DAYS} days is kept)`);
    expect(ops).toContain("**The time of an upload** is the record's own `at`, the server's receipt time, on both stores");
    expect(ops).toContain("(`CLOCK_GUARD_MS`)");
    expect(ops).toContain("(60 s, `TOMBSTONE_TTL_MS`)");
    // the code does what the section says: 179 and 180 days old stay, 181 goes (the record's own `at`); a receipt time a day and more ahead of the clock refuses
    const NOW = Date.UTC(2026, 9, 28, 12, 0, 0);
    const day = 86_400_000;
    const dir = mkdtempSync(join(tmpdir(), "bb-s6d-docs-ops-"));
    try {
      const up = (id: string, at: number): string => `${JSON.stringify({ id, at, snapshot: { rules: "bb-0.12.0", day: 1, playerId: `p-${id}` } })}\n`;
      appendFileSync(join(dir, "ghosts.jsonl"), up("a179", NOW - 179 * day) + up("a180", NOW - 180 * day) + up("a181", NOW - 181 * day));
      const out: string[] = [];
      const code = await runAdmin(["prune-ghosts", "--apply", "--data", dir], { BB_GHOST_STORE: "jsonl" }, (l) => out.push(l), undefined, () => NOW);
      expect(code, out.join("\n")).toBe(0);
      expect(out.join("\n")).toContain("APPLIED: deleted 1 of 1 record(s).");
      const left = readFileSync(join(dir, "ghosts.jsonl"), "utf8");
      expect(left).toContain('"id":"a179"');
      expect(left).toContain('"id":"a180"');
      expect(left).not.toContain('"id":"a181"');
      appendFileSync(join(dir, "ghosts.jsonl"), up("ahead", NOW + 2 * day));
      const refused: string[] = [];
      const rc = await runAdmin(["prune-ghosts", "--apply", "--days", "1", "--data", dir], { BB_GHOST_STORE: "jsonl" }, (l) => refused.push(l), undefined, () => NOW);
      expect(rc, refused.join("\n")).toBe(1);
      expect(refused.some((l) => l.startsWith("refused:"))).toBe(true);
      expect(readFileSync(join(dir, "ghosts.jsonl"), "utf8")).toContain('"id":"a179"'); // nothing was deleted
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("delete-player shares DELETE /v1/player's code; the weekly lines and the delays are the RUNBOOK's; the tests of the commands exist", () => {
    expect(ops).toContain("`--apply` calls `Links.deletePlayer` (`server/links.ts`), the function `DELETE /v1/player` calls");
    expect(read("server/linkRoutes.ts")).toContain("await r.links.deletePlayer(o.signer);");
    expect(read("server/pruneAdmin.ts")).toContain("await links.deletePlayer(p.player);");
    expect(ops).toContain("(`tombstoneIds`)");
    expect(read("server/links.ts")).toContain("export function tombstoneIds(");
    for (const f of ["`weekly 1/3 prune-idle: ...`", "`weekly 2/3 purge-tombstoned: ...`", "`weekly 3/3 prune-ghosts: ...`", "`weekly: done, all three steps succeeded`"]) expect(ops, f).toContain(f);
    expect(ops).toContain("`BB_GHOST_CACHE_TTL_S` has passed or it restarts (JSON lines: only a restart)");
    expect(ops).toContain("`delete-player <the probe's player id>` (S6D) removes it with the rest of the player");
    expect(ops).toContain("**Tested on both stores** in `tests/s6d.*.test.ts`");
    expect(readdirSync(join(ROOT, "tests")).some((f) => /^s6d\..+\.test\.ts$/.test(f))).toBe(true);
  });
});
