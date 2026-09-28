import type { RateLimitWindow } from "./buckets.ts";

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

/** The rules a route may name. */
export type RateLimitRuleName =
  | "signInCodeRequestPerAddress"
  | "signInCodeRequestPerIp"
  | "sessionCreatePerAddress"
  | "invitationResendPerInvitation"
  | "conversationWritePerMember"
  | "authenticatedDefault";

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
