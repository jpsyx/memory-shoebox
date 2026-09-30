import { describe, expect, it } from "vitest";
import { createDatabase } from "../../src/db/client.ts";
import { migrateToLatest } from "../../src/db/migrate.ts";
import { getVisibleItemOr404 } from "../../src/items/getVisibleItemOr404.ts";
import { ApiError } from "../../src/http/ApiError.ts";
import { createId } from "../../src/db/createId.ts";
import { EVERYONE_VISIBILITY_RULE_ID } from "../../src/visibility/everyoneRule.ts";
import { makeViewer } from "../helpers/makeViewer.ts";
import {
  insertItem,
  insertMember,
  insertVisibilityRule,
  insertVisibilityRuleSubject,
  NOW,
} from "../helpers/seedHelpers/seedHelpers.ts";

/**
 * Pulls the wire-relevant shape out of an `ApiError`.
 *
 * `message` and `stack` are own properties `Error` defines as
 * **non-enumerable**, so `{ ...apiError }` silently drops both: two errors
 * with different messages would still spread to the same plain object and
 * pass `toEqual`. Reading the properties by name instead of spreading is what
 * makes the byte-identity assertion below able to fail.
 */
type ComparableApiError = {
  statusCode: number;
  code: string;
  message: string;
  details: unknown;
};

function _makeComparableApiErrorFromApiError(
  error: ApiError,
): ComparableApiError {
  return {
    statusCode: error.statusCode,
    code: error.code,
    message: error.message,
    details: error.details,
  };
}

/**
 * Returns the `ApiError` a lookup rejected with.
 *
 * `ApiError` is a class, so this narrows rather than casts: anything else is
 * rethrown, and the caller holds a typed error with no `as` in sight. A
 * lookup that resolves fails here, where the reason reads, rather than
 * further down where the assertion is about the error's shape.
 */
async function _readApiErrorFromRejection(
  lookup: Promise<unknown>,
): Promise<ApiError> {
  try {
    await lookup;
  } catch (error: unknown) {
    if (!(error instanceof ApiError)) {
      throw error;
    }
    return error;
  }
  throw new Error("Expected the lookup to reject with an ApiError.");
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

    // Every column, not just two: a transposed alias in the `select` is
    // silent, and the value simply arrives as the wrong thing later.
    expect(item).toEqual({
      itemId,
      kind: "photo",
      capturedAt: NOW,
      capturedOn: "2026-09-27",
      capturedAtOffsetMinutes: 120,
      captureSource: "exif",
      originalCapturedAt: NOW,
      uploadedBy: memberId,
      visibilityRuleId: EVERYONE_VISIBILITY_RULE_ID,
      burstId: null,
      burstIndex: null,
      durationMs: null,
      altTextOverride: null,
      originalFilename: "IMG_0001.jpg",
    });
    await database.destroy();
  });

  it("returns an item the viewer sees through a rule rather than by owning it", async () => {
    const database = createDatabase(":memory:");
    await migrateToLatest(database);
    const viewerMemberId = await insertMember(database);
    const uploaderMemberId = await insertMember(database);
    const sharedRuleId = await insertVisibilityRule(database, { mode: "only" });
    await insertVisibilityRuleSubject(database, {
      ruleId: sharedRuleId,
      memberId: viewerMemberId,
    });
    const itemId = await insertItem(database, {
      uploadedBy: uploaderMemberId,
      visibility_rule_id: sharedRuleId,
    });

    // The ordinary restricted-but-shared case. Every other test here has the
    // viewer owning the item, so without this one the rule half of the
    // predicate could be broken and the suite would still pass on the
    // ownership half.
    const item = await getVisibleItemOr404({
      database,
      viewer: makeViewer({
        memberId: viewerMemberId,
        visibleRuleIds: [sharedRuleId],
      }),
      itemId,
    });

    expect(item.itemId).toBe(itemId);
    await database.destroy();
  });

  it("refuses a viewer who holds no rules and did not upload it", async () => {
    const database = createDatabase(":memory:");
    await migrateToLatest(database);
    const viewerMemberId = await insertMember(database);
    const uploaderMemberId = await insertMember(database);
    const itemId = await insertItem(database, {
      uploadedBy: uploaderMemberId,
    });

    // The empty set is special-cased inside `visibilityExpression`, to dodge
    // SQLite's `IN ()` syntax error. That branch has to fail closed.
    await expect(
      getVisibleItemOr404({
        database,
        viewer: makeViewer({ memberId: viewerMemberId, visibleRuleIds: [] }),
        itemId,
      }),
    ).rejects.toMatchObject({ statusCode: 404 });
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

    const forHidden = await _readApiErrorFromRejection(
      getVisibleItemOr404({ database, viewer, itemId: hiddenId }),
    );
    const forNothing = await _readApiErrorFromRejection(
      getVisibleItemOr404({ database, viewer, itemId: createId() }),
    );

    // Compared by named property, not by spread: see
    // `_makeComparableApiErrorFromApiError`. This is what actually proves
    // the two errors agree on `message`, which `{ ...forHidden }` cannot,
    // because `Error.prototype.message` is non-enumerable and a spread
    // silently drops it.
    expect(_makeComparableApiErrorFromApiError(forHidden)).toEqual(
      _makeComparableApiErrorFromApiError(forNothing),
    );
    expect(forHidden.statusCode).toBe(404);
    expect(forHidden.code).toBe("item_not_found");
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

    const error = await _readApiErrorFromRejection(
      getVisibleItemOr404({
        database,
        viewer: makeViewer({ memberId }),
        itemId: createId(),
        code: "comment_not_found",
      }),
    );

    expect(error.code).toBe("comment_not_found");
    await database.destroy();
  });
});
