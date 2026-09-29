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
