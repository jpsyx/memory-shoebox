import { describe, expect, it } from "vitest";
import { createTestApp } from "../helpers/createTestApp.ts";
import { insertSignedInMember } from "../helpers/insertSignedInMember.ts";
import {
  insertMember,
  insertItem,
  insertRendition,
  insertRemovalRequest,
  insertVisibilityRule,
  NOW,
} from "../helpers/seedHelpers/seedHelpers.ts";
import { createId } from "../../src/db/createId.ts";
import { getRemovalRequestOr404 } from "../../src/removals/getRemovalRequestOr404.ts";
import { makeRemovalRequestDtosFromRows } from "../../src/removals/makeRemovalRequestDtosFromRows.ts";
import { readRemovalRequests } from "../../src/removals/readRemovalRequests.ts";
import { makeViewer } from "../helpers/makeViewer.ts";
import { makeQueryCountingDatabaseFromDatabase } from "../helpers/makeQueryCountingDatabaseFromDatabase.ts";

describe("removal privacy and batches", () => {
  it("retains requester control without media after access narrows and hides requests from outsiders", async () => {
    const { app, database, b2, close } = await createTestApp();
    try {
      const requester = await insertSignedInMember({
        database,
        member: { role: "viewer" },
      });
      const outsider = await insertSignedInMember({
        database,
        token: "outsider",
        member: { role: "viewer" },
      });
      const uploader = await insertMember(database);
      const ruleId = await insertVisibilityRule(database, { mode: "only" });
      const itemId = await insertItem(database, {
        uploadedBy: uploader,
        visibility_rule_id: ruleId,
      });
      await insertRendition(database, { itemId });
      const requestId = await insertRemovalRequest(database, {
        item_id: itemId,
        requestedByMemberId: requester.memberId,
        itemUploaderMemberId: uploader,
        state: "open",
        resolved_at: null,
        resolved_by_member_id: null,
        decline_reason: null,
      });
      const viewer = makeViewer({
        memberId: requester.memberId,
        role: "viewer",
      });
      const row = await getRemovalRequestOr404({ database, viewer, requestId });
      const [dto] = await makeRemovalRequestDtosFromRows({
        database,
        b2,
        viewer,
        rows: [row],
        now: new Date(NOW),
      });
      expect(dto).toMatchObject({ media: null, canWithdraw: true });
      for (const method of ["GET", "POST"] as const) {
        const request = {
          method,
          headers: { cookie: requester.cookie },
          ...(method === "POST" ? { payload: {} } : {}),
        };
        const invisible = await app.inject({
          ...request,
          url: `/api/items/${itemId}/removal-requests`,
        });
        const missing = await app.inject({
          ...request,
          url: `/api/items/${createId()}/removal-requests`,
        });
        expect(invisible.statusCode).toBe(404);
        expect(invisible.body).toBe(missing.body);
      }
      const outsiderRequest = {
        method: "POST" as const,
        headers: { cookie: outsider.cookie },
      };
      const inaccessible = await app.inject({
        ...outsiderRequest,
        url: `/api/removal-requests/${requestId}/withdraw`,
      });
      const nonexistent = await app.inject({
        ...outsiderRequest,
        url: `/api/removal-requests/${createId()}/withdraw`,
      });
      expect(inaccessible.statusCode).toBe(404);
      expect(inaccessible.body).toBe(nonexistent.body);
      expect(
        (
          await app.inject({
            method: "POST",
            url: `/api/removal-requests/${requestId}/withdraw`,
            headers: { cookie: requester.cookie },
          })
        ).json(),
      ).toMatchObject({ state: "withdrawn", media: null });
    } finally {
      await close();
    }
  });

  it("counts snapshot uploader scope, includes deleted history and keeps query counts fixed", async () => {
    const { database, b2, close } = await createTestApp();
    try {
      const uploader = await insertMember(database);
      const requester = await insertMember(database);
      const otherUploader = await insertMember(database);
      const itemId = await insertItem(database, { uploadedBy: uploader });
      await insertRendition(database, { itemId });
      const deletedId = await insertRemovalRequest(database, {
        requestedByMemberId: requester,
        itemUploaderMemberId: uploader,
        state: "deleted",
        decline_reason: null,
      });
      await insertRemovalRequest(database, {
        requestedByMemberId: requester,
        itemUploaderMemberId: otherUploader,
      });
      const askIds = await Promise.all(
        Array.from({ length: 4 }, async () => {
          return insertRemovalRequest(database, {
            requestedByMemberId: requester,
            itemUploaderMemberId: uploader,
            item_id: itemId,
          });
        }),
      );
      const counted = makeQueryCountingDatabaseFromDatabase(database);
      const viewer = makeViewer({ memberId: uploader });
      const read = (limit: number) => {
        return readRemovalRequests({
          database: counted.database,
          b2,
          viewer,
          now: new Date(NOW),
          query: { state: "settled", limit },
        });
      };
      counted.reset();
      const small = await read(1);
      const smallCount = counted.getQueryCount();
      expect(smallCount).toBe(9);
      counted.reset();
      const large = await read(20);
      expect(counted.getQueryCount()).toBe(smallCount);
      expect(large).toMatchObject({
        openCount: 0,
        settledCount: 5,
        nextCursor: null,
      });
      expect(
        large.removalRequests.map((row) => {
          return row.requestId;
        }),
      ).toContain(deletedId);
      expect(large.removalRequests).toHaveLength(askIds.length + 1);
      expect(small.nextCursor).not.toBeNull();
    } finally {
      await close();
    }
  });
});
