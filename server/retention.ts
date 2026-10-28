// S6D (REQ-BFG-119): how long the server keeps what a player sent. The operator's decisions of 2026-10-27/28, in ONE place: the
// ghost-admin commands prune-ghosts, prune-idle and weekly (server/retention.ts's readers: server/pruneAdmin.ts) take their defaults
// from here, and the tests of the privacy page (tests/s6.pages.test.ts) read these same constants, so the page cannot promise
// a period the code does not keep. To change a number, change it HERE and the page text its pin names (the test says which).
//
//   - an UPLOAD (a ghost) is kept GHOST_RETENTION_DAYS days after the server received it;
//   - a PLAYER (the profile, the device links, the Steam link and the run history) is kept until the player deletes it
//     (DELETE /v1/player), or until IDLE_RETENTION_DAYS days pass with no server-side sign of play: then the weekly clean-up deletes it
//     exactly as the player's own delete does (server/links.ts Links.deletePlayer) and removes the player's uploads;
//   - the clean-up runs every WEEKLY_CLEANUP_DAYS days (a scheduled machine, deploy/RUNBOOK.md); a run can be late or fail, so the page
//     promises CLEANUP_PROMISE_DAYS, twice the schedule.
//
// Months: the operator said 24 months. They are counted as IDLE_RETENTION_DAYS = 730 days (2 x 365), so "24 months" is always at least
// 730 days in the store and a leap year makes it one day sooner than two calendar years. The page says both.

/** One day in milliseconds. */
export const DAY_MS = 86_400_000;

/** An upload is deleted once the server received it more than this many days ago. */
export const GHOST_RETENTION_DAYS = 180;

/** A player is deleted once there has been no server-side sign of play for more than this many months... */
export const IDLE_RETENTION_MONTHS = 24;
/** ...counted as this many days. */
export const IDLE_RETENTION_DAYS = 730;

/** The weekly clean-up's rhythm in days (the scheduled machine runs `ghost-admin weekly --apply` this often). */
export const WEEKLY_CLEANUP_DAYS = 7;
/** What the privacy page promises for a deleted player's stored ghosts: within this many days (a weekly run can be late or fail). */
export const CLEANUP_PROMISE_DAYS = 14;

/**
 * The clock guard (prune-ghosts, prune-idle, weekly): a receipt time later than now plus this is a sign that the machine's clock is
 * wrong (set far ahead it would age every record at once), so the command refuses, deletes nothing and says why.
 */
export const CLOCK_GUARD_MS = DAY_MS;

/**
 * The other half of the clock guard. A clock far AHEAD of the store's own would make every record look old and nothing in the store can say so, except that the
 * newest record is then old too. So `--apply` of prune-ghosts, prune-idle and weekly refuses when the newest receipt time in the store is more than this many days
 * before now, unless `--stale-ok` is given (the weekly machine never passes it). A store this quiet has nobody to protect; a wrong clock has everybody.
 */
export const STALE_STORE_DAYS = 90;
