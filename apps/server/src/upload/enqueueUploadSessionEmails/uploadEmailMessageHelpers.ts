import { getDayBandAssignmentsFromMilestoneSpans } from "../../milestones/getDayBandAssignmentsFromMilestoneSpans/getDayBandAssignmentsFromMilestoneSpans.ts";

import type { DatabaseExecutor } from "../../db/types/db.types.ts";

import { enqueueEmail } from "../../mail/enqueueEmail/enqueueEmail.ts";

import { getDisplayNameFromMember } from "../../members/getDisplayNameFromMember.ts";

import type {
  Recipient,
  UploadEmailContext,
} from "./enqueueUploadSessionEmails.types.ts";

/**
 * The milestone band on each of these days, if any, in one query.
 *
 * Uses the same global assignment as the timeline, including bands opened on
 * days omitted from the upload. Only the opening day supplies a name.
 *
 * Milestones have no visibility of their own (Decision 5), so a recipient's
 * restrictions never hide one and this needs no filtering.
 */
export async function readMilestoneNamesByDay(
  options: Readonly<{
    transaction: DatabaseExecutor;
    days: readonly string[];
  }>,
): Promise<Map<string, string>> {
  const days = [...new Set(options.days)].sort();
  const firstDay = days[0];
  const lastDay = days.at(-1);
  if (firstDay === undefined || lastDay === undefined) {
    return new Map();
  }
  const milestones = await options.transaction
    .selectFrom("milestones")
    .select([
      "id as milestoneId",
      "name",
      "starts_on as startsOn",
      "ends_on as endsOn",
      "blurb",
    ])
    .orderBy("id")
    .execute();

  const assignments = getDayBandAssignmentsFromMilestoneSpans(milestones);
  const namesById = new Map(
    milestones.map((milestone) => {
      return [milestone.milestoneId, milestone.name];
    }),
  );
  return new Map(
    days.flatMap((day) => {
      const milestoneId = assignments.get(day)?.bandMilestoneId;
      const name = milestoneId == null ? undefined : namesById.get(milestoneId);
      return name === undefined ? [] : [[day, name] as const];
    }),
  );
}

/** The uploader's name as every copy prints it. */
export async function readUploaderDisplayName(
  options: Readonly<{
    transaction: DatabaseExecutor;
    uploadedBy: string;
  }>,
): Promise<string> {
  const uploader = await options.transaction
    .selectFrom("members")
    .select(["email", "display_name as storedDisplayName"])
    .where("id", "=", options.uploadedBy)
    .executeTakeFirstOrThrow();
  return getDisplayNameFromMember({
    storedDisplayName: uploader.storedDisplayName ?? undefined,
    email: uploader.email,
  });
}

/** One recipient's copy, with their own figures. */
export async function enqueueUploadSessionEmailForRecipient(
  options: Readonly<{
    transaction: DatabaseExecutor;
    recipient: Readonly<Recipient>;
    context: Readonly<Omit<UploadEmailContext, "milestoneNamesByDay">> & {
      milestoneNamesByDay: ReadonlyMap<string, string>;
    };
  }>,
): Promise<void> {
  const { candidate, figures } = options.recipient;
  const { context } = options;
  await enqueueEmail({
    executor: options.transaction,
    now: context.now,
    input: {
      kind: "upload_session",
      toAddress: candidate.email,
      toMemberId: candidate.memberId,
      toDisplayName: candidate.displayName,
      // Verbatim from the recipe table. One row per recipient is what makes a
      // per-recipient count possible without a second message to anybody.
      idempotencyKey: `upload:${context.sessionId}:${candidate.memberId}`,
      triggerKind: "upload_session",
      triggerId: context.sessionId,
      payload: {
        uploaderDisplayName: context.uploaderDisplayName,
        ...figures,
        dayUrl: `${context.baseUrl}/?at=${figures.lastCapturedOn}`,
        // The band on the day `dayUrl` opens at, which is also the day the
        // multi-day copy means by "the last of them".
        milestoneName:
          context.milestoneNamesByDay.get(figures.lastCapturedOn) ?? null,
      },
    },
  });
}
