import { describe, expect, it } from "vitest";
import { createId } from "../../../src/db/createId.ts";
import {
  insertItem,
  insertMember,
  insertVisibilityRule,
} from "../../helpers/seedHelpers/seedHelpers.ts";
import { makeBulkTestContext } from "./bulkItems.helpers.ts";

describe("POST /api/items/bulk-edit authorization", () => {
  it("refuses a mixed-owner delete atomically", async () => {
    const { database, post, itemIds } = await makeBulkTestContext();
    const otherId = await insertMember(database);
    await database
      .updateTable("items")
      .set({ uploaded_by: otherId })
      .where("id", "=", itemIds[1]!)
      .execute();
    const response = await post({ action: "delete", itemIds });
    expect(response.statusCode).toBe(403);
    expect(response.json().error).toBe("item_delete_forbidden");
    expect(
      await database.selectFrom("items").selectAll().execute(),
    ).toHaveLength(2);
    expect(
      await database.selectFrom("activity_events").selectAll().execute(),
    ).toEqual([]);
    expect(
      await database
        .selectFrom("pending_object_deletions")
        .selectAll()
        .execute(),
    ).toEqual([]);
  });

  it.each(["tags", "people", "milestone", "delete"])(
    "refuses viewers for %s",
    async (action) => {
      const { database, post, memberId, itemIds } = await makeBulkTestContext();
      await database
        .updateTable("members")
        .set({ role: "viewer" })
        .where("id", "=", memberId)
        .execute();
      const response = await post({
        action,
        itemIds,
        tags: ["Beach"],
        people: [{ displayName: "Sam" }],
        milestoneId: createId(),
      });
      expect(response.statusCode).toBe(403);
      expect(
        await database.selectFrom("items").selectAll().execute(),
      ).toHaveLength(2);
      expect(await database.selectFrom("tags").selectAll().execute()).toEqual(
        [],
      );
      expect(await database.selectFrom("people").selectAll().execute()).toEqual(
        [],
      );
    },
  );

  it.each(["tags", "people", "milestone", "delete"])(
    "makes hidden and missing %s selections byte-identical and changes nothing",
    async (action) => {
      const { database, post, itemIds } = await makeBulkTestContext();
      const uploadedBy = await insertMember(database);
      const ruleId = await insertVisibilityRule(database, { mode: "only" });
      const hiddenId = await insertItem(database, {
        uploadedBy,
        visibility_rule_id: ruleId,
        seq: 2,
      });
      const fields = {
        action,
        tags: ["Beach"],
        people: [{ displayName: "Sam" }],
        milestoneId: createId(),
      };
      const hidden = await post({ ...fields, itemIds: [itemIds[0], hiddenId] });
      const missing = await post({
        ...fields,
        itemIds: [itemIds[0], createId()],
      });
      expect(hidden.statusCode).toBe(404);
      expect(hidden.json().error).toBe("item_not_found");
      expect(hidden.body).toBe(missing.body);
      expect(hidden.json().details).toBeUndefined();
      expect(
        await database.selectFrom("items").selectAll().execute(),
      ).toHaveLength(3);
      expect(await database.selectFrom("tags").selectAll().execute()).toEqual(
        [],
      );
      expect(await database.selectFrom("people").selectAll().execute()).toEqual(
        [],
      );
    },
  );

  it("permits an administrator to delete another uploader's selection", async () => {
    const { database, post, memberId, itemIds } = await makeBulkTestContext();
    const otherId = await insertMember(database);
    await database
      .updateTable("members")
      .set({ role: "admin" })
      .where("id", "=", memberId)
      .execute();
    await database.updateTable("items").set({ uploaded_by: otherId }).execute();
    expect((await post({ action: "delete", itemIds })).statusCode).toBe(204);
    expect(await database.selectFrom("items").selectAll().execute()).toEqual(
      [],
    );
  });
});
