// PACKS M2 (REQ-BFG-063): who the dusk intro says the foe is (day.ts foeTitle, drawn by battle.ts as "VS ..." in the
// banner's 3x5 sub line), and that the widest line fits the banner (the screen's width) on the desk and on phones, the
// 402x690 view included: the widest name (ten W's), the widest tag and the widest record. The name screen's panel fits
// every screen's logical size, and its OK button is at least 44 CSS px.
import { describe, expect, it } from "vitest";
import { computeView } from "../src/core/io";
import { battleScale } from "../src/game/battleLayout";
import { buildScale } from "../src/screens/build/layout";
import { titleScale } from "../src/screens/titleLayout";
import { defaultScale } from "../src/core/io";
import { textWidth } from "../src/render/font";
import { foeTitle, ghostRecord } from "../src/game/day";
import type { DuskFoe } from "../src/game/run";
import { standInFoe } from "../src/game/ghosts";
import { NAME_HINT, NAME_MAX, NAME_REFUSAL, NAME_TITLE, WANDERER, nameTag } from "../src/net/names";
import { NAME_CANCEL_CSS, NAME_OK_CSS, NAME_ROW_CSS, nameLayout } from "../src/screens/name";
import { nameEntryLabel } from "../src/ui/hud";
import { reachableRecords } from "../src/net/records";
import { MAX_DAY } from "../src/net/snapshot";
import { LONG_RUN_MAX_DAY } from "../src/sim/longRun";

const ghost = (day: number, wins: number, playerId: string, name?: string): DuskFoe => ({
  day, kind: "ghost", name: "GHOST · FURNACE · 0W 5♥", hero: "furnace", build: { hero: "furnace", items: [], routes: [], mods: [], beltCap: 0, hullBonus: 0 },
  record: { wins, lives: 5, runId: "r", playerId, createdAt: 0, ...(name === undefined ? {} : { name }) },
});
/** RUN-1 R2.4: the same ghost whose snapshot STATED its losses (DuskFoe.record.losses, copied where the stamp is made). */
const told = (day: number, wins: number, losses: number, playerId: string, name?: string): DuskFoe => {
  const g = ghost(day, wins, playerId, name);
  return { ...g, record: { ...g.record!, losses } };
};

/** A playerId for each of the 256 tags (found by search). */
function idsByTag(): Map<string, string> {
  const out = new Map<string, string>();
  for (let i = 0; out.size < 256; i++) {
    const id = `p${i.toString(36)}`;
    if (!out.has(nameTag(id))) out.set(nameTag(id), id);
  }
  return out;
}

describe("the intro line", () => {
  it("a named ghost: NAME#TAG · W-L (the summary's W-L: wins, then the dusks before it not won); nameless: WANDERER; a stand-in: its captain", () => {
    expect(foeTitle(ghost(10, 7, "a", "ANNA"))).toBe("ANNA#2C · 7-2");
    expect(`VS ${foeTitle(ghost(10, 7, "a", "ANNA"))}`).toBe("VS ANNA#2C · 7-2");
    expect(foeTitle(ghost(1, 0, "p-1"))).toBe("WANDERER · 0-0");
    expect(foeTitle(ghost(5, 1, "p-1", "anna"))).toBe("WANDERER · 1-3"); // a name the rules refuse is never shown
    expect(foeTitle(ghost(5, 1, "p-1", WANDERER))).toBe("WANDERER · 1-3");
    const s = standInFoe(1234, 3);
    expect(foeTitle({ day: 3, kind: "standin", name: s.name, hero: s.hero, build: s.build, rival: s.id })).toBe(s.name);
    expect([ghostRecord(1, 0), ghostRecord(4, 2), ghostRecord(10, 9), ghostRecord(10, 0)]).toEqual(["0-0", "2-1", "9-0", "0-9"]);
  });

  // RUN-1 R2.4: a ghost whose snapshot STATES its losses (a long run's record does) shows them: a draw is no loss. The derived W-L
  // above (day - 1 - wins) stays for a snapshot that states none (every 10-day ghost, an older snapshot).
  it("a ghost that states its losses: NAME#TAG · W-L from the stated count (a draw is no loss); a stand-in captain is untouched", () => {
    expect(foeTitle(told(10, 7, 1, "a", "ANNA"))).toBe("ANNA#2C · 7-1"); // 7 wins, 1 loss, 1 draw: the derived text counts the draw (7-2)
    expect(foeTitle(told(10, 7, 0, "a", "ANNA"))).toBe("ANNA#2C · 7-0"); // a stated 0 is a count (the derived text: 7-2)
    expect(foeTitle(told(10, 7, 2, "a", "ANNA"))).toBe("ANNA#2C · 7-2"); // no draw: the stated and the derived text agree
    expect(`VS ${foeTitle(told(10, 7, 1, "a", "ANNA"))}`).toBe("VS ANNA#2C · 7-1");
    expect(foeTitle(told(1, 0, 0, "p-1"))).toBe("WANDERER · 0-0");
    expect(foeTitle(told(5, 1, 0, "p-1", "anna"))).toBe("WANDERER · 1-0"); // a name the rules refuse is never shown
    expect(foeTitle(told(5, 1, 3, "p-1", WANDERER))).toBe("WANDERER · 1-3");
    expect(foeTitle(told(17, 9, 6, "p-1"))).toBe("WANDERER · 9-6"); // a long run's deepest dusks: the derived text would read 9-7
    expect(foeTitle(told(17, 4, 6, "p-1"))).toBe("WANDERER · 4-6"); // (and 4-12 on day 17 with 4 wins: a draw-heavy record)
    const s = standInFoe(1234, 3);
    const standin = { day: 3, kind: "standin" as const, name: s.name, hero: s.hero, build: s.build, rival: s.id }; // a variable, not a fresh literal: no excess-property error (tests/tsc-tests-baseline.json)
    expect(foeTitle(standin)).toBe(s.name);
  });

  // the views: the desk (and a small laptop), landscape and portrait phones, the operator's 402x690 among them
  const VIEWS: [string, number, number, number][] = [
    ["desk 1920x1080", 1920, 1080, 1], ["desk 1280x720", 1280, 720, 1], ["laptop 1366x768 @2", 1366, 768, 2],
    ["phone 402x690 @3", 402, 690, 3], ["phone 390x664 @3", 390, 664, 3], ["phone 375x667 @2", 375, 667, 2], ["phone 360x640 @3", 360, 640, 3],
    ["phone 320x568 @2", 320, 568, 2], ["phone landscape 844x390 @3", 844, 390, 3],
  ];

  it("the widest line fits the banner (the screen's width, a 4 px margin each side) in every view: ten W's, every tag, every record", () => {
    const ids = idsByTag();
    let widest = "";
    for (const [, id] of ids) {
      for (let day = 1; day <= MAX_DAY; day++) {
        for (const r of reachableRecords(day)) {
          const line = `VS ${foeTitle(ghost(day, r.wins, id, "W".repeat(NAME_MAX)))}`;
          if (textWidth(line, "3") > textWidth(widest, "3")) widest = line;
        }
      }
    }
    expect(widest).toMatch(/^VS W{10}#[0-9A-F]{2} · \d-\d$/);
    const w = textWidth(widest, "3");
    // PACKS run 2 (the lead's ruling R1): 84 (was 82): the 3x5 face's "#" is a five-column hash (was three columns)
    expect(w).toBe(84);
    expect(textWidth(`VS ${WANDERER} · 9-0`, "3")).toBeLessThan(w);
    for (const [what, cw, ch, dpr] of VIEWS) {
      const v = computeView(cw, ch, dpr, battleScale);
      expect(w + 8, `${what}: ${v.W}x${v.H}`).toBeLessThanOrEqual(v.W);
    }
    // the 402x690 phone's battle, in numbers
    const phone = computeView(402, 690, 3, battleScale);
    expect(`${phone.W}x${phone.H}`).toMatch(/^\d+x\d+$/);
    expect(phone.W - w).toBeGreaterThanOrEqual(8);
  });

  // RUN-1 R2.4: the line a STATED record makes is no wider than the derived one above (the same `W-L` digits, a count a long run's
  // hearts keep to one digit), so the banner fits it in every view as it fits that one
  it("the widest STATED line fits the banner as the derived one does: every record a long run can state, ten W's, every tag", () => {
    const W10 = "W".repeat(NAME_MAX);
    let wid = "", widestTag = "";
    for (const [, id] of idsByTag()) {
      const line = `VS ${foeTitle(told(2, 0, 0, id, W10))}`;
      if (textWidth(line, "3") > textWidth(widestTag, "3")) { widestTag = line; wid = id; }
    }
    let widest = "", n = 0, deepest = 0;
    for (let day = 1; day <= LONG_RUN_MAX_DAY; day++) {
      for (let losses = 0; losses < day; losses++) {
        for (const r of reachableRecords(day, { losses })) {
          const line = `VS ${foeTitle(told(day, r.wins, losses, wid, W10))}`;
          n++;
          deepest = Math.max(deepest, losses);
          if (textWidth(line, "3") > textWidth(widest, "3")) widest = line;
        }
      }
    }
    expect(n).toBeGreaterThan(200); // not an empty loop
    expect(deepest).toBeLessThan(10); // the most losses a long run's hearts allow is one digit, so no stated line grows past `W-L`
    expect(widest).toMatch(/^VS W{10}#[0-9A-F]{2} · \d-\d$/);
    expect(textWidth(widest, "3")).toBe(84); // the width pinned above
  });

  it("the options card's NAME entry: NAME: ANNA (NAME with none); the widest fits the card's narrowest button", () => {
    expect(nameEntryLabel("ANNA")).toBe("NAME: ANNA");
    expect(nameEntryLabel(null)).toBe("NAME");
    // hud.ts optionsCard: buttons min(W - 24, 150) px wide, the label in the 3x5 face; the narrowest screen of the views
    let narrowest = Infinity;
    for (const [, cw, ch, dpr] of VIEWS) for (const pick of [battleScale, buildScale, defaultScale]) narrowest = Math.min(narrowest, computeView(cw, ch, dpr, pick).W);
    expect(textWidth(nameEntryLabel("W".repeat(NAME_MAX)), "3") + 8).toBeLessThanOrEqual(Math.min(narrowest - 24, 150));
  });

  it("the options card with its NAME row (one more row) still fits the screen: the build MENU (3 actions), the battle's PAUSED (2)", () => {
    const cardH = (actions: number) => 18 + (3 + actions) * 22 + 4; // hud.ts optionsCard at k = 1: rows of 19 px + 3
    for (const [what, cw, ch, dpr] of VIEWS) {
      for (const [pick, actions, screen] of [[buildScale, 3, "build"], [battleScale, 2, "battle"]] as const) {
        const v = computeView(cw, ch, dpr, pick);
        expect(cardH(actions), `${what} ${screen} ${v.W}x${v.H}`).toBeLessThanOrEqual(v.H);
      }
    }
  });

  it("the name screen: the panel and its texts fit every screen's view; the row is at least 44 CSS px tall, OK and CANCEL at least 44 wide", () => {
    expect(NAME_ROW_CSS).toBeGreaterThanOrEqual(44);
    expect(NAME_OK_CSS).toBeGreaterThanOrEqual(44);
    expect(NAME_CANCEL_CSS).toBeGreaterThanOrEqual(44);
    const picks = [battleScale, buildScale, defaultScale, (pw: number, ph: number, p: boolean) => titleScale(pw, ph, p, 3)];
    for (const [what, cw, ch, dpr] of [...VIEWS, ["phone 402x690 @1", 402, 690, 1] as [string, number, number, number]]) {
      for (const pick of picks) {
        const v = computeView(cw, ch, dpr, pick);
        const k = v.scale / v.dpr;
        const L = nameLayout(v.W, v.H, k);
        const at = `${what} ${v.W}x${v.H}`;
        expect(L.panel.x >= 0 && L.panel.x + L.panel.w <= v.W && L.panel.y >= 0 && L.panel.y + L.panel.h <= v.H, at).toBe(true);
        expect(L.row.h * k, at).toBeGreaterThanOrEqual(NAME_ROW_CSS - 1e-9);
        expect(L.row.w * k, at).toBeGreaterThanOrEqual(NAME_OK_CSS + NAME_CANCEL_CSS + 12 + 80); // the input keeps 80 CSS px
        expect(textWidth(NAME_TITLE), at).toBeLessThanOrEqual(L.panel.w - 8);
        expect(textWidth(NAME_HINT, "3"), at).toBeLessThanOrEqual(L.panel.w - 8);
        for (const t of Object.values(NAME_REFUSAL)) expect(Math.min(textWidth(t), textWidth(t, "3")), `${at} ${t}`).toBeLessThanOrEqual(L.panel.w - 8);
        // the panel sits in the top part of the screen, where a phone keyboard leaves it in view
        if (v.portrait) expect(L.panel.y + L.panel.h, at).toBeLessThanOrEqual(Math.ceil(v.H * 0.5));
      }
    }
  });
});
