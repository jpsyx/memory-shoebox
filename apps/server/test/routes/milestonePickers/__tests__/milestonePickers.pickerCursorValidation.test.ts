import { describe, expect, it } from "vitest";
import { type TestApp } from "../../../helpers/createTestApp.ts";
import { createId } from "../../../../src/db/createId.ts";
import { withPickerContext } from "./withPickerContext.ts";

type AssertPickerCursorsOptions = {
  app: TestApp["app"];
  cookie: string;
  milestoneId: string;
  endpoint: string;
};

async function _assertPickerCursors(
  options: Readonly<AssertPickerCursorsOptions>,
): Promise<void> {
  const { app, cookie, milestoneId, endpoint } = options;
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
}

async function _assertPickerCursorValidation(endpoint: string): Promise<void> {
  await withPickerContext({ endpoint, assertion: _assertPickerCursors });
}
describe("milestone picker routes", (): void => {
  it.each(["candidates", "mismatches"])(
    "rejects malformed pair cursors for %s",
    _assertPickerCursorValidation,
  );
});
