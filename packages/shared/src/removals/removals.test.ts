import type { MemberRef, RemovalRequestDto } from "../index.ts";
import {
  createRemovalRequestParamsSchema,
  createRemovalRequestRequestSchema,
  declineRemovalRequestParamsSchema,
  declineRemovalRequestRequestSchema,
  listItemRemovalRequestsParamsSchema,
  listItemRemovalRequestsResponseSchema,
  listRemovalRequestsRequestSchema,
  listRemovalRequestsResponseSchema,
  removalRequestDtoSchema,
  withdrawRemovalRequestParamsSchema,
} from "../index.ts";
import { describe, expect, it } from "vitest";

const MEMBER = {
  memberId: "0199a1f0-2c3d-7e4a-8b5c-6d7e8f905678",
  displayName: "Inés",
} as const satisfies MemberRef;
const REQUEST = {
  requestId: MEMBER.memberId,
  state: "open",
  itemId: MEMBER.memberId,
  requestedBy: MEMBER,
  reason: null,
  declineReason: null,
  createdAt: "2026-09-14T12:00:00.000Z",
  resolvedAt: null,
  resolvedBy: null,
  uploadedBy: MEMBER,
  itemCapturedAt: null,
  media: null,
  canWithdraw: true,
  canDecline: false,
  canDeleteItem: false,
} as const satisfies RemovalRequestDto;

describe("removal writes", () => {
  it("normalizes absent and blank optional reasons to null and caps trimmed text", () => {
    const schema = createRemovalRequestRequestSchema;
    [{}, { reason: null }, { reason: "   " }].forEach((body) => {
      expect(schema.parse(body)).toHaveProperty("reason", null);
    });
    expect(schema.parse({ reason: " Please remove it \n" })).toHaveProperty(
      "reason",
      "Please remove it",
    );
    expect(schema.safeParse({ reason: ` ${"a".repeat(4000)} ` }).success).toBe(
      true,
    );
    expect(schema.safeParse({ reason: "a".repeat(4001) }).success).toBe(false);
  });

  it("requires the decliner's own words and caps them after trimming", () => {
    const schema = declineRemovalRequestRequestSchema;
    [{}, { declineReason: null }, { declineReason: " \n " }].forEach((body) => {
      expect(schema.safeParse(body).success).toBe(false);
    });
    expect(
      schema.parse({ declineReason: " First line\nSecond line " }),
    ).toHaveProperty("declineReason", "First line\nSecond line");
    expect(
      schema.safeParse({ declineReason: ` ${"a".repeat(4000)} ` }).success,
    ).toBe(true);
    expect(schema.safeParse({ declineReason: "a".repeat(4001) }).success).toBe(
      false,
    );
  });
});

describe("removal queue", () => {
  it("defaults to open and 25 rows with a maximum of 100", () => {
    const schema = listRemovalRequestsRequestSchema;
    expect(schema.parse({})).toMatchObject({ state: "open", limit: 25 });
    expect(schema.parse({ state: "settled", limit: "100" })).toMatchObject({
      state: "settled",
      limit: 100,
    });
    [0, -1, 101, 1.5].forEach((limit) => {
      expect(schema.safeParse({ limit }).success).toBe(false);
    });
    expect(schema.safeParse({ state: "deleted" }).success).toBe(false);
    expect(schema.safeParse({ cursor: "" }).success).toBe(false);
  });
});

describe("RemovalRequestDto", () => {
  it("permits nullable media and deleted item IDs without snapshot storage keys", () => {
    const schema = removalRequestDtoSchema;
    expect(schema.parse(REQUEST)).toEqual(REQUEST);
    expect(
      schema.safeParse({
        ...REQUEST,
        state: "deleted",
        itemId: null,
        resolvedAt: REQUEST.createdAt,
        resolvedBy: MEMBER,
      }).success,
    ).toBe(true);
    expect(
      schema.parse({ ...REQUEST, itemOriginalStorageKey: "secret" }),
    ).not.toHaveProperty("itemOriginalStorageKey");
  });

  it("requires frozen member fields and explicit nullable media", () => {
    const schema = removalRequestDtoSchema;
    const { media: _media, ...withoutMedia } = REQUEST;
    expect(schema.safeParse(withoutMedia).success).toBe(false);
    expect(
      schema.safeParse({ ...REQUEST, requestedBy: { displayName: "Inés" } })
        .success,
    ).toBe(false);
    expect(schema.safeParse({ ...REQUEST, state: "accepted" }).success).toBe(
      false,
    );
  });
});

describe("removal response envelopes and paths", () => {
  it("requires queue counts and the item read's full context", () => {
    const schema = listRemovalRequestsResponseSchema;
    expect(
      schema.safeParse({ removalRequests: [], nextCursor: null }).success,
    ).toBe(false);
    expect(
      schema.safeParse({
        removalRequests: [],
        nextCursor: null,
        openCount: 0,
        settledCount: 0,
      }).success,
    ).toBe(true);
    expect(
      listItemRemovalRequestsResponseSchema.safeParse({
        removalRequests: [],
        nextCursor: null,
        canRequestRemoval: false,
      }).success,
    ).toBe(false);
  });

  it.each([
    ["create", createRemovalRequestParamsSchema],
    ["list item", listItemRemovalRequestsParamsSchema],
    ["decline", declineRemovalRequestParamsSchema],
    ["withdraw", withdrawRemovalRequestParamsSchema],
  ])("accepts UUIDs and rejects row IDs in %s", (_label, schema) => {
    expect(
      schema.safeParse({ itemId: "rowid", requestId: "rowid" }).success,
    ).toBe(false);
    expect(
      schema.safeParse({ itemId: MEMBER.memberId, requestId: MEMBER.memberId })
        .success,
    ).toBe(true);
  });
});
