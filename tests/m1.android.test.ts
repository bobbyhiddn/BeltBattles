// M1 (BRIEF-M1 Goals 1 and 4): text checks of the committed android/ project and of the AAB workflow. No Android SDK, no Gradle and no
// runner exist on the dev host, so nothing here builds: each check reads a file and says what the first real build will rely on.
import { describe, expect, it } from "vitest";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const ROOT = new URL("..", import.meta.url).pathname;
const read = (rel: string): string => readFileSync(join(ROOT, rel), "utf8");
const cfg = JSON.parse(read("capacitor.config.json")) as { appId: string; appName: string; backgroundColor: string };

/** Every file under `rel` (relative paths), depth first; [] where the folder is absent. */
function walk(rel: string): string[] {
  const abs = join(ROOT, rel);
  if (!existsSync(abs)) return [];
  const out: string[] = [];
  for (const name of readdirSync(abs)) {
    const sub = `${rel}/${name}`;
    if (statSync(join(ROOT, sub)).isDirectory()) out.push(...walk(sub));
    else out.push(sub);
  }
  return out;
}

const RES = "android/app/src/main/res";

describe("M1 Goal 1: the committed android/ project (cap add android, Capacitor 8.5.3's template, plus M1's edits)", () => {
  it("applicationId, namespace, the Java package and its folder, and the two strings all equal the appId", () => {
    const gradle = read("android/app/build.gradle");
    expect(gradle).toMatch(new RegExp(`namespace = "${cfg.appId.replace(/\./g, "\\.")}"`));
    expect(gradle).toMatch(new RegExp(`applicationId "${cfg.appId.replace(/\./g, "\\.")}"`));
    const activity = `android/app/src/main/java/${cfg.appId.replace(/\./g, "/")}/MainActivity.java`;
    expect(existsSync(join(ROOT, activity)), activity).toBe(true);
    expect(read(activity)).toContain(`package ${cfg.appId};`);
    const strings = read(`${RES}/values/strings.xml`);
    expect(strings).toContain(`<string name="app_name">${cfg.appName}</string>`);
    expect(strings).toContain(`<string name="title_activity_main">${cfg.appName}</string>`);
    expect(strings).toContain(`<string name="package_name">${cfg.appId}</string>`);
    expect(strings).toContain(`<string name="custom_url_scheme">${cfg.appId}</string>`);
  });

  it("keeps the template's toolchain: minSdk 24, compileSdk and targetSdk 36, AGP 8.13.0, Gradle 8.14.3, Java 21 (never upgraded by hand)", () => {
    const vars = read("android/variables.gradle");
    expect(vars).toMatch(/minSdkVersion = 24\b/);
    expect(vars).toMatch(/compileSdkVersion = 36\b/);
    expect(vars).toMatch(/targetSdkVersion = 36\b/);
    expect(read("android/build.gradle")).toContain("com.android.tools.build:gradle:8.13.0");
    expect(read("android/gradle/wrapper/gradle-wrapper.properties")).toContain("gradle-8.14.3-all.zip");
    expect(read("android/app/capacitor.build.gradle")).toMatch(/sourceCompatibility JavaVersion\.VERSION_21[\s\S]*targetCompatibility JavaVersion\.VERSION_21/);
  });

  it("wires exactly the two plugins the game uses: @capacitor/app and @capacitor/preferences (core's SystemBars is built in)", () => {
    const settings = read("android/capacitor.settings.gradle");
    expect([...settings.matchAll(/include ':([\w-]+)'/g)].map((m) => m[1]).sort()).toEqual(["capacitor-android", "capacitor-app", "capacitor-preferences"]);
    const build = read("android/app/capacitor.build.gradle");
    expect([...build.matchAll(/implementation project\(':([\w-]+)'\)/g)].map((m) => m[1]).sort()).toEqual(["capacitor-app", "capacitor-preferences"]);
  });

  it("the splash and the window are the page's own #050B12, so the app never flashes white (colours, both themes, the launch screen)", () => {
    expect(cfg.backgroundColor).toBe("#050B12");
    expect(read(`${RES}/values/colors.xml`)).toMatch(/<color name="bb_background">#050B12<\/color>/);
    const styles = read(`${RES}/values/styles.xml`);
    const block = (name: string): string => styles.match(new RegExp(`<style name="${name}"[\\s\\S]*?</style>`))?.[0] ?? "";
    for (const theme of ["AppTheme.NoActionBar", "AppTheme.NoActionBarLaunch"]) {
      expect(block(theme), theme).toContain('<item name="android:windowBackground">@color/bb_background</item>');
    }
    expect(block("AppTheme.NoActionBarLaunch")).toContain('<item name="windowSplashScreenBackground">@color/bb_background</item>');
    expect(block("AppTheme.NoActionBarLaunch")).toContain('<item name="android:background">@color/bb_background</item>');
    // the template's splash.png has a white background: the launch theme does not paint it
    expect(styles).not.toMatch(/@drawable\/splash/);
    // the manifest's activity starts in the launch theme
    expect(read("android/app/src/main/AndroidManifest.xml")).toContain('android:theme="@style/AppTheme.NoActionBarLaunch"');
  });

  it("edge to edge: MainActivity calls EdgeToEdge.enable(this) before super.onCreate (Android 7-14 draw as 15+ does), and the config sets SystemBars' style", () => {
    const main = read(`android/app/src/main/java/${cfg.appId.replace(/\./g, "/")}/MainActivity.java`);
    expect(main).toContain("import androidx.activity.EdgeToEdge;");
    expect(main).toContain("extends BridgeActivity");
    expect(main.indexOf("EdgeToEdge.enable(this);")).toBeGreaterThan(main.indexOf("public void onCreate(Bundle savedInstanceState)"));
    expect(main.indexOf("EdgeToEdge.enable(this);")).toBeLessThan(main.indexOf("super.onCreate(savedInstanceState);"));
    // the page, not the window, clears the bars: C1's #stage padding reads env() and Capacitor's variables
    const html = read("index.html");
    expect(html).toContain("viewport-fit=cover");
    expect(html).toContain("padding-top: max(env(safe-area-inset-top, 0px), var(--safe-area-inset-top, 0px));");
    expect(html).toContain("padding-bottom: max(env(safe-area-inset-bottom, 0px), var(--safe-area-inset-bottom, 0px));");
    // insetsHandling stays at Capacitor's default ("css": native padding below WebView 140, env() and the variables from 140)
    expect(JSON.stringify(JSON.parse(read("capacitor.config.json")).plugins)).not.toContain("insetsHandling");
  });

  it("allows no cleartext traffic and no screen lock: only the INTERNET permission, no usesCleartextTraffic, no network security config, no screenOrientation", () => {
    const manifest = read("android/app/src/main/AndroidManifest.xml");
    expect(manifest).not.toMatch(/usesCleartextTraffic/i);
    expect(manifest).not.toMatch(/networkSecurityConfig/i);
    expect(manifest).not.toMatch(/screenOrientation/);
    expect([...manifest.matchAll(/<uses-permission android:name="([^"]+)"/g)].map((m) => m[1])).toEqual(["android.permission.INTERNET"]);
    expect(manifest).toContain('android:exported="true"');
    expect(manifest).toContain('android:launchMode="singleTask"');
    expect(read("capacitor.config.json")).not.toMatch(/cleartext/i);
  });

  // M3 (REQ-BFG-119) changed this pin: it held the template's 26 default PNGs (15 launcher icons and 11 splash images). M3 drew the 15
  // launcher PNGs with the game's own art and deleted the 11 splash images (the launch theme shows a plain colour, then the system splash
  // draws the launcher icon). tests/m3.android.test.ts checks the art itself and that no template file is left.
  it("holds the 15 launcher PNGs and no other image: no splash image (M3 deleted the 11 template ones) and no picture the launch theme could show", () => {
    const images = walk(RES).filter((f) => /\.(png|jpe?g|webp|gif|svg)$/i.test(f));
    expect(images.length).toBe(15);
    expect(images.filter((f) => /ic_launcher(_foreground|_round)?\.png$/.test(f)).length).toBe(15);
    expect(images.filter((f) => /splash\.png$/.test(f)).length).toBe(0);
  });

  it("android/.gitignore keeps the copied web build and the generated config out of git (cap sync writes them; CI makes them)", () => {
    const ignore = read("android/.gitignore");
    for (const line of ["app/src/main/assets/public", "app/src/main/assets/capacitor.config.json", "app/src/main/assets/capacitor.plugins.json", "app/src/main/res/xml/config.xml", "capacitor-cordova-android-plugins", "build/", ".gradle/", "local.properties", "*.aab", "*.apk"]) {
      expect(ignore.split("\n"), line).toContain(line);
    }
  });

  it("16 KB pages: none of the @capacitor packages ships a native library (.so, .a, .dylib, .node, .aar): Capacitor's Android code is Java", () => {
    const base = "node_modules/@capacitor";
    expect(existsSync(join(ROOT, base)), "run npm ci first").toBe(true);
    const native = walk(base).filter((f) => /\.(so|so\.\d+|a|dylib|node|aar)$/i.test(f));
    expect(native).toEqual([]);
    // what their android/ folders do hold is Java source (the Android plugins are Java; the JS half is the web bundle's)
    for (const dir of [`${base}/android/capacitor/src`, `${base}/app/android/src`, `${base}/preferences/android/src`]) {
      expect(walk(dir).filter((f) => f.endsWith(".java")).length, dir).toBeGreaterThan(0);
    }
  });
});

describe("M1 Goal 4: the version reaches Gradle as -P properties", () => {
  it("android/app/build.gradle reads bbVersionCode and bbVersionName, and a local build without them keeps the template's 1 and \"1.0\"", () => {
    const gradle = read("android/app/build.gradle");
    expect(gradle).toContain("versionCode((project.findProperty('bbVersionCode') ?: '1').toString().toInteger())");
    expect(gradle).toContain("versionName((project.findProperty('bbVersionName') ?: '1.0').toString())");
    // the template's two literals are gone, and the edit is only those two lines (plus their comment)
    expect(gradle).not.toMatch(/versionCode 1\b/);
    expect(gradle).not.toMatch(/versionName "1\.0"/);
    expect(gradle.match(/bbVersion/g)).toHaveLength(4); // the two lines, and the comment's two mentions
  });

  it("the workflow passes both, from scripts/android-version.mjs's output, to bundleRelease and assembleDebug", () => {
    const wf = read(".github/workflows/android.yml");
    expect(wf).toContain("node scripts/android-version.mjs --tag \"$REF_NAME\"");
    expect(wf).toContain("node scripts/android-version.mjs --rebuild \"${REBUILD_INPUT:-0}\"");
    expect(wf).toContain('./gradlew bundleRelease --no-daemon "-PbbVersionName=$VERSION_NAME" "-PbbVersionCode=$VERSION_CODE"');
    expect(wf).toContain('./gradlew assembleDebug --no-daemon "-PbbVersionName=$VERSION_NAME" "-PbbVersionCode=$VERSION_CODE"');
    expect(wf).toContain("VERSION_NAME: ${{ steps.version.outputs.versionName }}");
    expect(wf).toContain("VERSION_CODE: ${{ steps.version.outputs.versionCode }}");
    expect(wf).not.toContain("-PbbVersionCode=91300"); // never a literal: the version comes from package.json through the formula
  });
});

describe("M1 Goal 4: .github/workflows/android.yml (text checks: no runner, no SDK and no Gradle exist on the dev host)", () => {
  const wf = read(".github/workflows/android.yml");
  /** The workflow's lines with comments and blank lines dropped (a comment may name anything). */
  const lines = wf.split("\n").filter((l) => l.trim() !== "" && !l.trim().startsWith("#"));
  const body = lines.join("\n");
  const SECRETS = ["ANDROID_UPLOAD_KEYSTORE_BASE64", "ANDROID_UPLOAD_KEYSTORE_PASSWORD", "ANDROID_UPLOAD_KEY_ALIAS", "ANDROID_UPLOAD_KEY_PASSWORD"];

  /** The `on:` block's text: from `on:` to the next top-level key. */
  const onBlock = (): string => body.match(/^on:\n((?: {2}.*\n?)+)/m)?.[1] ?? "";

  it("runs only on workflow_dispatch (input `rebuild`, default 0) and on pushed tags android-v*: no branch push, no pull request, no schedule", () => {
    const on = onBlock();
    expect(on.length).toBeGreaterThan(0);
    expect([...on.matchAll(/^ {2}([\w_]+):/gm)].map((m) => m[1]).sort()).toEqual(["push", "workflow_dispatch"]);
    expect(on).toMatch(/workflow_dispatch:\n {4}inputs:\n {6}rebuild:/);
    expect(on).toMatch(/default: "0"/);
    expect(on).toMatch(/push:\n {4}tags:\n {6}- "android-v\*"\n?$/);
    expect(on).not.toMatch(/branches|pull_request|schedule|paths|workflow_run|release:/);
  });

  it("holds read-only permissions (contents: read), one job with a timeout, on one ubuntu-24.04 runner", () => {
    expect(body).toMatch(/^permissions:\n {2}contents: read\n(?=\w)/m);
    expect((body.match(/^ {2}\w+:\n {4}name:/gm) ?? []).length).toBe(1); // one job
    expect(body).toMatch(/timeout-minutes: \d+/);
    expect(body.match(/runs-on: (.+)/g)).toEqual(["runs-on: ubuntu-24.04"]);
    expect(body).not.toMatch(/write/); // no permission is raised anywhere
  });

  it("builds in the brief's order: checkout, Node 22 with the npm cache, Temurin 21, npm ci, build:app, cap sync, the version, then ./gradlew bundleRelease", () => {
    const at = (s: string): number => body.indexOf(s);
    const order = ["uses: actions/checkout@", "uses: actions/setup-node@", "uses: actions/setup-java@", "run: npm ci", "run: npm run build:app", "run: npx cap sync android", "scripts/android-version.mjs", "./gradlew bundleRelease"];
    for (const s of order) expect(at(s), s).toBeGreaterThan(-1);
    for (let i = 1; i < order.length; i++) expect(at(order[i]), `${order[i - 1]} before ${order[i]}`).toBeGreaterThan(at(order[i - 1]));
    expect(body).toMatch(/uses: actions\/setup-node@v\d+\n {8}with:\n {10}node-version: 22\n {10}cache: npm/);
    expect(body).toMatch(/uses: actions\/setup-java@v\d+\n {8}with:\n {10}distribution: temurin\n {10}java-version: "21"/);
    expect(body).toMatch(/working-directory: android\n(?: {8}env:\n(?: {10}.*\n)+)? {8}run: \.\/gradlew bundleRelease/);
  });

  it("uses only the official actions/* actions (and gradle/actions/wrapper-validation), each pinned to a major version; nothing third-party", () => {
    const uses = [...body.matchAll(/^\s+(?:- )?uses: (\S+)$/gm)].map((m) => m[1]);
    expect(uses.length).toBeGreaterThanOrEqual(5);
    for (const u of uses) expect(u, u).toMatch(/^(actions\/(checkout|setup-node|setup-java|upload-artifact)|gradle\/actions\/wrapper-validation)@v\d+$/);
    expect(uses.some((u) => u.startsWith("actions/upload-artifact@"))).toBe(true);
    expect(body).not.toMatch(/docker:\/\/|\.\/\.github\/actions|@main|@master|@latest/);
  });

  it("signs with the four upload-key secrets when all are set (a job-level flag: a step's `if:` cannot read secrets), and says UNSIGNED when not", () => {
    for (const s of SECRETS) expect(body, s).toContain(`secrets.${s}`);
    // the flag is made from all four, at the job level; the steps test the flag
    expect(body).toMatch(/^ {6}HAVE_UPLOAD_KEY: \$\{\{ (secrets\.\w+ != '' && ){3}secrets\.\w+ != '' \}\}$/m);
    for (const s of SECRETS) expect(body.match(/^ {6}HAVE_UPLOAD_KEY: .*$/m)![0], s).toContain(s);
    for (const m of body.matchAll(/^ {8}if: (.*)$/gm)) {
      expect(m[1], "an if: that reads a secret").not.toMatch(/secrets\./);
      expect(m[1]).toMatch(/env\.HAVE_UPLOAD_KEY/);
    }
    // the keystore is written to $RUNNER_TEMP with base64 in a run step, never by a third-party action, and deleted in an always() step
    expect(body).toMatch(/printf '%s' "\$KEYSTORE_BASE64" \| base64 --decode > "\$RUNNER_TEMP\/upload\.keystore"/);
    expect(body).toMatch(/if: always\(\) && env\.HAVE_UPLOAD_KEY == 'true'\n {8}run: rm -f "\$RUNNER_TEMP\/upload\.keystore"/);
    expect(body).toMatch(/jarsigner -keystore "\$RUNNER_TEMP\/upload\.keystore" -storepass:env STORE_PASSWORD -keypass:env KEY_PASSWORD/);
    // the unsigned path: an UNSIGNED release AAB, a debug APK, and the job summary says so
    expect(body).toContain("-release-UNSIGNED.aab");
    expect(body).toContain("./gradlew assembleDebug");
    expect(body).toMatch(/-debug\.apk/);
    expect(body).toMatch(/release AAB is UNSIGNED/);
    expect(body).toContain('>> "$GITHUB_STEP_SUMMARY"');
  });

  it("never echoes a secret, writes one into the repo or onto a command line, and never uploads to Google Play", () => {
    // a secret appears only as an `env:` value (NAME: ${{ secrets.X }}); never inside a run block
    for (const m of body.matchAll(/^.*secrets\..*$/gm)) {
      expect(m[0], "a secret outside an env: mapping").toMatch(/^ {6,10}[A-Z0-9_]+: \$\{\{ (secrets\.[A-Z0-9_]+ != '' && )*secrets\.[A-Z0-9_]+( != '')? \}\}$/);
    }
    // no echo line names a secret or its variable
    const printing = lines.filter((l) => /\b(echo|printf|cat|tee)\b/.test(l) && /secrets\.|PASSWORD|KEYSTORE_BASE64|KEY_ALIAS|\$KEY|\$STORE/.test(l));
    expect(printing.map((l) => l.trim())).toEqual([`printf '%s' "$KEYSTORE_BASE64" | base64 --decode > "$RUNNER_TEMP/upload.keystore"`]); // the one use: into base64, into the file
    for (const l of lines) if (/\b(echo|cat|tee)\b/.test(l)) expect(l, l).not.toMatch(/secrets\.|PASSWORD|KEYSTORE_BASE64|KEY_ALIAS|\$KEY|\$STORE/);
    expect(body).not.toMatch(/set -x|xtrace|-x\b.*bash|ACTIONS_STEP_DEBUG|add-mask/);
    // a password goes to jarsigner as an environment variable's name, never as its value
    expect(body).not.toMatch(/-storepass [^:]|-keypass [^:]|-storepass:env \$|-keypass:env \$/);
    // nothing talks to Play
    expect(body).not.toMatch(/upload-google-play|r0adkll|fastlane|supply|androidpublisher|play\.google|publishBundle|publishRelease/i);
    // and nothing is committed or pushed
    expect(body).not.toMatch(/git (push|commit|tag|add)|gh release|contents: write/);
  });

  it("names the artifact and the files with the versionName and the versionCode, and fails if there is nothing to upload", () => {
    expect(body).toContain("name: beltbattles-${{ steps.version.outputs.versionName }}-${{ steps.version.outputs.versionCode }}-android");
    expect(body).toContain("BeltBattles-${{ steps.version.outputs.versionName }}-${{ steps.version.outputs.versionCode }}-release.aab");
    expect(body).toContain("if-no-files-found: error");
    expect(body).toMatch(/path: dist-aab\/\*/);
  });
});
