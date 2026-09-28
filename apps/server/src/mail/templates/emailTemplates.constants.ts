import {
  signInCodeEmailPayloadSchema,
  type EmailCommon,
  type SignInCodeEmailPayload,
} from "@memory-shoebox/shared";
import type { ZodType } from "zod";
import type { EmailTemplate } from "./emailLayoutHelpers.ts";
import { signInCodeTemplate } from "./signInCodeTemplate.ts";

/**
 * The payload each built kind carries, minus `EmailCommon`, which
 * `enqueueEmail` resolves.
 *
 * A later step adds its kind here in the same change as its copy and its
 * callers. The six missing entries are step 3a's caller for `sign_in_code`
 * aside: `comment` in 5a, `upload_session` in 6a, the three removal messages
 * in 7a, and `invitation` in 8a.
 */
export type EmailPayloadExtras = {
  sign_in_code: Omit<SignInCodeEmailPayload, keyof EmailCommon>;
};

/**
 * Kind to the copy that kind's payload can actually be rendered by.
 *
 * Mapped over `EmailPayloadExtras` rather than widened to
 * `Record<string, EmailTemplate<never>>`, because `never` is the bottom type:
 * every template is assignable to it, so the widened form checked only that a
 * key existed and left both call sites asserting `payload as never` to get
 * past it. Spelling the payload out per kind is what turns the gate below
 * from a promise into a check.
 */
type EmailTemplateRegistry = {
  [Kind in keyof EmailPayloadExtras]: EmailTemplate<
    EmailCommon & EmailPayloadExtras[Kind]
  >;
};

/**
 * Kind to copy, for every kind that has copy.
 *
 * **This object is what gates the mail queue.** `enqueueEmail` derives a
 * message's subject from its template, so a kind absent from here cannot be
 * enqueued at all, and the attempt is a type error rather than a row that sits
 * `queued` forever behind a renderer that cannot render it. That is how the
 * step split is enforced rather than merely stated.
 */
export const EMAIL_TEMPLATES = {
  sign_in_code: signInCodeTemplate,
} as const satisfies EmailTemplateRegistry;

/** A kind that has copy today, and so may be enqueued today. */
export type BuiltEmailKind = keyof typeof EMAIL_TEMPLATES;

/**
 * Renders one stored row's payload into both forms a mail client picks from.
 *
 * Takes `unknown` because that is honestly what the worker holds: it reads
 * `payload_json` back out of SQLite, where a row may have been written by an
 * older build or edited by hand. The kind is typed now, and that does not help
 * here: knowing a row is a `comment` says nothing about whether the JSON beside
 * it still matches that kind's schema. The parse that turns one into the other
 * is closed over beside the template that needs it, so the worker never names a
 * payload type it cannot know.
 */
export type EmailRenderer = (payload: unknown) => {
  html: string;
  text: string;
};

/** Pairs one kind's schema with its copy, and forgets which kind it was. */
function _createRenderer<Payload extends EmailCommon>(options: {
  template: EmailTemplate<Payload>;
  schema: ZodType<Payload>;
}): EmailRenderer {
  return (payload) => {
    const parsed = options.schema.parse(payload);
    return {
      html: options.template.html(parsed),
      text: options.template.text(parsed),
    };
  };
}

/**
 * Kind to renderer, for every kind that has copy.
 *
 * The worker's half of `EMAIL_TEMPLATES`: same keys, same gate, but it
 * validates the stored payload first. A payload that does not parse throws
 * inside the worker's `try` and lands as `render_failed`, which is the
 * outcome that branch was always written for.
 */
export const EMAIL_RENDERERS = {
  sign_in_code: _createRenderer({
    template: signInCodeTemplate,
    schema: signInCodeEmailPayloadSchema,
  }),
} as const satisfies Record<BuiltEmailKind, EmailRenderer>;
