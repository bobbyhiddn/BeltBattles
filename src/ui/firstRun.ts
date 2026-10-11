// CARD-4 (REQ-BFG-107, N): main.ts's FIRST import. An ES module runs before every module imported after it, and this one
// imports only tips.ts (which imports nothing), so decidePlayer reads the store exactly as this build found it: before
// the title screen folds the profile, the audio reads or writes the sound, or anything else this build writes. It decides
// once (stored with the notes) whether the rename notice is for this device's player (a 0.9.8 store), and never again.

import { decidePlayer } from "./tips";

decidePlayer();
