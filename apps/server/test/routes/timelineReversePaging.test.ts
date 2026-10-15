import type { TimelineResponse } from "@memory-shoebox/shared";
import { CompiledQuery } from "kysely";
import { readTimelinePage } from "../../src/archive/readTimelinePage.ts";
import { EVERYONE_VISIBILITY_RULE_ID } from "../../src/visibility/everyoneRule.ts";
import { describe, expect, it } from "vitest";
import { makeTimelineFilterFromQuery } from "../../src/archive/selectionFilterHelpers.ts";
import { makeDigestFromFilter } from "../../src/archive/timelineCursorHelpers/timelineCursorHelpers.ts";
import { insertSignedInMember } from "../helpers/insertSignedInMember.ts";
import {
  insertMember,
  insertItem,
  insertRendition,
  insertBurst,
  insertUploadSession,
  setBurstCover,
  insertMilestone,
  insertVisibilityRule,
} from "../helpers/seedHelpers/seedHelpers.ts";
import {
  insertDrawableItem,
  makeApp,
} from "./__tests__/timelineContractTestHelpers.ts";

function _encodeCursor(payload: unknown): string {
  return Buffer.from(JSON.stringify(payload)).toString("base64url");
}

describe("bidirectional atomic-day timeline pages", () => {
  it("uses the same bounded keyset plan as the archive grows in either direction", async () => {
    const fixture = await makeApp();
    const member = await insertSignedInMember({ database: fixture.database });
    try {
      const compiled = new Map<object, CompiledQuery>();
      const executed: CompiledQuery[] = [];
      const database = fixture.database.withPlugin({
        transformQuery: (arguments_) => {
          compiled.set(
            arguments_.queryId,
            fixture.database
              .getExecutor()
              .compileQuery(arguments_.node, arguments_.queryId),
          );
          return arguments_.node;
        },
        transformResult: async (arguments_) => {
          executed.push(compiled.get(arguments_.queryId)!);
          return arguments_.result;
        },
      });
      for (const [index, capturedOn] of [
        "2026-09-24",
        "2026-09-22",
        "2026-09-20",
      ].entries()) {
        await insertDrawableItem(fixture.database, {
          uploadedBy: member.memberId,
          seq: index + 1,
          capturedOn,
        });
      }
      const filter = makeTimelineFilterFromQuery({});
      const read = (direction: "older" | "newer", isAdmin: boolean) => {
        return readTimelinePage({
          database,
          b2: fixture.b2,
          filter,
          limit: 1,
          now: new Date("2026-09-27T10:00:00Z"),
          viewer: {
            memberId: member.memberId,
            sessionId: member.sessionId,
            role: isAdmin ? "admin" : "viewer",
            isAdmin,
            visibleRuleIds: [EVERYONE_VISIBILITY_RULE_ID],
          },
          cursor: {
            boundaryDay: "2026-09-22",
            direction,
            filterDigest: makeDigestFromFilter(filter),
          },
        });
      };
      const smallCounts = [];
      for (const isAdmin of [false, true]) {
        for (const direction of ["older", "newer"] as const) {
          executed.length = 0;
          await read(direction, isAdmin);
          smallCounts.push(executed.length);
        }
      }
      for (let index = 0; index < 1000; index += 1) {
        await insertItem(fixture.database, {
          uploadedBy: member.memberId,
          seq: 100 + index,
          captured_on: index < 500 ? "2025-01-01" : "2027-01-01",
        });
      }
      const largeCounts = [];
      for (const isAdmin of [false, true]) {
        for (const direction of ["older", "newer"] as const) {
          executed.length = 0;
          const page = await read(direction, isAdmin);
          largeCounts.push(executed.length);
          expect(
            page.days.map((day) => {
              return day.capturedOn;
            }),
          ).toEqual([direction === "older" ? "2026-09-20" : "2026-09-24"]);
          const keysetQueries = executed.filter((query) => {
            return (
              query.sql.includes('"items"."captured_on"') &&
              query.sql.includes("limit ?") &&
              !query.sql.includes('"items"."captured_on" in')
            );
          });
          expect(keysetQueries).toHaveLength(2);
          const plans = await Promise.all(
            keysetQueries.map((query) => {
              return fixture.database.executeQuery<{ detail: string }>(
                CompiledQuery.raw(`EXPLAIN QUERY PLAN ${query.sql}`, [
                  ...query.parameters,
                ]),
              );
            }),
          );
          const details = plans.flatMap((plan) => {
            return plan.rows.map((row) => {
              return row.detail;
            });
          });
          expect(
            details.some((detail) => {
              return (
                detail.startsWith("SEARCH items USING") &&
                /captured_on[<>]/.test(detail)
              );
            }),
            JSON.stringify(details),
          ).toBe(true);
          if (isAdmin) {
            expect(
              details.filter((detail) => {
                return detail.includes("TEMP B-TREE");
              }),
            ).toEqual([]);
          }
        }
      }
      expect(largeCounts).toEqual(smallCounts);
      expect(
        largeCounts.every((count) => {
          return count <= 12;
        }),
      ).toBe(true);
    } finally {
      await fixture.close();
    }
  });

  it("keeps hidden burst frames absent when reversing into their atomic day", async () => {
    const fixture = await makeApp();
    const { cookie, memberId } = await insertSignedInMember({
      database: fixture.database,
    });
    try {
      const uploader = await insertMember(fixture.database);
      const hiddenRule = await insertVisibilityRule(fixture.database, {
        mode: "only",
      });
      const uploadSessionId = await insertUploadSession(fixture.database, {
        uploadedBy: uploader,
      });
      const burstId = await insertBurst(fixture.database, {
        uploadSessionId,
        capturedOn: "2026-09-20",
      });
      const frameIds = [];
      for (let index = 0; index < 3; index += 1) {
        const itemId = await insertItem(fixture.database, {
          uploadedBy: uploader,
          seq: index + 1,
          captured_on: "2026-09-20",
          captured_at: `2026-09-20T09:0${index}:00Z`,
          burst_id: burstId,
          burst_index: index + 1,
          ...(index === 2 ? { visibility_rule_id: hiddenRule } : {}),
        });
        await insertRendition(fixture.database, { itemId, purpose: "thumb" });
        frameIds.push(itemId);
      }
      await setBurstCover(fixture.database, {
        burstId,
        coverItemId: frameIds[2]!,
      });
      await insertDrawableItem(fixture.database, {
        uploadedBy: memberId,
        seq: 10,
        capturedOn: "2026-09-21",
      });
      await insertDrawableItem(fixture.database, {
        uploadedBy: memberId,
        seq: 11,
        capturedOn: "2026-09-19",
      });
      const read = async (cursor: string | null): Promise<TimelineResponse> => {
        return (
          await fixture.app.inject({
            method: "GET",
            headers: { cookie },
            url: `/api/timeline?limit=1${cursor === null ? "" : `&cursor=${cursor}`}`,
          })
        ).json();
      };
      const newest = await read(null);
      const middle = await read(newest.nextCursor);
      const oldest = await read(middle.nextCursor);
      const restored = await read(oldest.previousCursor);
      expect(restored.days).toEqual(middle.days);
      expect(restored.days[0]!.itemCount).toBe(2);
      expect(restored.days[0]!.items[0]!.burst).toMatchObject({
        visibleFrameCount: 2,
        coverItemId: frameIds[0],
      });
      expect(JSON.stringify(restored)).not.toContain(frameIds[2]);
    } finally {
      await fixture.close();
    }
  });
  it("recounts a filtered retained refresh only when explicitly requested", async () => {
    const fixture = await makeApp();
    const { cookie, memberId } = await insertSignedInMember({
      database: fixture.database,
    });
    try {
      const firstId = await insertDrawableItem(fixture.database, {
        uploadedBy: memberId,
        seq: 1,
        capturedOn: "2026-09-23",
      });
      await insertDrawableItem(fixture.database, {
        uploadedBy: memberId,
        seq: 2,
        capturedOn: "2026-09-22",
      });
      const first = (
        await fixture.app.inject({
          method: "GET",
          headers: { cookie },
          url: "/api/timeline?until=2026-09-23&limit=1",
        })
      ).json<TimelineResponse>();
      expect(first.resultCount).toBe(2);
      await fixture.database
        .deleteFrom("items")
        .where("id", "=", firstId)
        .execute();
      const path = `/api/timeline?until=2026-09-23&cursor=${first.nextCursor}`;
      const ordinary = await fixture.app.inject({
        method: "GET",
        headers: { cookie },
        url: path,
      });
      expect(ordinary.json().resultCount).toBeNull();
      const refreshed = await fixture.app.inject({
        method: "GET",
        headers: { cookie },
        url: `${path}&includeResultCount=true`,
      });
      expect(refreshed.statusCode).toBe(200);
      expect(refreshed.json().resultCount).toBe(1);
      const invalid = await fixture.app.inject({
        method: "GET",
        headers: { cookie },
        url: `${path}&includeResultCount=unexpected`,
      });
      expect(invalid.statusCode).toBe(400);
    } finally {
      await fixture.close();
    }
  });
  it("reverse traversal restores evicted pages without splitting days", async () => {
    const fixture = await makeApp();
    const { cookie, memberId } = await insertSignedInMember({
      database: fixture.database,
    });
    try {
      const originalIds: string[] = [];
      for (let index = 0; index < 16; index += 1) {
        originalIds.push(
          await insertDrawableItem(fixture.database, {
            uploadedBy: memberId,
            seq: index + 1,
            capturedOn: `2026-09-${String(30 - index).padStart(2, "0")}`,
          }),
        );
      }
      const read = async (cursor: string | null): Promise<TimelineResponse> => {
        const response = await fixture.app.inject({
          method: "GET",
          headers: { cookie },
          url: `/api/timeline?limit=2${cursor === null ? "" : `&cursor=${encodeURIComponent(cursor)}`}`,
        });
        expect(response.statusCode).toBe(200);
        return response.json();
      };
      const pages = [await read(null)];
      for (let pageIndex = 1; pageIndex < 8; pageIndex += 1) {
        pages.push(await read(pages.at(-1)!.nextCursor));
      }
      expect(pages[0]!.previousCursor).toBeNull();
      expect(pages.at(-1)!.nextCursor).toBeNull();
      const retained = pages.slice(-5);
      const restored = [];
      for (let pageIndex = 0; pageIndex < 3; pageIndex += 1) {
        const previous = await read(retained[0]!.previousCursor);
        restored.unshift(previous);
        retained.unshift(previous);
        retained.pop();
        expect(retained).toHaveLength(5);
      }
      const allDays = [...restored, ...pages.slice(3)].flatMap((page) => {
        return page.days;
      });
      const restoredIds = allDays.flatMap((day) => {
        return day.items.map((item) => {
          return item.itemId;
        });
      });
      expect(restoredIds).toEqual(originalIds);
      expect(
        new Set(
          allDays.map((day) => {
            return day.capturedOn;
          }),
        ).size,
      ).toBe(allDays.length);
    } finally {
      await fixture.close();
    }
  });

  it("returns all 1,000 equal-date items together in either direction", async () => {
    const fixture = await makeApp();
    const { cookie, memberId } = await insertSignedInMember({
      database: fixture.database,
    });
    try {
      await insertDrawableItem(fixture.database, {
        uploadedBy: memberId,
        seq: 1001,
        capturedOn: "2026-09-21",
      });
      for (let index = 0; index < 1000; index += 1) {
        await insertDrawableItem(fixture.database, {
          uploadedBy: memberId,
          seq: index + 1,
          capturedOn: "2026-09-20",
        });
      }
      await insertDrawableItem(fixture.database, {
        uploadedBy: memberId,
        seq: 1002,
        capturedOn: "2026-09-19",
      });
      const read = async (cursor: string | null): Promise<TimelineResponse> => {
        const response = await fixture.app.inject({
          method: "GET",
          headers: { cookie },
          url: `/api/timeline?limit=1${cursor === null ? "" : `&cursor=${encodeURIComponent(cursor)}`}`,
        });
        expect(response.statusCode).toBe(200);
        return response.json();
      };
      const newest = await read(null);
      const middle = await read(newest.nextCursor);
      const oldest = await read(middle.nextCursor);
      const restored = await read(oldest.previousCursor);
      expect(
        middle.days.map((day) => {
          return day.itemCount;
        }),
      ).toEqual([1000]);
      expect(restored.days).toEqual(middle.days);
      expect(
        new Set(
          restored.days[0]!.items.map((item) => {
            return item.itemId;
          }),
        ).size,
      ).toBe(1000);
    } finally {
      await fixture.close();
    }
  });

  it("preserves occasion-only days, global overlap bands and descending response order", async () => {
    const fixture = await makeApp();
    const { cookie, memberId } = await insertSignedInMember({
      database: fixture.database,
    });
    try {
      await insertDrawableItem(fixture.database, {
        uploadedBy: memberId,
        seq: 1,
        capturedOn: "2026-09-24",
      });
      await insertDrawableItem(fixture.database, {
        uploadedBy: memberId,
        seq: 2,
        capturedOn: "2026-09-18",
      });
      await insertMilestone(fixture.database, {
        name: "A week",
        startsOn: "2026-09-18",
        endsOn: "2026-09-24",
      });
      await insertMilestone(fixture.database, {
        name: "Quiet days",
        startsOn: "2026-09-20",
        endsOn: "2026-09-22",
      });
      const read = async (cursor: string | null): Promise<TimelineResponse> => {
        const response = await fixture.app.inject({
          method: "GET",
          headers: { cookie },
          url: `/api/timeline?limit=3${cursor === null ? "" : `&cursor=${encodeURIComponent(cursor)}`}`,
        });
        return response.json();
      };
      const first = await read(null);
      const second = await read(first.nextCursor);
      const reverse = await read(second.previousCursor);
      expect(reverse.days).toEqual(first.days);
      expect(
        reverse.days.map((day) => {
          return day.capturedOn;
        }),
      ).toEqual(["2026-09-24", "2026-09-23", "2026-09-22"]);
      expect(
        reverse.days.map((day) => {
          return day.itemCount;
        }),
      ).toEqual([1, 0, 0]);
      expect(reverse.days[2]!.milestoneBand?.milestone.name).toBe("Quiet days");
      expect(reverse.days[2]!.milestoneStrips[0]!.milestone.name).toBe(
        "A week",
      );
      const rail = await fixture.app.inject({
        method: "GET",
        url: "/api/timeline/rail",
        headers: { cookie },
      });
      expect(
        rail.json().days.map((day: { capturedOn: string }) => {
          return day.capturedOn;
        }),
      ).toEqual([
        "2026-09-24",
        "2026-09-23",
        "2026-09-22",
        "2026-09-21",
        "2026-09-20",
        "2026-09-19",
        "2026-09-18",
      ]);
    } finally {
      await fixture.close();
    }
  });

  it("never issues cursors toward hidden days and treats deleted boundary sources as dates", async () => {
    const fixture = await makeApp();
    const { cookie, memberId } = await insertSignedInMember({
      database: fixture.database,
    });
    try {
      const otherMember = await insertMember(fixture.database);
      const hiddenRule = await insertVisibilityRule(fixture.database, {
        mode: "only",
      });
      for (const [index, capturedOn] of [
        "2026-09-25",
        "2026-09-15",
      ].entries()) {
        await insertDrawableItem(fixture.database, {
          uploadedBy: otherMember,
          seq: index + 10,
          capturedOn,
          visibilityRuleId: hiddenRule,
        });
      }
      const source = await insertDrawableItem(fixture.database, {
        uploadedBy: memberId,
        seq: 1,
        capturedOn: "2026-09-23",
      });
      const equalDay = await insertDrawableItem(fixture.database, {
        uploadedBy: memberId,
        seq: 2,
        capturedOn: "2026-09-23",
      });
      const boundarySource = await insertDrawableItem(fixture.database, {
        uploadedBy: memberId,
        seq: 3,
        capturedOn: "2026-09-21",
      });
      const first = (
        await fixture.app.inject({
          method: "GET",
          headers: { cookie },
          url: "/api/timeline?limit=1",
        })
      ).json<TimelineResponse>();
      expect(first.previousCursor).toBeNull();
      expect(
        first.days[0]!.items.map((item) => {
          return item.itemId;
        }),
      ).toEqual([source, equalDay]);
      const last = (
        await fixture.app.inject({
          method: "GET",
          headers: { cookie },
          url: `/api/timeline?limit=1&cursor=${first.nextCursor}`,
        })
      ).json<TimelineResponse>();
      expect(last.nextCursor).toBeNull();
      await fixture.database
        .deleteFrom("items")
        .where("id", "=", boundarySource)
        .execute();
      const restored = (
        await fixture.app.inject({
          method: "GET",
          headers: { cookie },
          url: `/api/timeline?limit=1&cursor=${last.previousCursor}`,
        })
      ).json<TimelineResponse>();
      expect(restored.days).toEqual(first.days);
      await fixture.database
        .deleteFrom("items")
        .where("id", "in", [source, equalDay])
        .execute();
      const reverse = (
        await fixture.app.inject({
          method: "GET",
          headers: { cookie },
          url: `/api/timeline?limit=1&cursor=${last.previousCursor}`,
        })
      ).json<TimelineResponse>();
      expect(reverse).toEqual({
        days: [],
        nextCursor: null,
        previousCursor: null,
        resultCount: null,
      });
    } finally {
      await fixture.close();
    }
  });

  it("accepts unversioned older cursors and rejects invalid directions and selection digests", async () => {
    const fixture = await makeApp();
    const { cookie, memberId } = await insertSignedInMember({
      database: fixture.database,
    });
    try {
      await insertDrawableItem(fixture.database, {
        uploadedBy: memberId,
        seq: 1,
        capturedOn: "2026-09-20",
      });
      const f = makeDigestFromFilter(makeTimelineFilterFromQuery({}));
      const read = (payload: unknown) => {
        return fixture.app.inject({
          method: "GET",
          headers: { cookie },
          url: `/api/timeline?cursor=${_encodeCursor(payload)}`,
        });
      };
      const legacy = await read({ d: "2026-09-21", f });
      expect(legacy.statusCode).toBe(200);
      expect(
        legacy.json().days.map((day: { capturedOn: string }) => {
          return day.capturedOn;
        }),
      ).toEqual(["2026-09-20"]);
      for (const payload of [
        { v: 2, d: "2026-09-21", f, direction: "sideways" },
        { v: 2, d: "2026-09-21", f },
        { v: 2, d: "2026-09-21", f: "wrong", direction: "newer" },
        { v: 3, d: "2026-09-21", f, direction: "older" },
      ]) {
        const invalid = await read(payload);
        expect(invalid.statusCode).toBe(400);
        expect(invalid.json().details.fieldErrors.cursor).toBeDefined();
      }
    } finally {
      await fixture.close();
    }
  });

  it("keeps both directions inside the effective at bound and content filters suppress occasion-only days", async () => {
    const fixture = await makeApp();
    const { cookie, memberId } = await insertSignedInMember({
      database: fixture.database,
    });
    try {
      for (let index = 0; index < 6; index += 1) {
        await insertDrawableItem(fixture.database, {
          uploadedBy: memberId,
          seq: index + 1,
          capturedOn: `2026-09-${25 - index}`,
        });
      }
      // The web sends min(until, at) as the effective until, never raw at.
      const read = async (cursor: string | null): Promise<TimelineResponse> => {
        const response = await fixture.app.inject({
          method: "GET",
          headers: { cookie },
          url: `/api/timeline?until=2026-09-23&limit=2${cursor === null ? "" : `&cursor=${cursor}`}`,
        });
        expect(response.statusCode).toBe(200);
        return response.json();
      };
      const first = await read(null);
      const second = await read(first.nextCursor);
      const restored = await read(second.previousCursor);
      const newerThanJumpDays = restored.days.filter((day) => {
        return day.capturedOn > "2026-09-23";
      });
      expect(newerThanJumpDays).toEqual([]);
      expect(restored.days).toEqual(first.days);
      expect(restored.previousCursor).toBeNull();
      const mismatched = await fixture.app.inject({
        method: "GET",
        headers: { cookie },
        url: `/api/timeline?cursor=${second.previousCursor}`,
      });
      expect(mismatched.statusCode).toBe(400);
      await insertMilestone(fixture.database, {
        name: "Empty",
        startsOn: "2026-09-19",
      });
      const unknownTag = "018f0000-0000-7000-8000-000000009999";
      const content = await fixture.app.inject({
        method: "GET",
        headers: { cookie },
        url: `/api/timeline?tags=${unknownTag}`,
      });
      expect(content.json()).toEqual({
        days: [],
        nextCursor: null,
        previousCursor: null,
        resultCount: 0,
      });
    } finally {
      await fixture.close();
    }
  });
});
