// C1 (BRIEF-C1 item 3): audio follows the page. When the page is hidden (visibilitychange) the WebAudio context is suspended; when
// it is visible again it is resumed only if audio was unlocked (a first tap made the context) and the player's sound mode is on.
// pauseAudio and resumeAudio are exported for the phone wrapper's appStateChange (job M1). The first tap's unlock() is as it was.
// Built from fakes: the AudioContext, the document's events.
import { afterEach, describe, expect, it, vi } from "vitest";
import { Audio, bindPageAudio, pauseAudio, resumeAudio, type VisibilityHost } from "../src/audio/audio";
import { eventTarget, makeGame } from "./c1.gameHarness";

type State = "running" | "suspended" | "closed";

/** A fake AudioContext that logs what it is asked and changes `state` the way a real one does (a created context starts suspended). */
class FakeCtx {
  static made: FakeCtx[] = [];
  state: State = "suspended";
  currentTime = 0;
  sampleRate = 8000;
  destination = {};
  log: string[] = [];
  /** `suspend()` takes this many ms to land (the state still reads "running" meanwhile, as in a browser). */
  slow = 0;
  fail = false;
  constructor() {
    FakeCtx.made.push(this);
  }
  createGain() { return { gain: { value: 0, setTargetAtTime() {} }, connect() {} }; }
  createBuffer(_c: number, len: number) { return { getChannelData: () => new Float32Array(len) }; }
  createPeriodicWave() { return {}; }
  resume(): Promise<void> {
    this.log.push("resume");
    if (this.fail) return Promise.reject(new Error("resume refused"));
    this.state = "running";
    return Promise.resolve();
  }
  suspend(): Promise<void> {
    this.log.push("suspend");
    if (this.fail) throw new Error("suspend threw");
    if (this.slow) return new Promise<void>((r) => setTimeout(() => { this.state = "suspended"; r(); }, this.slow));
    this.state = "suspended";
    return Promise.resolve();
  }
}

afterEach(() => {
  FakeCtx.made.length = 0;
  vi.unstubAllGlobals();
});

/** An Audio that a first tap has unlocked, on a fake context. */
function unlocked(mode = 0): { a: Audio; ctx: FakeCtx } {
  vi.stubGlobal("window", { AudioContext: FakeCtx });
  const a = new Audio();
  a.mode = mode;
  a.unlock();
  return { a, ctx: FakeCtx.made[0] };
}

describe("C1 item 3: Audio.pause and Audio.resume", () => {
  it("before the first tap there is no context: pause and resume do nothing and make none", () => {
    vi.stubGlobal("window", { AudioContext: FakeCtx });
    const a = new Audio();
    expect(a.unlocked).toBe(false);
    a.pause();
    a.resume();
    expect(FakeCtx.made).toHaveLength(0);
    expect(a.ctx).toBeNull();
    expect(a.unlocked).toBe(false);
  });

  it("the first tap's unlock() is exactly as it was: one context, resumed if suspended, never a second", () => {
    const { a, ctx } = unlocked();
    expect(a.unlocked).toBe(true);
    expect(FakeCtx.made).toHaveLength(1);
    expect(ctx.log).toEqual(["resume"]); // created suspended: resumed on the tap
    a.unlock();
    a.unlock();
    expect(FakeCtx.made).toHaveLength(1);
    expect(ctx.log).toEqual(["resume"]); // running: nothing more
    ctx.state = "suspended"; // the browser suspended it: the next tap resumes it, as ever
    a.unlock();
    expect(ctx.log).toEqual(["resume", "resume"]);
  });

  it("pause suspends the context; resume resumes it, with sound on (music + sfx, or sfx only)", () => {
    for (const mode of [0, 1]) {
      const { a, ctx } = unlocked(mode);
      ctx.log.length = 0;
      a.pause();
      expect(ctx.log).toEqual(["suspend"]);
      expect(ctx.state).toBe("suspended");
      a.resume();
      expect(ctx.log).toEqual(["suspend", "resume"]);
      expect(ctx.state).toBe("running");
      vi.unstubAllGlobals();
      FakeCtx.made.length = 0;
    }
  });

  it("resume does nothing with sound OFF (mode 2); pause still suspends; the next tap's unlock() resumes it as it always did", () => {
    const { a, ctx } = unlocked(2);
    ctx.log.length = 0;
    a.pause();
    a.resume();
    expect(ctx.log).toEqual(["suspend"]);
    expect(ctx.state).toBe("suspended");
    a.mode = 0; // the player turned sound back on (SND button), the tap before it ran unlock():
    a.unlock();
    expect(ctx.log).toEqual(["suspend", "resume"]);
    expect(ctx.state).toBe("running");
  });

  it("a suspend still landing reads `running`: resume does not ask the state, so it still resumes (quick hide and show)", async () => {
    const { a, ctx } = unlocked();
    ctx.slow = 5;
    ctx.log.length = 0;
    a.pause();
    expect(ctx.state).toBe("running"); // the suspend has not landed yet
    a.resume();
    expect(ctx.log).toEqual(["suspend", "resume"]);
    await new Promise((r) => setTimeout(r, 10));
  });

  it("a closed context is left alone; a context that refuses or throws is quiet (no unhandled rejection, no throw)", async () => {
    const { a, ctx } = unlocked();
    ctx.state = "closed";
    ctx.log.length = 0;
    a.pause();
    a.resume();
    expect(ctx.log).toEqual([]);
    ctx.state = "running";
    ctx.fail = true;
    expect(() => a.pause()).not.toThrow(); // suspend() throws
    expect(() => a.resume()).not.toThrow(); // resume() rejects
    await new Promise((r) => setTimeout(r, 5));
    expect(ctx.log).toEqual(["suspend", "resume"]);
  });
});

describe("C1 item 3: bindPageAudio, pauseAudio, resumeAudio", () => {
  function fakeDoc(): VisibilityHost & { visibilityState: string; fire(): void; count(): number } {
    const t = eventTarget();
    return Object.assign({ visibilityState: "visible" }, {
      addEventListener: (type: "visibilitychange", fn: () => void) => t.addEventListener(type, fn),
      removeEventListener: (type: "visibilitychange", fn: () => void) => t.removeEventListener(type, fn),
      fire: () => t.fire("visibilitychange"),
      count: () => t.count("visibilitychange"),
    });
  }

  it("hidden pauses, visible resumes; the exported pauseAudio and resumeAudio act on the bound audio; unbinding undoes both", () => {
    const calls: string[] = [];
    const audio = { pause: () => void calls.push("pause"), resume: () => void calls.push("resume") };
    const doc = fakeDoc();
    pauseAudio(); // nothing bound yet: nothing happens
    resumeAudio();
    expect(calls).toEqual([]);
    const unbind = bindPageAudio(audio, doc);
    expect(doc.count()).toBe(1);
    doc.visibilityState = "hidden";
    doc.fire();
    doc.visibilityState = "visible";
    doc.fire();
    expect(calls).toEqual(["pause", "resume"]);
    pauseAudio(); // the phone wrapper's appStateChange: inactive
    resumeAudio(); // ... and active again
    expect(calls).toEqual(["pause", "resume", "pause", "resume"]);
    unbind();
    expect(doc.count()).toBe(0);
    doc.visibilityState = "hidden";
    doc.fire();
    pauseAudio();
    expect(calls).toEqual(["pause", "resume", "pause", "resume"]); // unbound: the page's audio is gone
  });

  it("with no document (a server, a test) it binds only the exported functions", () => {
    const calls: string[] = [];
    const unbind = bindPageAudio({ pause: () => void calls.push("pause"), resume: () => void calls.push("resume") }, undefined);
    pauseAudio();
    resumeAudio();
    expect(calls).toEqual(["pause", "resume"]);
    unbind();
  });

  it("end to end on a real Audio: hide suspends the context, show resumes it with sound on and leaves it with sound OFF", () => {
    const { a, ctx } = unlocked();
    const doc = fakeDoc();
    const unbind = bindPageAudio(a, doc);
    ctx.log.length = 0;
    doc.visibilityState = "hidden";
    doc.fire();
    expect(ctx.log).toEqual(["suspend"]);
    doc.visibilityState = "visible";
    doc.fire();
    expect(ctx.log).toEqual(["suspend", "resume"]);
    a.mode = 2;
    doc.visibilityState = "hidden";
    doc.fire();
    doc.visibilityState = "visible";
    doc.fire();
    expect(ctx.log).toEqual(["suspend", "resume", "suspend"]);
    unbind();
  });
});

describe("C1 item 3: the Game wires it", () => {
  it("a Game binds its audio to the document's visibilitychange; the exported functions reach it; the old handler is still there", () => {
    const r = makeGame({ w: 390, h: 844, dpr: 3 });
    vi.stubGlobal("window", Object.assign(r.win, { AudioContext: FakeCtx }));
    r.game.audio.unlock(); // a first tap
    const ctx = FakeCtx.made[0];
    ctx.log.length = 0;
    expect(r.doc.count("visibilitychange")).toBe(2); // the Game's own (frame clock, retained frame) and the audio's
    r.doc.visibilityState = "hidden";
    r.doc.fire("visibilitychange");
    expect(ctx.log).toEqual(["suspend"]);
    r.doc.visibilityState = "visible";
    r.doc.fire("visibilitychange");
    expect(ctx.log).toEqual(["suspend", "resume"]);
    pauseAudio();
    resumeAudio();
    expect(ctx.log).toEqual(["suspend", "resume", "suspend", "resume"]);
    r.game.audio.mode = 2; // sound OFF: the page showing again leaves the context suspended
    r.doc.visibilityState = "hidden";
    r.doc.fire("visibilitychange");
    r.doc.visibilityState = "visible";
    r.doc.fire("visibilitychange");
    expect(ctx.log.slice(4)).toEqual(["suspend"]);
  });
});
