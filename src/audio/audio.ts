// Chiptune sound: synthesized SFX and a tiny step sequencer for music. Nothing is
// sampled; every sound is built from pulse, triangle and noise voices at runtime.

export type Sfx =
  | "click" | "belt" | "connect" | "error" | "place" | "pickup" | "coin" | "sell" | "stamp" | "sizzle"
  | "zap" | "fire_heavy" | "fire_light" | "impact" | "impact_small" | "jam" | "commission" | "siren"
  | "horn" | "ready" | "go" | "win" | "lose" | "boom" | "whoosh" | "load" | "repair" | "fuse";

type Wave = "p12" | "p25" | "p50" | "tri" | "saw";

interface Song {
  bpm: number;
  tracks: { wave: Wave | "noise"; vol: number; steps: string[] }[];
}

const NOTE: Record<string, number> = { C: 0, "C#": 1, D: 2, "D#": 3, E: 4, F: 5, "F#": 6, G: 7, "G#": 8, A: 9, "A#": 10, B: 11 };
function freq(tok: string): number {
  const m = /^([A-G]#?)(\d)$/.exec(tok);
  if (!m) return 0;
  const midi = 12 * (Number(m[2]) + 1) + NOTE[m[1]];
  return 440 * Math.pow(2, (midi - 69) / 12);
}

const seq = (...bars: string[]) => bars.join(" ").split(/\s+/).filter(Boolean);
const rep = (s: string, n: number) => Array(n).fill(s).join(" ");

const BATTLE: Song = {
  bpm: 150,
  tracks: [
    {
      wave: "p25", vol: 0.13, steps: seq(
        "A4 . C5 . E5 . A5 . G5 . E5 . C5 . E5 .",
        "F4 . A4 . C5 . F5 . E5 . C5 . A4 . C5 .",
        "G4 . B4 . D5 . G5 . F5 . D5 . B4 . D5 .",
        "E4 . G#4 . B4 . E5 . G#5 . B5 . G#5 . E5 .",
        "E5 - - . A5 - - . B5 . C6 . B5 . A5 .",
        "C6 - - . A5 - - . F5 - - . A5 . C6 .",
        "D6 - - . B5 - - . G5 - - . B5 . D6 .",
        "E6 - - - D6 - C6 - B5 - - - G#5 - - -",
      ),
    },
    {
      wave: "p12", vol: 0.05, steps: seq(
        rep("A3 C4 E4 C4", 4), rep("F3 A3 C4 A3", 4), rep("G3 B3 D4 B3", 4), rep("E3 G#3 B3 G#3", 4),
        rep("A3 C4 E4 C4", 4), rep("F3 A3 C4 A3", 4), rep("G3 B3 D4 B3", 4), rep("E3 G#3 B3 G#3", 4),
      ),
    },
    {
      wave: "tri", vol: 0.22, steps: seq(
        rep("A2 . A3 .", 4), rep("F2 . F3 .", 4), rep("G2 . G3 .", 4), "E2 . E3 . E2 . E3 . E2 . E3 . G#2 . B2 .",
        rep("A2 . A3 .", 4), rep("F2 . F3 .", 4), rep("G2 . G3 .", 4), "E2 . E3 . E2 . E3 . E2 . E3 . G#2 . B2 .",
      ),
    },
    { wave: "noise", vol: 0.1, steps: seq(rep("K . H . S . H . K K H . S . H H", 8)) },
  ],
};

const PREP: Song = {
  bpm: 108,
  tracks: [
    {
      wave: "p12", vol: 0.07, steps: seq(
        ". . . . E5 - - - D5 - C5 - - - . .",
        ". . . . F5 - - - E5 - D5 - - - . .",
        ". . . . D5 - - - B4 - G4 - A4 - B4 -",
        "C5 - - - - - - - E5 - - - D5 - - -",
      ),
    },
    {
      wave: "p25", vol: 0.045, steps: seq(
        "A3 . C4 . E4 . G4 . E4 . C4 . A3 . E3 .",
        "D3 . F3 . A3 . C4 . A3 . F3 . D3 . A2 .",
        "G3 . B3 . D4 . F4 . D4 . B3 . G3 . D3 .",
        "C3 . E3 . G3 . B3 . G3 . E3 . C3 . G3 .",
      ),
    },
    {
      wave: "tri", vol: 0.2, steps: seq(
        "A2 - - - - - - - E2 - - - - - - -",
        "D2 - - - - - - - A2 - - - - - - -",
        "G2 - - - - - - - D2 - - - - - - -",
        "C2 - - - - - - - G2 - - - E2 - - -",
      ),
    },
    { wave: "noise", vol: 0.04, steps: seq(rep("H . . . H . . . H . . . H . H .", 4)) },
  ],
};

export class Audio {
  ctx: AudioContext | null = null;
  private master!: GainNode;
  private sfxBus!: GainNode;
  private musBus!: GainNode;
  private noiseBuf!: AudioBuffer;
  private waves = new Map<Wave, PeriodicWave>();
  private last = new Map<string, number>();
  mode = 0; // 0 all, 1 sfx only, 2 mute
  private song: Song | null = null;
  private songName: string | null = null;
  private step = 0;
  private nextTime = 0;
  private timer: number | null = null;

  constructor() {
    try {
      const m = localStorage.getItem("beltbattles.sound");
      if (m) this.mode = Math.max(0, Math.min(2, Number(m) || 0));
    } catch { /* ignore */ }
  }

  unlock(): void {
    if (!this.ctx) {
      const AC = (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext);
      if (!AC) return;
      const ctx = new AC();
      this.ctx = ctx;
      this.master = ctx.createGain();
      this.master.gain.value = 0.9;
      this.master.connect(ctx.destination);
      this.sfxBus = ctx.createGain();
      this.musBus = ctx.createGain();
      this.sfxBus.connect(this.master);
      this.musBus.connect(this.master);
      const len = ctx.sampleRate;
      this.noiseBuf = ctx.createBuffer(1, len, ctx.sampleRate);
      const d = this.noiseBuf.getChannelData(0);
      let s = 1;
      for (let i = 0; i < len; i++) {
        s = (s * 1103515245 + 12345) >>> 0;
        d[i] = (s / 4294967296) * 2 - 1;
      }
      for (const [w, duty] of [["p12", 0.125], ["p25", 0.25], ["p50", 0.5]] as [Wave, number][]) {
        const n = 48;
        const re = new Float32Array(n), im = new Float32Array(n);
        for (let k = 1; k < n; k++) {
          re[k] = Math.sin(2 * Math.PI * k * duty) / (k * Math.PI);
          im[k] = (1 - Math.cos(2 * Math.PI * k * duty)) / (k * Math.PI);
        }
        this.waves.set(w, ctx.createPeriodicWave(re, im));
      }
      this.applyMode();
    }
    if (this.ctx.state === "suspended") void this.ctx.resume();
  }

  /** C1 (BRIEF-C1 item 3): audio was unlocked (a first tap made the context). Before that there is nothing to pause or resume. */
  get unlocked(): boolean {
    return this.ctx !== null;
  }

  /** C1: suspend the WebAudio context: the page is hidden (bindPageAudio) or the phone wrapper's app went to the background
   *  (pauseAudio, called from Capacitor's appStateChange by job M1). Nothing sounds and the context's clock stands still, so
   *  the music carries on from the same beat when resume() runs. No-op before unlock(). */
  pause(): void {
    const ctx = this.ctx;
    if (!ctx || ctx.state === "closed") return;
    try {
      void Promise.resolve(ctx.suspend()).catch(() => undefined);
    } catch { /* a context that cannot suspend stays as it is */ }
  }

  /** C1: undo pause(): resume the context only if audio was unlocked and the player's sound mode is on (not OFF: nothing
   *  would sound, and a suspended context saves the phone's battery; the next tap's unlock() resumes it, as it always did).
   *  The context's own `state` is not asked: a suspend still in flight would read "running", and the resume must win. */
  resume(): void {
    const ctx = this.ctx;
    if (!ctx || this.mode === 2 || ctx.state === "closed") return;
    try {
      void Promise.resolve(ctx.resume()).catch(() => undefined);
    } catch { /* the next tap's unlock() tries again */ }
  }

  cycleMode(): number {
    this.mode = (this.mode + 1) % 3;
    try { localStorage.setItem("beltbattles.sound", String(this.mode)); } catch { /* ignore */ }
    this.applyMode();
    return this.mode;
  }

  private applyMode(): void {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.sfxBus.gain.setTargetAtTime(this.mode === 2 ? 0 : 0.34, t, 0.02);
    this.musBus.gain.setTargetAtTime(this.mode === 0 ? 0.55 : 0, t, 0.05);
  }

  private osc(wave: Wave, f0: number, f1: number, dur: number, vol: number, when: number, dest: AudioNode): void {
    const ctx = this.ctx!;
    const o = ctx.createOscillator();
    if (wave === "tri") o.type = "triangle";
    else if (wave === "saw") o.type = "sawtooth";
    else o.setPeriodicWave(this.waves.get(wave)!);
    o.frequency.setValueAtTime(Math.max(20, f0), when);
    if (f1 !== f0) o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), when + dur);
    const gn = ctx.createGain();
    gn.gain.setValueAtTime(0.0001, when);
    gn.gain.linearRampToValueAtTime(vol, when + 0.004);
    gn.gain.exponentialRampToValueAtTime(0.0001, when + dur);
    o.connect(gn);
    gn.connect(dest);
    o.start(when);
    o.stop(when + dur + 0.02);
  }

  private noise(dur: number, vol: number, type: BiquadFilterType, f0: number, f1: number, when: number, dest: AudioNode): void {
    const ctx = this.ctx!;
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    const flt = ctx.createBiquadFilter();
    flt.type = type;
    flt.frequency.setValueAtTime(f0, when);
    if (f1 !== f0) flt.frequency.exponentialRampToValueAtTime(Math.max(30, f1), when + dur);
    const gn = ctx.createGain();
    gn.gain.setValueAtTime(vol, when);
    gn.gain.exponentialRampToValueAtTime(0.0001, when + dur);
    src.connect(flt);
    flt.connect(gn);
    gn.connect(dest);
    const off = Math.random() * 0.5;
    src.start(when, off, dur + 0.05);
  }

  play(name: Sfx, param = 0): void {
    if (!this.ctx || this.mode === 2) return;
    const now = this.ctx.currentTime;
    const gap: Partial<Record<Sfx, number>> = {
      stamp: 0.07, sizzle: 0.09, fire_light: 0.045, commission: 0.08, load: 0.06, impact_small: 0.05,
      zap: 0.08, belt: 0.02, impact: 0.05, fuse: 0.12,
    };
    const lim = gap[name];
    if (lim) {
      const l = this.last.get(name) ?? -1;
      if (now - l < lim) return;
      this.last.set(name, now);
    }
    const d = this.sfxBus;
    const t = now + 0.005;
    switch (name) {
      case "click": this.osc("p25", 1200, 1200, 0.03, 0.12, t, d); break;
      case "belt": {
        const scale = [440, 494, 554, 659, 740, 880, 988, 1109, 1319, 1480, 1760];
        const f = scale[Math.min(scale.length - 1, Math.max(0, param))];
        this.osc("p25", f, f, 0.05, 0.1, t, d);
        break;
      }
      case "connect":
        [660, 880, 1109, 1319, 1760].forEach((f, i) => this.osc("p25", f, f, 0.07, 0.12, t + i * 0.045, d));
        break;
      case "error":
        this.osc("saw", 110, 104, 0.14, 0.09, t, d);
        this.osc("p50", 116, 110, 0.14, 0.06, t, d);
        break;
      case "place":
        this.osc("p50", 240, 110, 0.08, 0.14, t, d);
        this.noise(0.05, 0.12, "lowpass", 1200, 400, t, d);
        break;
      case "pickup": this.osc("p25", 330, 700, 0.07, 0.1, t, d); break;
      case "coin":
        this.osc("p25", 988, 988, 0.06, 0.12, t, d);
        this.osc("p25", 1319, 1319, 0.2, 0.12, t + 0.06, d);
        break;
      case "sell":
        this.osc("p25", 1319, 1319, 0.06, 0.1, t, d);
        this.osc("p25", 988, 988, 0.15, 0.1, t + 0.06, d);
        break;
      case "stamp":
        this.noise(0.06, 0.07, "lowpass", 500, 200, t, d);
        this.osc("tri", 100, 60, 0.07, 0.12, t, d);
        break;
      case "sizzle": this.noise(0.12, 0.04, "highpass", 3000, 5000, t, d); break;
      case "zap": this.osc("p12", 1800, 300, 0.1, 0.05, t, d); break;
      case "fire_heavy":
        this.noise(0.28, 0.28, "lowpass", 1400, 150, t, d);
        this.osc("p50", 190, 45, 0.22, 0.18, t, d);
        break;
      case "fire_light": this.osc("p25", 1500, 520, 0.07, 0.06, t, d); break;
      case "impact":
        this.noise(0.36, 0.26, "lowpass", 1000, 90, t, d);
        this.osc("tri", 80, 35, 0.3, 0.3, t, d);
        break;
      case "impact_small": this.noise(0.1, 0.1, "bandpass", 1800, 900, t, d); break;
      case "jam":
        this.osc("p50", 95, 80, 0.16, 0.18, t, d);
        this.noise(0.35, 0.07, "highpass", 2500, 1500, t + 0.05, d);
        break;
      case "commission":
        this.osc("p25", 1760, 1760, 0.03, 0.05, t, d);
        this.osc("p25", 2637, 2637, 0.06, 0.05, t + 0.03, d);
        break;
      case "siren":
        for (let i = 0; i < 6; i++) this.osc("p50", i % 2 ? 660 : 440, i % 2 ? 660 : 440, 0.17, 0.07, t + i * 0.18, d);
        break;
      case "horn":
        this.osc("tri", 220, 220, 0.3, 0.22, t, d);
        this.osc("tri", 277, 277, 0.3, 0.14, t, d);
        this.osc("tri", 220, 220, 0.4, 0.22, t + 0.38, d);
        this.osc("tri", 277, 277, 0.4, 0.14, t + 0.38, d);
        break;
      case "ready":
        for (let i = 0; i < 3; i++) this.osc("p25", 880, 880, 0.07, 0.1, t + i * 0.16, d);
        break;
      case "go":
        this.osc("p25", 1760, 1760, 0.25, 0.12, t, d);
        this.osc("p50", 880, 880, 0.25, 0.08, t, d);
        break;
      case "win":
        [523, 659, 784, 1047].forEach((f, i) => this.osc("p25", f, f, 0.12, 0.13, t + i * 0.1, d));
        this.osc("p25", 1047, 1047, 0.5, 0.12, t + 0.42, d);
        this.osc("p12", 1319, 1319, 0.5, 0.08, t + 0.42, d);
        break;
      case "lose":
        [392, 349, 311, 294].forEach((f, i) => this.osc("p50", f, f * 0.98, 0.18, 0.12, t + i * 0.17, d));
        break;
      case "boom":
        this.noise(1.3, 0.4, "lowpass", 700, 50, t, d);
        this.osc("tri", 65, 28, 1.0, 0.35, t, d);
        break;
      case "whoosh": this.noise(0.3, 0.08, "bandpass", 400, 2200, t, d); break;
      case "load": this.osc("p25", 620, 520, 0.025, 0.05, t, d); break;
      case "repair":
        for (let i = 0; i < 3; i++) this.osc("p25", 1400 + i * 300, 1400 + i * 300, 0.03, 0.06, t + i * 0.07, d);
        break;
      case "fuse":
        // 0.6.1d (ARSENAL.md §8.3): two rising blips, a clink, and (★3, param>=3) a third blip + a quiet thump.
        this.osc("p25", 660, 880, 0.09, 0.14, t, d);
        this.osc("p25", 880, 1320, 0.09, 0.14, t + 0.1, d);
        this.noise(0.05, 0.1, "bandpass", 4000, 4000, t + 0.16, d);
        if (param >= 3) {
          this.osc("p25", 1760, 1760, 0.08, 0.12, t + 0.24, d);
          this.noise(0.5, 0.16, "lowpass", 700, 50, t + 0.24, d);
          this.osc("tri", 65, 28, 0.4, 0.14, t + 0.24, d);
        }
        break;
    }
  }

  music(name: "prep" | "battle" | null): void {
    if (name === this.songName) return;
    this.songName = name;
    this.song = name === "battle" ? BATTLE : name === "prep" ? PREP : null;
    this.step = 0;
    if (this.ctx) this.nextTime = this.ctx.currentTime + 0.08;
    if (this.song && this.timer === null) {
      this.timer = window.setInterval(() => this.pump(), 25);
    }
    if (!this.song && this.timer !== null) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  private pump(): void {
    const ctx = this.ctx;
    const song = this.song;
    if (!ctx || !song) return;
    if (this.nextTime < ctx.currentTime - 0.3) this.nextTime = ctx.currentTime + 0.05;
    const stepDur = 60 / song.bpm / 4;
    while (this.nextTime < ctx.currentTime + 0.15) {
      for (const tr of song.tracks) {
        const n = tr.steps.length;
        const tok = tr.steps[this.step % n];
        if (!tok || tok === "." || tok === "-") continue;
        if (tr.wave === "noise") {
          if (tok === "K") {
            this.osc("tri", 150, 45, 0.09, tr.vol * 3, this.nextTime, this.musBus);
          } else if (tok === "S") this.noise(0.12, tr.vol * 1.2, "bandpass", 1800, 1200, this.nextTime, this.musBus);
          else if (tok === "H") this.noise(0.03, tr.vol * 0.6, "highpass", 7000, 7000, this.nextTime, this.musBus);
          continue;
        }
        let len = 1;
        while (tr.steps[(this.step + len) % n] === "-" && len < 16) len++;
        const f = freq(tok);
        if (f > 0) this.osc(tr.wave, f, f, stepDur * len * 0.92, tr.vol, this.nextTime, this.musBus);
      }
      this.step++;
      this.nextTime += stepDur;
    }
  }
}

// ---------------------------------------------------------------- C1 (BRIEF-C1 item 3): audio follows the page's visibility

/** The part of `document` read here (tests pass a fake). */
export interface VisibilityHost {
  visibilityState?: string;
  addEventListener(type: "visibilitychange", listener: () => void): void;
  removeEventListener(type: "visibilitychange", listener: () => void): void;
}

/** What the page's pause and resume act on: the Game's Audio, once bindPageAudio has been given it. */
let pageAudio: Pick<Audio, "pause" | "resume"> | null = null;

/** Suspend the page's audio (nothing before the Game has bound one). Exported for the phone wrapper (job M1): Capacitor's
 *  `App.addListener("appStateChange", ({ isActive }) => (isActive ? resumeAudio() : pauseAudio()))`. */
export function pauseAudio(): void {
  pageAudio?.pause();
}

/** Resume the page's audio after pauseAudio, if it was unlocked and the player's sound mode is on (Audio.resume). */
export function resumeAudio(): void {
  pageAudio?.resume();
}

/** Make `audio` the page's audio (pauseAudio and resumeAudio act on it) and keep it in step with the page: suspended while the
 *  page is hidden, resumed when it is visible again (Audio.resume's rules). Returns a function that undoes both. */
export function bindPageAudio(audio: Pick<Audio, "pause" | "resume">, doc: VisibilityHost | undefined = typeof document === "undefined" ? undefined : document): () => void {
  pageAudio = audio;
  const onChange = () => (doc?.visibilityState === "hidden" ? audio.pause() : audio.resume());
  doc?.addEventListener("visibilitychange", onChange);
  return () => {
    doc?.removeEventListener("visibilitychange", onChange);
    if (pageAudio === audio) pageAudio = null;
  };
}
