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
  "signInCodeRequestPerAddress",
  "signInCodeRequestPerIp",
  "sessionCreatePerAddress",
  "invitationResendPerInvitation",
  "conversationWritePerMember",
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
  /** Everything else authenticated. */
  authenticatedDefault: {
    scope: "session",
    windows: [{ limit: 600, windowSeconds: 60 }],
  },
} as const satisfies Record<RateLimitRuleName, RateLimitRule>;
