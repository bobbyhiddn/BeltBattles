// C1 (store hardening, BRIEF-C1 item 1): is the device offline? One question, read where it is asked, with no state of its
// own: the phone and Steam builds must not wait for a network that is not there (Apple's reviewer may have none).
// `navigator.onLine === false` is the one reliable answer: the browser says there is no connection at all. `true` proves
// nothing (a dead network can still read true), so that case keeps its own guard, the ghost fetch's 4 s deadline
// (online.ts FETCH_TIMEOUT_MS). Where there is no `navigator` (tests, a server), or it has no `onLine`, the answer is
// "not offline": the game then behaves exactly as it did before this module existed.

/** The part of `navigator` read here (tests pass a fake). */
export interface NavLike {
  onLine?: boolean;
}

/** The part of `window` read here (tests pass a fake). */
export interface EventHost {
  addEventListener(type: string, listener: () => void): void;
  removeEventListener(type: string, listener: () => void): void;
}

/** True only when the browser says there is no network. */
export function isOffline(nav: NavLike | undefined = typeof navigator === "undefined" ? undefined : navigator): boolean {
  return nav?.onLine === false;
}

/** Calls `onChange(offline)` when the page's `offline` event (true) or `online` event (false) fires. Returns a function that
 *  stops listening. With no host (no window) it listens to nothing. */
export function watchConnectivity(host: EventHost | undefined, onChange: (offline: boolean) => void): () => void {
  if (!host) return () => undefined;
  const gone = () => onChange(true);
  const back = () => onChange(false);
  host.addEventListener("offline", gone);
  host.addEventListener("online", back);
  return () => {
    host.removeEventListener("offline", gone);
    host.removeEventListener("online", back);
  };
}
