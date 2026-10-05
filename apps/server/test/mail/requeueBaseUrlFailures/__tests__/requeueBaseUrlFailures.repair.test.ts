import { describe, expect, it } from "vitest";
import { insertItem } from "../../../helpers/seedHelpers/seedHelpers.ts";
import { expectRepairedRows } from "./expectRepairedRows.ts";
import {
  ADMIN,
  BASE_URL,
  insertRemovalRequestFailures,
  insertRemovalResolutionFailures,
  insertUploadFailure,
  prepareRetainedCommentFailure,
  repair,
} from "./requeueBaseUrlFailuresTestHelpers.ts";

type FrozenRepairedLinksOptions = {
  after: Awaited<ReturnType<typeof repair>>;
  frozenInvitationId: string;
  frozenItemCount: unknown;
  comment: string;
  upload: string;
  itemId: string;
};

function _expectFrozenRepairedLinks(
  options: Readonly<FrozenRepairedLinksOptions>,
): void {
  const {
    after,
    frozenInvitationId,
    frozenItemCount,
    comment,
    upload,
    itemId,
  } = options;
  const payloadOf = (id: string) => {
    return JSON.parse(
      after.find((row) => {
        return row.id === id;
      })!.payload_json,
    );
  };
  expect(payloadOf(comment).itemUrl).toBe(`${BASE_URL}/item/${itemId}`);
  expect(payloadOf(upload).dayUrl).toBe(`${BASE_URL}/?at=2026-09-27`);
  expect(payloadOf(frozenInvitationId).visibleItemCount).toBe(frozenItemCount);
  expect(payloadOf(frozenInvitationId).joinUrl).toBe(
    `${BASE_URL}/join?address=invited%40example.com`,
  );
  expect(payloadOf(comment).preferencesUrl).toBe(`${BASE_URL}/account`);
  const requesterAnswer = after.find((row) => {
    return JSON.parse(row.payload_json).outcome === "declined";
  })!;
  expect(JSON.parse(requesterAnswer.payload_json).preferencesUrl).toBeNull();
}

describe("retained base URL failures", () => {
  it("repairs each non-code family without recounting, relabeling or changing recipients", async () => {
    const {
      context,
      uploadId,
      requestId,
      itemId,
      database,
      invitationId,
      comment,
      close,
    } = await prepareRetainedCommentFailure();
    const upload = await insertUploadFailure({ context, uploadId });
    await insertRemovalRequestFailures({ context, requestId });
    await insertRemovalResolutionFailures({ context, requestId, itemId });
    const before = await database
      .selectFrom("outbound_emails")
      .selectAll()
      .execute();
    const frozenInvite = before.find((row) => {
      return row.trigger_id === invitationId;
    })!;
    const frozenCount = JSON.parse(frozenInvite.payload_json).visibleItemCount;
    await insertItem(database, { uploadedBy: ADMIN.memberId, seq: 1 });
    await database
      .updateTable("members")
      .set({ display_name: "New name" })
      .where("id", "=", ADMIN.memberId)
      .execute();
    const after = await repair(context);
    expectRepairedRows({ after, before });
    _expectFrozenRepairedLinks({
      after,
      frozenInvitationId: frozenInvite.id,
      frozenItemCount: frozenCount,
      comment,
      upload,
      itemId,
    });
    await close();
  });
});
