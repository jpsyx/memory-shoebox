/** One message, rendered and addressed, ready to hand to a service. */
export type EmailSendRequest = {
  /** The full identity, for example `My Shoebox <shoebox@example.com>`. */
  from: string;
  to: string;
  subject: string;
  html: string;
  /** The plain-text alternative. Never omitted: for some members in this
   * audience it is the only version that ever arrives. */
  text: string;
  /** The row's own `idempotency_key`, so a retry cannot duplicate a send that
   * in fact succeeded and whose response we lost. */
  idempotencyKey: string;
};

/** What the service said about one accepted message. */
export type EmailSendResult = {
  /** Undefined when the service accepted the message without naming one. */
  providerMessageId: string | undefined;
};

/**
 * Delivers one message.
 *
 * **The one seam every test substitutes, and the one place the difference
 * between a real send and a local PDF lives.** A caller hands over a finished
 * `html` and `text` and learns only whether it was accepted, which is what
 * lets the fake receive exactly what Resend would.
 */
export type EmailService = {
  send: (request: EmailSendRequest) => Promise<EmailSendResult>;
};
