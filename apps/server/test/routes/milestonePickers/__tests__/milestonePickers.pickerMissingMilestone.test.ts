import { describe, expect, it } from "vitest";
import { createId } from "../../../../src/db/createId.ts";
import { withPickerContext } from "./withPickerContext.ts";

async function _assertPickerMissingMilestone(endpoint: string): Promise<void> {
  await withPickerContext({
    endpoint,
    assertion: async ({ app, cookie }) => {
      expect(
        (
          await app.inject({
            url: `/api/milestones/${createId()}/${endpoint}`,
            headers: { cookie },
          })
        ).json(),
      ).toMatchObject({ error: "milestone_not_found" });
    },
  });
}
describe("milestone picker routes", (): void => {
  it.each(["candidates", "mismatches"])(
    "returns milestone_not_found for a missing %s milestone",
    _assertPickerMissingMilestone,
  );
});
