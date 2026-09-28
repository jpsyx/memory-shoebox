import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import {
  requestSignInCodeRequestSchema,
  type RequestSignInCodeResponse,
} from "@memory-shoebox/shared";
import { mintSignInCode } from "../auth/mintSignInCode.ts";
import { runInImmediateTransaction } from "../db/runInImmediateTransaction.ts";

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
}
