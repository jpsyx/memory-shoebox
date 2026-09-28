/** One rendered message, in both forms a mail client may choose between. */
export type RenderedEmail = {
  html: string;
  text: string;
};

/**
 * One kind's copy.
 *
 * **Takes the payload and nothing else.** That is the mechanical test for
 * whether a payload is right (`apis/notifications.md` section "Rules that
 * hold for all nine"): if rendering would need a query, the payload is
 * wrong, and a retry a day later would produce a different message from the
 * same row.
 *
 * `subject` is separate from `render` and stays synchronous because it is
 * needed at **enqueue** time, where the row's subject column is written,
 * while the body is rendered at **send** time.
 */
export type EmailTemplate<Payload> = {
  subject: (payload: Payload) => string;
  render: (payload: Payload) => Promise<RenderedEmail>;
};
