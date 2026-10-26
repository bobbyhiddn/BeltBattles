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

  it("keeps the template's 26 default PNGs (launcher icons and splash: the real art is job M3's) and adds no other image", () => {
    const images = walk(RES).filter((f) => /\.(png|jpe?g|webp|gif|svg)$/i.test(f));
    expect(images.length).toBe(26);
    expect(images.filter((f) => /ic_launcher(_foreground|_round)?\.png$/.test(f)).length).toBe(15);
    expect(images.filter((f) => /splash\.png$/.test(f)).length).toBe(11);
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
