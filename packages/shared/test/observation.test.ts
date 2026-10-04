import { describe, expect, it } from "vitest";
import {
  presenceRequestSchema,
  presenceResponseSchema,
  presenceRowSchema,
  itemViewersRequestSchema,
  itemViewersResponseSchema,
  itemViewerRowSchema,
  activityRequestSchema,
  activityResponseSchema,
  activityDetailSchema,
  activityActorSchema,
  activitySubjectSchema,
  mailDiagnosisSchema,
  mailHealthResponseSchema,
  mailDeliveryFailureSchema,
} from "../src/index.ts";

const memberId = "019f0000-0000-7000-8000-000000000001";
const timestamp = "2026-10-04T12:00:00.000Z";
const member = { memberId, displayName: "Rosa" };
const presence = {
  member,
  email: "rosa@example.com",
  status: "invited",
  invitedAt: timestamp,
  joinedAt: null,
  lastSignedInAt: null,
  lastSeenAt: null,
  activeDaysCount: 0,
  activeDaysWindowDays: 90,
  itemsOpenedCount: 0,
  commentsWrittenCount: 0,
  reactionsLeftCount: 0,
};
const viewer = {
  member,
  hasOpened: false,
  firstSeenAt: null,
  firstOpenedAt: null,
  lastOpenedAt: null,
  openCount: 0,
};
const queue = {
  queuedCount: 0,
  failedCount: 0,
  suppressedCount: 0,
  sentLast24hCount: 0,
  oldestQueuedAt: null,
  lastSentAt: null,
  lastFailedAt: null,
};

describe("presence and viewer contracts", () => {
  it("preserves never-arrived and unseen states without relative timestamps", () => {
    expect(presenceRowSchema.parse(presence).joinedAt).toBeNull();
    expect(
      presenceResponseSchema.parse({ presence: [presence], nextCursor: null })
        .presence[0]?.activeDaysWindowDays,
    ).toBe(90);
    expect(itemViewerRowSchema.parse(viewer).hasOpened).toBe(false);
    expect(
      itemViewersResponseSchema.parse({ viewers: [viewer], nextCursor: null })
        .viewers[0]?.firstSeenAt,
    ).toBeNull();
  });
  it("accepts only canonical ids and the documented request fields", () => {
    expect(presenceRequestSchema.parse({ memberId }).memberId).toBe(memberId);
    expect(itemViewersRequestSchema.parse({ itemId: memberId }).itemId).toBe(
      memberId,
    );
    expect(presenceRequestSchema.safeParse({ cursor: "page" }).success).toBe(
      false,
    );
    expect(itemViewersRequestSchema.safeParse({ itemId: "slug" }).success).toBe(
      false,
    );
  });
  it.each([
    "activeDaysCount",
    "activeDaysWindowDays",
    "itemsOpenedCount",
    "commentsWrittenCount",
    "reactionsLeftCount",
  ])("rejects negative presence %s", (field) => {
    expect(
      presenceRowSchema.safeParse({ ...presence, [field]: -1 }).success,
    ).toBe(false);
  });
  it("rejects removed presence rows and malformed viewer records", () => {
    expect(
      presenceRowSchema.safeParse({ ...presence, status: "removed" }).success,
    ).toBe(false);
    expect(
      itemViewerRowSchema.safeParse({ ...viewer, openCount: 0.5 }).success,
    ).toBe(false);
    expect(
      itemViewerRowSchema.safeParse({ ...viewer, lastOpenedAt: "today" })
        .success,
    ).toBe(false);
  });
});

describe("activity contracts", () => {
  it("accepts bounded filters while refusing undeclared queries", () => {
    expect(
      activityRequestSchema.parse({
        limit: 200,
        actorMemberId: memberId,
        subjectId: memberId,
        family: "authority",
      }).limit,
    ).toBe(200);
    expect(activityRequestSchema.safeParse({ limit: 201 }).success).toBe(false);
    expect(activityRequestSchema.safeParse({ limit: 0 }).success).toBe(false);
    expect(activityRequestSchema.safeParse({ family: "uploads" }).success).toBe(
      false,
    );
    expect(activityRequestSchema.safeParse({ debug: true }).success).toBe(
      false,
    );
  });
  it("preserves historical actor labels and nullable dangling subjects", () => {
    expect(
      activityActorSchema.parse({ memberId: null, label: "Former Rosa" }),
    ).toEqual({ memberId: null, label: "Former Rosa" });
    expect(
      activitySubjectSchema.parse({
        kind: "setting",
        id: null,
        label: "Shoebox name",
      }).id,
    ).toBeNull();
    const response = activityResponseSchema.parse({
      activity: [
        {
          entryId: memberId,
          kind: "group_membership_changed",
          family: "authority",
          occurredAt: timestamp,
          actor: { memberId, label: "Rosa then" },
          subject: { kind: "group", id: memberId, label: "Cousins then" },
          deviceLabel: null,
          detail: {
            kind: "group_membership_changed",
            addedLabels: ["Juan"],
            removedLabels: [],
          },
        },
      ],
      nextCursor: null,
    });
    expect(response.activity[0]?.actor.label).toBe("Rosa then");
  });
  it.each([
    { kind: "member_role_changed", fromRole: "viewer", toRole: "admin" },
    {
      kind: "group_membership_changed",
      addedLabels: ["Rosa"],
      removedLabels: [],
    },
    { kind: "item_visibility_changed", fromLabel: null, toLabel: "Everyone" },
    {
      kind: "setting_changed",
      settingKey: "shoebox.name",
      fromValue: null,
      toValue: "Family",
    },
  ])("keeps only documented detail fields: %j", (detail) => {
    expect(
      activityDetailSchema.parse({ ...detail, rawProviderSecret: "secret" }),
    ).toEqual(detail);
  });
  it("rejects unsupported detail kinds and invalid subject ids", () => {
    expect(
      activityDetailSchema.safeParse({ kind: "uploaded", count: 1 }).success,
    ).toBe(false);
    expect(
      activitySubjectSchema.safeParse({
        kind: "item",
        id: "slug",
        label: "Gone",
      }).success,
    ).toBe(false);
  });
});

describe("mail health contracts", () => {
  it.each([
    { code: "base_url_unset", settingKey: "public.base_url" },
    { code: "from_address_unset", settingKey: "mail.from_address" },
    { code: "domain_unverified", domain: "example.com", providerError: null },
    {
      code: "provider_rejecting",
      providerStatus: "403",
      providerMessage: null,
      failingSince: timestamp,
    },
    { code: "backlog", oldestQueuedAt: timestamp, queuedCount: 2 },
  ])("preserves actionable diagnosis: %j", (diagnosis) => {
    expect(mailDiagnosisSchema.parse(diagnosis)).toEqual(diagnosis);
  });
  it("composes the existing queue with nullable health and failure facts", () => {
    const health = {
      status: "ok",
      diagnosis: null,
      fromAddress: null,
      fromName: null,
      sendingDomain: null,
      domainVerifiedAt: null,
      domainLastCheckError: null,
      isBaseUrlSet: false,
      queue,
      lastError: null,
      suppressedAddressCount: 0,
    };
    expect(mailHealthResponseSchema.parse(health).queue.queuedCount).toBe(0);
    expect(
      mailDeliveryFailureSchema.parse({
        code: null,
        message: null,
        occurredAt: timestamp,
        kind: "sign_in_code",
      }).kind,
    ).toBe("sign_in_code");
    expect(
      mailHealthResponseSchema.safeParse({
        ...health,
        suppressedAddressCount: -1,
      }).success,
    ).toBe(false);
  });
  it("rejects malformed diagnosis timestamps, negative backlog and unknown mail kinds", () => {
    expect(
      mailDiagnosisSchema.safeParse({
        code: "backlog",
        oldestQueuedAt: timestamp,
        queuedCount: -1,
      }).success,
    ).toBe(false);
    expect(
      mailDiagnosisSchema.safeParse({
        code: "provider_rejecting",
        providerStatus: null,
        providerMessage: null,
        failingSince: "yesterday",
      }).success,
    ).toBe(false);
    expect(
      mailDeliveryFailureSchema.safeParse({
        code: null,
        message: null,
        occurredAt: timestamp,
        kind: "newsletter",
      }).success,
    ).toBe(false);
  });
});
