import { describe, expect, it } from "vitest";
import {
  prepareTerminalMailFailures,
  repair,
} from "./requeueBaseUrlFailuresTestHelpers.ts";
import {
  insertTerminalCommentFailures,
  insertTerminalSignInCodes,
  makeTerminalOverridesFromFixture,
} from "./terminalFailureSeedHelpers.ts";

describe("retained base URL failures", () => {
  it("keeps seven-day-old, non-baseURL, deleted-trigger, malformed and sign-in-code rows terminal", async () => {
    const {
      atBoundary,
      payload,
      itemId,
      context,
      commentId,
      database,
      eligible,
      close,
    } = await prepareTerminalMailFailures();
    const terminal = await insertTerminalCommentFailures({
      context,
      commentId,
      payload,
      overridesList: makeTerminalOverridesFromFixture({
        atBoundary,
        payload,
        itemId,
      }),
    });
    terminal.push(...(await insertTerminalSignInCodes(database)));
    const before = await database
      .selectFrom("outbound_emails")
      .selectAll()
      .where("id", "in", terminal)
      .execute();
    const after = await repair(context);
    expect(
      after.find((row) => {
        return row.id === eligible;
      })!.state,
    ).toBe("queued");
    expect(
      after.filter((row) => {
        return terminal.includes(row.id);
      }),
    ).toEqual(before);
    await close();
  });
});
