import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createId } from "../../../src/db/createId.ts";
import { insertSignedInMember } from "../../helpers/insertSignedInMember.ts";
import {
  insertItem,
  insertRendition,
} from "../../helpers/seedHelpers/seedHelpers.ts";
import {
  COMMENT_CASES,
  ITEM_CASES,
  getParityResponses,
  makeParityFixture,
  type ParityFixture,
} from "./itemNotFoundParityTestHelpers.ts";

describe("one 404, byte-identical on every route", () => {
  // One app for every case, which is the point: the two answers a case
  // compares come out of the same process, over the same seeded archive.
  let builtFixture: ParityFixture | undefined;

  /** The fixture, or the failure that says `beforeAll` did not run. */
  function getFixture(): ParityFixture {
    if (builtFixture === undefined) {
      throw new Error("The parity fixture was never built.");
    }
    return builtFixture;
  }

  beforeAll(async () => {
    builtFixture = await makeParityFixture();
  });

  afterAll(async () => {
    await getFixture().close();
  });

  ITEM_CASES.forEach((notFoundCase) => {
    it(`${notFoundCase.name} cannot tell an invisible item from one that never existed`, async () => {
      const fixture = getFixture();
      const { invisible, nonexistent, status } = await getParityResponses({
        fixture,
        notFoundCase,
        invisibleId: fixture.invisibleItemId,
      });

      expect(status).toBe(404);
      expect(invisible).toBe(nonexistent);
    });
  });

  COMMENT_CASES.forEach((notFoundCase) => {
    it(`${notFoundCase.name} keeps its 404 about the comment`, async () => {
      // The item is what the viewer may not see, and the comment is what the
      // caller addressed: the code names the second, never the first, or the
      // pair of codes is itself the oracle.
      const fixture = getFixture();
      const { invisible, nonexistent, status } = await getParityResponses({
        fixture,
        notFoundCase,
        invisibleId: fixture.invisibleCommentId,
      });

      expect(status).toBe(404);
      expect(invisible).toBe(nonexistent);
    });
  });

  it("is a 404 and never a 403 for a viewer who cannot see it", async () => {
    // A `viewer` is refused every mutating route in the slice, so this is the
    // one actor for whom a role check running first would be visible. Every
    // answer here must still be the 404, and never `item_edit_forbidden`,
    // `item_visibility_forbidden`, `item_capture_date_forbidden` or
    // `item_delete_forbidden`.
    const fixture = getFixture();
    const { cookie } = await insertSignedInMember({
      database: fixture.database,
      token: "a-viewer-who-may-change-nothing",
      member: { role: "viewer" },
    });

    const answers = await Promise.all(
      ITEM_CASES.map(async (notFoundCase) => {
        const responses = await getParityResponses({
          fixture,
          notFoundCase,
          invisibleId: fixture.invisibleItemId,
          cookie,
        });
        return {
          name: notFoundCase.name,
          status: responses.status,
          identical: responses.invisible === responses.nonexistent,
        };
      }),
    );

    expect(answers).toEqual(
      ITEM_CASES.map((notFoundCase) => {
        return { name: notFoundCase.name, status: 404, identical: true };
      }),
    );
  });

  it("refuses a selection holding one invisible id with the same 404", async () => {
    // `POST /api/items/visibility` takes its ids in the body rather than the
    // path, and one miss fails the whole request: no `details` naming which
    // id failed, because a list of the ids that survived is a count of what
    // the viewer cannot see.
    const fixture = getFixture();
    const mine = await insertItem(fixture.database, {
      uploadedBy: fixture.memberId,
      seq: 900,
    });
    await insertRendition(fixture.database, { itemId: mine });

    const withInvisible = await fixture.app.inject({
      method: "POST",
      url: "/api/items/visibility",
      headers: { cookie: fixture.cookie },
      payload: {
        itemIds: [mine, fixture.invisibleItemId],
        visibilityRuleId: "visibility-rule-everyone",
      },
    });
    const withNonexistent = await fixture.app.inject({
      method: "POST",
      url: "/api/items/visibility",
      headers: { cookie: fixture.cookie },
      payload: {
        itemIds: [mine, createId()],
        visibilityRuleId: "visibility-rule-everyone",
      },
    });

    expect(withInvisible.statusCode).toBe(404);
    expect(withInvisible.body).toBe(withNonexistent.body);
    expect(withInvisible.json()).toEqual({
      error: "item_not_found",
      message: "Not found.",
    });
  });
});
