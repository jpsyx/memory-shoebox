/**
 * The numbers the sign-in path is built from, each stated in the interface or
 * the email and therefore written once.
 */

/** Ten minutes, stated in the UI and in the email. */
export const SIGN_IN_CODE_LIFETIME_MINUTES = 10;

/**
 * Three tries. Stored on the row as `max_attempts`, so "two tries left" is
 * computable from the row and a change here does not retroactively burn a live
 * code (`data-models.md` § `sign_in_codes`).
 */
export const SIGN_IN_CODE_MAX_ATTEMPTS = 3;

/** One day in milliseconds, the unit the two session timings are built from. */
const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Thirty days idle, which is what a device's "Stays until" counts down.
 *
 * File-local, because the two spellings below are what callers actually need
 * and a caller converting days for itself is how the cookie and the row came
 * to say thirty days separately in the first place.
 */
const SESSION_LIFETIME_DAYS = 30;

/** The same thirty days, as the slide writes them onto `expires_at`. */
export const SESSION_LIFETIME_MS = SESSION_LIFETIME_DAYS * DAY_MS;

/**
 * The same thirty days again, in the unit a cookie's `Max-Age` is written in.
 *
 * Derived rather than spelled out beside the `Set-Cookie`, so the browser and
 * `sessions.expires_at` cannot disagree about how long a device stays signed
 * in.
 */
export const SESSION_LIFETIME_SECONDS = SESSION_LIFETIME_MS / 1000;

/**
 * The slide threshold: `sessions.last_used_at`, `sessions.expires_at` and
 * `members.last_seen_at` move only when the remaining lifetime has moved by
 * more than this (`conventions.md` § The auth middleware).
 *
 * Without it, one timeline page of thumbnails is dozens of writes serialising
 * on SQLite's single writer.
 */
export const SESSION_SLIDE_THRESHOLD_MS = DAY_MS;
