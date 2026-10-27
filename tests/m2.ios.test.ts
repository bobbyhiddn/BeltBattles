// M2 (BRIEF-M2 Goals 1 and 4): text checks of the committed ios/ project: `cap add ios` (Capacitor 8.5.3, Swift Package Manager) plus M2's
// edits. There is no Mac, no Xcode and no Ruby on the dev host, so nothing here builds: each check reads a file and says what the first real
// build on a GitHub macOS runner will rely on. The workflows and the fastlane lane have their own files (m2.workflows, m2.fastlane).
import { describe, expect, it } from "vitest";
import { createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const ROOT = new URL("..", import.meta.url).pathname;
const read = (rel: string): string => readFileSync(join(ROOT, rel), "utf8");
const bytes = (rel: string): Buffer => Buffer.from(readFileSync(join(ROOT, rel)));
const sha = (b: Buffer): string => createHash("sha256").update(b).digest("hex");
const cfg = JSON.parse(read("capacitor.config.json")) as { appId: string; appName: string; backgroundColor: string; webDir: string; plugins: Record<string, Record<string, string>> };

/** Every file under `rel` (relative paths), depth first; [] where the folder is absent. `skip` names folders (relative) to leave out. */
function walk(rel: string, skip: readonly string[] = []): string[] {
  const abs = join(ROOT, rel);
  if (!existsSync(abs) || skip.includes(rel)) return [];
  const out: string[] = [];
  for (const name of readdirSync(abs).sort()) {
    const sub = `${rel}/${name}`;
    if (statSync(join(ROOT, sub)).isDirectory()) out.push(...walk(sub, skip));
    else out.push(sub);
  }
  return out;
}

const IOS = "ios";
const APP = "ios/App/App";
const PBX = "ios/App/App.xcodeproj/project.pbxproj";
const ASSETS = `${APP}/Assets.xcassets`;
/** What `cap sync ios` writes into ios/ (all gitignored): a developer's tree may hold them, the committed project does not. */
const GENERATED = ["ios/App/App/public", "ios/capacitor-cordova-ios-plugins"];

// ------------------------------------------------------------------ helpers: XML, plist, PNG, pbxproj

/** A well-formedness check for the XML here (the node test environment has no DOM parser): tags nest and close, attribute values are
 *  quoted, comments, CDATA and the declaration end, text holds only whole entities, one root. Throws with the line. */
function checkXml(text: string, name: string): void {
  let i = 0, line = 1, roots = 0;
  const stack: string[] = [];
  const fail = (msg: string): never => { throw new Error(`${name}:${line}: ${msg}`); };
  const skipTo = (end: string, what: string): void => {
    const j = text.indexOf(end, i);
    if (j < 0) fail(`${what} is never closed`);
    for (const ch of text.slice(i, j + end.length)) if (ch === "\n") line++;
    i = j + end.length;
  };
  while (i < text.length) {
    if (text[i] !== "<") {
      const j = text.indexOf("<", i);
      const seg = text.slice(i, j < 0 ? text.length : j);
      if (!stack.length && seg.trim() !== "") fail("text outside the root element");
      for (const m of seg.matchAll(/&(?!(amp|lt|gt|quot|apos|#\d+|#x[0-9a-fA-F]+);)/g)) fail(`a bare & at ${m.index}`);
      for (const ch of seg) if (ch === "\n") line++;
      i = j < 0 ? text.length : j;
      continue;
    }
    if (text.startsWith("<?", i)) skipTo("?>", "a declaration");
    else if (text.startsWith("<!--", i)) skipTo("-->", "a comment");
    else if (text.startsWith("<![CDATA[", i)) skipTo("]]>", "a CDATA section");
    else if (text.startsWith("<!", i)) skipTo(">", "a declaration");
    else if (text.startsWith("</", i)) {
      const m = /^<\/([A-Za-z_][\w:.-]*)\s*>/.exec(text.slice(i, i + 200));
      if (!m) fail("a bad closing tag");
      const open = stack.pop();
      if (open !== m![1]) fail(`</${m![1]}> closes <${open}>`);
      i += m![0].length;
    } else {
      const m = /^<([A-Za-z_][\w:.-]*)/.exec(text.slice(i, i + 200));
      if (!m) fail("a bad opening tag");
      i += m![0].length;
      for (;;) {
        const ws = /^\s*/.exec(text.slice(i, i + 50))![0];
        for (const ch of ws) if (ch === "\n") line++;
        i += ws.length;
        if (text.startsWith("/>", i)) { i += 2; if (!stack.length) roots++; break; }
        if (text[i] === ">") { i++; if (!stack.length) roots++; stack.push(m![1]); break; }
        const a = /^([A-Za-z_][\w:.-]*)\s*=\s*("[^"<]*"|'[^'<]*')/.exec(text.slice(i, i + 4000));
        if (!a) fail(`a bad attribute in <${m![1]}>`);
        for (const ch of a![0]) if (ch === "\n") line++;
        i += a![0].length;
      }
    }
  }
  if (stack.length) fail(`<${stack[stack.length - 1]}> is never closed`);
  if (roots !== 1) fail(`${roots} root elements`);
}

type Plist = string | number | boolean | Plist[] | { [key: string]: Plist };

/** An XML property list (Info.plist, PrivacyInfo.xcprivacy) as plain values: dict, array, string, integer, real, true, false. */
function parsePlist(xml: string, name: string): { [key: string]: Plist } {
  checkXml(xml, name);
  const body = xml.replace(/<\?xml[\s\S]*?\?>/, "").replace(/<!DOCTYPE[\s\S]*?>/, "").replace(/<!--[\s\S]*?-->/g, "").replace(/<plist[^>]*>/, "").replace(/<\/plist>/, "");
  const toks = [...body.matchAll(/<(\/?)([A-Za-z]+)(\s*\/?)>([^<]*)/g)].map((m) => ({ close: m[1] === "/", name: m[2], self: m[3].trim() === "/", text: m[4] }));
  const unesc = (s: string): string => s.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, "&");
  let i = 0;
  const value = (): Plist => {
    const t = toks[i++];
    if (!t || t.close) throw new Error(`${name}: unexpected end or </${t?.name}>`);
    switch (t.name) {
      case "true": return true;
      case "false": return false;
      case "string": { if (t.self) return ""; i++; return unesc(t.text); }
      case "integer": case "real": { i++; return Number(t.text); }
      case "array": {
        const out: Plist[] = [];
        if (t.self) return out;
        while (!(toks[i].close && toks[i].name === "array")) out.push(value());
        i++;
        return out;
      }
      case "dict": {
        const out: { [key: string]: Plist } = {};
        if (t.self) return out;
        while (!(toks[i].close && toks[i].name === "dict")) {
          const k = toks[i++];
          if (k.close || k.name !== "key") throw new Error(`${name}: a dict wants <key>, got <${k.name}>`);
          i++; // </key>
          out[unesc(k.text)] = value();
        }
        i++;
        return out;
      }
      default: throw new Error(`${name}: unsupported plist element <${t.name}>`);
    }
  };
  const root = value();
  if (typeof root !== "object" || Array.isArray(root)) throw new Error(`${name}: the root is not a dict`);
  if (i !== toks.length) throw new Error(`${name}: ${toks.length - i} tokens left over`);
  return root;
}

/** A PNG's IHDR (the 8-byte signature and the IHDR chunk checked). */
function ihdr(b: Buffer): { width: number; height: number; depth: number; colorType: number; interlace: number } {
  expect(b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))).toBe(true);
  expect(b.subarray(12, 16).toString("latin1")).toBe("IHDR");
  return { width: b.readUInt32BE(16), height: b.readUInt32BE(20), depth: b[24], colorType: b[25], interlace: b[28] };
}

const pbx = read(PBX);

/** Every object of the project file by id: one-line objects ({isa = PBXBuildFile; ...; };) and multi-line ones, as Xcode writes them. */
function pbxObjects(text: string): Map<string, string> {
  const out = new Map<string, string>();
  const body = text.slice(text.indexOf("objects = {"));
  for (const m of body.matchAll(/^\t\t([0-9A-F]{24})(?: \/\*[^*]*\*\/)? = (\{[^\n]*\};|\{\n[\s\S]*?\n\t\t\};)$/gm)) out.set(m[1], m[2]);
  return out;
}
const objects = pbxObjects(pbx);
const isa = (o: string): string => /\bisa = (\w+);/.exec(o)?.[1] ?? "";
/** The ids in `key = ( ... );` of one object. */
const idList = (o: string, key: string): string[] => [...(new RegExp(`\\b${key} = \\(([\\s\\S]*?)\\);`).exec(o)?.[1] ?? "").matchAll(/[0-9A-F]{24}/g)].map((m) => m[0]);
const idOf = (o: string, key: string): string => new RegExp(`\\b${key} = ([0-9A-F]{24})`).exec(o)?.[1] ?? "";
/** One build setting's value in an XCBuildConfiguration (quotes dropped), or undefined. */
const setting = (o: string, name: string): string | undefined => {
  const m = new RegExp(`\\b${name} = ([^;\\n]+);`).exec(o);
  return m ? m[1].trim().replace(/^"(.*)"$/, "$1") : undefined;
};
const appTarget = [...objects.entries()].find(([, o]) => isa(o) === "PBXNativeTarget" && /\bname = App;/.test(o));
const configsOf = (listId: string): string[] => idList(objects.get(listId) ?? "", "buildConfigurations").map((id) => objects.get(id) ?? "");

// ------------------------------------------------------------------ the project

describe("M2 Goal 1: ios/ is Capacitor 8.5.3's Swift Package Manager template (cap add ios), with the bundle id and name from capacitor.config.json", () => {
  it("is an SPM project: CapApp-SPM, no Podfile, no Pods, no App.xcworkspace (so fastlane and xcodebuild take App.xcodeproj)", () => {
    for (const rel of ["ios/App/CapApp-SPM/Package.swift", "ios/App/CapApp-SPM/Sources/CapApp-SPM/CapApp-SPM.swift", PBX, `${APP}/Info.plist`, `${APP}/AppDelegate.swift`, `${APP}/SceneDelegate.swift`, "ios/debug.xcconfig", "ios/.gitignore"]) {
      expect(existsSync(join(ROOT, rel)), rel).toBe(true);
    }
    for (const rel of ["ios/App/Podfile", "ios/App/Podfile.lock", "ios/App/Pods", "ios/App/App.xcworkspace"]) expect(existsSync(join(ROOT, rel)), rel).toBe(false);
    expect(pbx).toContain("XCLocalSwiftPackageReference");
    expect(pbx).toContain('relativePath = "CapApp-SPM"');
    expect(pbx).not.toMatch(/Pods|\[CP\]/);
  });

  it("CapApp-SPM/Package.swift is what `cap sync ios` writes: capacitor-swift-pm at exactly the pinned @capacitor/ios, iOS 15, and the two plugins the game uses", () => {
    const swift = read("ios/App/CapApp-SPM/Package.swift");
    const pkg = JSON.parse(read("package.json")) as { dependencies: Record<string, string> };
    expect(swift).toContain("// swift-tools-version: 5.9");
    expect(swift).toContain("platforms: [.iOS(.v15)]");
    expect(swift).toContain(`.package(url: "https://github.com/ionic-team/capacitor-swift-pm.git", exact: "${pkg.dependencies["@capacitor/ios"]}")`);
    expect(pkg.dependencies["@capacitor/ios"]).toBe(pkg.dependencies["@capacitor/core"]); // the platform and the core move together
    expect([...swift.matchAll(/\.package\(name: "(\w+)", path: "([^"]+)"\)/g)].map((m) => [m[1], m[2]])).toEqual([
      ["CapacitorApp", "../../../node_modules/@capacitor/app"],
      ["CapacitorPreferences", "../../../node_modules/@capacitor/preferences"],
    ]);
    expect([...swift.matchAll(/\.product\(name: "(\w+)", package: "([\w-]+)"\)/g)].map((m) => `${m[1]}@${m[2]}`)).toEqual([
      "Capacitor@capacitor-swift-pm", "Cordova@capacitor-swift-pm", "CapacitorApp@CapacitorApp", "CapacitorPreferences@CapacitorPreferences",
    ]);
  });

  it("the bundle id is the appId and the display name the appName, in both configurations of the App target (and nowhere is another id)", () => {
    expect(cfg.appId).toBe("com.bobbyhiddn.beltbattles");
    expect(appTarget, "the App target").toBeDefined();
    const listId = idOf(appTarget![1], "buildConfigurationList");
    const confs = configsOf(listId);
    expect(confs.map((c) => /\bname = (\w+);/.exec(c)?.[1])).toEqual(["Debug", "Release"]);
    for (const c of confs) expect(setting(c, "PRODUCT_BUNDLE_IDENTIFIER")).toBe(cfg.appId);
    expect([...pbx.matchAll(/PRODUCT_BUNDLE_IDENTIFIER = ([^;]+);/g)].map((m) => m[1])).toEqual([cfg.appId, cfg.appId]);
    const info = parsePlist(read(`${APP}/Info.plist`), "Info.plist");
    expect(info.CFBundleDisplayName).toBe(cfg.appName);
    expect(info.CFBundleIdentifier).toBe("$(PRODUCT_BUNDLE_IDENTIFIER)");
    expect(info.CFBundleName).toBe("$(PRODUCT_NAME)"); // the product stays App.app: the workflows and fastlane say App
    expect(setting(confs[0], "PRODUCT_NAME")).toBe("$(TARGET_NAME)");
  });

  it("iPhone only: TARGETED_DEVICE_FAMILY is 1 in every configuration of the App target, and no iPad key is left in Info.plist", () => {
    const confs = configsOf(idOf(appTarget![1], "buildConfigurationList"));
    for (const c of confs) expect(setting(c, "TARGETED_DEVICE_FAMILY")).toBe("1");
    expect([...pbx.matchAll(/TARGETED_DEVICE_FAMILY = ([^;]+);/g)].map((m) => m[1])).toEqual(["1", "1"]);
    expect(pbx).not.toMatch(/TARGETED_DEVICE_FAMILY = "?[0-9,]*2/);
    const info = parsePlist(read(`${APP}/Info.plist`), "Info.plist");
    expect(Object.keys(info).filter((k) => k.includes("~ipad"))).toEqual([]);
    expect(info.UIDeviceFamily).toBeUndefined();
  });

  it("portrait and both landscapes on iPhone (the game lays out for both), as the CAPBridgeViewController reads them", () => {
    const info = parsePlist(read(`${APP}/Info.plist`), "Info.plist");
    expect(info.UISupportedInterfaceOrientations).toEqual(["UIInterfaceOrientationPortrait", "UIInterfaceOrientationLandscapeLeft", "UIInterfaceOrientationLandscapeRight"]);
    const vc = read("node_modules/@capacitor/ios/Capacitor/Capacitor/CAPBridgeViewController.swift");
    expect(vc).toContain('plist["UISupportedInterfaceOrientations"] as? [String]'); // the plugin's own view controller reads this key
  });

  it("versions: the project keeps the template's MARKETING_VERSION 1.0 and CURRENT_PROJECT_VERSION 1 (the workflow sets the real ones), and Info.plist reads both through $(...)", () => {
    const confs = configsOf(idOf(appTarget![1], "buildConfigurationList"));
    for (const c of confs) {
      expect(setting(c, "MARKETING_VERSION")).toBe("1.0");
      expect(setting(c, "CURRENT_PROJECT_VERSION")).toBe("1");
      expect(setting(c, "INFOPLIST_FILE")).toBe("App/Info.plist");
      expect(setting(c, "VERSIONING_SYSTEM")).toBeUndefined(); // no apple-generic: xcargs set the numbers, not agvtool
    }
    const info = parsePlist(read(`${APP}/Info.plist`), "Info.plist");
    expect(info.CFBundleShortVersionString).toBe("$(MARKETING_VERSION)");
    expect(info.CFBundleVersion).toBe("$(CURRENT_PROJECT_VERSION)");
  });

  it("the deployment target is iOS 15.0 everywhere (Capacitor 8's floor; Apple takes iOS 13+ now and 15+ from April 2027), and SPM's matches it", () => {
    expect([...pbx.matchAll(/IPHONEOS_DEPLOYMENT_TARGET = ([^;]+);/g)].map((m) => m[1])).toEqual(["15.0", "15.0", "15.0", "15.0"]);
    expect(read("ios/App/CapApp-SPM/Package.swift")).toContain(".iOS(.v15)");
  });

  it("Info.plist: export compliance says false (so TestFlight asks nothing per build), and no ATS exception, no usage description, no tracking, no app-bound domains", () => {
    const info = parsePlist(read(`${APP}/Info.plist`), "Info.plist");
    expect(info.ITSAppUsesNonExemptEncryption).toBe(false);
    expect(info.ITSEncryptionExportComplianceCode).toBeUndefined();
    expect(info.NSAppTransportSecurity).toBeUndefined();
    expect(Object.keys(info).filter((k) => /UsageDescription$/.test(k))).toEqual([]);
    expect(info.NSUserTrackingUsageDescription).toBeUndefined();
    expect(info.WKAppBoundDomains).toBeUndefined();
    expect(info.LSRequiresIPhoneOS).toBe(true);
    expect(info.UILaunchStoryboardName).toBe("LaunchScreen");
    // the plain-text file says it too (a key spelled in a comment would not parse as the key)
    expect(read(`${APP}/Info.plist`)).not.toMatch(/NSAppTransportSecurity|NSAllowsArbitraryLoads|WKAppBoundDomains/);
  });

  it("export compliance is right: the client only signs (ECDSA P-256, SHA-256 through the OS's WebCrypto) and talks HTTPS through the system; it never encrypts or decrypts", () => {
    const files = walk("src").filter((f) => /\.(ts|js|mjs)$/.test(f));
    const SUBTLE = ["decrypt", "deriveBits", "deriveKey", "digest", "encrypt", "exportKey", "generateKey", "importKey", "sign", "unwrapKey", "verify", "wrapKey"];
    const used = new Set<string>();
    for (const f of files) {
      const text = read(f).replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
      // identity.ts calls WebCrypto as `subtle.x(...)` and, through the alias `const crypto = subtle`, as `crypto.x(...)`
      for (const m of text.matchAll(/\b(?:subtle|crypto)\.(\w+)\(/g)) if (SUBTLE.includes(m[1])) used.add(m[1]);
      expect(text, `${f}: a cipher`).not.toMatch(/\b(createCipher|createCipheriv|createDecipher|AES-GCM|AES-CBC|AES-CTR|RSA-OAEP|crypto-js|tweetnacl)\b/);
      expect(text, `${f}: encrypt, decrypt, wrapKey or deriveKey`).not.toMatch(/\.(encrypt|decrypt|wrapKey|unwrapKey|deriveKey|deriveBits)\(/);
    }
    // sign and verify (authentication), a SHA-256 digest (the player id) and key import, export and generation: nothing that hides data
    expect([...used].sort()).toEqual(["digest", "exportKey", "generateKey", "importKey", "sign", "verify"]);
    // no third-party crypto in the package: the only runtime dependencies are Capacitor's
    const pkg = JSON.parse(read("package.json")) as { dependencies: Record<string, string> };
    for (const name of Object.keys(pkg.dependencies)) expect(name, name).toMatch(/^@capacitor\//);
  });

  it("the status bar needs nothing in Info.plist: Capacitor's view controller answers preferredStatusBarStyle itself, SystemBars maps DARK to light content, and the config says DARK", () => {
    const info = parsePlist(read(`${APP}/Info.plist`), "Info.plist");
    // view-controller-based appearance must stay on (true, the template's value): the plugin works through the view controller's override
    expect(info.UIViewControllerBasedStatusBarAppearance).toBe(true);
    const vc = read("node_modules/@capacitor/ios/Capacitor/Capacitor/CAPBridgeViewController.swift");
    expect(vc).toMatch(/override open var preferredStatusBarStyle: UIStatusBarStyle \{\s*return statusBarStyle\s*\}/);
    const bars = read("node_modules/@capacitor/ios/Capacitor/Capacitor/Plugins/SystemBars.swift");
    expect(bars).toMatch(/case \.dark:\s*newStyle = \.lightContent/);
    expect(bars).toContain('getConfig().getString("style", "DEFAULT")');
    expect(cfg.plugins.SystemBars.style).toBe("DARK");
    expect(info.UIStatusBarStyle).toBeUndefined();
    expect(info.UIStatusBarHidden).toBeUndefined();
  });

  it("safe areas: Capacitor's WebView is not inset by iOS (contentInset defaults to never), the config sets no ios block, and the page pads itself from env(safe-area-inset-*)", () => {
    expect(read("node_modules/@capacitor/ios/Capacitor/Capacitor/CAPInstanceDescriptor.m")).toContain("_contentInsetAdjustmentBehavior = UIScrollViewContentInsetAdjustmentNever;");
    expect(Object.keys(cfg)).not.toContain("ios");
    expect(read("capacitor.config.json")).not.toMatch(/contentInset/);
    const html = read("index.html");
    expect(html).toContain("viewport-fit=cover");
    expect(html).toContain("padding-top: max(env(safe-area-inset-top, 0px), var(--safe-area-inset-top, 0px));");
    expect(html).toContain("padding-bottom: max(env(safe-area-inset-bottom, 0px), var(--safe-area-inset-bottom, 0px));");
  });

  it("the app's origin on iOS is capacitor://localhost (no server block), which is the origin M1 named for BB_GHOST_ORIGINS; there is no service worker, so no app-bound domains", () => {
    const desc = read("node_modules/@capacitor/ios/Capacitor/Capacitor/CAPInstanceDescriptor.swift");
    expect(desc).toContain('public static let scheme = "capacitor"');
    expect(desc).toContain('public static let hostname = "localhost"');
    expect("server" in cfg).toBe(false);
    expect(read("node_modules/@capacitor/ios/Capacitor/Capacitor/CAPInstanceDescriptor.m")).toContain("_limitsNavigationsToAppBoundDomains = FALSE;"); // WKAppBoundDomains would need it true
    for (const f of walk("src").filter((x) => x.endsWith(".ts"))) expect(read(f), f).not.toMatch(/serviceWorker/);
    expect(read("index.html")).not.toMatch(/serviceWorker|rel="manifest"/);
  });

  it("M1's boot works on iOS as written: Preferences is UserDefaults, @capacitor/app reports appStateChange on iOS, and backButton never fires there (the listener is harmless)", () => {
    const boot = read("src/native/boot.ts");
    expect(boot).toContain('import("@capacitor/preferences")');
    expect(boot).toContain('App.addListener("appStateChange"');
    expect(boot).toContain('App.addListener("backButton"');
    expect(boot).toContain("Capacitor.isNativePlatform()");
    const appPlugin = read("node_modules/@capacitor/app/ios/Sources/AppPlugin/AppPlugin.swift");
    expect(appPlugin).toContain('notifyListeners("appStateChange"');
    expect(appPlugin).not.toMatch(/backButton/);
    expect(read("node_modules/@capacitor/preferences/ios/Sources/PreferencesPlugin/Preferences.swift")).toContain("UserDefaults.standard");
  });
});

describe("M2 Goal 1: the project file (project.pbxproj) is consistent, and lists the privacy manifest in the App target's resources", () => {
  it("the braces and parentheses balance, and every 24-digit id it mentions is an object it defines", () => {
    expect(pbx.split("{").length).toBe(pbx.split("}").length);
    expect(pbx.split("(").length).toBe(pbx.split(")").length);
    expect(pbx.startsWith("// !$*UTF8*$!\n{")).toBe(true);
    const mentioned = new Set(pbx.match(/\b[0-9A-F]{24}\b/g));
    for (const id of mentioned) expect(objects.has(id), `${id} is not an object`).toBe(true);
    expect(objects.size).toBeGreaterThan(30);
    // every id is defined once
    const heads = [...pbx.matchAll(/^\t\t([0-9A-F]{24})(?: \/\*[^*]*\*\/)? = \{/gm)].map((m) => m[1]);
    expect(new Set(heads).size).toBe(heads.length);
    expect(heads.length).toBe(objects.size);
    expect(idOf(pbx, "rootObject")).toBe([...objects.entries()].find(([, o]) => isa(o) === "PBXProject")![0]);
  });

  it("PrivacyInfo.xcprivacy is a file of the App group and in the App target's Resources phase, through a build file that points at it", () => {
    expect(appTarget).toBeDefined();
    const phases = idList(appTarget![1], "buildPhases").map((id) => [id, objects.get(id) ?? ""] as const);
    const resources = phases.find(([, o]) => isa(o) === "PBXResourcesBuildPhase");
    expect(resources, "a Resources phase").toBeDefined();
    // a file reference is named by its path, a variant group (the two storyboards) by its name
    const label = (o: string): string => /\bpath = ([^;]+);/.exec(o)?.[1] ?? /\bname = ([^;]+);/.exec(o)?.[1] ?? "?";
    const names = idList(resources![1], "files").map((id) => {
      const bf = objects.get(id) ?? "";
      expect(isa(bf), id).toBe("PBXBuildFile");
      return label(objects.get(idOf(bf, "fileRef")) ?? "");
    });
    expect(names).toContain("PrivacyInfo.xcprivacy");
    expect(names.filter((n) => n === "PrivacyInfo.xcprivacy")).toHaveLength(1);
    expect(names.sort()).toEqual(["Assets.xcassets", "LaunchScreen.storyboard", "Main.storyboard", "PrivacyInfo.xcprivacy", "capacitor.config.json", "config.xml", "public"].sort());
    // the file reference sits in the App group (next to Info.plist), and is not a build setting only
    const group = [...objects.values()].find((o) => isa(o) === "PBXGroup" && /\bpath = App;/.test(o));
    expect(group, "the App group").toBeDefined();
    const ref = [...objects.entries()].find(([, o]) => isa(o) === "PBXFileReference" && /\bpath = PrivacyInfo\.xcprivacy;/.test(o));
    expect(ref).toBeDefined();
    expect(idList(group!, "children")).toContain(ref![0]);
    expect(existsSync(join(ROOT, APP, "PrivacyInfo.xcprivacy"))).toBe(true);
  });

  it("sources are the two template Swift files only (no plugin source in the App target), and the debug.xcconfig base configuration is Debug's only", () => {
    const phases = idList(appTarget![1], "buildPhases").map((id) => objects.get(id) ?? "");
    const sources = phases.find((o) => isa(o) === "PBXSourcesBuildPhase")!;
    const names = idList(sources, "files").map((id) => /\bpath = ([^;]+);/.exec(objects.get(idOf(objects.get(id) ?? "", "fileRef")) ?? "")?.[1]);
    expect(names.sort()).toEqual(["AppDelegate.swift", "SceneDelegate.swift"]);
    const confs = configsOf(idOf(appTarget![1], "buildConfigurationList"));
    expect(/baseConfigurationReference/.test(confs[0])).toBe(true);
    expect(/baseConfigurationReference/.test(confs[1])).toBe(false);
    expect(read("ios/debug.xcconfig").trim()).toBe("CAPACITOR_DEBUG = true"); // Release has no CAPACITOR_DEBUG: a store build is not web-inspectable
  });

  it("the signing style is the template's automatic one in the committed project (the signed lane switches it on the runner with update_code_signing_settings); no team or profile is committed", () => {
    expect(pbx).not.toMatch(/DEVELOPMENT_TEAM|PROVISIONING_PROFILE|CODE_SIGN_ENTITLEMENTS/);
    const confs = configsOf(idOf(appTarget![1], "buildConfigurationList"));
    for (const c of confs) expect(setting(c, "CODE_SIGN_STYLE")).toBe("Automatic");
  });

  it("a shared scheme App exists, so xcodebuild and fastlane can say -scheme App on a fresh checkout (Xcode creates missing schemes only in the IDE)", () => {
    const rel = "ios/App/App.xcodeproj/xcshareddata/xcschemes/App.xcscheme";
    const xml = read(rel);
    checkXml(xml, rel);
    const target = appTarget![0];
    const refs = [...xml.matchAll(/BlueprintIdentifier = "([0-9A-F]{24})"/g)].map((m) => m[1]);
    expect(refs.length).toBeGreaterThanOrEqual(1);
    for (const id of refs) expect(id).toBe(target);
    expect(xml).toContain('BuildableName = "App.app"');
    expect(xml).toContain('BlueprintName = "App"');
    expect(xml).toContain('ReferencedContainer = "container:App.xcodeproj"');
    expect(xml).toMatch(/<ArchiveAction\s+buildConfiguration = "Release"/);
    expect(xml).toMatch(/<LaunchAction\s+buildConfiguration = "Debug"/);
  });

  it("ios/.gitignore keeps what `cap sync ios` and Xcode generate out of git: the copied web build, the generated config, Pods, DerivedData, xcuserdata, build output", () => {
    const lines = read("ios/.gitignore").split("\n");
    for (const line of ["App/build", "App/Pods", "App/output", "App/App/public", "DerivedData", "xcuserdata", "capacitor-cordova-ios-plugins", "App/App/capacitor.config.json", "App/App/config.xml"]) expect(lines, line).toContain(line);
    const spm = read("ios/App/CapApp-SPM/.gitignore").split("\n");
    for (const line of ["/.build", "/Packages", "xcuserdata/", "DerivedData/"]) expect(spm, line).toContain(line);
  });
});

// ------------------------------------------------------------------ the privacy manifest

describe("M2 Goal 1: PrivacyInfo.xcprivacy declares what the app uses and sends, and nothing else", () => {
  const manifest = parsePlist(read(`${APP}/PrivacyInfo.xcprivacy`), "PrivacyInfo.xcprivacy");

  it("tracking is off with no tracking domains, and the file holds exactly the four privacy keys", () => {
    expect(Object.keys(manifest).sort()).toEqual(["NSPrivacyAccessedAPITypes", "NSPrivacyCollectedDataTypes", "NSPrivacyTracking", "NSPrivacyTrackingDomains"]);
    expect(manifest.NSPrivacyTracking).toBe(false);
    expect(manifest.NSPrivacyTrackingDomains).toEqual([]);
  });

  it("the one required-reason API is UserDefaults with reason CA92.1 (@capacitor/preferences keeps the identity mirror there): the app's own data, read and written by the app only", () => {
    expect(manifest.NSPrivacyAccessedAPITypes).toEqual([{ NSPrivacyAccessedAPIType: "NSPrivacyAccessedAPICategoryUserDefaults", NSPrivacyAccessedAPITypeReasons: ["CA92.1"] }]);
  });

  it("it collects, linked to the player and never for tracking, for app functionality only: the player ID, the chosen name and the gameplay content (uploaded builds and the profile)", () => {
    const purpose = ["NSPrivacyCollectedDataTypePurposeAppFunctionality"];
    expect(manifest.NSPrivacyCollectedDataTypes).toEqual(
      ["NSPrivacyCollectedDataTypeUserID", "NSPrivacyCollectedDataTypeName", "NSPrivacyCollectedDataTypeGameplayContent"].map((t) => ({
        NSPrivacyCollectedDataType: t,
        NSPrivacyCollectedDataTypeLinked: true,
        NSPrivacyCollectedDataTypeTracking: false,
        NSPrivacyCollectedDataTypePurposes: purpose,
      })),
    );
  });

  it("the manifest rests on facts read in the code: neither plugin ships a manifest, Capacitor's own two declare nothing, and UserDefaults is the only required-reason API in the iOS sources", () => {
    const base = "node_modules/@capacitor";
    expect(existsSync(join(ROOT, base)), "run npm ci first").toBe(true);
    const manifests = walk(base).filter((f) => f.endsWith(".xcprivacy"));
    expect(manifests.sort()).toEqual([`${base}/ios/Capacitor/Capacitor/PrivacyInfo.xcprivacy`, `${base}/ios/CapacitorCordova/CapacitorCordova/PrivacyInfo.xcprivacy`]);
    for (const f of manifests) {
      const m = parsePlist(read(f), f);
      expect(m.NSPrivacyAccessedAPITypes, f).toEqual([]);
      expect(m.NSPrivacyCollectedDataTypes, f).toEqual([]);
      expect(m.NSPrivacyTracking, f).toBe(false);
    }
    // Apple's categories (developer.apple.com/documentation/bundleresources/app-privacy-configuration/nsprivacyaccessedapitypes/nsprivacyaccessedapitype, read 2026-10-27)
    // case-insensitive, so the Objective-C spellings (NSFileModificationDate, NSURLContentModificationDateKey, NSFileSystemFreeSize) are caught as well as Swift's
    const APIS: Record<string, RegExp> = {
      fileTimestamp: /modificationdate|creationdate|\b(getattrlist|getattrlistbulk|fgetattrlist|getattrlistat|stat|fstat|fstatat|lstat)\s*\(/i,
      systemBootTime: /\bsystemUptime\b|\bmach_absolute_time\b/i,
      diskSpace: /volumeavailablecapacity|volumetotalcapacity|systemfreesize|\bsystemsize\b|\b(statfs|statvfs|fstatfs|fstatvfs)\s*\(/i,
      activeKeyboards: /\bactiveInputModes\b/i,
      userDefaults: /\bUserDefaults\b/,
    };
    const sources = [...walk(`${base}/ios`), ...walk(`${base}/app/ios`), ...walk(`${base}/preferences/ios`), ...walk(APP)].filter((f) => /\.(swift|m|h)$/.test(f) && !/\/Tests\//.test(f));
    expect(sources.length).toBeGreaterThan(60);
    const hits: string[] = [];
    for (const f of sources) {
      const text = read(f).replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
      for (const [name, re] of Object.entries(APIS)) if (re.test(text)) hits.push(`${name}: ${f}`);
    }
    expect(hits.sort()).toEqual([
      `userDefaults: ${base}/preferences/ios/Sources/PreferencesPlugin/Preferences.swift`,
      `userDefaults: ${base}/preferences/ios/Sources/PreferencesPlugin/PreferencesPlugin.swift`,
    ]);
  });
});

// ------------------------------------------------------------------ the art

/** SHA-256 of the 4 PNGs `cap add ios` wrote (the template at commit 5683e5a: the icon, and the three identical splash slots). */
const TEMPLATE_PNG_SUMS: Record<string, string> = {
  "29e4777e319de3ee5a52c3a8004ec19d0568414004257e36d7c94a077d71c93b": "AppIcon-512@2x.png (1024 x 1024, 110,522 bytes)",
  "1b5002b74a5500e697298ced06ca2811ac33f2771f236f3c720ff23243890530": "splash-2732x2732.png, -1 and -2 (2732 x 2732, 41,273 bytes each)",
};

describe("M2 Goal 1: the art is M3's, byte for byte, and no template picture is left", () => {
  const icon = `${ASSETS}/AppIcon.appiconset/AppIcon-512@2x.png`;
  const slots = ["splash-2732x2732.png", "splash-2732x2732-1.png", "splash-2732x2732-2.png"].map((n) => `${ASSETS}/Splash.imageset/${n}`);

  it("the AppIcon is store/icon-1024.png: the same bytes, 1024 x 1024, RGB with no alpha channel, in the template's one universal 1024 slot", () => {
    expect(bytes(icon).equals(bytes("store/icon-1024.png"))).toBe(true);
    expect(ihdr(bytes(icon))).toEqual({ width: 1024, height: 1024, depth: 8, colorType: 2, interlace: 0 }); // colour type 2 is RGB: no alpha
    const contents = JSON.parse(read(`${ASSETS}/AppIcon.appiconset/Contents.json`)) as { images: Record<string, string>[]; info: Record<string, unknown> };
    expect(contents.images).toEqual([{ filename: "AppIcon-512@2x.png", idiom: "universal", platform: "ios", size: "1024x1024" }]);
    expect(contents.info).toEqual({ author: "xcode", version: 1 });
    expect(walk(`${ASSETS}/AppIcon.appiconset`).map((f) => f.split("/").pop()).sort()).toEqual(["AppIcon-512@2x.png", "Contents.json"]);
  });

  it("every slot of the Splash image set is store/splash-2732.png: the same bytes, 2732 x 2732 RGB; the set keeps the template's three slots", () => {
    for (const s of slots) {
      expect(bytes(s).equals(bytes("store/splash-2732.png")), s).toBe(true);
      expect(ihdr(bytes(s))).toEqual({ width: 2732, height: 2732, depth: 8, colorType: 2, interlace: 0 });
    }
    const contents = JSON.parse(read(`${ASSETS}/Splash.imageset/Contents.json`)) as { images: { idiom: string; filename: string; scale: string }[] };
    expect(contents.images.map((i) => [i.scale, i.filename, i.idiom])).toEqual([
      ["1x", "splash-2732x2732-2.png", "universal"], ["2x", "splash-2732x2732-1.png", "universal"], ["3x", "splash-2732x2732.png", "universal"],
    ]);
    expect(walk(`${ASSETS}/Splash.imageset`).map((f) => f.split("/").pop()).sort()).toEqual(["Contents.json", "splash-2732x2732-1.png", "splash-2732x2732-2.png", "splash-2732x2732.png"]);
    for (const f of [`${ASSETS}/Contents.json`, `${ASSETS}/AppIcon.appiconset/Contents.json`, `${ASSETS}/Splash.imageset/Contents.json`]) expect(() => JSON.parse(read(f)), f).not.toThrow();
  });

  it("no template picture is left: none of the 4 PNGs `cap add ios` wrote (2 different ones) matches any file under ios/", () => {
    expect(Object.keys(TEMPLATE_PNG_SUMS)).toHaveLength(2);
    const files = walk(IOS, GENERATED);
    expect(files.length).toBeGreaterThan(15);
    const pngs = files.filter((f) => /\.(png|jpe?g|gif|webp|svg|pdf|heic)$/i.test(f));
    expect(pngs.sort()).toEqual([icon, ...slots].sort()); // the icon and the three splash slots are all the pictures there are
    for (const f of files) expect(TEMPLATE_PNG_SUMS[sha(bytes(f))], `${f} is a template picture`).toBeUndefined();
  });

  it("the launch screen is #050B12 (sRGB), the page's own colour, so nothing white flashes at launch; the splash image sits on the same colour", () => {
    const rel = `${APP}/Base.lproj/LaunchScreen.storyboard`;
    const xml = read(rel);
    checkXml(xml, rel);
    const view = /<imageView key="view"[^>]*image="Splash"[\s\S]*?<\/imageView>/.exec(xml)?.[0] ?? "";
    expect(view).not.toBe("");
    const color = /<color key="backgroundColor" red="([\d.]+)" green="([\d.]+)" blue="([\d.]+)" alpha="1" colorSpace="custom" customColorSpace="sRGB"\/>/.exec(view);
    expect(color, "an sRGB background colour on the view").not.toBeNull();
    const hex = [1, 2, 3].map((i) => Math.round(Number(color![i]) * 255).toString(16).padStart(2, "0")).join("").toUpperCase();
    expect(`#${hex}`).toBe(cfg.backgroundColor);
    expect(`#${hex}`).toBe("#050B12");
    expect(view).not.toMatch(/systemBackgroundColor|white="1"/);
    // the colour is the same as the Android window's, the config's and the page's
    expect(read("index.html").toLowerCase()).toContain("background: #050b12;");
    expect(xml).toContain('image="Splash"');
    expect(xml).toContain('<image name="Splash" width="1366" height="1366"/>');
  });

  it("the XML checker rejects what it should, and the plist reader reads what Apple writes (a mismatched tag, a bare &, two roots, an unclosed comment; dict, array, true, false, real, empty array)", () => {
    expect(() => checkXml("<a><b></a></b>", "x")).toThrow(/closes/);
    expect(() => checkXml("<a>fish & chips</a>", "x")).toThrow(/bare &/);
    expect(() => checkXml("<a/><b/>", "x")).toThrow(/2 root/);
    expect(() => checkXml("<a><!-- </a>", "x")).toThrow(/never closed/);
    const sample = '<?xml version="1.0" encoding="UTF-8"?>\n<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">\n<plist version="1.0"><dict><key>a</key><true/><key>b</key><array><string>x &amp; y</string><real>1.5</real></array><key>c</key><array/><key>d</key><dict><key>e</key><false/></dict></dict></plist>';
    expect(parsePlist(sample, "sample")).toEqual({ a: true, b: ["x & y", 1.5], c: [], d: { e: false } });
    expect(() => parsePlist("<plist><array/></plist>", "x")).toThrow(/not a dict/);
  });
});
