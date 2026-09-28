import type {
  EmailCommon,
  SignInCodeEmailPayload,
} from "@memory-shoebox/shared";
import type { EmailTemplate } from "./layout.ts";
import { signInCodeTemplate } from "./signInCode.ts";

/**
 * The payload each built kind carries, minus `EmailCommon`, which
 * `enqueueEmail` resolves.
 *
 * A later step adds its kind here in the same change as its copy and its
 * callers. The six missing entries are step 3a's caller for `sign_in_code`
 * aside: `comment` in 5a, `upload_session` in 6a, the five removal messages
 * in 7a, and `invitation` in 8a.
 */
export type EmailPayloadExtras = {
  sign_in_code: Omit<SignInCodeEmailPayload, keyof EmailCommon>;
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
} as const satisfies Record<string, EmailTemplate<never>>;

/** A kind that has copy today, and so may be enqueued today. */
export type BuiltEmailKind = keyof typeof EMAIL_TEMPLATES;
