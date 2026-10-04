import { describe, expect, it } from "vitest";
import { withPickerContext } from "./withPickerContext.ts";

async function _assertEmptyPicker(endpoint: string): Promise<void> {
  await withPickerContext({
    endpoint,
    assertion: async ({ app, cookie, milestoneId }) => {
      const empty = await app.inject({
        url: `/api/milestones/${milestoneId}/${endpoint}`,
        headers: { cookie },
      });
      expect(empty.statusCode).toBe(200);
      expect(
        empty.json()[endpoint === "candidates" ? "candidates" : "mismatches"],
      ).toEqual([]);
      if (endpoint === "mismatches")
        expect(empty.json().wideningSpan).toEqual({
          startsOn: "2026-09-27",
          endsOn: "2026-09-27",
        });
    },
  });
}
describe("milestone picker routes", (): void => {
  it.each(["candidates", "mismatches"])(
    "returns empty %s results",
    _assertEmptyPicker,
  );
});
