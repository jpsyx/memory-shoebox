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

/** Thirty days idle, which is what a device's "Stays until" counts down. */
export const SESSION_LIFETIME_DAYS = 30;

/**
 * The slide threshold: `sessions.last_used_at`, `sessions.expires_at` and
 * `members.last_seen_at` move only when the remaining lifetime has moved by
 * more than this (`conventions.md` § The auth middleware).
 *
 * Without it, one timeline page of thumbnails is dozens of writes serialising
 * on SQLite's single writer.
 */
export const SESSION_SLIDE_THRESHOLD_MS = 24 * 60 * 60 * 1000;
