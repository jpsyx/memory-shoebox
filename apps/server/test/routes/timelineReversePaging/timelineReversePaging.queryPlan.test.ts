import type { TimelineResponse } from "@memory-shoebox/shared";

import { CompiledQuery } from "kysely";

import { readTimelinePage } from "../../../src/archive/readTimelinePage.ts";

import { EVERYONE_VISIBILITY_RULE_ID } from "../../../src/visibility/everyoneRule.ts";

import { describe, expect, it } from "vitest";

import { makeTimelineFilterFromQuery } from "../../../src/archive/selectionFilterHelpers.ts";

import { makeDigestFromFilter } from "../../../src/archive/timelineCursorHelpers/timelineCursorHelpers.ts";

import { insertSignedInMember } from "../../helpers/insertSignedInMember.ts";

import { insertItem } from "../../helpers/seedHelpers/seedHelpers.ts";

import {
  insertDrawableItem,
  makeApp,
} from "../__tests__/timelineContractTestHelpers.ts";

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
});
describe("bidirectional atomic-day timeline pages", () => {
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
});
