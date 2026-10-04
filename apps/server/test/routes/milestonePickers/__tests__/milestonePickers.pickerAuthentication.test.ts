import { describe, expect, it } from "vitest";
import { withPickerContext } from "./withPickerContext.ts";

async function _assertPickerAuthentication(endpoint: string): Promise<void> {
  await withPickerContext({
    endpoint,
    assertion: async ({ app, milestoneId }) => {
      expect(
        (
          await app.inject({
            url: `/api/milestones/${milestoneId}/${endpoint}`,
          })
        ).statusCode,
      ).toBe(401);
    },
  });
}
describe("milestone picker routes", (): void => {
  it.each(["candidates", "mismatches"])(
    "requires a session for %s",
    _assertPickerAuthentication,
  );
});
