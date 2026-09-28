import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import {
  createSessionRequestSchema,
  requestSignInCodeRequestSchema,
  type CreateSessionResponse,
  type RequestSignInCodeResponse,
} from "@memory-shoebox/shared";
import { mintSignInCode } from "../auth/mintSignInCode.ts";
import { redeemSignInCode } from "../auth/redeemSignInCode.ts";
import {
  clearSessionCookie,
  getSessionTokenFromRequest,
  setSessionCookie,
} from "../auth/sessionCookie.ts";
import { makeTokenHashFromToken } from "../auth/sessionToken.ts";
import { runInImmediateTransaction } from "../db/runInImmediateTransaction.ts";
import { ApiError } from "../http/ApiError.ts";
import { getMeDtoFromMemberId } from "../members/getMeDtoFromMemberId.ts";
import { readShellSettings } from "../settings/readShellSettings.ts";

/**
 * Sign-in codes and sessions: `tech-specs/apis/auth.md`.
 *
 * Every route here is anonymous, and each names the rules that apply to it:
 * rate limiting is applied by the middleware and never by a handler
 * (`conventions.md` § Rate limits).
 */
export async function authRoutes(app: FastifyInstance): Promise<void> {
  /**
   * Both mint routes, which are deliberately the same handler.
   *
   * The split exists so the client's state machine can tell "Send another"
   * (state `resent`, which says plainly that the old code has stopped working)
   * from a first request (state `sent`). The server behaves identically on
   * purpose: a route that behaved differently depending on whether a code was
   * already outstanding would leak that fact.
   */
  const requestSignInCode = async (
    request: FastifyRequest,
    reply: FastifyReply,
  ): Promise<RequestSignInCodeResponse> => {
    const body = requestSignInCodeRequestSchema.parse(request.body);
    const now = request.server.clock().toISOString();

    const minted = await runInImmediateTransaction({
      database: request.server.database,
      callback: (transaction) => {
        return mintSignInCode({
          transaction,
          email: body.email,
          pepper: request.server.config.signInCodePepper,
          now,
        });
      },
    });

    // 202 rather than 200: nothing has been sent when this is written. The row
    // is committed and the message is queued; the provider is never called
    // inside the request.
    void reply.code(202);
    // The echoed address proves nothing: it is the caller's own input, echoed
    // so the copy can bold the canonical form.
    return { email: body.email, expiresAt: minted.expiresAt };
  };

  app.post(
    "/auth/sign-in-codes",
    {
      config: {
        rateLimit: ["signInCodeRequestPerAddress", "signInCodeRequestPerIp"],
      },
    },
    requestSignInCode,
  );

  // The same two rules, and therefore the same buckets: the per-address one is
  // shared, or the resend is a way round the cap (`auth.md` Ruling 3).
  app.post(
    "/auth/sign-in-codes/resend",
    {
      config: {
        rateLimit: ["signInCodeRequestPerAddress", "signInCodeRequestPerIp"],
      },
    },
    requestSignInCode,
  );

  app.post(
    "/auth/session",
    { config: { rateLimit: ["sessionCreatePerAddress"] } },
    async (request, reply): Promise<CreateSessionResponse> => {
      const body = createSessionRequestSchema.parse(request.body);
      const outcome = await redeemSignInCode({
        database: request.server.database,
        email: body.email,
        code: body.code,
        pepper: request.server.config.signInCodePepper,
        now: request.server.clock().toISOString(),
        userAgent: request.headers["user-agent"],
        presentedToken: getSessionTokenFromRequest(request),
      });

      // The refusals are thrown here rather than inside the transaction: a
      // throw in there rolls back the attempt increment, and a wrong code
      // that does not count down never reaches "two tries left".
      if (outcome.kind === "expired") {
        throw ApiError.gone("sign_in_code_expired");
      }
      if (outcome.kind === "invalid") {
        throw ApiError.signInCodeInvalid(outcome.attemptsRemaining);
      }
      if (outcome.kind === "exhausted") {
        throw ApiError.signInCodeAttemptsExhausted();
      }

      setSessionCookie({ reply, token: outcome.session.token });
      void reply.code(201);
      return {
        me: await getMeDtoFromMemberId({
          database: request.server.database,
          memberId: outcome.memberId,
        }),
        session: {
          sessionId: outcome.session.sessionId,
          deviceLabel: outcome.session.deviceLabel,
          createdAt: outcome.session.createdAt,
          lastUsedAt: outcome.session.lastUsedAt,
          expiresAt: outcome.session.expiresAt,
          // The device this request just created.
          isCurrent: true,
        },
        isFirstSignIn: outcome.isFirstSignIn,
        settings: await readShellSettings(request.server.database),
      };
    },
  );

  /**
   * Signing out, which must never fail.
   *
   * **The one route in the product that must not call `requireViewer`**
   * (`conventions.md` § The auth middleware): a dead, expired or absent
   * cookie still gets the clearing header, because a person pressing "sign
   * out" and being told they are not signed in has been failed by the
   * software rather than informed by it. The 401 is kept for the one case
   * where there is nothing at all to sign out of.
   *
   * The delete keys on the presented token rather than on
   * `viewer.sessionId`, which is the same row when there is a viewer and is
   * also the only way to answer a cookie the middleware could not resolve.
   */
  app.delete("/auth/session", async (request, reply) => {
    const token = getSessionTokenFromRequest(request);
    if (token === undefined) {
      throw ApiError.notSignedIn();
    }

    await request.server.database
      .deleteFrom("sessions")
      .where("token_hash", "=", makeTokenHashFromToken(token))
      .execute();

    // It stops working immediately, everywhere, because the middleware looks
    // the session up in the database on every request.
    clearSessionCookie(reply);
    // `members.last_seen_at` is not touched: signing out is not being seen.
    return reply.code(204).send();
  });
}
