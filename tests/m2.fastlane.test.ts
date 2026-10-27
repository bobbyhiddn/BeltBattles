// M2 (BRIEF-M2 Goal 3 and 4): text checks of the fastlane lane (ios/App/fastlane, ios/App/Gemfile) and of THE SECRETS the workflows and the lane use.
// There is no Ruby and no fastlane on the dev host, so nothing here runs a lane: each check reads a file and says what the first real run relies on.
import { describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = new URL("..", import.meta.url).pathname;
const read = (rel: string): string => readFileSync(join(ROOT, rel), "utf8");
/** Ruby text without full-line comments and blank lines. */
const code = (rel: string): string => read(rel).split("\n").filter((l) => l.trim() !== "" && !l.trim().startsWith("#")).join("\n");

const FASTFILE = "ios/App/fastlane/Fastfile";
const fastfile = code(FASTFILE);
/** The lane's text, from `lane :name do` to the `end` that closes it (two-space indented). */
const lane = (name: string): string => new RegExp(`^  lane :${name} do\\n([\\s\\S]*?)\\n  end$`, "m").exec(fastfile)?.[1] ?? "";

/** The six signing secrets, and the ones of the operator's seventeen that BeltBattles does not read. */
const SECRETS = ["APPLE_KEY_ID", "APPLE_ISSUER_ID", "APPLE_KEY_CONTENT", "DEVELOPER_PORTAL_TEAM_ID", "MATCH_GIT_URL", "MATCH_PASSWORD"];
const NOT_NEEDED = ["APP_STORE_CONNECT_TEAM_ID", "TEMP_KEYCHAIN_PASSWORD", "GIT_AUTHORIZATION", "DEVELOPER_APP_ID", "FASTLANE_APPLE_ID", "FASTLANE_USER", "FASTLANE_PASSWORD", "PROVISIONING_PROFILE_SPECIFIER", "GIT_URL", "FLY_API_TOKEN"];

describe("M2 Goal 3: the Gemfile pins fastlane and nothing else; no lock is committed (no Ruby here to make one)", () => {
  it("is `source rubygems.org` and one gem line: fastlane 2.241.2 exactly (rubygems.org, released 2026-10-26; Ruby >= 3.2.0)", () => {
    expect(code("ios/App/Gemfile").split("\n")).toEqual(['source "https://rubygems.org"', 'gem "fastlane", "2.241.2"']);
    expect(read("ios/App/Gemfile")).toMatch(/2026-10-26/);
    expect(read("ios/App/Gemfile")).toMatch(/no Gemfile\.lock/);
  });
  it("has no Gemfile.lock, no Podfile and no .ruby-version (the workflow chooses Ruby 3.3; the action makes the lock when there is none)", () => {
    for (const f of ["ios/App/Gemfile.lock", "ios/App/Podfile", "ios/App/.ruby-version", "ios/App/.bundle", "ios/App/vendor"]) expect(existsSync(join(ROOT, f)), f).toBe(false);
  });
});

describe("M2 Goal 3: the Appfile and the Matchfile are the operator's, with the bundle id from DEVELOPER_APP_IDENTIFIER", () => {
  it("Appfile: the app identifier and the team id, from the environment; his Apple id line is gone (the API key signs in)", () => {
    expect(code("ios/App/fastlane/Appfile").split("\n")).toEqual(['app_identifier(ENV["DEVELOPER_APP_IDENTIFIER"])', 'team_id(ENV["DEVELOPER_PORTAL_TEAM_ID"])']);
  });
  it("Matchfile: git storage at MATCH_GIT_URL, type appstore, the one app identifier", () => {
    expect(code("ios/App/fastlane/Matchfile").split("\n")).toEqual(['git_url(ENV["MATCH_GIT_URL"])', 'storage_mode("git")', 'type("appstore")', 'app_identifier([ENV["DEVELOPER_APP_IDENTIFIER"]])']);
  });
});

describe("M2 Goal 3: the Fastfile: two lanes, closed_beta (the release) and match_init (the one-off that writes)", () => {
  it("has default_platform ios and exactly the lanes closed_beta and match_init; the file's blocks and brackets balance (a Ruby syntax sanity check: no Ruby here)", () => {
    expect(fastfile.split("\n")[0]).toBe("default_platform(:ios)");
    expect(fastfile).toMatch(/^platform :ios do$/m);
    expect([...fastfile.matchAll(/^ {2}lane :(\w+) do$/gm)].map((m) => m[1])).toEqual(["closed_beta", "match_init"]);
    const openers = (fastfile.match(/(\bdo|\bbegin)$/gm) ?? []).length;
    const closers = (fastfile.match(/^\s*end$/gm) ?? []).length;
    expect(openers).toBe(closers);
    for (const [a, b] of [["(", ")"], ["{", "}"], ["[", "]"]]) expect(fastfile.split(a).length, `${a}${b}`).toBe(fastfile.split(b).length);
    expect(fastfile.endsWith("\nend")).toBe(true);
    // every string on one line is closed: an even number of unescaped double quotes
    for (const l of fastfile.split("\n")) expect((l.replace(/\\"/g, "").match(/"/g) ?? []).length % 2, l).toBe(0);
  });

  it("builds App.xcodeproj, not a workspace (Capacitor 8 makes a Swift Package Manager project: no Podfile, no Pods, no workspace), scheme App, Release, export method app-store", () => {
    const l = lane("closed_beta");
    expect(l).toContain('project: "App.xcodeproj"');
    expect(l).toContain('path: "App.xcodeproj"');
    expect(fastfile).not.toMatch(/workspace|xcworkspace|cocoapods|pod install/i);
    expect(l).toContain('scheme: "App"');
    expect(l).toContain('configuration: "Release"');
    expect(l).toContain('export_method: "app-store"');
    expect(l).toContain("build_app(");
    // the project that fastlane builds is the one that exists, with the scheme that is shared
    expect(existsSync(join(ROOT, "ios/App/App.xcodeproj/project.pbxproj"))).toBe(true);
    expect(existsSync(join(ROOT, "ios/App/App.xcodeproj/xcshareddata/xcschemes/App.xcscheme"))).toBe(true);
  });

  it("takes the bundle id from DEVELOPER_APP_IDENTIFIER (the workflows set it from capacitor.config.json's appId), refuses to run without it, and names the profile 'match AppStore <bundle id>'", () => {
    const l = lane("closed_beta");
    expect(l).toContain('bundle_id = ENV["DEVELOPER_APP_IDENTIFIER"].to_s.strip');
    expect(l).toMatch(/UI\.user_error!\("DEVELOPER_APP_IDENTIFIER is not set[^"]*"\) if bundle_id\.empty\?/);
    expect(l).toContain('"match AppStore #{bundle_id}"');
    expect(l).toContain('ENV["sigh_#{bundle_id}_appstore_profile-name"]');
    expect(l).toContain("bundle_id => profile_name");
    expect(l).toContain("profile_name: profile_name");
    expect(l).toContain("bundle_identifier: bundle_id");
    expect(fastfile).not.toContain("com.bobbyhiddn"); // no id is written into the lane: capacitor.config.json is the one source
    expect(fastfile).not.toMatch(/ENV\["DEVELOPER_APP_IDENTIFIER"\] ?\|\|/);
  });

  it("signs manually: match read-only into fastlane's temporary keychain (setup_ci), the profile set on the App target only, signing identity 'iPhone Distribution', team from DEVELOPER_PORTAL_TEAM_ID", () => {
    const l = lane("closed_beta");
    expect(l).toContain('setup_ci if ENV["CI"]');
    expect(l).toMatch(/sync_code_signing\(\n\s+type: "appstore",\n\s+app_identifier: bundle_id,\n\s+git_url: ENV\["MATCH_GIT_URL"\],\n\s+readonly: true\n\s+\)/);
    expect(l).toMatch(/update_code_signing_settings\(\n\s+use_automatic_signing: false,\n\s+path: "App\.xcodeproj",\n\s+targets: \["App"\],\n\s+team_id: team_id,\n\s+code_sign_identity: "iPhone Distribution",/);
    expect(l).toContain('team_id = ENV["DEVELOPER_PORTAL_TEAM_ID"].to_s.strip');
    expect(l.indexOf("sync_code_signing")).toBeLessThan(l.indexOf("update_code_signing_settings"));
    expect(l.indexOf("update_code_signing_settings")).toBeLessThan(l.indexOf("build_app("));
    expect(l.indexOf("build_app(")).toBeLessThan(l.indexOf("upload_to_testflight("));
    // the signing settings go into the project file, not into xcargs: a profile in xcargs would reach the Swift package targets, which take none
    expect(l).not.toMatch(/xcargs:[^\n]*(PROVISIONING|CODE_SIGN|DEVELOPMENT_TEAM)/);
    // his explicit keychain and its password secret are gone
    expect(fastfile).not.toMatch(/keychain_name|keychain_password|TEMP_KEYCHAIN_PASSWORD|build\.keychain/);
  });

  it("sets the two version numbers as build settings (xcargs), not with agvtool: MARKETING_VERSION from CUSTOM_VERSION, CURRENT_PROJECT_VERSION = the latest TestFlight build + 1", () => {
    const l = lane("closed_beta");
    expect(l).toContain('version = ENV["CUSTOM_VERSION"].to_s.strip');
    expect(l).toMatch(/UI\.user_error!\("CUSTOM_VERSION must be the marketing version x\.y\.z[^\n]*unless version\.match\?\(\/\\A\\d\+\\\.\\d\+\\\.\\d\+\\z\/\)/);
    expect(l).toContain('xcargs: "MARKETING_VERSION=#{version} CURRENT_PROJECT_VERSION=#{build_number}"');
    expect(l).toContain("build_number = latest.to_i + 1");
    expect(l).toMatch(/latest_testflight_build_number\(\n\s+api_key: api_key,\n\s+app_identifier: bundle_id,\n\s+initial_build_number: 0\n\s+\)/); // 0 + 1 for a new app
    expect(fastfile).not.toMatch(/increment_version_number|increment_build_number|agvtool|VERSIONING_SYSTEM/);
    // his `rescue 0` turned any failure into build number 1; here a failed read stops the lane with a plain message
    expect(fastfile).not.toMatch(/\) rescue 0|rescue 0/);
    expect(l).toMatch(/rescue StandardError => e\n\s+UI\.user_error!\("Could not read TestFlight's latest build number/);
    // Info.plist reads both settings, so the xcargs reach the built app
    expect(read("ios/App/App/Info.plist")).toContain("<string>$(MARKETING_VERSION)</string>");
    expect(read("ios/App/App/Info.plist")).toContain("<string>$(CURRENT_PROJECT_VERSION)</string>");
  });

  it("uploads to TestFlight without waiting for App Store Connect (skip_waiting_for_build_processing: true), the .ipa gym just built, with the API key", () => {
    const l = lane("closed_beta");
    expect(l).toMatch(/upload_to_testflight\(\n\s+api_key: api_key,\n\s+app_identifier: bundle_id,\n\s+ipa: lane_context\[SharedValues::IPA_OUTPUT_PATH\],\n\s+skip_waiting_for_build_processing: true\n\s+\)/);
    expect(fastfile).not.toContain("skip_waiting_for_build_processing: false");
    expect(fastfile).not.toContain("wait_processing_interval");
    expect(read("ios/App/App/Info.plist")).toContain("<key>ITSAppUsesNonExemptEncryption</key>\n\t<false/>"); // so no manual compliance step remains
    expect(fastfile).not.toMatch(/distribute_external|groups:|changelog:|submit_for_review|deliver\(|upload_to_app_store/);
  });

  it("builds the API key from APPLE_KEY_ID, APPLE_ISSUER_ID and APPLE_KEY_CONTENT (the .p8 body without its BEGIN/END lines, his format), in both lanes, with no key file", () => {
    for (const name of ["closed_beta", "match_init"]) {
      const l = lane(name);
      expect(l, name).toContain('key_body = ENV["APPLE_KEY_CONTENT"].to_s.gsub(/-----[^-]+-----/, "").gsub(/\\s+/, "")');
      expect(l, name).toMatch(/app_store_connect_api_key\(\n\s+key_id: ENV\["APPLE_KEY_ID"\],\n\s+issuer_id: ENV\["APPLE_ISSUER_ID"\],\n\s+key_content: "-----BEGIN PRIVATE KEY-----\\n#\{key_body\.scan\(\/\.\{1,64\}\/\)\.join\("\\n"\)\}\\n-----END PRIVATE KEY-----",\n\s+in_house: false,\n\s+is_key_content_base64: false\n\s+\)/);
      expect(l, name).toContain("api_key = lane_context[SharedValues::APP_STORE_CONNECT_API_KEY]");
    }
    expect(fastfile).not.toMatch(/key_filepath|api_key_path|AuthKey|File\.(write|read)/);
  });

  it("match_init is the only lane that writes: readonly false and generate_apple_certs (an expired certificate is replaced), it says so, and the release lane never calls it", () => {
    const l = lane("match_init");
    expect(l).toMatch(/sync_code_signing\(\n\s+type: "appstore",\n\s+app_identifier: bundle_id,\n\s+git_url: ENV\["MATCH_GIT_URL"\],\n\s+git_full_name: "github-actions\[bot\]",\n\s+git_user_email: "41898282\+github-actions\[bot\]@users\.noreply\.github\.com",\n\s+team_id: team_id,\n\s+api_key: api_key,\n\s+readonly: false,\n\s+renew_expired_certs: true,\n\s+generate_apple_certs: true,\n\s+skip_confirmation: true\n\s+\)/);
    expect(l).not.toMatch(/build_app|upload_to_testflight|update_code_signing_settings|latest_testflight_build_number/);
    expect(lane("closed_beta")).not.toMatch(/match_init|readonly: false|generate_apple_certs/);
    expect(read(FASTFILE)).toMatch(/desc "ONE-OFF, WRITES to the match repository and to the Apple account/);
    // an expired certificate is replaced only because renewal is switched on (match's renew_expired_certs defaults to false): the lane must set it
    expect(l).toContain("renew_expired_certs: true,");
    expect(read(FASTFILE)).toMatch(/has likely expired:/);
    expect(read(FASTFILE)).toMatch(/renewal is opt-in/);
    expect(read(FASTFILE)).toMatch(/leaves the old one at Apple/);
    expect(lane("closed_beta")).not.toContain("renew_expired_certs"); // the release lane only reads
  });

  it("reads only the environment variables the workflows set: the six secrets (MATCH_PASSWORD is read by match itself), the app id, the version, CI", () => {
    const text = ["ios/App/fastlane/Fastfile", "ios/App/fastlane/Appfile", "ios/App/fastlane/Matchfile"].map(code).join("\n");
    const read_ = new Set([...text.matchAll(/ENV\["([A-Za-z0-9_#{}-]+)"\]/g)].map((m) => m[1].replace(/#\{bundle_id\}/, "<bundle>")));
    expect([...read_].sort()).toEqual(["APPLE_ISSUER_ID", "APPLE_KEY_CONTENT", "APPLE_KEY_ID", "CI", "CUSTOM_VERSION", "DEVELOPER_APP_IDENTIFIER", "DEVELOPER_PORTAL_TEAM_ID", "MATCH_GIT_URL", "sigh_<bundle>_appstore_profile-name"].sort());
    // match reads MATCH_PASSWORD from the environment itself; the lane's description says it is needed
    expect(read(FASTFILE)).toContain("MATCH_GIT_URL, MATCH_PASSWORD");
    for (const s of SECRETS) expect(read(FASTFILE), s).toContain(s);
  });
});

describe("M2 Goal 3: THE SECRETS: the six that ios.yml and ios-match-init.yml use, and the eleven of the operator's seventeen that nothing here reads", () => {
  const files = [".github/workflows/ios.yml", ".github/workflows/ios-match-init.yml"];
  const strip = (rel: string): string => read(rel).split("\n").filter((l) => !l.trim().startsWith("#")).join("\n");

  it("every secret the workflows map is one of the six, and each of the six is mapped into the fastlane step of both lanes", () => {
    for (const f of files) {
      const used = new Set([...strip(f).matchAll(/secrets\.([A-Z0-9_]+)/g)].map((m) => m[1]));
      expect([...used].sort(), f).toEqual([...SECRETS].sort());
    }
    const lane1 = /- name: Build, sign and upload to TestFlight[\s\S]*?run: bundle exec fastlane closed_beta/.exec(strip(files[0]))?.[0] ?? "";
    const lane2 = /- name: Run fastlane match_init[\s\S]*?run: bundle exec fastlane match_init/.exec(strip(files[1]))?.[0] ?? "";
    for (const s of SECRETS) {
      expect(lane1, `closed_beta env ${s}`).toContain(`${s}: \${{ secrets.${s} }}`);
      expect(lane2, `match_init env ${s}`).toContain(`${s}: \${{ secrets.${s} }}`);
    }
  });

  it("none of the secrets that only his pipeline read (or that BeltBattles replaces) appears in a workflow, the lane or the Gemfile, as a secret or as an environment variable", () => {
    const all = [...files.map(strip), code(FASTFILE), code("ios/App/fastlane/Appfile"), code("ios/App/fastlane/Matchfile"), code("ios/App/Gemfile")].join("\n");
    for (const s of NOT_NEEDED) expect(all, s).not.toMatch(new RegExp(`\\b${s}\\b`));
    // the bundle id is not a secret: it is read from capacitor.config.json
    expect(all).not.toContain("secrets.DEVELOPER_APP_IDENTIFIER");
    expect(strip(files[0])).toContain(`DEVELOPER_APP_IDENTIFIER=$(node -p "require('./capacitor.config.json').appId")" >> "$GITHUB_ENV"`);
    expect(strip(files[1])).toContain(`DEVELOPER_APP_IDENTIFIER=$(node -p "require('./capacitor.config.json').appId")" >> "$GITHUB_ENV"`);
  });

  it("ios/.gitignore also keeps fastlane's report and README, bundler's folders and its vendored gems out of git (the lane and the Ruby action make them)", () => {
    const lines = read("ios/.gitignore").split("\n");
    for (const line of ["App/fastlane/report.xml", "App/fastlane/README.md", "App/fastlane/test_output", "App/vendor", "App/.bundle"]) expect(lines, line).toContain(line);
    // the template's own lines stay
    for (const line of ["App/build", "App/Pods", "App/output", "App/App/public", "DerivedData", "xcuserdata", "capacitor-cordova-ios-plugins", "App/App/capacitor.config.json", "App/App/config.xml"]) expect(lines, line).toContain(line);
  });
});
