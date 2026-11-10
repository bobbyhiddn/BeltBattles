// POLISH-5 (REQ-BFG-087, REQ-BFG-089; P5-3): THE FOE'S TURRET SUB AT 280x653 IS NOT CUT WITH A DOT.
//   At polish4c-accepted the foe's turret sub (`MASTER VOSS'S MEDIUM TURRET IN SLOT 1`, 139 px) was cut with a dot in the 280x653 band (164 x 69, subMax 137): 24 faces of corpus A and 24 of corpus B, and none at any other of the thirteen views
//   (it was pinned as known in tests/polish4.rigsub.test.ts: 48). A band has no row to break the sub onto: a second sub row costs the face an ability or a CORE / GEAR line (19 of the 24 A faces, 21 of the 24 B faces). So the sub gets a shorter
//   wording where it does not fit (inspector.ts slotSubFit, planOnce's `subFit`, drawn by battleScout.ts drawOn): ` IN` goes first (`... TURRET SLOT 1`), then ` TURRET IN` for a comma (`OLD BULWARK'S ADAPTABLE, SLOT 2`). The owner, the weight and
//   the slot stay; the face's plan (rows, lines, gaps, family head) is the one it was.
import { afterEach, describe, expect, it } from "vitest";
import { G, fresh, installRaster } from "./raster.helpers";
import { facePlan, BattleFaces, faceArea } from "../src/screens/battleScout";
import { planPanel, slotSubFit } from "../src/screens/build/inspector";
import { ENCHANT, setEnchant, withEnchant } from "../src/sim/enchant";
import { RIVAL_IDS, RIVALS, rivalBuild } from "../src/sim/rivals";
import { DEFAULT_SKIN } from "../src/render/styles";
import { textWidth } from "../src/render/font";
import { battleLayout, laneLayout } from "../src/game/battleLayout";
import { faces, drawnSubs, type Face } from "./polish3b.helpers";
import { VIEW13_NAMES, gameAt, viewAt, type View13 } from "./polish4.helpers";

installRaster();
afterEach(() => setEnchant(ENCHANT));
const BAND: View13 = "band-280x653";
const plan = (f: Face, name: View13, foe: boolean) => { const { fa, tp } = viewAt(name, foe ? 1 : 0); return withEnchant(() => facePlan(f.t, fa, f.fam, tp)); };

describe("POLISH-5 P5-3: slotSubFit, the ladder", () => {
  it("a sub that fits is returned as it is, and so is a sub that is not a turret's", () => {
    expect(slotSubFit("MASTER VOSS'S MEDIUM TURRET IN SLOT 1", 200)).toBe("MASTER VOSS'S MEDIUM TURRET IN SLOT 1");
    expect(slotSubFit("SPARKFANG'S RIG · 1/1 ARROWS ON BELTS", 40)).toBe("SPARKFANG'S RIG · 1/1 ARROWS ON BELTS");
  });
  it("` IN` goes first, then ` TURRET IN` for a comma; the owner, the weight and the slot always stay", () => {
    expect(textWidth("MASTER VOSS'S MEDIUM TURRET IN SLOT 1", "3"), "the case of the brief: 139 px in 137").toBe(139);
    expect(slotSubFit("MASTER VOSS'S MEDIUM TURRET IN SLOT 1", 137)).toBe("MASTER VOSS'S MEDIUM TURRET SLOT 1");
    expect(slotSubFit("OLD BULWARK'S ADAPTABLE TURRET IN SLOT 2", 137)).toBe("OLD BULWARK'S ADAPTABLE, SLOT 2");
    expect(slotSubFit("IRON MATRIARCH'S ADAPTABLE TURRET IN SLOT 1", 137)).toBe("IRON MATRIARCH'S ADAPTABLE, SLOT 1");
  });
  it("every owner x weight x slot (RIVALS' names and SPARKFANG, the four weights, slots 1-3: 228 subs) fits the band's 137 px after it, with its three facts", () => {
    const names = [...new Set([...RIVAL_IDS.map((id) => RIVALS[id].name), "SPARKFANG"])];
    let n = 0, cut = 0, widest = 0;
    for (const o of names) for (const k of ["LIGHT", "MEDIUM", "HEAVY", "ADAPTABLE"]) for (const slot of [1, 2, 3]) {
      const s = `${o}'S ${k} TURRET IN SLOT ${slot}`, f = slotSubFit(s, 137);
      n++;
      if (textWidth(s, "3") > 137) cut++;
      widest = Math.max(widest, textWidth(f, "3"));
      expect(textWidth(f, "3"), f).toBeLessThanOrEqual(137);
      expect(f.startsWith(`${o}'S ${k}`), `${f}: the owner and the weight`).toBe(true);
      expect(f.endsWith(`SLOT ${slot}`), `${f}: the slot`).toBe(true);
    }
    expect(n).toBe(228);
    expect(cut, "subs wider than the band's room as they were").toBe(66);
    expect(widest, "the widest shortened sub (`IRON MATRIARCH'S HEAVY TURRET SLOT 1` is 135, the longest ` TURRET SLOT` that fits is 136)").toBe(136);
  });
});

describe("POLISH-5 P5-3: the 280x653 band's foe faces", () => {
  const foe = faces(true);
  it("corpus A (2,242) and B (1,809): 24 + 24 subs were cut with a dot, 0 are now; each shortened sub is drawn whole, in the owner's words", () => {
    expect(foe.filter((f) => f.corpus === "A").length).toBe(2242);
    expect(foe.filter((f) => f.corpus === "B").length).toBe(1809);
    const got = { A: { fit: 0, cut: 0 }, B: { fit: 0, cut: 0 } };
    for (const f of foe) {
      const p = plan(f, BAND, true), wide = textWidth(f.t.sub, "3") > p.subMax;
      if (p.subFit !== undefined) {
        got[f.corpus].fit++;
        expect(wide, `${f.tag}: only a sub that did not fit is changed`).toBe(true);
        expect(textWidth(p.subFit, "3"), `${f.tag}: ${p.subFit}`).toBeLessThanOrEqual(p.subMax);
        expect(p.subFit.startsWith(f.t.subOwner!), `${f.tag}: the owner (${f.t.subOwner})`).toBe(true);
        expect(/ (LIGHT|MEDIUM|HEAVY|ADAPTABLE)[ ,]/.test(p.subFit) && /SLOT \d$/.test(p.subFit), `${f.tag}: the weight and the slot (${p.subFit})`).toBe(true);
        expect(p.subs, `${f.tag}: the plan's sub rows are the sub, as before`).toEqual([f.t.sub]);
        expect(p.shift, `${f.tag}: the band's CLOSE row sits under the sub, as before`).toBe(12);
      } else if (/ TURRET IN SLOT \d$/.test(f.t.sub)) expect(wide, `${f.tag}: a turret's slot sub that does not fit has its fit`).toBe(false);
      if (drawnSubs(f.t, p).some((s) => textWidth(s, "3") > p.subMax)) got[f.corpus].cut++;
    }
    expect(got).toEqual({ A: { fit: 24, cut: 0 }, B: { fit: 24, cut: 0 } });
  });
  it("the words of the sub: MASTER VOSS'S MEDIUM TURRET SLOT 1 / 2, IRON MATRIARCH'S HEAVY TURRET SLOT 1, OLD BULWARK'S ADAPTABLE, SLOT 2 (A) and SPARKFANG'S ADAPTABLE TURRET SLOT 1 (B)", () => {
    const seen = new Set<string>();
    for (const f of foe) { const p = plan(f, BAND, true); if (p.subFit) seen.add(`${f.corpus} ${p.subFit}`); }
    expect([...seen].sort()).toEqual(["A IRON MATRIARCH'S HEAVY TURRET SLOT 1", "A MASTER VOSS'S MEDIUM TURRET SLOT 1", "A MASTER VOSS'S MEDIUM TURRET SLOT 2", "A OLD BULWARK'S ADAPTABLE, SLOT 2", "B SPARKFANG'S ADAPTABLE TURRET SLOT 1"]);
  });
  it("no face's lines move: the shortened faces draw exactly the lines the plan with their sub made short on its own would (same body, same gaps, same family head)", () => {
    // the sub's wording is the only change: the plan of the same text with the fitted sub as its sub, in the same band, has the same body and header places as the plan with the whole sub
    for (const f of foe.filter((x) => plan(x, BAND, true).subFit !== undefined)) {
      const { fa, tp } = viewAt(BAND, 1), p = plan(f, BAND, true);
      const q = withEnchant(() => planPanel({ ...f.t, sub: p.subFit! }, fa.area, f.fam, { tap: tp, band: fa.band, wrap: true }));
      expect(JSON.stringify(p.body.lines.map((l) => (l === "rule" ? l : l.spans.map((s) => s.t).join("")))), f.tag).toBe(JSON.stringify(q.body.lines.map((l) => (l === "rule" ? l : l.spans.map((s) => s.t).join("")))));
      expect(p.body.shown.map((l) => l.b.text), f.tag).toEqual(q.body.shown.map((l) => l.b.text));
      expect([p.r.h, p.gaps.px, p.famHead?.at ?? null], f.tag).toEqual([q.r.h, q.gaps.px, q.famHead?.at ?? null]);
    }
  });
});

describe("POLISH-5 P5-3: nothing else moves", () => {
  it("on the other twelve views, own and foe, both corpora, no face has a fitted sub; the 280x653 band's own faces have none either", () => {
    for (const name of VIEW13_NAMES) for (const isFoe of [false, true]) {
      let n = 0;
      for (const f of faces(isFoe)) { if (plan(f, name, isFoe).subFit !== undefined) n++; }
      expect(n, `${name} ${isFoe ? "foe" : "own"}: faces with a fitted sub`).toBe(name === BAND && isFoe ? 48 : 0);
    }
  });
  it("the build screen's panel (no `wrap`) never has one, even for the foe's text in the band", () => {
    const { fa, tp } = viewAt(BAND, 1);
    for (const f of faces(true).filter((x) => x.corpus === "A" && x.kind === "turret").slice(0, 60)) {
      const p = withEnchant(() => planPanel({ ...f.t, subOwner: undefined }, fa.area, f.fam, { tap: tp, band: fa.band }));
      expect(p.subFit, f.tag).toBeUndefined();
    }
  });
});

describe("POLISH-5 P5-3: the face draws the fitted sub (BattleFaces.drawOn at 280x653)", () => {
  it("MASTER VOSS's day-12 turret face draws `MASTER VOSS'S MEDIUM TURRET SLOT 1`, not the cut sub; a face whose sub fits draws its sub", () => {
    const { v, game } = gameAt(BAND);
    const fa = faceArea(laneLayout(battleLayout(v.W, v.H, v.portrait)), 1);
    const draw = (id: (typeof RIVAL_IDS)[number], day: number, index: number): string | undefined => {
      const faces = new BattleFaces(), b = withEnchant(() => rivalBuild(id, day));
      faces.open = { side: 1, sel: { kind: "turret", index } };
      withEnchant(() => faces.drawOn(G(fresh(v.W, v.H)), game, b, fa, () => null, DEFAULT_SKIN.panel, null, day, RIVALS[id].name));
      return faces.last?.subDrawn;
    };
    const seen: string[] = [];
    for (const day of [5, 8, 12, 16]) for (const index of [0, 1, 2]) { const s = draw("voss", day, index); if (s) seen.push(s); }
    expect(seen.length, "VOSS's turrets opened").toBeGreaterThan(0);
    expect(seen.every((s) => textWidth(s, "3") <= fa.area.w - 27), JSON.stringify(seen)).toBe(true);
    expect(seen.some((s) => s === "MASTER VOSS'S MEDIUM TURRET SLOT 1"), JSON.stringify(seen)).toBe(true);
  });
});
