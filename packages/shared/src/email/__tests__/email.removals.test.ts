import type {
  EmailCommon,
  RemovalRequestEmailPayload,
  RemovalResolvedEmailPayload,
} from "../../index.ts";
import {
  removalReminderEmailPayloadSchema,
  removalRequestEmailPayloadSchema,
  removalResolvedEmailPayloadSchema,
} from "../../index.ts";
import { describe, expect, it } from "vitest";

const COMMON = {
  shoeboxName: "Family",
  baseUrl: "https://shoebox.example",
  timezone: "Europe/Madrid",
  toDisplayName: "Inés",
  preferencesUrl: null,
} as const satisfies EmailCommon;
const REQUEST_PAYLOAD = {
  ...COMMON,
  requesterDisplayName: "Inés",
  isRequesterTagged: true,
  reason: null,
  itemCapturedOn: "2026-09-14",
  itemUploadedOn: "2026-09-15",
  uploaderDisplayName: "Papá",
  requestsUrl: "https://shoebox.example/requests",
  relation: "uploader",
} as const satisfies RemovalRequestEmailPayload;
const RESOLVED_AT = "2026-09-21T12:00:00.000Z";
const DELETED = {
  ...COMMON,
  outcome: "deleted",
  resolvedByDisplayName: "Papá",
  resolvedAt: RESOLVED_AT,
  itemCapturedOn: "2026-09-14",
  relation: "requester",
} as const satisfies RemovalResolvedEmailPayload;
const DECLINED = {
  ...COMMON,
  outcome: "declined",
  declinerDisplayName: "Papá",
  declineReason: "The actual words.\nAnother line.",
  resolvedAt: RESOLVED_AT,
  itemUrl: "https://shoebox.example/item/1",
} as const satisfies RemovalResolvedEmailPayload;
const WITHDRAWN = {
  ...COMMON,
  outcome: "withdrawn",
  withdrawnByDisplayName: "Inés",
  resolvedAt: RESOLVED_AT,
  itemCapturedOn: "2026-09-14",
  itemUrl: "https://shoebox.example/item/1",
} as const satisfies RemovalResolvedEmailPayload;

function _assertRequiresTheRequestSDateSnapshotsTaggingFact1(): void {
  const schema = removalRequestEmailPayloadSchema;
  expect(schema.safeParse(REQUEST_PAYLOAD).success).toBe(true);
  expect(
    schema.safeParse({ ...REQUEST_PAYLOAD, relation: "requester" }).success,
  ).toBe(false);
  expect(
    schema.safeParse({ ...REQUEST_PAYLOAD, itemUploadedOn: "2026-02-30" })
      .success,
  ).toBe(false);
  const { isRequesterTagged: _tagged, ...withoutTag } = REQUEST_PAYLOAD;
  expect(schema.safeParse(withoutTag).success).toBe(false);
}

function _assertRequiresARealReminderDayAndAPositive2(): void {
  const schema = removalReminderEmailPayloadSchema;
  const payload = {
    ...COMMON,
    requesterDisplayName: "Inés",
    reason: null,
    requestedOn: "2026-09-14",
    weekIndex: 2,
    requestsUrl: "https://shoebox.example/requests",
    relation: "admin",
  };
  expect(schema.safeParse(payload).success).toBe(true);
  expect(
    schema.safeParse({ ...payload, requestedOn: "2026-02-30" }).success,
  ).toBe(false);
  [0, -1, 1.5].forEach((weekIndex) => {
    expect(schema.safeParse({ ...payload, weekIndex }).success).toBe(false);
  });
  expect(
    schema.safeParse({ ...payload, requestsUrl: "/requests" }).success,
  ).toBe(false);
}

function _assertParsesAllThreeOutcomesAndRequiresTheirDistinct3(): void {
  const schema = removalResolvedEmailPayloadSchema;
  [DELETED, DECLINED, WITHDRAWN].forEach((payload) => {
    expect(schema.parse(payload)).toEqual(payload);
  });
  expect(schema.safeParse({ ...DECLINED, declineReason: null }).success).toBe(
    false,
  );
  expect(schema.safeParse({ ...DELETED, relation: "admin" }).success).toBe(
    false,
  );
  expect(schema.safeParse({ ...WITHDRAWN, itemUrl: undefined }).success).toBe(
    false,
  );
  expect(schema.safeParse({ ...DELETED, outcome: "open" }).success).toBe(false);
  expect(
    schema.parse({ ...DELETED, itemUrl: "https://shoebox.example/item/1" }),
  ).not.toHaveProperty("itemUrl");
}
describe("removal email payloads", () => {
  it(
    "requires the request's date snapshots, tagging fact, and recipient relation",
    _assertRequiresTheRequestSDateSnapshotsTaggingFact1,
  );

  it(
    "requires a real reminder day and a positive integer week index",
    _assertRequiresARealReminderDayAndAPositive2,
  );

  it(
    "parses all three outcomes and requires their distinct fields",
    _assertParsesAllThreeOutcomesAndRequiresTheirDistinct3,
  );
});
