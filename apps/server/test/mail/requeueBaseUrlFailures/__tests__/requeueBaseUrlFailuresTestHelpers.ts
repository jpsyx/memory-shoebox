import type { EmailCommon } from "@memory-shoebox/shared";
import { expect } from "vitest";
import type { OutboundEmailsTable } from "../../../../src/db/types/operations.types.ts";
import type { Viewer } from "../../../../src/http/requestContextHelpers.ts";
import { createOwnedTestApp } from "../../../helpers/createOwnedTestApp/createOwnedTestApp.ts";
import {
  insertComment,
  insertItem,
  insertMember,
  insertOutboundEmail,
  insertRemovalRequest,
  insertUploadSession,
  NOW,
} from "../../../helpers/seedHelpers/seedHelpers.ts";
import type {
  FailureOptions,
  RequeueFixture,
  RetainedCommentFailureResult,
  TerminalMailFailuresResult,
} from "./requeueFixtures.types.ts";

/** Shared requeueBaseUrlFailures test input. */
export const ADMIN = {
  memberId: "019f1234-0000-7000-8000-000000000001",
  sessionId: "session",
  role: "admin",
  isAdmin: true,
  visibleRuleIds: [],
} as const satisfies Viewer;

/** Shared requeueBaseUrlFailures test input. */
export const BASE_URL = "https://family.example" satisfies string;

/** Shared requeueBaseUrlFailures test input. */
export const COMMON = {
  shoeboxName: "Original title",
  timezone: "UTC",
  baseUrl: "",
  toDisplayName: "Original greeting",
  preferencesUrl: null,
} as const satisfies EmailCommon;

/** Provides requeueBaseUrlFailures catalog fixtures and request controls. */
export async function createRequeueBaseUrlFailuresFixture(): Promise<RequeueFixture> {
  const context = await createOwnedTestApp({
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

/** Repairs the missing base URL and returns the outbound email queue rows. */
export async function repair(
  context: Readonly<RequeueFixture>,
): Promise<OutboundEmailsTable[]> {
  const response = await context.app.inject({
    method: "PATCH",
    url: "/api/settings",
    payload: { public: { baseUrl: BASE_URL } },
  });
  expect(response.statusCode).toBe(200);
  return context.database.selectFrom("outbound_emails").selectAll().execute();
}

/** Inserts an outbound email failure fixture and returns its ID. */
export async function insertFailure(
  options: Readonly<FailureOptions>,
): Promise<string> {
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

/** Provides requeueBaseUrlFailures catalog fixtures and request controls. */
export async function prepareRetainedCommentFailure(): Promise<RetainedCommentFailureResult> {
  const context = await createRequeueBaseUrlFailuresFixture();
  const {
    database,
    itemId,
    commentId,
    uploadId,
    requestId,
    invitationId,
    close,
  } = context;
  const comment = await insertFailure({
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
  return {
    context,
    uploadId,
    requestId,
    itemId,
    database,
    invitationId,
    comment,
    close,
  };
}

/** Provides requeueBaseUrlFailures catalog fixtures and request controls. */
export async function prepareTerminalMailFailures(): Promise<TerminalMailFailuresResult> {
  const context = await createRequeueBaseUrlFailuresFixture();
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
  const eligible = await insertFailure({
    context,
    kind: "comment",
    triggerKind: "comment",
    triggerId: commentId,
    payload,
    overrides: { created_at: "2026-09-20T10:00:00.001Z" },
  });
  return {
    atBoundary,
    payload,
    itemId,
    context,
    commentId,
    database,
    eligible,
    close,
  };
}

/** Inserts an upload notification failure and returns its email ID. */
export async function insertUploadFailure(
  options: Readonly<{ context: RequeueFixture; uploadId: string }>,
): Promise<string> {
  const { context, uploadId } = options;
  const upload = await insertFailure({
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
  return upload;
}

/** Seeds request and reminder email failures for a removal request. */
export async function insertRemovalRequestFailures(
  options: Readonly<{ context: RequeueFixture; requestId: string }>,
): Promise<void> {
  const { context, requestId } = options;
  const removal = {
    requesterDisplayName: "Original requester",
    reason: "Original reason",
    requestsUrl: "/removal-requests",
    relation: "admin",
  };
  await insertFailure({
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
  await insertFailure({
    context,
    kind: "removal_reminder",
    triggerId: requestId,
    triggerKind: "removal_request",
    payload: { ...removal, requestedOn: "2026-09-27", weekIndex: 2 },
  });
}

/** Seeds declined, withdrawn, and deleted removal email failures. */
export async function insertRemovalResolutionFailures(
  options: Readonly<{
    context: RequeueFixture;
    requestId: string;
    itemId: string;
  }>,
): Promise<void> {
  const { context, requestId, itemId } = options;
  await insertFailure({
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
  await insertFailure({
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
  await insertFailure({
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
}
