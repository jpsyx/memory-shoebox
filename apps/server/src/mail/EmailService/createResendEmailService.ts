import { Resend } from "resend";
import { MailSendError } from "../MailSendError.ts";
import type { EmailService } from "./EmailService.types.ts";

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
    error?: { name?: string; message: string } | null;
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
 * @param options.emails Overridable so a test never reaches the network.
 * @returns A sender that hands one message to Resend at a time.
 */
export function createResendEmailService(options: {
  apiKey: string;
  emails?: ResendEmailsApi;
}): EmailService {
  const emails =
    options.emails ?? (new Resend(options.apiKey).emails as ResendEmailsApi);

  return {
    send: async (request) => {
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
      if (error !== undefined) {
        throw new MailSendError({
          code: error.name ?? "provider_rejected",
          message: error.message,
        });
      }

      return { providerMessageId: response.data?.id };
    },
  };
}
