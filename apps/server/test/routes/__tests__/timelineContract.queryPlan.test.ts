import { CompiledQuery } from "kysely";
import { readTimelinePage } from "../../../src/archive/readTimelinePage.ts";
import { makeTimelineFilterFromQuery } from "../../../src/archive/selectionFilterHelpers.ts";
import { EVERYONE_VISIBILITY_RULE_ID } from "../../../src/visibility/everyoneRule.ts";
import { describe, expect, it } from "vitest";
import { createDatabase } from "../../../src/db/client.ts";
import { makeQueryCountingDatabaseFromDatabase } from "../../helpers/makeQueryCountingDatabaseFromDatabase.ts";
import { insertSignedInMember } from "../../helpers/insertSignedInMember.ts";
import { insertMilestone } from "../../helpers/seedHelpers/seedHelpers.ts";
import { insertDrawableItem, makeApp } from "./timelineContractTestHelpers.ts";

describe("the query plan", () => {
  it("costs the same for one print as for two hundred and fifty", async () => {
    const small = makeQueryCountingDatabaseFromDatabase(
      createDatabase(":memory:"),
    );
    const smallApp = await makeApp({ database: small.database });
    const smallMember = await insertSignedInMember({
      database: smallApp.database,
    });
    await insertDrawableItem(smallApp.database, {
      uploadedBy: smallMember.memberId,
      seq: 1,
    });

    small.reset();
    const smallResponse = await smallApp.app.inject({
      method: "GET",
      url: "/api/timeline",
      headers: { cookie: smallMember.cookie },
    });
    const smallQueries = small.getQueryCount();

    const large = makeQueryCountingDatabaseFromDatabase(
      createDatabase(":memory:"),
    );
    const largeApp = await makeApp({ database: large.database });
    const largeMember = await insertSignedInMember({
      database: largeApp.database,
    });
    const largeDays = ["2026-09-14", "2026-09-13", "2026-09-12"];
    await Promise.all(
      Array.from({ length: 250 }, (_unused, index) => {
        return insertDrawableItem(largeApp.database, {
          uploadedBy: largeMember.memberId,
          seq: index + 1,
          capturedOn: largeDays[index % largeDays.length],
        });
      }),
    );
    await insertMilestone(largeApp.database, {
      name: "Three days",
      startsOn: "2026-09-12",
      endsOn: "2026-09-14",
    });

    large.reset();
    const largeResponse = await largeApp.app.inject({
      method: "GET",
      url: "/api/timeline",
      headers: { cookie: largeMember.cookie },
    });
    const largeQueries = large.getQueryCount();

    expect(smallResponse.statusCode).toBe(200);
    expect(largeResponse.statusCode).toBe(200);
    expect(largeResponse.json().days).toHaveLength(3);
    // Three days and 250 prints cost what one day and one print costs, plus
    // the band count that only the large page has a band for. Neither number
    // grows with the page: that is the property, not the number itself.
    expect(largeQueries).toBeLessThanOrEqual(smallQueries + 1);
    expect(smallQueries).toBeLessThanOrEqual(14);

    await smallApp.close();
    await largeApp.close();
  });
});

it("bounds the uploader arm of the actual viewer timeline by capture day", async () => {
  const fixture = await makeApp();
  try {
    const member = await insertSignedInMember({ database: fixture.database });
    await insertDrawableItem(fixture.database, {
      uploadedBy: member.memberId,
      seq: 1,
      capturedOn: "2026-09-14",
    });
    await insertDrawableItem(fixture.database, {
      uploadedBy: member.memberId,
      seq: 2,
      capturedOn: "2025-01-01",
    });
    const executed: CompiledQuery[] = [];
    const database = fixture.database.withPlugin({
      transformQuery: ({ node, queryId }) => {
        executed.push(
          fixture.database.getExecutor().compileQuery(node, queryId),
        );
        return node;
      },
      transformResult: async ({ result }) => {
        return result;
      },
    });
    const result = await readTimelinePage({
      database,
      b2: fixture.b2,
      filter: makeTimelineFilterFromQuery({
        from: "2026-09-13",
        until: "2026-09-14",
      }),
      limit: 20,
      cursor: undefined,
      now: new Date("2026-09-27T10:00:00Z"),
      viewer: {
        memberId: member.memberId,
        sessionId: member.sessionId,
        role: "viewer",
        isAdmin: false,
        visibleRuleIds: [EVERYONE_VISIBILITY_RULE_ID],
      },
    });
    expect(
      result.days.map((day) => {
        return day.capturedOn;
      }),
    ).toEqual(["2026-09-14"]);
    expect(result.days[0]!.items).toHaveLength(1);
    const query = executed.find((entry) => {
      return entry.sql.includes('group by "items"."captured_on"');
    })!;
    expect(query).toBeDefined();
    const plan = await fixture.database.executeQuery<{ detail: string }>(
      CompiledQuery.raw(`EXPLAIN QUERY PLAN ${query.sql}`, [
        ...query.parameters,
      ]),
    );
    expect(
      plan.rows.map((row) => {
        return row.detail;
      }),
    ).toContainEqual(
      expect.stringMatching(
        /items_uploaded_by_captured_on.*uploaded_by=\?.*captured_on>\?.*captured_on<\?/,
      ),
    );
  } finally {
    await fixture.close();
  }
});
