import { readInstanceSettings } from "../../settings/readInstanceSettings.ts";

import type {
  EnqueueUploadSessionEmailsOptions,
  UploadEmailContext,
} from "./enqueueUploadSessionEmails.types.ts";

import { readRecipients } from "./readRecipients.ts";

import {
  readUploaderDisplayName,
  readMilestoneNamesByDay,
  enqueueUploadSessionEmailForRecipient,
} from "./uploadEmailMessageHelpers.ts";

/**
 * Queues the one `upload_session` message per recipient
 * (`apis/notifications.md` § 3).
 *
 * **The recipient set is three queries, never one per member**
 * (§ Recipient resolution is one set operation), and each recipient's count
 * falls out of the same intersection that admitted them: Inés gets 3 and
 * Abuela gets 210 from one pass. A batch spanning three weeks is still one
 * message per recipient, keyed `upload:<sessionId>:<memberId>`.
 *
 * Called only by `settleUploadSession`, inside the latch's transaction, and
 * only when the latch fired. It does not throw on a mail problem: an unset
 * `public.base_url` makes `enqueueEmail` write `failed` rows, and the batch
 * still settles.
 *
 * @param options.transaction The settle latch's transaction.
 * @param options.sessionId The batch that just settled.
 * @param options.uploadedBy The uploader, who is never told about their own.
 * @param options.now The settle time.
 * @returns How many recipients the batch has, which `notified_member_count`
 *   records. A recipient whose row already existed (the key is idempotent) is
 *   still counted, so this is not a count of rows newly written.
 */
export async function enqueueUploadSessionEmails(
  options: Readonly<EnqueueUploadSessionEmailsOptions>,
): Promise<{ recipientCount: number }> {
  const { transaction } = options;
  const [recipients, settings, uploaderDisplayName] = await Promise.all([
    readRecipients(options),
    readInstanceSettings({ database: transaction, keys: ["public.base_url"] }),
    readUploaderDisplayName(options),
  ]);
  const milestoneNamesByDay = await readMilestoneNamesByDay({
    transaction,
    days: recipients.map((recipient) => {
      return recipient.figures.lastCapturedOn;
    }),
  });
  const context: UploadEmailContext = {
    sessionId: options.sessionId,
    uploaderDisplayName,
    baseUrl: settings["public.base_url"] ?? "",
    milestoneNamesByDay,
    now: options.now,
  };

  await Promise.all(
    recipients.map((recipient) => {
      return enqueueUploadSessionEmailForRecipient({
        transaction,
        recipient,
        context,
      });
    }),
  );
  return { recipientCount: recipients.length };
}
