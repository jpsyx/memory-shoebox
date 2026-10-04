import { describe, expect, it } from "vitest";
import type { OutboundEmailKind } from "@memory-shoebox/shared";
import { createTestApp } from "../helpers/createTestApp.ts";
import {
  insertMember,
  insertItem,
  insertComment,
  insertUploadSession,
  insertRemovalRequest,
  insertOutboundEmail,
  NOW,
} from "../helpers/seedHelpers/seedHelpers.ts";
const ADMIN = {
  memberId: "019f1234-0000-7000-8000-000000000001",
  sessionId: "session",
  role: "admin",
  isAdmin: true,
  visibleRuleIds: [],
} as const;
const BASE_URL = "https://family.example";
const COMMON = {
  shoeboxName: "Original title",
  timezone: "UTC",
  baseUrl: "",
  toDisplayName: "Original greeting",
  preferencesUrl: null,
};
async function _makeFixture() {
  const context = await createTestApp({
    authenticate: async () => {
      return ADMIN;
    },
    clock: () => {
      return new Date(NOW);
    },
  });
  const { database } = context;
  await insertMember(database, { id: ADMIN.memberId, role: "admin" });
  const itemId = await insertItem(database, { uploadedBy: ADMIN.memberId });
  const commentId = await insertComment(database, {
    itemId,
    authorMemberId: ADMIN.memberId,
  });
  const uploadId = await insertUploadSession(database, {
    uploadedBy: ADMIN.memberId,
  });
  const requestId = await insertRemovalRequest(database, {
    requestedByMemberId: ADMIN.memberId,
    itemUploaderMemberId: ADMIN.memberId,
    item_id: itemId,
  });
  const invitation = await context.app.inject({
    method: "POST",
    url: "/api/members",
    payload: { email: "invited@example.com", role: "viewer" },
  });
  expect(invitation.statusCode).toBe(201);
  const invitationRow = await database
    .selectFrom("invitations")
    .select("id")
    .executeTakeFirstOrThrow();
  return {
    ...context,
    itemId,
    commentId,
    uploadId,
    requestId,
    invitationId: invitationRow.id,
  };
}
async function _repair(context: Awaited<ReturnType<typeof _makeFixture>>) {
  const response = await context.app.inject({
    method: "PATCH",
    url: "/api/settings",
    payload: { public: { baseUrl: BASE_URL } },
  });
  expect(response.statusCode).toBe(200);
  return context.database.selectFrom("outbound_emails").selectAll().execute();
}
async function _insertFailure(options: {
  context: Awaited<ReturnType<typeof _makeFixture>>;
  kind: OutboundEmailKind;
  payload: object;
  triggerId: string;
  triggerKind: "comment" | "upload_session" | "removal_request";
  overrides?: Parameters<typeof insertOutboundEmail>[1];
}) {
  return insertOutboundEmail(options.context.database, {
    kind: options.kind,
    trigger_kind: options.triggerKind,
    trigger_id: options.triggerId,
    subject: "Frozen subject",
    to_address: "frozen@example.com",
    state: "failed",
    last_error_code: "base_url_unset",
    last_error_message: "No links",
    payload_json: JSON.stringify({ ...COMMON, ...options.payload }),
    ...options.overrides,
  });
}

describe("retained base URL failures", () => {
  it("repairs each non-code family without recounting, relabeling or changing recipients", async () => {
    const context = await _makeFixture();
    const {
      database,
      itemId,
      commentId,
      uploadId,
      requestId,
      invitationId,
      close,
    } = context;
    const comment = await _insertFailure({
      context,
      kind: "comment",
      triggerId: commentId,
      triggerKind: "comment",
      payload: {
        authorDisplayName: "Original author",
        body: "Unedited words",
        atSeconds: null,
        itemCapturedOn: "2026-09-27",
        itemUrl: `/item/${itemId}`,
        relation: "uploader",
        uploaderDisplayName: "Original uploader",
      },
    });
    const upload = await _insertFailure({
      context,
      kind: "upload_session",
      triggerId: uploadId,
      triggerKind: "upload_session",
      payload: {
        uploaderDisplayName: "Original uploader",
        visibleItemCount: 4,
        visibleDayCount: 1,
        capturedOn: "2026-09-27",
        firstCapturedOn: "2026-09-27",
        lastCapturedOn: "2026-09-27",
        dayUrl: "/?at=2026-09-27",
        milestoneName: "Original milestone",
      },
    });
    const removal = {
      requesterDisplayName: "Original requester",
      reason: "Original reason",
      requestsUrl: "/removal-requests",
      relation: "admin",
    };
    await _insertFailure({
      context,
      kind: "removal_request",
      triggerId: requestId,
      triggerKind: "removal_request",
      payload: {
        ...removal,
        isRequesterTagged: false,
        itemCapturedOn: "2026-09-27",
        itemUploadedOn: "2026-09-27",
        uploaderDisplayName: "Original uploader",
      },
    });
    await _insertFailure({
      context,
      kind: "removal_reminder",
      triggerId: requestId,
      triggerKind: "removal_request",
      payload: { ...removal, requestedOn: "2026-09-27", weekIndex: 2 },
    });
    await _insertFailure({
      context,
      kind: "removal_resolved",
      triggerId: requestId,
      triggerKind: "removal_request",
      payload: {
        outcome: "declined",
        declinerDisplayName: "Original decliner",
        declineReason: "Original answer",
        resolvedAt: NOW,
        itemUrl: `/item/${itemId}`,
      },
    });
    await _insertFailure({
      context,
      kind: "removal_resolved",
      triggerId: requestId,
      triggerKind: "removal_request",
      payload: {
        outcome: "withdrawn",
        withdrawnByDisplayName: "Original requester",
        resolvedAt: NOW,
        itemCapturedOn: "2026-09-27",
        itemUrl: `/item/${itemId}`,
      },
    });
    await _insertFailure({
      context,
      kind: "removal_resolved",
      triggerId: requestId,
      triggerKind: "removal_request",
      payload: {
        outcome: "deleted",
        resolvedByDisplayName: "Original uploader",
        resolvedAt: NOW,
        itemCapturedOn: "2026-09-27",
        relation: "requester",
      },
    });
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
    const after = await _repair(context);
    expect(after).toHaveLength(8);
    for (const repaired of after) {
      const original = before.find((row) => {
        return row.id === repaired.id;
      })!;
      expect(repaired.state).toBe("queued");
      expect(repaired.last_error_code).toBeNull();
      expect(repaired.subject).toBe(original.subject);
      expect(repaired.to_address).toBe(original.to_address);
      expect(repaired.to_member_id).toBe(original.to_member_id);
      expect(repaired.idempotency_key).toBe(original.idempotency_key);
      const originalPayload = JSON.parse(original.payload_json);
      const repairedPayload = JSON.parse(repaired.payload_json);
      expect(repairedPayload.baseUrl).toBe(BASE_URL);
      for (const [key, value] of Object.entries(originalPayload)) {
        if (
          ![
            "baseUrl",
            "preferencesUrl",
            "joinUrl",
            "itemUrl",
            "dayUrl",
            "requestsUrl",
          ].includes(key)
        ) {
          expect(repairedPayload[key]).toEqual(value);
        }
      }
    }
    const payloadOf = (id: string) => {
      return JSON.parse(
        after.find((row) => {
          return row.id === id;
        })!.payload_json,
      );
    };
    expect(payloadOf(comment).itemUrl).toBe(`${BASE_URL}/item/${itemId}`);
    expect(payloadOf(upload).dayUrl).toBe(`${BASE_URL}/?at=2026-09-27`);
    expect(payloadOf(frozenInvite.id).visibleItemCount).toBe(frozenCount);
    expect(payloadOf(frozenInvite.id).joinUrl).toBe(
      `${BASE_URL}/join?address=invited%40example.com`,
    );
    expect(payloadOf(comment).preferencesUrl).toBe(`${BASE_URL}/account`);
    const requesterAnswer = after.find((row) => {
      return JSON.parse(row.payload_json).outcome === "declined";
    })!;
    expect(JSON.parse(requesterAnswer.payload_json).preferencesUrl).toBeNull();
    await close();
  });

  it("keeps seven-day-old, non-baseURL, deleted-trigger, malformed and sign-in-code rows terminal", async () => {
    const context = await _makeFixture();
    const { database, commentId, itemId, close } = context;
    const payload = {
      authorDisplayName: "A",
      body: "Original",
      atSeconds: null,
      itemCapturedOn: "2026-09-27",
      itemUrl: `/item/${itemId}`,
      relation: "uploader",
      uploaderDisplayName: "U",
    };
    const atBoundary = "2026-09-20T10:00:00.000Z";
    const eligible = await _insertFailure({
      context,
      kind: "comment",
      triggerKind: "comment",
      triggerId: commentId,
      payload,
      overrides: { created_at: "2026-09-20T10:00:00.001Z" },
    });
    const terminal: string[] = [];
    for (const overrides of [
      { created_at: atBoundary },
      { last_error_code: "provider_refused" },
      { trigger_id: "deleted" },
      { payload_json: "{}" },
      {
        payload_json: JSON.stringify({
          ...COMMON,
          ...payload,
          itemUrl: `javascript:/item/${itemId}`,
        }),
      },
      {
        payload_json: JSON.stringify({
          ...COMMON,
          ...payload,
          baseUrl: "invalid",
        }),
      },
      {
        payload_json: JSON.stringify({
          ...COMMON,
          ...payload,
          preferencesUrl: "invalid",
        }),
      },
      { payload_json: "{invalid" },
      { payload_json: JSON.stringify({ ...COMMON, ...payload, body: 9 }) },
      {
        payload_json: JSON.stringify({ ...COMMON, ...payload, itemUrl: null }),
      },
    ]) {
      terminal.push(
        await _insertFailure({
          context,
          kind: "comment",
          triggerKind: "comment",
          triggerId: commentId,
          payload,
          overrides,
        }),
      );
    }
    terminal.push(
      await insertOutboundEmail(database, {
        state: "failed",
        last_error_code: "base_url_unset",
        payload_json: "{}",
        subject: "Your code",
      }),
    );
    terminal.push(
      await insertOutboundEmail(database, {
        state: "failed",
        last_error_code: "base_url_unset",
        payload_json: JSON.stringify({
          ...COMMON,
          code: "123456",
          expiresAt: "2026-09-20T10:00:00.000Z",
          expiresInMinutes: 10,
        }),
      }),
    );
    const before = await database
      .selectFrom("outbound_emails")
      .selectAll()
      .where("id", "in", terminal)
      .execute();
    const after = await _repair(context);
    expect(
      after.find((row) => {
        return row.id === eligible;
      })!.state,
    ).toBe("queued");
    expect(
      after.filter((row) => {
        return terminal.includes(row.id);
      }),
    ).toEqual(before);
    await close();
  });

  it("preview leaves failed queue rows unchanged", async () => {
    const context = await _makeFixture();
    const before = await context.database
      .selectFrom("outbound_emails")
      .selectAll()
      .execute();
    const response = await context.app.inject({
      method: "PATCH",
      url: "/api/settings?preview=true",
      payload: { public: { baseUrl: BASE_URL } },
    });
    expect(response.statusCode).toBe(200);
    expect(response.json().isPreview).toBe(true);
    expect(
      await context.database
        .selectFrom("outbound_emails")
        .selectAll()
        .execute(),
    ).toEqual(before);
    await context.close();
  });
});
