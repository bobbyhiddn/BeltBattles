// POLISH-1 (REQ-BFG-085, REQ-BFG-052, REQ-BFG-057; BRIEF-POLISH1 P4): the rules card (title.ts helpLines) as it was before the gate and ENCHANTER sentence (item 4) and POISON (item 6) joined
// it. Each part follows its own switch (GATES, ENCHANT, and the scaling switch that turns POISON on), so with the three off the card is HELP exactly as before. The eleven files that
// pin the card's lines read their OFF-world pins through this; the ON world's pins are tests/polish1.help.test.ts's.
import { withEnchant } from "../src/sim/enchant";
import { withGates } from "../src/sim/gates";
import { withScaleRigs } from "../src/sim/scale";

export const cardBefore = <T>(fn: () => T): T => withEnchant(() => withGates(() => withScaleRigs(fn, false), false), false);
