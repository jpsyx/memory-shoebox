import type { EnqueueEmailInput } from "@memory-shoebox/shared";
import type { DatabaseExecutor } from "../db/types/db.types.ts";
import { recordDigestEvent } from "./digests/recordDigestEvent.ts";
import { getActivityFrequencyFromMemberId } from "./getActivityFrequencyFromMemberId.ts";
import { enqueueEmail } from "./enqueueEmail/enqueueEmail.ts";
import type { EmailPayloadExtras } from "./templates/emailTemplates.constants.ts";

type ActivityKind = "upload_session" | "comment" | "comment_tag";

/** Routes an eligible activity inside its feature transaction using current preferences. */
export async function scheduleActivityNotification<Kind extends ActivityKind>(
  options: Readonly<{
    executor: DatabaseExecutor;
    now?: string;
    input: EnqueueEmailInput<Kind, EmailPayloadExtras[Kind]>;
  }>,
): Promise<void> {
  const { executor, input } = options;
  if (input.toMemberId == null) {
    return;
  }
  const frequency = await getActivityFrequencyFromMemberId({
    executor,
    memberId: input.toMemberId,
    kind: input.kind,
  });
  if (frequency === "off") {
    return;
  }
  if (frequency === "immediate") {
    await enqueueEmail(options);
    return;
  }
  await recordDigestEvent({
    executor,
    memberId: input.toMemberId,
    kind: input.kind,
    sourceId: input.triggerId,
    occurredAt: options.now ?? new Date().toISOString(),
    deduplicationKey: input.idempotencyKey,
  });
}
