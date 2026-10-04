import { describe, expect, it } from "vitest";
import {
  listMilestoneCandidatesResponseSchema,
  listMilestoneMismatchesResponseSchema,
} from "@memory-shoebox/shared";
import { createTestApp } from "../helpers/createTestApp.ts";
import { insertSignedInMember } from "../helpers/insertSignedInMember.ts";
import {
  insertItem,
  insertItemMilestone,
  insertMilestone,
  insertRendition,
  insertMember,
  insertVisibilityRule,
  NOW,
} from "../helpers/seedHelpers/seedHelpers.ts";
import { createId } from "../../src/db/createId.ts";

describe("milestone picker routes", () => {
  it.each([
    ["viewer", "candidates", 403],
    ["viewer", "mismatches", 403],
    ["uploader", "candidates", 200],
    ["uploader", "mismatches", 200],
    ["admin", "candidates", 200],
    ["admin", "mismatches", 200],
  ] as const)(
    "restricts the %s role on %s before parameter validation",
    async (role, endpoint, status) => {
      const { app, database, close } = await createTestApp();
      try {
        const { cookie } = await insertSignedInMember({
          database,
          member: { role },
        });
        const milestoneId = await insertMilestone(database, {
          name: "Empty",
          startsOn: "2026-09-27",
        });
        const url = `/api/milestones/${milestoneId}/${endpoint}`;
        expect((await app.inject({ url })).statusCode).toBe(401);
        const response = await app.inject({ url, headers: { cookie } });
        expect(response.statusCode).toBe(status);
        if (role === "viewer") {
          expect(response.json().error).toBe("milestone_forbidden");
          expect(
            (
              await app.inject({
                url: `/api/milestones/invalid/${endpoint}?cursor=bad`,
                headers: { cookie },
              })
            ).statusCode,
          ).toBe(403);
        }
      } finally {
        await close();
      }
    },
  );

  it("defaults to the span, marks attachments and allows advisory outsiders with all bounds", async () => {
    const { app, database, close } = await createTestApp();
    try {
      const { cookie, memberId } = await insertSignedInMember({ database });
      const milestoneId = await insertMilestone(database, {
        name: "Trip",
        startsOn: "2026-09-10",
        endsOn: "2026-09-12",
      });
      const insideId = await insertItem(database, {
        uploadedBy: memberId,
        captured_on: "2026-09-11",
      });
      const outsideId = await insertItem(database, {
        uploadedBy: memberId,
        seq: 1,
        captured_on: "2026-09-13",
      });
      await insertRendition(database, { itemId: insideId });
      await insertRendition(database, { itemId: outsideId });
      await insertItemMilestone(database, { milestoneId, itemId: insideId });
      const url = `/api/milestones/${milestoneId}/candidates`;
      const response = await app.inject({ url, headers: { cookie } });
      expect(response.statusCode).toBe(200);
      expect(
        listMilestoneCandidatesResponseSchema.parse(response.json()).candidates,
      ).toMatchObject([
        { item: { itemId: insideId }, isAttached: true, isOutsideSpan: false },
      ]);
      const all = await app.inject({
        url: `${url}?scope=all&from=2026-09-13&to=2026-09-13`,
        headers: { cookie },
      });
      expect(
        listMilestoneCandidatesResponseSchema.parse(all.json()).candidates,
      ).toMatchObject([
        { item: { itemId: outsideId }, isAttached: false, isOutsideSpan: true },
      ]);
      expect(
        (
          await app.inject({
            url: `${url}?from=2026-09-01`,
            headers: { cookie },
          })
        ).statusCode,
      ).toBe(400);
    } finally {
      await close();
    }
  });

  it("paginates tied days without repeating IDs and advances past missing media", async () => {
    const { app, database, close } = await createTestApp();
    try {
      const { cookie, memberId } = await insertSignedInMember({ database });
      const milestoneId = await insertMilestone(database, {
        name: "Day",
        startsOn: "2026-09-27",
      });
      const ids = [createId(), createId(), createId()].sort().reverse();
      await Promise.all(
        ids.map(async (id, index) => {
          await insertItem(database, { id, uploadedBy: memberId, seq: index });
          if (index !== 0) {
            await insertRendition(database, { itemId: id });
          }
        }),
      );
      const url = `/api/milestones/${milestoneId}/candidates?limit=1`;
      const first = await app.inject({ url, headers: { cookie } });
      expect(first.statusCode).toBe(200);
      const firstPage = listMilestoneCandidatesResponseSchema.parse(
        first.json(),
      );
      expect(firstPage.candidates).toEqual([]);
      expect(firstPage.nextCursor).not.toBeNull();
      const secondPage = listMilestoneCandidatesResponseSchema.parse(
        (
          await app.inject({
            url: `${url}&cursor=${firstPage.nextCursor}`,
            headers: { cookie },
          })
        ).json(),
      );
      expect(secondPage.candidates[0]?.item.itemId).toBe(ids[1]);
      const thirdPage = listMilestoneCandidatesResponseSchema.parse(
        (
          await app.inject({
            url: `${url}&cursor=${secondPage.nextCursor}`,
            headers: { cookie },
          })
        ).json(),
      );
      expect(thirdPage.candidates[0]?.item.itemId).toBe(ids[2]);
      expect(thirdPage.nextCursor).toBeNull();
    } finally {
      await close();
    }
  });

  it("widens over all visible unacknowledged mismatches even on a one-item page", async () => {
    const { app, database, close } = await createTestApp();
    try {
      const { cookie } = await insertSignedInMember({ database });
      const uploader = await insertMember(database);
      const hiddenRule = await insertVisibilityRule(database, { mode: "only" });
      const milestoneId = await insertMilestone(database, {
        name: "Trip",
        startsOn: "2026-09-10",
        endsOn: "2026-09-12",
      });
      await ["2026-09-01", "2026-09-20", "2026-09-25", "2026-08-01"].reduce(
        async (previous, day, index) => {
          await previous;
          const itemId = await insertItem(database, {
            uploadedBy: uploader,
            seq: index,
            captured_on: day,
            ...(index === 3 ? { visibility_rule_id: hiddenRule } : {}),
          });
          await insertRendition(database, { itemId });
          await insertItemMilestone(database, {
            milestoneId,
            itemId,
            span_mismatch_acknowledged_at: index === 2 ? NOW : null,
          });
        },
        Promise.resolve(),
      );
      const url = `/api/milestones/${milestoneId}/mismatches?limit=1`;
      const response = await app.inject({ url, headers: { cookie } });
      expect(response.statusCode).toBe(200);
      const page = listMilestoneMismatchesResponseSchema.parse(response.json());
      expect(page.mismatches).toHaveLength(1);
      expect(page.mismatches[0]).toMatchObject({
        item: { capturedOn: "2026-09-20" },
        attachedAt: NOW,
      });
      expect(page.wideningSpan).toEqual({
        startsOn: "2026-09-01",
        endsOn: "2026-09-20",
      });
      const finalPage = listMilestoneMismatchesResponseSchema.parse(
        (
          await app.inject({
            url: `${url}&cursor=${page.nextCursor}`,
            headers: { cookie },
          })
        ).json(),
      );
      expect(finalPage.mismatches[0]?.item.capturedOn).toBe("2026-09-01");
      expect(finalPage.wideningSpan).toEqual(page.wideningSpan);
      expect(finalPage.nextCursor).toBeNull();
    } finally {
      await close();
    }
  });

  it.each(["candidates", "mismatches"])(
    "requires a session, finds milestones, and validates pair cursors for %s",
    async (endpoint) => {
      const { app, database, close } = await createTestApp();
      try {
        const { cookie } = await insertSignedInMember({ database });
        const milestoneId = await insertMilestone(database, {
          name: "Empty",
          startsOn: "2026-09-27",
        });
        expect(
          (
            await app.inject({
              url: `/api/milestones/${milestoneId}/${endpoint}`,
            })
          ).statusCode,
        ).toBe(401);
        expect(
          (
            await app.inject({
              url: `/api/milestones/${createId()}/${endpoint}`,
              headers: { cookie },
            })
          ).json(),
        ).toMatchObject({ error: "milestone_not_found" });
        const cursors = [
          "bad",
          Buffer.from(JSON.stringify({ capturedOn: "2026-09-27" })).toString(
            "base64url",
          ),
          Buffer.from(
            JSON.stringify({ capturedOn: "2026-02-30", itemId: createId() }),
          ).toString("base64url"),
        ];
        await Promise.all(
          cursors.map(async (cursor) => {
            expect(
              (
                await app.inject({
                  url: `/api/milestones/${milestoneId}/${endpoint}?cursor=${cursor}`,
                  headers: { cookie },
                })
              ).statusCode,
            ).toBe(400);
          }),
        );
        const empty = await app.inject({
          url: `/api/milestones/${milestoneId}/${endpoint}`,
          headers: { cookie },
        });
        expect(empty.statusCode).toBe(200);
        if (endpoint === "mismatches") {
          expect(empty.json().wideningSpan).toEqual({
            startsOn: "2026-09-27",
            endsOn: "2026-09-27",
          });
        }
      } finally {
        await close();
      }
    },
  );
});
