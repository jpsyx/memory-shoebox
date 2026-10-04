import { describe, expect, it } from "vitest";
import { createDatabase } from "../../../db/client.ts";
import { migrateToLatest } from "../../../db/migrate.ts";
import { runRemovalReminder } from "../runRemovalReminder.ts";
import {
  NOW,
  insertMember,
  insertRemovalRequest,
  shiftDays,
} from "../../../../test/helpers/seedHelpers/seedHelpers.ts";
import {
  createReminderContextWithOpenRequest,
  expectPersistedReminderKeys,
} from "./runRemovalReminderTestHelpers.ts";

type ExcludesRequesterAdminsOnlyFromTheirOwn1State0 = {
  database: Awaited<
    ReturnType<typeof createReminderContextWithOpenRequest>
  >["database"];
  uploaderId: Awaited<
    ReturnType<typeof createReminderContextWithOpenRequest>
  >["uploaderId"];
  adminId: Awaited<
    ReturnType<typeof createReminderContextWithOpenRequest>
  >["adminId"];
  requesterId: Awaited<
    ReturnType<typeof createReminderContextWithOpenRequest>
  >["requesterId"];
  requestId: Awaited<
    ReturnType<typeof createReminderContextWithOpenRequest>
  >["requestId"];
  itemId: Awaited<
    ReturnType<typeof createReminderContextWithOpenRequest>
  >["itemId"];
};
type ExcludesRequesterAdminsOnlyFromTheirOwn1State1 =
  ExcludesRequesterAdminsOnlyFromTheirOwn1State0 & {
    secondRequestId: Awaited<ReturnType<typeof insertRemovalRequest>>;
    summary: Awaited<ReturnType<typeof runRemovalReminder>>;
    expectedPairs: Set<string>;
  };
type ExcludesRequesterAdminsOnlyFromTheirOwn1State2 =
  ExcludesRequesterAdminsOnlyFromTheirOwn1State1 & {
    emails: Array<{ to_member_id: string | null; idempotency_key: string }>;
  };
type ExcludesRequesterAdminsOnlyFromTheirOwn1State3 =
  ExcludesRequesterAdminsOnlyFromTheirOwn1State2;

async function _excludesRequesterAdminsOnlyFromTheirOwn1Stage1(
  state: Readonly<ExcludesRequesterAdminsOnlyFromTheirOwn1State0>,
): Promise<ExcludesRequesterAdminsOnlyFromTheirOwn1State1> {
  const { database, adminId, uploaderId, itemId, requestId, requesterId } =
    state;
  const secondRequestId = await insertRemovalRequest(database, {
    requestedByMemberId: adminId,
    itemUploaderMemberId: uploaderId,
    item_id: itemId,
    state: "open",
    decline_reason: null,
    resolved_at: null,
    resolved_by_member_id: null,
    created_at: shiftDays({ instant: NOW, days: -8 }),
  });
  const summary = await runRemovalReminder({ database, now: NOW });
  const expectedPairs = new Set([
    `${requestId}:${uploaderId}`,
    `${requestId}:${adminId}`,
    `${secondRequestId}:${uploaderId}`,
    `${secondRequestId}:${requesterId}`,
  ]);
  return { ...state, secondRequestId, summary, expectedPairs };
}

async function _excludesRequesterAdminsOnlyFromTheirOwn1Stage2(
  state: Readonly<ExcludesRequesterAdminsOnlyFromTheirOwn1State1>,
): Promise<ExcludesRequesterAdminsOnlyFromTheirOwn1State2> {
  const { summary, expectedPairs, database } = state;
  expect(
    new Set(
      summary.due.map((due) => {
        return `${due.requestId}:${due.memberId}`;
      }),
    ),
  ).toEqual(expectedPairs);
  const emails = await database
    .selectFrom("outbound_emails")
    .select(["to_member_id", "idempotency_key"])
    .execute();
  expect(emails).toHaveLength(4);
  return { ...state, emails };
}

async function _excludesRequesterAdminsOnlyFromTheirOwn1Stage3(
  state: Readonly<ExcludesRequesterAdminsOnlyFromTheirOwn1State2>,
): Promise<ExcludesRequesterAdminsOnlyFromTheirOwn1State3> {
  const {
    emails,
    requestId,
    uploaderId,
    adminId,
    secondRequestId,
    requesterId,
  } = state;
  expect(
    new Set(
      emails.map((email) => {
        return `${email.idempotency_key}:${email.to_member_id}`;
      }),
    ),
  ).toEqual(
    new Set([
      `removal-reminder:${requestId}:${uploaderId}:1:${uploaderId}`,
      `removal-reminder:${requestId}:${adminId}:1:${adminId}`,
      `removal-reminder:${secondRequestId}:${uploaderId}:1:${uploaderId}`,
      `removal-reminder:${secondRequestId}:${requesterId}:1:${requesterId}`,
    ]),
  );
  return { ...state };
}

async function _assertFindsNothingAgainstEmptyTables1(): Promise<void> {
  const database = createDatabase(":memory:");
  await migrateToLatest(database);

  const summary = await runRemovalReminder({ database, now: NOW });

  expect(summary.due).toEqual([]);
  await expectPersistedReminderKeys({ database, due: summary.due });
  await database.destroy();
}

async function _assertIsDueForTheSnapshotUploaderAndEvery2(): Promise<void> {
  const { database, uploaderId, adminId, requesterId, requestId } =
    await createReminderContextWithOpenRequest();

  const summary = await runRemovalReminder({ database, now: NOW });

  expect(summary.due).toHaveLength(2);
  expect(
    summary.due
      .map((due) => {
        return due.memberId;
      })
      .sort(),
  ).toEqual([uploaderId, adminId].sort());
  expect(
    summary.due.map((due) => {
      return due.memberId;
    }),
  ).not.toContain(requesterId);
  expect(summary.due[0]?.weekIndex).toBe(1);
  expect(
    summary.due
      .map((due) => {
        return due.idempotencyKey;
      })
      .every((key) => {
        return key.startsWith(`removal-reminder:${requestId}:`);
      }),
  ).toBe(true);
  await expectPersistedReminderKeys({ database, due: summary.due });
  await database.destroy();
}

async function _assertNamesTheUploaderOnceWhenTheUploaderIs3(): Promise<void> {
  const { database, uploaderId, adminId } =
    await createReminderContextWithOpenRequest({
      uploaderOverrides: { role: "admin" },
    });

  const summary = await runRemovalReminder({ database, now: NOW });

  // The join's OR matches the one member row once, so there is nothing to
  // de-duplicate: the uploader gets one reminder, not two.
  expect(
    summary.due
      .map((due) => {
        return due.memberId;
      })
      .sort(),
  ).toEqual([uploaderId, adminId].sort());
  const uploaderDue = summary.due.filter((due) => {
    return due.memberId === uploaderId;
  });
  expect(uploaderDue).toHaveLength(1);
  expect(uploaderDue[0]?.relation).toBe("uploader");
  await expectPersistedReminderKeys({ database, due: summary.due });
  await database.destroy();
}

async function _assertNeverChasesTheRequesterWithTheirOwnRequest4(): Promise<void> {
  const { database, requesterId } = await createReminderContextWithOpenRequest({
    requesterOverrides: { role: "admin" },
  });

  const summary = await runRemovalReminder({ database, now: NOW });

  expect(
    summary.due.map((due) => {
      return due.memberId;
    }),
  ).not.toContain(requesterId);
  await expectPersistedReminderKeys({ database, due: summary.due });
  await database.destroy();
}

async function _assertExcludesRequesterAdminsOnlyFromTheirOwnAsk5(): Promise<void> {
  const { database, uploaderId, adminId, requesterId, requestId, itemId } =
    await createReminderContextWithOpenRequest({
      requesterOverrides: { role: "admin" },
    });
  try {
    const state0 = {
      database,
      uploaderId,
      adminId,
      requesterId,
      requestId,
      itemId,
    };
    const state1 =
      await _excludesRequesterAdminsOnlyFromTheirOwn1Stage1(state0);
    const state2 =
      await _excludesRequesterAdminsOnlyFromTheirOwn1Stage2(state1);
    await _excludesRequesterAdminsOnlyFromTheirOwn1Stage3(state2);
  } finally {
    await database.destroy();
  }
}

async function _assertReadsTheSnapshotUploaderNeverTheItemS6(): Promise<void> {
  // `item_id` is SET NULL, so the job may not join to `items` at all. The
  // two columns are pulled apart here so that a job which did join would
  // name the wrong person and fail.
  const { database, uploaderId, itemId } =
    await createReminderContextWithOpenRequest({});
  const otherUploaderId = await insertMember(database, { role: "uploader" });
  await database
    .updateTable("items")
    .set({ uploaded_by: otherUploaderId })
    .where("id", "=", itemId)
    .execute();

  const summary = await runRemovalReminder({ database, now: NOW });

  expect(
    summary.due.map((due) => {
      return due.memberId;
    }),
  ).toContain(uploaderId);
  expect(
    summary.due.map((due) => {
      return due.memberId;
    }),
  ).not.toContain(otherUploaderId);
  await expectPersistedReminderKeys({ database, due: summary.due });
  await database.destroy();
}

async function _assertIsNotDueInWeekZeroSoNothing7(): Promise<void> {
  const { database } = await createReminderContextWithOpenRequest({
    requestOverrides: { created_at: shiftDays({ instant: NOW, days: -2 }) },
  });

  const summary = await runRemovalReminder({ database, now: NOW });

  expect(summary.due).toEqual([]);
  await expectPersistedReminderKeys({ database, due: summary.due });
  await database.destroy();
}

async function _assertIsNotDueOnceTheRequestIsResolved8(): Promise<void> {
  const { database } = await createReminderContextWithOpenRequest({
    requestOverrides: { state: "withdrawn", resolved_at: NOW },
  });

  const summary = await runRemovalReminder({ database, now: NOW });

  expect(summary.due).toEqual([]);
  await expectPersistedReminderKeys({ database, due: summary.due });
  await database.destroy();
}

async function _assertSkipsSomebodyWhoHasTurnedTheRemovalConversation9(): Promise<void> {
  const { database, adminId } = await createReminderContextWithOpenRequest();
  await database
    .updateTable("members")
    .set({ notify_on_removal: 0 })
    .where("id", "=", adminId)
    .execute();

  const summary = await runRemovalReminder({ database, now: NOW });

  expect(
    summary.due.map((due) => {
      return due.memberId;
    }),
  ).not.toContain(adminId);
  await expectPersistedReminderKeys({ database, due: summary.due });
  await database.destroy();
}

async function _assertSkipsAnAdminWhoHasLeftTheFamily10(): Promise<void> {
  const { database, adminId } = await createReminderContextWithOpenRequest();
  await database
    .updateTable("members")
    .set({ status: "removed", removed_at: NOW })
    .where("id", "=", adminId)
    .execute();

  const summary = await runRemovalReminder({ database, now: NOW });

  expect(
    summary.due.map((due) => {
      return due.memberId;
    }),
  ).not.toContain(adminId);
  await expectPersistedReminderKeys({ database, due: summary.due });
  await database.destroy();
}

async function _assertReturnsTheSameDueSetWhileEnqueueingEach11(): Promise<void> {
  const { database } = await createReminderContextWithOpenRequest();

  const first = await runRemovalReminder({ database, now: NOW });
  const second = await runRemovalReminder({ database, now: NOW });

  expect(second.due).toEqual(first.due);
  expect(
    await database.selectFrom("outbound_emails").selectAll().execute(),
  ).toHaveLength(2);
  await expectPersistedReminderKeys({ database, due: first.due });
  await database.destroy();
}
describe("removal-reminder recipient identity", () => {
  it(
    "finds nothing against empty tables",
    _assertFindsNothingAgainstEmptyTables1,
  );
  it(
    "is due for the snapshot uploader and every admin, minus the requester",
    _assertIsDueForTheSnapshotUploaderAndEvery2,
  );
  it(
    "names the uploader once when the uploader is also an admin",
    _assertNamesTheUploaderOnceWhenTheUploaderIs3,
  );
  it(
    "never chases the requester with their own request, even as an admin",
    _assertNeverChasesTheRequesterWithTheirOwnRequest4,
  );
  it(
    "excludes requester-admins only from their own ask across multiple requesters",
    _assertExcludesRequesterAdminsOnlyFromTheirOwnAsk5,
  );
  it(
    "reads the snapshot uploader, never the item's current one",
    _assertReadsTheSnapshotUploaderNeverTheItemS6,
  );
});

describe("removal-reminder eligibility", () => {
  it(
    "is not due in week zero, so nothing chases within the hour of asking",
    _assertIsNotDueInWeekZeroSoNothing7,
  );
  it(
    "is not due once the request is resolved",
    _assertIsNotDueOnceTheRequestIsResolved8,
  );
  it(
    "skips somebody who has turned the removal conversation off",
    _assertSkipsSomebodyWhoHasTurnedTheRemovalConversation9,
  );
  it(
    "skips an admin who has left the family",
    _assertSkipsAnAdminWhoHasLeftTheFamily10,
  );
  it(
    "returns the same due set while enqueueing each weekly key only once",
    _assertReturnsTheSameDueSetWhileEnqueueingEach11,
  );
});
