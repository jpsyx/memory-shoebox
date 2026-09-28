import { Resend } from "resend";
import { MailSendError } from "../MailSendError.ts";
import type { EmailService } from "./EmailService.types.ts";
import type { SendRateLimiter } from "./createSendRateLimiter.ts";

/**
 * How many times one message may meet a rate limit before it is given up on.
 *
 * A rate limit is not the message failing, so it does not spend one of the
 * row's five attempts. It still needs a ceiling, or a provider stuck on 429
 * would hold the worker forever and every other queued message behind it.
 */
const RATE_LIMIT_ATTEMPTS = 3;

/** Whether the provider refused because we are sending too fast. */
function _isRateLimited(error: {
  name?: string;
  statusCode?: number;
}): boolean {
  return error.name === "rate_limit_exceeded" || error.statusCode === 429;
}

/** The slice of the Resend SDK this uses, so a test can stand in for it. */
export type ResendEmailsApi = {
  send: (
    payload: {
      from: string;
      to: string[];
      subject: string;
      html: string;
      text: string;
    },
    options: { idempotencyKey: string },
  ) => Promise<{
    data?: { id: string } | null;
    error?: { name?: string; message: string; statusCode?: number } | null;
  }>;
};

/**
 * Builds the Resend-backed sender.
 *
 * The provider's own idempotency key is passed as well as our unique index,
 * and the two guard different things: the index stops a retried **handler**
 * writing a second row, and this stops a retried **send** of one row
 * duplicating a message whose success we did not hear about. Resend's keys
 * expire after 24 hours, which is longer than this worker's whole retry
 * schedule.
 *
 * @param options.apiKey From `RESEND_API_KEY`.
 * @param options.limiter Waited on before every call, including a retry, so
 *   the provider is never asked faster than its window allows.
 * @param options.emails Overridable so a test never reaches the network.
 * @returns A sender that hands one message to Resend at a time.
 */
export function createResendEmailService(options: {
  apiKey: string;
  limiter: SendRateLimiter;
  emails?: ResendEmailsApi;
}): EmailService {
  const emails =
    options.emails ?? (new Resend(options.apiKey).emails as ResendEmailsApi);

  return {
    send: async (request) => {
      for (let attempt = 1; ; attempt += 1) {
        await options.limiter.acquire();

        // The call is wrapped rather than assigned out of a `try`, so the
        // response is a `const` and its type comes from the call rather than
        // from an annotation written only because the assignment was deferred.
        const response = await (async () => {
          try {
            return await emails.send(
              {
                from: request.from,
                to: [request.to],
                subject: request.subject,
                html: request.html,
                text: request.text,
              },
              { idempotencyKey: request.idempotencyKey },
            );
          } catch (error: unknown) {
            throw new MailSendError({
              code: "provider_unreachable",
              message: error instanceof Error ? error.message : String(error),
            });
          }
        })();

        // Nullish rather than `!== null`: the SDK's declared shape is one of
        // the two fields, but a response carrying neither must not crash the
        // worker on a property read. Such a response falls through as an
        // acceptance with no id, which is what an undefined
        // `providerMessageId` is for.
        const error = response.error ?? undefined;
        if (error === undefined) {
          return { providerMessageId: response.data?.id };
        }

        // Going too fast is our problem rather than the message's, so it buys
        // another slot instead of spending one of the row's attempts.
        if (_isRateLimited(error) && attempt < RATE_LIMIT_ATTEMPTS) {
          continue;
        }

        throw new MailSendError({
          code: error.name ?? "provider_rejected",
          message: error.message,
        });
      }
    },
  };
}
