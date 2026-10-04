import type { Database } from "../../db/types/db.types.ts";
import {
  enqueueEmail,
  type EnqueueEmailResult,
} from "../../mail/enqueueEmail/enqueueEmail.ts";
import { getDisplayNameFromMember } from "../../members/getDisplayNameFromMember.ts";
import { readInstanceSettings } from "../../settings/readInstanceSettings.ts";
import { getLocalDayFromInstant } from "../../time/localDayHelpers.ts";
import type { RemovalRequestRow } from "../makeRemovalRequestDtosFromRows.ts";
import type { RemovalEmailOptions } from "./enqueueRemovalEmails.ts";
import type { EmailPayloadExtras } from "../../mail/templates/emailTemplates.constants.ts";

type IsRemovalEmailRecipientOptions = {
  event: RemovalEmailOptions["event"];
  request: RemovalRequestRow;
  member: Database["members"];
  actorMemberId: string;
};

/** Batched names, settings and live fallback facts for this transaction. */
type Lookups = {
  members: Array<Database["members"]>;
  names: Map<string, string>;
  baseUrl: string;
  timezone: string;
  items: Map<string, { captured_at: string; created_at: string }>;
};
/** Frozen facts shared by the copies of a single request. */
type EmailContext = {
  request: RemovalRequestRow;
  itemCapturedOn: string;
  itemUploadedOn: string;
  requestedOn: string;
  requesterDisplayName: string;
  uploaderDisplayName: string;
  actorDisplayName: string;
  itemUrl: string;
  requestsUrl: string;
};
/** One recipient's outbound transaction and addressing. */
type RecipientOptions = {
  options: RemovalEmailOptions;
  context: EmailContext;
  member: Database["members"];
  lookups: Lookups;
};

async function _readLegacyItems(
  options: Readonly<RemovalEmailOptions>,
): Promise<Array<{ id: string; captured_at: string; created_at: string }>> {
  const itemIds = [
    ...new Set(
      options.requests.flatMap((request) => {
        return request.item_id === null ? [] : [request.item_id];
      }),
    ),
  ];
  return itemIds.length === 0
    ? []
    : await options.transaction
        .selectFrom("items")
        .select(["id", "captured_at", "created_at"])
        .where("id", "in", itemIds)
        .execute();
}

/** Reads members and legacy item fallback facts once for the request batch. */
export async function readRemovalEmailLookups(
  options: Readonly<RemovalEmailOptions>,
): Promise<Lookups> {
  const members = await options.transaction
    .selectFrom("members")
    .selectAll()
    .execute();
  const settings = await readInstanceSettings({
    database: options.transaction,
    keys: ["public.base_url", "shoebox.timezone"],
  });
  const items = await _readLegacyItems(options);
  return {
    members,
    baseUrl: settings["public.base_url"] ?? "",
    timezone: settings["shoebox.timezone"],
    items: new Map(
      items.map((item) => {
        return [item.id, item];
      }),
    ),
    names: new Map(
      members.map((member) => {
        return [
          member.id,
          getDisplayNameFromMember({
            storedDisplayName: member.display_name ?? undefined,
            email: member.email,
          }),
        ];
      }),
    ),
  };
}

/** Derives email calendar days without widening nullable history snapshots. */
export function makeRemovalEmailContextFromRequest(
  options: Readonly<{
    options: RemovalEmailOptions;
    request: RemovalRequestRow;
    lookups: Lookups;
  }>,
): EmailContext {
  const { request, options: emailOptions, lookups } = options;
  const item =
    request.item_id === null ? undefined : lookups.items.get(request.item_id);
  const capturedAt = request.item_captured_at ?? item?.captured_at;
  if (capturedAt === undefined) {
    throw new Error(
      "Removal email requires a capture snapshot or live legacy item.",
    );
  }
  const day = (instant: string) => {
    return getLocalDayFromInstant({ instant, timezone: lookups.timezone });
  };
  return {
    request,
    itemCapturedOn: day(capturedAt),
    itemUploadedOn: day(item?.created_at ?? request.created_at),
    requestedOn: day(request.created_at),
    requesterDisplayName:
      lookups.names.get(request.requested_by_member_id) ?? "",
    uploaderDisplayName:
      lookups.names.get(request.item_uploader_member_id) ?? "",
    actorDisplayName: lookups.names.get(emailOptions.actorMemberId) ?? "",
    itemUrl: `${lookups.baseUrl}/item/${request.item_id ?? ""}`,
    requestsUrl: `${lookups.baseUrl}/removal-requests`,
  };
}

/** Actor exclusion applies even to unsuppressible requester answers. */
export function isRemovalEmailRecipient(
  options: Readonly<IsRemovalEmailRecipientOptions>,
): boolean {
  const { event, request, member, actorMemberId } = options;
  if (member.status !== "active" || member.id === actorMemberId) {
    return false;
  }
  const isRequester = member.id === request.requested_by_member_id;
  const isUploader = member.id === request.item_uploader_member_id;
  return event === "declined"
    ? isRequester
    : event === "deleted"
      ? isRequester || (isUploader && member.notify_on_removal === 1)
      : (isUploader || member.role === "admin") &&
        member.notify_on_removal === 1;
}

function _makeRequestedPayload(
  options: Readonly<RecipientOptions>,
): EmailPayloadExtras["removal_request"] {
  const { context, member } = options;
  return {
    requesterDisplayName: context.requesterDisplayName,
    isRequesterTagged: true,
    reason: context.request.reason,
    itemCapturedOn: context.itemCapturedOn,
    itemUploadedOn: context.itemUploadedOn,
    uploaderDisplayName: context.uploaderDisplayName,
    requestsUrl: context.requestsUrl,
    relation:
      member.id === context.request.item_uploader_member_id
        ? "uploader"
        : "admin",
  };
}

function _makeResolvedPayload(
  options: Readonly<RecipientOptions>,
): EmailPayloadExtras["removal_resolved"] {
  const { options: emailOptions, context, member } = options;
  const resolvedAt = context.request.resolved_at ?? emailOptions.now;
  if (emailOptions.event === "deleted") {
    return {
      outcome: "deleted",
      resolvedByDisplayName: context.actorDisplayName,
      resolvedAt,
      itemCapturedOn: context.itemCapturedOn,
      relation:
        member.id === context.request.requested_by_member_id
          ? "requester"
          : "uploader",
    };
  }
  if (emailOptions.event === "declined") {
    return {
      outcome: "declined",
      declinerDisplayName: context.actorDisplayName,
      declineReason: context.request.decline_reason ?? "",
      resolvedAt,
      itemUrl: context.itemUrl,
    };
  }
  return {
    outcome: "withdrawn",
    withdrawnByDisplayName: context.actorDisplayName,
    resolvedAt,
    itemCapturedOn: context.itemCapturedOn,
    itemUrl: context.itemUrl,
  };
}

function _makeReminderPayload(
  options: Readonly<RecipientOptions>,
): EmailPayloadExtras["removal_reminder"] {
  const { options: emailOptions, context, member } = options;
  const weekIndex =
    emailOptions.event === "reminder"
      ? emailOptions.weekIndexes.get(context.request.id)
      : undefined;
  if (
    weekIndex === undefined ||
    !Number.isInteger(weekIndex) ||
    weekIndex < 1
  ) {
    throw new Error("Reminder weekIndex must be a positive integer.");
  }
  return {
    requesterDisplayName: context.requesterDisplayName,
    reason: context.request.reason,
    requestedOn: context.requestedOn,
    weekIndex,
    requestsUrl: context.requestsUrl,
    relation:
      member.id === context.request.item_uploader_member_id
        ? "uploader"
        : "admin",
  };
}

/**
 * Inserts one copy; serial callers preserve late-error transaction rollback.
 */
export async function enqueueRemovalEmailForRecipient(
  options: Readonly<RecipientOptions>,
): Promise<EnqueueEmailResult> {
  const { options: emailOptions, context, member, lookups } = options;
  const common = { executor: emailOptions.transaction, now: emailOptions.now };
  const address = {
    toAddress: member.email,
    toMemberId: member.id,
    toDisplayName: lookups.names.get(member.id),
    triggerKind: "removal_request" as const,
    triggerId: context.request.id,
  };
  if (emailOptions.event === "requested") {
    return enqueueEmail({
      ...common,
      input: {
        ...address,
        kind: "removal_request",
        idempotencyKey: `removal:${context.request.id}:${member.id}`,
        payload: _makeRequestedPayload(options),
      },
    });
  }
  if (emailOptions.event === "reminder") {
    const payload = _makeReminderPayload(options);
    return enqueueEmail({
      ...common,
      input: {
        ...address,
        kind: "removal_reminder",
        idempotencyKey: `removal-reminder:${context.request.id}:${member.id}:${payload.weekIndex}`,
        payload,
      },
    });
  }
  return enqueueEmail({
    ...common,
    input: {
      ...address,
      kind: "removal_resolved",
      idempotencyKey: `removal-resolved:${context.request.id}:${member.id}`,
      payload: _makeResolvedPayload(options),
    },
  });
}
