import type {
  EmailSendRequest,
  EmailService,
} from "../../src/mail/EmailService/EmailService.types.ts";
import { MailSendError } from "../../src/mail/MailSendError.ts";

/** An `EmailService` that records and never sends. */
export type RecordingEmailService = EmailService & {
  readonly sent: readonly EmailSendRequest[];
  /** Set to make the next and every later send fail with this code. */
  failWith: { code: string; message: string } | null;
};

/**
 * Builds the only sender any test uses.
 *
 * There is no path from the test suite to a mail provider, deliberately: the
 * repository holds no key, and a test that somehow constructed the real sender
 * would be sending with a placeholder.
 *
 * @returns A recording sender, empty, with no failure armed.
 */
export function createRecordingEmailService(): RecordingEmailService {
  const sent: EmailSendRequest[] = [];
  const sender: RecordingEmailService = {
    sent,
    failWith: null,
    send: (request) => {
      if (sender.failWith !== null) {
        return Promise.reject(new MailSendError(sender.failWith));
      }
      sent.push(request);
      return Promise.resolve({ providerMessageId: `fake-${sent.length}` });
    },
  };
  return sender;
}
