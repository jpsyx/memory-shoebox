import { describe, expect, it } from "vitest";
import { createDatabase } from "../../src/db/client.ts";
import { migrateToLatest } from "../../src/db/migrate.ts";
import { getVisibleItemOr404 } from "../../src/items/getVisibleItemOr404.ts";
import { ApiError } from "../../src/http/ApiError.ts";
import type { Viewer } from "../../src/http/requestContextHelpers.ts";
import { createId } from "../../src/db/createId.ts";
import {
  insertItem,
  insertMember,
  insertVisibilityRule,
} from "../helpers/seedHelpers/seedHelpers.ts";

const makeViewer = (
  overrides: Partial<Viewer> & { memberId: string },
): Viewer => {
  return {
    sessionId: createId(),
    role: "uploader",
    isAdmin: false,
    visibleRuleIds: ["visibility-rule-everyone"],
    ...overrides,
  };
};

/**
 * Pulls the wire-relevant shape out of an `ApiError`.
 *
 * `message` and `stack` are own properties `Error` defines as
 * **non-enumerable**, so `{ ...apiError }` silently drops both: two errors
 * with different messages would still spread to the same plain object and
 * pass `toEqual`. Reading the properties by name instead of spreading is what
 * makes the byte-identity assertion below able to fail.
 */
function toComparableShape(error: ApiError): {
  statusCode: number;
  code: string;
  message: string;
  details: unknown;
} {
  return {
    statusCode: error.statusCode,
    code: error.code,
    message: error.message,
    details: error.details,
  };
}

describe("getVisibleItemOr404", () => {
  it("returns the row the viewer may see", async () => {
    const database = createDatabase(":memory:");
    await migrateToLatest(database);
    const memberId = await insertMember(database);
    const itemId = await insertItem(database, { uploadedBy: memberId });

    const item = await getVisibleItemOr404({
      database,
      viewer: makeViewer({ memberId }),
      itemId,
    });

    expect(item.itemId).toBe(itemId);
    expect(item.uploadedBy).toBe(memberId);
    await database.destroy();
  });

  it("throws the same 404 for an invisible item and a nonexistent id", async () => {
    const database = createDatabase(":memory:");
    await migrateToLatest(database);
    const viewerMemberId = await insertMember(database);
    const otherMemberId = await insertMember(database);
    const hiddenRuleId = await insertVisibilityRule(database, {
      mode: "only",
    });
    const hiddenId = await insertItem(database, {
      uploadedBy: otherMemberId,
      seq: 1,
      visibility_rule_id: hiddenRuleId,
    });
    const viewer = makeViewer({ memberId: viewerMemberId });

    const forHidden = await getVisibleItemOr404({
      database,
      viewer,
      itemId: hiddenId,
    }).catch((error: unknown) => {
      return error;
    });
    const forNothing = await getVisibleItemOr404({
      database,
      viewer,
      itemId: createId(),
    }).catch((error: unknown) => {
      return error;
    });

    expect(forHidden).toBeInstanceOf(ApiError);
    expect(forNothing).toBeInstanceOf(ApiError);
    // Compared by named property, not by spread: see `toComparableShape`.
    // This is what actually proves the two errors agree on `message`, which
    // `{ ...forHidden }` cannot, because `Error.prototype.message` is
    // non-enumerable and a spread silently drops it.
    expect(toComparableShape(forHidden as ApiError)).toEqual(
      toComparableShape(forNothing as ApiError),
    );
    expect((forHidden as ApiError).statusCode).toBe(404);
    expect((forHidden as ApiError).code).toBe("item_not_found");
    await database.destroy();
  });

  it("carries the uploader's own item, and everything for an admin", async () => {
    const database = createDatabase(":memory:");
    await migrateToLatest(database);
    const uploaderId = await insertMember(database);
    const adminId = await insertMember(database, { role: "admin" });
    const hiddenRuleId = await insertVisibilityRule(database, {
      mode: "only",
    });
    const itemId = await insertItem(database, {
      uploadedBy: uploaderId,
      visibility_rule_id: hiddenRuleId,
    });

    await expect(
      getVisibleItemOr404({
        database,
        viewer: makeViewer({ memberId: uploaderId, visibleRuleIds: [] }),
        itemId,
      }),
    ).resolves.toMatchObject({ itemId });

    await expect(
      getVisibleItemOr404({
        database,
        viewer: makeViewer({
          memberId: adminId,
          role: "admin",
          isAdmin: true,
          visibleRuleIds: [],
        }),
        itemId,
      }),
    ).resolves.toMatchObject({ itemId });
    await database.destroy();
  });

  it("names the resource the caller addressed", async () => {
    const database = createDatabase(":memory:");
    await migrateToLatest(database);
    const memberId = await insertMember(database);

    const error = await getVisibleItemOr404({
      database,
      viewer: makeViewer({ memberId }),
      itemId: createId(),
      code: "comment_not_found",
    }).catch((caught: unknown) => {
      return caught as ApiError;
    });

    expect((error as ApiError).code).toBe("comment_not_found");
    await database.destroy();
  });
});
