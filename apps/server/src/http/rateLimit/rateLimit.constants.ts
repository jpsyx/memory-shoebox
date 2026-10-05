import type { RateLimitWindow } from "./createFixedWindowLimiter.ts";

/**
 * What a rule counts against.
 *
 * `invitation` is the one that is not a counter at all: `conventions.md` says
 * the middleware reads `invitations.last_sent_at`, which exists for it.
 */
export type RateLimitScope =
  | "address"
  | "ip"
  | "session"
  | "member"
  | "invitation";

/**
 * The rules a route may name, written once.
 *
 * **Not `keyof typeof RATE_LIMIT_RULES`**, which would be shorter and would
 * give up the only check that the table below still holds every row of
 * `apis/conventions.md` § Rate limits. Five of the six are named by no route
 * yet, so a row dropped from the table would narrow the union with nothing
 * left to go red: the per-IP cap on sign-in codes would quietly stop existing,
 * which is the failure `_trustedProxyHops` in `app.ts` exists to prevent. The
 * `satisfies` below is what turns that into a compile error.
 *
 * File-local: nothing outside validates an arbitrary string against it, since
 * a route names its rules in typed Fastify route config.
 */
const RULE_NAMES = [
  "setupCreatePerIp",
  "signInCodeRequestPerAddress",
  "signInCodeRequestPerIp",
  "sessionCreatePerAddress",
  "invitationResendPerInvitation",
  "conversationWritePerMember",
  "publicReadPerIp",
  "uploadSessionPerSession",
  "authenticatedDefault",
] as const;

/** The rules a route may name. */
export type RateLimitRuleName = (typeof RULE_NAMES)[number];

/** One named rule: what it counts against, and its allowances. */
export type RateLimitRule = {
  scope: RateLimitScope;
  windows: readonly RateLimitWindow[];
};

/**
 * Every row of `apis/conventions.md` § Rate limits, applied by the middleware
 * and never by a handler.
 *
 * A route names the rules that apply to it in its Fastify route config. An
 * authenticated route that names none gets `authenticatedDefault`, which is
 * the table's last row.
 */
export const RATE_LIMIT_RULES = {
  /** Anonymous first-admin creation attempts, confined to process memory. */
  setupCreatePerIp: {
    scope: "ip",
    windows: [{ limit: 20, windowSeconds: 3600 }],
  },
  /**
   * **Shared with the resend path**, which is why the key is the address and
   * not the address and the route: a resend that drew on its own bucket would
   * be a way round the cap.
   */
  signInCodeRequestPerAddress: {
    scope: "address",
    windows: [{ limit: 5, windowSeconds: 3600 }],
  },
  /**
   * The one place in the product an IP address is touched, in memory, never
   * stored and never logged (`data-models.md` § Privacy).
   */
  signInCodeRequestPerIp: {
    scope: "ip",
    windows: [{ limit: 20, windowSeconds: 3600 }],
  },
  /** On top of the per-code attempt cap, which `sign_in_codes` holds. */
  sessionCreatePerAddress: {
    scope: "address",
    windows: [{ limit: 10, windowSeconds: 3600 }],
  },
  /** Two windows: an admin's impatient second click, and their tenth. */
  invitationResendPerInvitation: {
    scope: "invitation",
    windows: [
      { limit: 1, windowSeconds: 60 },
      { limit: 10, windowSeconds: 86_400 },
    ],
  },
  /** Comment and reaction writes. */
  conversationWritePerMember: {
    scope: "member",
    windows: [{ limit: 60, windowSeconds: 60 }],
  },
  /**
   * `GET /api/public-settings`, the one route an unauthenticated visitor can
   * call repeatedly.
   *
   * **An addition to `conventions.md` § Rate limits**, recorded the way
   * `auth.md` records the shared address bucket. `administration.md` says this
   * route "takes the per-IP bucket", and the only per-IP row in that table is
   * twenty an hour, which is a cap on mail somebody can aim at an inbox. This
   * route renders the sign-in page's top bar, so twenty an hour would lock out
   * anybody who reloads a slow page. The document's intent, that the anonymous
   * read has a cap, is kept; its number, aimed at a different route, is not.
   */
  publicReadPerIp: {
    scope: "ip",
    windows: [{ limit: 120, windowSeconds: 60 }],
  },
  /**
   * Every upload-session route, in place of the default: a batch on a fast
   * link outruns 600 a minute.
   *
   * **Sized for a large batch with headroom.** A file costs about four calls
   * (the original's presign, two derivative presigns, and `complete`; a
   * multipart original adds one re-presign per URL lifetime, nothing on a
   * fast link). The mockup's 264-file batch is about 1,056 calls and a
   * 200-file one about 800. Two lanes against a real deployment are bounded
   * by round trips: seven of them a file (four calls, three PUTs) at 30 ms or
   * more each, plus the hash and the decode, is at most about 8 files a
   * second, so about 32 calls a second, or 1,920 a minute. 3,000 a minute
   * clears that by half again and holds the 264-file batch nearly three
   * times over, while still capping a runaway client at 50 writes a second
   * on SQLite's one writer. The engine waits out a `429` for its
   * `retryAfterSeconds` rather than failing the file, so meeting the cap
   * costs a pause, not a casualty.
   */
  uploadSessionPerSession: {
    scope: "session",
    windows: [{ limit: 3000, windowSeconds: 60 }],
  },
  /** Everything else authenticated. */
  authenticatedDefault: {
    scope: "session",
    windows: [{ limit: 600, windowSeconds: 60 }],
  },
} as const satisfies Record<RateLimitRuleName, RateLimitRule>;
