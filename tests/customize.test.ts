// CUSTOM-2a (REQ-BFG-072): the CUSTOMIZE screen's choices (src/screens/customize.ts CustomizeState) and its frame
// (customizeLayout, customizeScale): one tap on an open row wears it; a locked row previews but doesn't wear; BACK and a
// tab restore what you wear; the choice persists; the rows are a finger tall, the PREVIEW band covers no machinery,
// turret or plate (R7), and every target is a finger's on the touchcheck phones.
import { describe, expect, it } from "vitest";
import { computeView } from "../src/core/io";
import { CustomizeState, FOOTER, PREVIEW_NOTE, ROW_H, WANT_H, customizeLayout, customizeScale } from "../src/screens/customize";
import { PROFILE_KEY, emptyProfile, foldDusk, foldEnd, loadProfile, playerSkin, saveProfile, unseen, type RunFacts } from "../src/game/profile";
import { textWidth, wrap } from "../src/render/font";
import { BELTS, DEFAULT_SKIN, FLOORS, PANELS, styleKey } from "../src/render/styles";
import { TAP_CSS, isPhone, tapPx } from "../src/ui/tap";

function mem(): Storage & { keys(): string[] } {
  const m = new Map<string, string>();
  return {
    get length() { return m.size; }, clear: () => m.clear(), key: (i: number) => [...m.keys()][i] ?? null,
    getItem: (k: string) => (m.has(k) ? m.get(k)! : null), setItem: (k: string, v: string) => void m.set(k, String(v)),
    removeItem: (k: string) => void m.delete(k), keys: () => [...m.keys()].sort(),
  };
}
const facts = (o: Partial<RunFacts> = {}): RunFacts => ({ runId: "r1", hero: "furnace", day: 2, over: null, flawless: false, belts: 1, ...o });

/** A player some runs in: TIMBER DECK and TREAD PLATE open (4 dusk wins, day 5), VERDIGRIS belts (2 runs); the rest locked. */
function player(st: Storage): ReturnType<typeof loadProfile> {
  const p = loadProfile(st);
  for (let d = 1; d <= 4; d++) foldDusk(p, facts({ day: d + 1 }), d, "win");
  foldEnd(p, facts({ over: "lost", day: 5 }));
  foldEnd(p, facts({ runId: "r2", over: null, day: 1 }));
  saveProfile(p, st);
  return loadProfile(st);
}

describe("CUSTOM-2a CUSTOMIZE: the choices", () => {
  it("one tap on an open row wears it, saved at once; the default is always open", () => {
    const st = mem();
    const s = new CustomizeState(player(st), st);
    expect(s.tab).toBe("floor");
    expect(s.worn).toEqual(DEFAULT_SKIN);
    expect(s.tapRow("timber")).toBe("worn");
    expect(s.worn.floor).toBe("timber");
    expect(s.preview.floor).toBe("timber");
    expect(s.previewLocked()).toBe(false);
    expect(JSON.parse(st.getItem(PROFILE_KEY)!).chosen.floor).toBe("timber"); // saved at once
    s.tapTab("belt");
    expect(s.tapRow("verdigris")).toBe("worn");
    expect(playerSkin(st)).toEqual({ floor: "timber", belt: "verdigris", panel: "slate" });
    s.tapTab("floor");
    expect(s.tapRow("plate")).toBe("worn");
    expect(playerSkin(st).floor).toBe("plate");
    expect(s.tapRow("nope")).toBe("none");
  });

  it("a tap on a locked row previews it but doesn't wear it; another row, a tab or BACK restores what you wear", () => {
    const st = mem();
    const s = new CustomizeState(player(st), st);
    s.tapRow("tread");
    const before = st.getItem(PROFILE_KEY);
    expect(s.tapRow("rune")).toBe("preview"); // RUNE STONE: FINISH WITH 3 DIFFERENT HEROES, 0/3
    expect(s.preview.floor).toBe("rune");
    expect(s.previewLocked()).toBe(true);
    expect(s.worn.floor).toBe("tread"); // not worn
    expect(st.getItem(PROFILE_KEY)).toBe(before); // nothing saved
    expect(playerSkin(st).floor).toBe("tread");
    s.back(); // BACK (and ESC)
    expect(s.pick).toBe("tread");
    expect(s.previewLocked()).toBe(false);
    s.tapRow("checker");
    expect(s.previewLocked()).toBe(true);
    s.tapTab("panel"); // another tab: its preview is what you wear
    expect(s.preview).toEqual({ floor: "tread", belt: "iron", panel: "slate" });
    s.tapTab("floor");
    expect(s.pick).toBe("tread");
    s.tapRow("checker");
    s.tapRow("timber"); // another row: an open one, worn
    expect(s.worn.floor).toBe("timber");
  });

  it("the choice persists: a new visit (and the views' playerSkin) reads it back; a locked choice is never worn", () => {
    const st = mem();
    const s = new CustomizeState(player(st), st);
    s.tapRow("timber");
    const again = new CustomizeState(loadProfile(st), st);
    expect(again.worn.floor).toBe("timber");
    expect(again.pick).toBe("timber");
    expect(playerSkin(st)).toEqual({ ...DEFAULT_SKIN, floor: "timber" });
    // a stored choice that isn't open (an edited key) is worn as the default
    const raw = JSON.parse(st.getItem(PROFILE_KEY)!);
    raw.chosen.panel = "plum";
    st.setItem(PROFILE_KEY, JSON.stringify(raw));
    expect(playerSkin(st).panel).toBe("slate");
  });

  it("rows: five per tab, the default first; locked ones show progress (9/60 fills 15%); NEW until the screen is seen", () => {
    const st = mem();
    const p = player(st);
    expect(unseen(p).length).toBeGreaterThan(0);
    const s = new CustomizeState(p, st);
    expect(unseen(loadProfile(st))).toEqual([]); // opening the screen marks them seen: the title's NEW dot goes
    for (const [tab, list] of [["floor", FLOORS], ["belt", BELTS], ["panel", PANELS]] as const) {
      s.tapTab(tab);
      const rows = s.rows();
      expect(rows.map((r) => r.style.id)).toEqual(list.map((x) => x.id));
      expect(rows[0].open && rows[0].worn).toBe(true);
    }
    s.tapTab("floor");
    const timber = s.rows().find((r) => r.style.id === "timber")!;
    expect(timber.fresh).toBe(true);
    expect(timber.progress).toBeNull();
    s.tapTab("belt");
    const rune = s.rows().find((r) => r.style.id === "rune")!;
    expect(rune.open).toBe(false);
    expect(rune.progress).toEqual([4, 60]);
    expect(rune.key).toBe(styleKey("belt", "rune"));
    // a second visit: nothing is NEW
    expect(new CustomizeState(loadProfile(st), st).rows().some((r) => r.fresh)).toBe(false);
    const q = emptyProfile();
    for (let d = 1; d <= 9; d++) foldDusk(q, facts({ runId: `x${d}` }), 1, "win");
    const s9 = new CustomizeState(q, null);
    s9.tapTab("belt");
    const [have, need] = s9.rows().find((r) => r.style.id === "rune")!.progress!;
    expect([have, need]).toEqual([9, 60]);
    expect(Math.round((100 * have) / need)).toBe(15);
  });
});

describe("CUSTOM-2a CUSTOMIZE: the frame", () => {
  const PHONES: [string, number, number, number][] = [
    ["phone", 390, 844, 3], ["phone-660", 390, 660, 3], ["wk-iphone13", 390, 664, 3], ["wk-iphone15pm", 430, 739, 3],
    ["wk-op-690", 402, 690, 3], ["small", 360, 640, 2], ["bar-667", 375, 667, 2], ["phone-land", 844, 390, 3], ["desk", 1920, 1080, 1],
  ];
  const meets = (a: { x: number; y: number; w: number; h: number }, b: { x: number; y: number; w: number; h: number }) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
  const inside = (b: { x: number; y: number; w: number; h: number }, W: number, H: number) => b.x >= 0 && b.y >= 0 && b.x + b.w <= W && b.y + b.h <= H;

  for (const [name, w, h, dpr] of PHONES) {
    it(`${name} ${w}x${h} @${dpr}: rows a finger tall, every target a finger's, the PREVIEW band clear of the carrier`, () => {
      const v = computeView(w, h, dpr, (pw, ph, p) => customizeScale(pw, ph, p, dpr));
      const tap = isPhone(v) ? tapPx(v) : 0;
      const L = customizeLayout(v.W, v.H, v.portrait, tap);
      const css = v.scale / v.dpr;
      if (v.portrait) {
        expect(v.H, name).toBeGreaterThanOrEqual(WANT_H);
        for (const r of L.rows) expect(r.h, name).toBe(ROW_H); // 46 px (77 CSS px at 390x844)
      } else for (const r of L.rows) expect(r.h, name).toBeGreaterThanOrEqual(ROW_H);
      if (isPhone(v)) {
        for (const r of [L.backHit, ...L.tabHits, ...L.rows]) {
          expect(r.h * css, name).toBeGreaterThanOrEqual(TAP_CSS - 1e-9);
          expect(r.w * css, name).toBeGreaterThanOrEqual(TAP_CSS - 1e-9);
        }
      }
      // every target and panel on screen; the rows above the footer, apart from each other, the tabs and BACK
      for (const r of [L.back, L.backHit, L.band, L.plate, L.keys, ...L.tabs, ...L.tabHits, ...L.rows]) expect(inside(r, v.W, v.H), name).toBe(true);
      const last = L.rows[4];
      expect(last.y + last.h, name).toBeLessThan(L.footY);
      for (let i = 0; i < 5; i++) for (let j = i + 1; j < 5; j++) expect(meets(L.rows[i], L.rows[j])).toBe(false);
      for (const t of [...L.tabHits, L.backHit]) for (const r of L.rows) expect(meets(t, r), name).toBe(false);
      for (let i = 0; i < 3; i++) for (let j = i + 1; j < 3; j++) expect(meets(L.tabHits[i], L.tabHits[j])).toBe(false);
      // R7: the band sits over no machinery, turret or plate: above the hull box with the ship's stern (6 px past it)
      expect(L.band.y + L.band.h, name).toBeLessThanOrEqual(L.hull.y - 6);
      expect(meets(L.band, L.plate) || meets(L.band, L.keys), name).toBe(false);
      expect(textWidth(PREVIEW_NOTE, "3"), name).toBeLessThanOrEqual(L.band.w - 4);
      // the plate and the strip under the board, the footer's sentence whole
      expect(L.plate.y, name).toBeGreaterThanOrEqual(L.hull.y + L.hull.h);
      expect(textWidth(FOOTER, "3"), name).toBeLessThanOrEqual(v.portrait ? v.W - 4 : L.rows[0].w);
      // every locked line fits its row in two lines beside the swatch and the progress number
      for (const list of [FLOORS, BELTS, PANELS]) for (const s of list.slice(1)) {
        const room = L.rows[0].w - 5 - Math.min(L.rows[0].h - 6, 40) - 3 - 5 - 8 - textWidth(`${s.need}/${s.need}`, "3") - 4;
        expect(wrap(`LOCKED: ${s.how}.`, room, "3").length, `${name}: ${s.id}`).toBeLessThanOrEqual(2);
      }
    });
  }

  it("the scale: the menu scale where the portrait frame fits it, else one CSS px per logical px at least", () => {
    expect(customizeScale(1170, 2532, true, 3)).toBe(5); // 390x844 @3: 234 x 506, as the study's mock
    expect(customizeScale(1170, 1980, true, 3)).toBe(4); // 390x660 @3
    expect(customizeScale(720, 1280, true, 2)).toBe(2); // 360x640 @2: one CSS px per px
    expect(customizeScale(2532, 1170, false, 3)).toBe(3); // landscape keeps the menu scale
  });
});
