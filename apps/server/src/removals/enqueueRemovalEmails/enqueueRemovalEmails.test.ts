import type { Database } from "../../db/types/db.types.ts";
import type { Selectable } from "kysely";
import { describe, expect, it } from "vitest";
import { createTestApp } from "../../../test/helpers/createTestApp.ts";
import {
  insertMember,
  insertItem,
  insertRemovalRequest,
  insertInstanceSetting,
  NOW,
} from "../../../test/helpers/seedHelpers/seedHelpers.ts";
import { enqueueRemovalEmails } from "./enqueueRemovalEmails.ts";
import { removalRequestEmailPayloadSchema } from "@memory-shoebox/shared";

type DeduplicatesUploaderAdminSkipsInactiveRecipientsAnd1State0 = {
  database: Awaited<ReturnType<typeof createTestApp>>["database"];
  close: Awaited<ReturnType<typeof createTestApp>>["close"];
};
type DeduplicatesUploaderAdminSkipsInactiveRecipientsAnd1State1 =
  DeduplicatesUploaderAdminSkipsInactiveRecipientsAnd1State0 & {
    requester: Awaited<ReturnType<typeof insertMember>>;
    uploader: Awaited<ReturnType<typeof insertMember>>;
    admin: Awaited<ReturnType<typeof insertMember>>;
    itemId: Awaited<ReturnType<typeof insertItem>>;
  };
type DeduplicatesUploaderAdminSkipsInactiveRecipientsAnd1State2 =
  DeduplicatesUploaderAdminSkipsInactiveRecipientsAnd1State1 & {
    requests: Array<Selectable<Database["removal_requests"]>>;
  };
type DeduplicatesUploaderAdminSkipsInactiveRecipientsAnd1State3 =
  DeduplicatesUploaderAdminSkipsInactiveRecipientsAnd1State2 & {
    emails: Array<Selectable<Database["outbound_emails"]>>;
  };
type DeduplicatesUploaderAdminSkipsInactiveRecipientsAnd1State4 =
  DeduplicatesUploaderAdminSkipsInactiveRecipientsAnd1State3 & {
    payload: ReturnType<typeof removalRequestEmailPayloadSchema.parse>;
  };
type DeduplicatesUploaderAdminSkipsInactiveRecipientsAnd1State5 =
  DeduplicatesUploaderAdminSkipsInactiveRecipientsAnd1State4;

async function _deduplicatesUploaderAdminSkipsInactiveRecipientsAnd1Stage1(
  state: Readonly<DeduplicatesUploaderAdminSkipsInactiveRecipientsAnd1State0>,
): Promise<DeduplicatesUploaderAdminSkipsInactiveRecipientsAnd1State1> {
  const { database } = state;
  const requester = await insertMember(database, {
    role: "admin",
    display_name: "Requester",
  });
  const uploader = await insertMember(database, {
    role: "admin",
    display_name: "Uploader",
  });
  const admin = await insertMember(database, { role: "admin" });
  await insertMember(database, { role: "admin", status: "invited" });
  await insertMember(database, { role: "admin", status: "removed" });
  await insertMember(database, { role: "admin", notify_on_removal: 0 });
  const itemId = await insertItem(database, {
    uploadedBy: uploader,
    captured_at: "2025-01-02T12:00:00.000Z",
    created_at: "2026-01-03T12:00:00.000Z",
  });
  await insertInstanceSetting(database, {
    key: "public.base_url",
    value: "https://family.example",
  });
  return { ...state, requester, uploader, admin, itemId };
}

async function _deduplicatesUploaderAdminSkipsInactiveRecipientsAnd1Stage2(
  state: Readonly<DeduplicatesUploaderAdminSkipsInactiveRecipientsAnd1State1>,
): Promise<DeduplicatesUploaderAdminSkipsInactiveRecipientsAnd1State2> {
  const { database, requester, uploader, itemId } = state;
  await insertRemovalRequest(database, {
    requestedByMemberId: requester,
    itemUploaderMemberId: uploader,
    item_id: itemId,
    item_captured_at: null,
    state: "open",
    resolved_at: null,
    resolved_by_member_id: null,
    decline_reason: null,
  });
  const requests = await database
    .selectFrom("removal_requests")
    .selectAll()
    .execute();
  return { ...state, requests };
}

async function _deduplicatesUploaderAdminSkipsInactiveRecipientsAnd1Stage3(
  state: Readonly<DeduplicatesUploaderAdminSkipsInactiveRecipientsAnd1State2>,
): Promise<DeduplicatesUploaderAdminSkipsInactiveRecipientsAnd1State3> {
  const { database, requests, requester, uploader, admin } = state;
  expect(
    await enqueueRemovalEmails({
      transaction: database,
      requests,
      event: "requested",
      actorMemberId: requester,
      now: NOW,
    }),
  ).toEqual({ recipientCount: 2 });
  const emails = await database
    .selectFrom("outbound_emails")
    .selectAll()
    .execute();
  expect(
    new Set(
      emails.map((email) => {
        return email.to_member_id;
      }),
    ),
  ).toEqual(new Set([uploader, admin]));
  return { ...state, emails };
}

async function _deduplicatesUploaderAdminSkipsInactiveRecipientsAnd1Stage4(
  state: Readonly<DeduplicatesUploaderAdminSkipsInactiveRecipientsAnd1State3>,
): Promise<DeduplicatesUploaderAdminSkipsInactiveRecipientsAnd1State4> {
  const { emails } = state;
  const payload = removalRequestEmailPayloadSchema.parse(
    JSON.parse(emails[0]!.payload_json),
  );
  expect(payload).toMatchObject({
    requesterDisplayName: "Requester",
    uploaderDisplayName: "Uploader",
    itemCapturedOn: "2025-01-02",
    itemUploadedOn: "2026-01-03",
    baseUrl: "https://family.example",
  });
  expect(
    new Set(
      emails.map((email) => {
        return email.idempotency_key;
      }),
    ).size,
  ).toBe(2);
  return { ...state, payload };
}

async function _deduplicatesUploaderAdminSkipsInactiveRecipientsAnd1Stage5(
  state: Readonly<DeduplicatesUploaderAdminSkipsInactiveRecipientsAnd1State4>,
): Promise<DeduplicatesUploaderAdminSkipsInactiveRecipientsAnd1State5> {
  const { database, requests, requester } = state;
  expect(
    await enqueueRemovalEmails({
      transaction: database,
      requests,
      event: "requested",
      actorMemberId: requester,
      now: NOW,
    }),
  ).toEqual({ recipientCount: 0 });
  return { ...state };
}

async function _assertDeduplicatesUploaderAdminSkipsInactiveRecipientsAndFreezes1(): Promise<void> {
  const { database, close } = await createTestApp();
  try {
    const state0 = { database, close };
    const state1 =
      await _deduplicatesUploaderAdminSkipsInactiveRecipientsAnd1Stage1(state0);
    const state2 =
      await _deduplicatesUploaderAdminSkipsInactiveRecipientsAnd1Stage2(state1);
    const state3 =
      await _deduplicatesUploaderAdminSkipsInactiveRecipientsAnd1Stage3(state2);
    const state4 =
      await _deduplicatesUploaderAdminSkipsInactiveRecipientsAnd1Stage4(state3);
    await _deduplicatesUploaderAdminSkipsInactiveRecipientsAnd1Stage5(state4);
  } finally {
    await close();
  }
}

async function _assertSendsSRequesterAnswersDespitePreferencesAndFails2(
  event: "declined" | "deleted",
): Promise<void> {
  const { database, close } = await createTestApp();
  try {
    const requester = await insertMember(database, {
      notify_on_removal: 0,
    });
    const uploader = await insertMember(database, { notify_on_removal: 0 });
    await insertRemovalRequest(database, {
      requestedByMemberId: requester,
      itemUploaderMemberId: uploader,
      state: event,
      decline_reason: event === "declined" ? "actual words" : null,
    });
    const requests = await database
      .selectFrom("removal_requests")
      .selectAll()
      .execute();
    expect(
      await enqueueRemovalEmails({
        transaction: database,
        requests,
        event,
        actorMemberId: uploader,
        now: NOW,
      }),
    ).toEqual({ recipientCount: 1 });
    const email = await database
      .selectFrom("outbound_emails")
      .selectAll()
      .executeTakeFirstOrThrow();
    expect(email).toMatchObject({
      to_member_id: requester,
      state: "failed",
      last_error_code: "base_url_unset",
    });
    expect(JSON.parse(email.payload_json).preferencesUrl).toBeNull();
  } finally {
    await close();
  }
}

async function _assertHonorsWithdrawalPreferencesAndExcludesTheActor3(): Promise<void> {
  const { database, close } = await createTestApp();
  try {
    const requester = await insertMember(database, { role: "admin" });
    const uploader = await insertMember(database, { notify_on_removal: 0 });
    await insertRemovalRequest(database, {
      requestedByMemberId: requester,
      itemUploaderMemberId: uploader,
      state: "withdrawn",
      decline_reason: null,
    });
    const requests = await database
      .selectFrom("removal_requests")
      .selectAll()
      .execute();
    expect(
      await enqueueRemovalEmails({
        transaction: database,
        requests,
        event: "withdrawn",
        actorMemberId: requester,
        now: NOW,
      }),
    ).toEqual({ recipientCount: 0 });
    expect(
      await database.selectFrom("outbound_emails").selectAll().execute(),
    ).toEqual([]);
  } finally {
    await close();
  }
}
describe("removal mail recipients", () => {
  it(
    "deduplicates uploader-admin, skips inactive recipients and freezes request snapshots including legacy capture",
    _assertDeduplicatesUploaderAdminSkipsInactiveRecipientsAndFreezes1,
  );
  it.each(["declined", "deleted"] as const)(
    "sends %s requester answers despite preferences and fails terminally without base URL",
    _assertSendsSRequesterAnswersDespitePreferencesAndFails2,
  );
  it(
    "honors withdrawal preferences and excludes the actor",
    _assertHonorsWithdrawalPreferencesAndExcludesTheActor3,
  );
});
