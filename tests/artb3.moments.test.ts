// ARTB-CODE-3A (REQ-BFG-126), a finding pinned: the battle MOMENTS of wave 3's rigs bypass art B's hook.
// src/render/machinery.ts:516-517 draws a rig as `wave3GateSprite(id, frame, active, state)` whenever a moment's state shows (wave3Moments.ts rigMoment: PINCER's heated jaws, BRACE FRAME's glow, PLATE BREAKER's hot strip, IRON WALL's
// boss, TWIN GAUGE's needles, TWIN LATCH's lamp, STOKER, PLATE ROLLER) and as `gateSprite(id, ...)` (the art B hook) otherwise. wave3GateSprite is the BASE drawing (src/render/wave3Art.ts), no hook: for the moment's duration the deck shows
// the OLD art of the rig, whole, in place of art B's sprite. Eight of the 34 new rigs are such rigs. This display-only job changes no drawing code (the brief's section 4), so the list is pinned here (a later job that hooks the moments
// updates it) and reported to cap as QUESTION 1. tests/wave3Moments.test.ts, tests/wave3Art.test.ts and tests/art1e.test.ts pin the base drawing with the switch off.
import { afterEach, describe, expect, it } from "vitest";
import { R, installRaster } from "./raster.helpers";

installRaster();

import { setArtB } from "../src/render/artB";
import { gateSprite } from "../src/render/sprites";
import { wave3GateSprite } from "../src/render/wave3Art";
import { NEW_RIGS } from "./artb3.helpers";

afterEach(() => setArtB(true));

describe("ARTB-CODE-3A: the new rigs whose battle moments draw the base's art (machinery.ts:516-517)", () => {
  // ARTB-CODE-3B (the hold of 27 pictures), old -> new: the data holds 14 of the 34 new rigs; four of the eight (PINCER, TWIN LATCH, STOKER, SHIELD FUEL) are held, so four are left: PLATE ROLLER, TWIN GAUGE, BRACE FRAME, IRON WALL
  // (this whole file is rewritten by the next commit, item S, once machinery.ts asks art B first)
  it("exactly four of the 14 new rigs have a wave-3 moment look (wave3GateSprite answers for them): PLATE ROLLER, TWIN GAUGE, BRACE FRAME, IRON WALL", () => {
    const w3 = NEW_RIGS.filter((id) => wave3GateSprite(id, 0, false, {}) !== null);
    expect([...w3].sort()).toEqual(["braceframe", "plateroller", "shieldwall", "twingauge"]);
    expect(w3.length).toBe(4);
  });

  it("for those four, the moment's sprite (the base's wave3GateSprite) is another picture than art B's gateSprite at every frame, idle and working: the deck changes art for the moment", () => {
    setArtB(true);
    for (const id of ["plateroller", "twingauge", "braceframe", "shieldwall"]) {
      for (let f = 0; f < 8; f++) for (const active of [false, true]) {
        const moment = wave3GateSprite(id, f, active, {}), art = gateSprite(id, f, active);
        expect(R(moment).px, `${id} frame ${f} ${active ? "working" : "idle"}: the base's moment sprite is not art B's`).not.toEqual(R(art).px);
      }
    }
  });
});
