import type { FastifyInstance, FastifyRequest } from "fastify";
import type { Kysely } from "kysely";
import type { Database } from "../../db/types/db.types.ts";
import { ApiError } from "../apiError.ts";
import {
  createFixedWindowLimiter,
  type FixedWindowLimiter,
  type RateLimitOutcome,
} from "./buckets.ts";
import { checkInvitationResendLimit } from "./invitationResend.ts";
import {
  RATE_LIMIT_RULES,
  type RateLimitRuleName,
  type RateLimitScope,
} from "./rules.ts";

declare module "fastify" {
  interface FastifyContextConfig {
    /**
     * The rules that apply to this route. An authenticated route that names
     * none gets `authenticatedDefault`. Rate limiting is applied by the
     * middleware and never by a handler
     * (`apis/conventions.md` § Rate limits).
     */
    rateLimit?: readonly RateLimitRuleName[];
  }

  interface FastifyInstance {
    rateLimiter: FixedWindowLimiter;
  }
}

/** The address a sign-in route is about, normalised the way the row is. */
function _addressFromBody(request: FastifyRequest): string | null {
  const body: unknown = request.body;
  if (typeof body !== "object" || body === null || !("email" in body)) {
    return null;
  }
  const email: unknown = (body as { email: unknown }).email;
  if (typeof email !== "string" || email.trim() === "") {
    return null;
  }
  return email.trim().toLowerCase();
}

/**
 * What a rule counts against for this request, or null when the request
 * carries nothing to count.
 *
 * Null skips the rule rather than refusing: a sign-in body with no address
 * fails validation in the handler with a `400 invalid_request` naming the
 * field, which is a better answer than a `429` about a bucket nobody could
 * have filled. Nothing is opened up by that: the per-IP rule keys on
 * something every request carries, so a caller omitting the address still
 * meets a cap on the route where it matters.
 */
function _scopeValue(
  scope: RateLimitScope,
  request: FastifyRequest,
): string | null {
  switch (scope) {
    case "address":
      return _addressFromBody(request);
    case "ip":
      return request.ip;
    case "session":
      return request.viewer?.sessionId ?? null;
    case "member":
      return request.viewer?.memberId ?? null;
    case "invitation": {
      const params: unknown = request.params;
      if (
        typeof params !== "object" ||
        params === null ||
        !("memberId" in params)
      ) {
        return null;
      }
      const memberId: unknown = (params as { memberId: unknown }).memberId;
      return typeof memberId === "string" ? memberId : null;
    }
  }
}

/**
 * Applies every rate limit in `apis/conventions.md` § Rate limits.
 *
 * `preHandler` rather than `onRequest`, because two of the six rules key on
 * the address in the body and the body is not parsed until after `onRequest`.
 * It is still middleware: a handler neither knows about a limit nor can forget
 * one.
 *
 * @param app The Fastify instance.
 * @param options.database Read by the invitation resend rule, and by no other.
 * @param options.clock Overridable so a test can hold time still.
 */
export function registerRateLimit(
  app: FastifyInstance,
  options: {
    database: Kysely<Database>;
    clock?: () => Date;
  },
): void {
  const clock =
    options.clock ??
    (() => {
      return new Date();
    });
  const limiter = createFixedWindowLimiter();
  app.decorate("rateLimiter", limiter);

  app.addHook("preHandler", async (request) => {
    const declared = request.routeOptions.config.rateLimit;
    const ruleNames: readonly RateLimitRuleName[] =
      declared ?? (request.viewer === null ? [] : ["authenticatedDefault"]);

    const now = clock();
    for (const ruleName of ruleNames) {
      const rule = RATE_LIMIT_RULES[ruleName];
      const value = _scopeValue(rule.scope, request);
      if (value === null) {
        continue;
      }

      const outcome: RateLimitOutcome =
        rule.scope === "invitation"
          ? await checkInvitationResendLimit({
              database: options.database,
              memberId: value,
              now: now.toISOString(),
            })
          : limiter.consume({
              key: `${ruleName}:${value}`,
              windows: rule.windows,
              nowMs: now.getTime(),
            });

      if (!outcome.isAllowed) {
        throw ApiError.rateLimited(outcome.retryAfterSeconds);
      }
    }
  });
}
