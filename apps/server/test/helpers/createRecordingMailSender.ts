import type {
  MailSender,
  MailSendRequest,
} from "../../src/mail/createResendMailSender.ts";
import { MailSendError } from "../../src/mail/MailSendError.ts";

/** A `MailSender` that records and never sends. */
export type RecordingMailSender = MailSender & {
  readonly sent: readonly MailSendRequest[];
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
export function createRecordingMailSender(): RecordingMailSender {
  const sent: MailSendRequest[] = [];
  const sender: RecordingMailSender = {
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
