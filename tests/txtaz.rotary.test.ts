// TXT-AZ item 1 (REQ-BFG-070; REVIEW-TXT096 Q1; text only, rules bb-0.9.7 unchanged): ROTARY BREECH's OLDEST FIRST, a tap
// note (glossary.ts TAP_NOTES rotary, on its face's word CHAMBERS). The order is read from the sim side, so a change to it
// turns this red: cores.ts ROUTINES.rotary's select takes stack index 0 (the oldest load) while its core's order is "FIFO"
// (content.ts rotary: order "FIFO"), on a gun makeTurret builds with a ROTARY BREECH fitted; the default gun's select takes
// the newest. The note is reachable: keywords.ts noteWord puts a tap target on CHAMBERS, and glossaryText shows the note.
import { describe, expect, it } from "vitest";
import { makeTurret, type TurretState } from "../src/sim/battle";
import { ITEMS } from "../src/sim/content";
import { ROUTINES } from "../src/sim/cores";
import { setTurretList, turretSlots, type Build } from "../src/sim/deck";
import { effectAt, starField } from "../src/sim/stars";
import { newRun } from "../src/game/run";
import { colourize, wrapRich } from "../src/ui/richText";
import { icons } from "../src/render/font";
import { C } from "../src/render/palette";
import { GLOSSARY_WRAP_W, TAP_NOTES, glossaryEntry, glossaryText } from "../src/ui/glossary";
import { faceAt } from "../src/ui/faces";
import { noteWord } from "../src/screens/build/keywords";

const STARS = [1, 2, 3];
/** makeTurret's gun 0 of a FURNACE run with `def`, and a ROTARY BREECH (★cs) as its core when `cs` is given. */
const gun = (def: string, cs?: number): TurretState => {
  const r = newRun("furnace", 5, "txtaz");
  setTurretList(r.build, [{ slot: 0, def, uid: 700 }]);
  if (cs) r.build.mods.push({ uid: 730, def: "rotary", turret: 0, ...starField(cs) } as Build["mods"][number]);
  return makeTurret(r.build, 0, turretSlots(r.build)[0].td!);
};
/** The stack index gun `tu` fires next with three loads in its chamber (oldest first in tu.stack, as Battle pushes them). */
const pick = (tu: TurretState): number => {
  const stack = [1, 2, 3].map((n) => ({ id: n }) as unknown as TurretState["stack"][number]);
  return ROUTINES[tu.core.routine].select({ ...tu, stack });
};

describe("TXT-AZ item 1: ROTARY BREECH's tap note says the oldest load fires first (REQ-BFG-070)", () => {
  it("the sim: a ROTARY BREECH's gun fires the oldest load (index 0, its FIFO order); the same gun without it, the newest", () => {
    expect(ITEMS.rotary.core).toMatchObject({ routine: "rotary", order: "FIFO" });
    for (const def of ["scrapcannon", "dartgun", "thunderer"]) {
      const plain = gun(def);
      expect(plain.core.routine, def).toBe("identity");
      expect(pick(plain), def).toBe(2); // IDENTITY's lifo: the newest of three
      for (const s of STARS) {
        expect(effectAt("rotary", s).core!.order, `★${s}`).toBe("FIFO");
        const g = gun(def, s);
        expect([g.core.routine, g.core.spec.order], `${def} ★${s}`).toEqual(["rotary", "FIFO"]);
        expect(pick(g), `${def} ★${s}`).toBe(0); // the oldest
      }
    }
  });

  it("the note says it, in the tap notes' shape: its word first, 2 lines of 5x7 at most, no number", () => {
    const n = TAP_NOTES.rotary;
    expect(n.word).toBe("CHAMBERS");
    const text = n.text(effectAt("rotary", 1), { stars: 1, k: 1 });
    expect(text).toBe("CHAMBERS: THE OLDEST LOAD IN ITS CHAMBER FIRES FIRST, NOT THE NEWEST.");
    // the oldest (index 0) and the default's newest (lifo), as the sim picks them above
    expect(pick(gun("scrapcannon", 1))).toBe(0);
    expect(text).toMatch(/^CHAMBERS: THE OLDEST LOAD .* FIRES FIRST, NOT THE NEWEST\.$/);
    expect(text).not.toMatch(/\d/);
    expect(wrapRich(colourize(icons(text), C.bone), GLOSSARY_WRAP_W, "5").length).toBeLessThanOrEqual(2);
  });

  it("reachable: CHAMBERS is a word of its face at every star, a tap target (noteWord), and a tap on it shows the note", () => {
    expect(glossaryEntry("CHAMBERS")).toBeUndefined(); // no glossary row of its own: the tap shows the piece's note only
    expect(noteWord("rotary")).toBe("CHAMBERS");
    for (const s of STARS) {
      const face = faceAt("rotary", s)!.rules.map((r) => r.text).join(" ");
      expect(face, `★${s}`).toMatch(/\bCHAMBERS\b/);
      expect(glossaryText("CHAMBERS", { def: "rotary", stars: s }), `★${s}`).toBe(TAP_NOTES.rotary.text(effectAt("rotary", s), { stars: s, k: 1 }));
    }
    // another piece's CHAMBERS is no tap note (the note is ROTARY BREECH's alone)
    expect(noteWord("chamber")).toBe("UP TO");
    expect(glossaryText("CHAMBERS", { def: "pressure", stars: 1 })).toBeUndefined();
  });
});
