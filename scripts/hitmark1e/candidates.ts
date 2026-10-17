// HITMARK-1E (REQ-BFG-100, C7; BRIEF-HITMARK1E steps 1-2) picture tooling, not shipped: the drawings under test for ICON.CRACK,
// the hits-on-you chip's mark. Each candidate is one idea drawn at both sizes (5x7 and 3x5, rows joined with "|", "#" ink), the
// way font.ts holds a glyph. OLD is SCALE-2c's crack as shipped at the base (frozen here, so the sheet can show it after font.ts
// has moved). sheet.ts draws them as the chip's row draws a glyph; dist.ts-style numbers come from the same file's helpers.

export interface Candidate {
  id: string;
  name: string;
  five: string;
  three: string;
  /** one line: what it is, and what it should say */
  idea: string;
}

/** SCALE-2c's crack (font.ts :191 and :284 at 6645b6184db1): the mark all four round-M readers took for FRAY. */
export const OLD: Candidate = {
  id: "OLD",
  name: "OLD CRACK",
  five: "#.#..|.#.#.|..#..|.##..|...#.|..#.#|.#...",
  three: "#.#|.#.|.##|..#|.#.",
  idea: "a lone jagged line (SCALE-2c): read as a frayed thread, i.e. FRAY",
};

export const ROUND1: Candidate[] = [
  {
    id: "A",
    name: "WALL",
    five: "....#|.#..#|..#.#|#####|..#.#|.#..#|....#",
    three: "..#|#.#|.##|#.#|..#",
    idea: "an arrow driving into a wall: the hit lands on the plate",
  },
  {
    id: "B",
    name: "CLAWS",
    five: "....#|...#.|..#.#|.#.#.|#.#..|.#...|#....",
    three: "..#|.#.|#.#|.#.|#..",
    idea: "two parallel strike slashes across the plate",
  },
  {
    id: "C",
    name: "TARGET",
    five: ".....|.###.|#...#|#.#.#|#...#|.###.|.....",
    three: "...|###|#.#|###|...",
    idea: "a ring with a dot: you were the one hit",
  },
  {
    id: "D",
    name: "FIST",
    five: ".#.#.|#####|#####|#####|#####|.###.|.###.",
    three: ".#.|###|###|###|.#.",
    idea: "a fist: a blow",
  },
  {
    id: "E",
    name: "DENT",
    five: "####.|####.|###..|##..#|###..|####.|####.",
    three: "##.|##.|#.#|##.|##.",
    idea: "a slab with a bite out of its edge and the slug that did it",
  },
];

/** Round 2: round 1's lessons. Thin diagonal strokes (B) feel like the old thread; blobs (D, E) read as objects, not as a hit; the
 *  ring (C) is bold but has no 3x5 twin clear of SLUG, 0 and O. The arrow into a wall (A) is the one idea with a direction (the
 *  hit lands ON the plate) that scales to both sizes: three more drawings of it, and the ring kept as a wild card. */
export const ROUND2: Candidate[] = [
  ROUND1[0],
  {
    id: "A2",
    name: "WALL, THICK",
    five: "...##|...##|.#.##|#####|.#.##|...##|...##",
    three: "..#|#.#|.##|#.#|..#",
    idea: "the same arrow into a two-px wall: a slab, not a line",
  },
  {
    id: "A3",
    name: "RICOCHET",
    five: "....#|#...#|.#..#|..#.#|.#..#|#...#|....#",
    three: "..#|#.#|.##|#.#|..#",
    idea: "only the arrowhead, its point on the wall: the path of a shot that landed",
  },
  {
    id: "F",
    name: "BOWED WALL",
    five: "...#.|...#.|..#.#|#####|..#.#|...#.|...#.",
    three: "..#|#.#|.##|#.#|..#",
    idea: "the arrow pushes the wall out into a bow: a dent, not a line",
  },
  ROUND1[2],
];

/** Round 3: round 2 on the sheet at 5x showed the wall next to the number reads as a digit 1 ("->158"): the wall gets serifs (a
 *  bracket, which no digit has) or is shorter than a digit is tall. */
export const ROUND3: Candidate[] = [
  ROUND1[0],
  {
    id: "A5",
    name: "BRACKET",
    five: "..###|....#|..#.#|#####|..#.#|....#|..###",
    three: "###|..#|.##|..#|###",
    idea: "the arrow drives into a bracketed plate edge: no digit has serifs on both ends",
  },
  {
    id: "A7",
    name: "SHORT WALL",
    five: ".....|....#|..#.#|#####|..#.#|....#|.....",
    three: "..#|#.#|.##|#.#|..#",
    idea: "the arrow and a wall only five rows tall: not a digit's height",
  },
  ROUND1[2],
];

/** The informal pre-read's six rows (step 2's sub-agent readers; not the score): the old crack as the control, the wall family and
 *  the ring. */
export const PANEL: Candidate[] = [ROUND1[0], ROUND2[1], ROUND3[1], ROUND3[2], ROUND1[2]];

export const ROUNDS: Record<string, Candidate[]> = { r1: ROUND1, r2: ROUND2, r3: ROUND3, rp: PANEL };
