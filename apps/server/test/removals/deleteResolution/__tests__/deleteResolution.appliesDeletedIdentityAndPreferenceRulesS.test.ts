import { describe, expect, it } from "vitest";
import { insertMember } from "../../../helpers/seedHelpers/seedHelpers.ts";
import { runDelete } from "../../../helpers/runDelete.ts";
import {
  createDeletionContext,
  requestRemoval,
} from "./deleteResolutionTestHelpers.ts";

async function _assertAppliesDeletedIdentityAndPreferenceRulesS2(
  scenario: string,
): Promise<void> {
  const context = await createDeletionContext();
  const { database, uploaderId, itemId, close } = context;
  try {
    const requesterId =
      scenario === "same-requester-uploader"
        ? uploaderId
        : await insertMember(database, { notify_on_removal: 0 });
    const requestId = await requestRemoval({
      context,
      requesterId,
    });
    if (scenario === "uploader-opted-out") {
      await database
        .updateTable("members")
        .set({ notify_on_removal: 0 })
        .where("id", "=", uploaderId)
        .execute();
    }
    const memberId =
      scenario === "uploader-actor"
        ? uploaderId
        : scenario === "requester-actor"
          ? requesterId
          : context.actor.memberId;
    await runDelete({ database, itemId, memberId });
    const emails = await database
      .selectFrom("outbound_emails")
      .selectAll()
      .execute();
    const expectedRecipient =
      scenario === "requester-actor" || scenario === "same-requester-uploader"
        ? uploaderId
        : requesterId;
    expect(emails).toHaveLength(1);
    expect(emails[0]).toMatchObject({
      to_member_id: expectedRecipient,
      idempotency_key: `removal-resolved:${requestId}:${expectedRecipient}`,
    });
  } finally {
    await close();
  }
}
describe("deletion resolution mail", (): void => {
  it.each([
    "uploader-actor",
    "requester-actor",
    "same-requester-uploader",
    "uploader-opted-out",
  ])(
    "queues exactly one eligible deletion answer for %s",
    _assertAppliesDeletedIdentityAndPreferenceRulesS2,
  );
});
