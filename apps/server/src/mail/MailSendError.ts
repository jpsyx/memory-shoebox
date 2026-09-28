/**
 * A refusal, carrying the provider's own vocabulary.
 *
 * The code is **not** constrained to a list: the provider owns that
 * vocabulary, and `outbound_emails.last_error_code` carries it through
 * verbatim to the admin banner rather than parsing it
 * (migration `0007_operations_and_audit.ts`).
 */
export class MailSendError extends Error {
  /** The provider's own error name, passed through unparsed. */
  readonly code: string;

  /**
   * @param options.code The provider's own error name.
   * @param options.message The provider's own message.
   */
  constructor(options: { code: string; message: string }) {
    super(options.message);
    this.name = "MailSendError";
    this.code = options.code;
  }
}
