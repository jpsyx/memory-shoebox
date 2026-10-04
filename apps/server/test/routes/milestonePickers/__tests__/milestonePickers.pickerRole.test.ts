import { describe, expect, it } from "vitest";
import { createTestApp } from "../../../helpers/createTestApp.ts";
import { insertSignedInMember } from "../../../helpers/insertSignedInMember.ts";
import { insertMilestone } from "../../../helpers/seedHelpers/seedHelpers.ts";

async function _assertPickerRole(
  role: "viewer" | "uploader" | "admin",
  endpoint: string,
  status: number,
): Promise<void> {
  const { app, database, close } = await createTestApp();
  try {
    const { cookie } = await insertSignedInMember({
      database,
      member: { role },
    });
    const milestoneId = await insertMilestone(database, {
      name: "Empty",
      startsOn: "2026-09-27",
    });
    const url = `/api/milestones/${milestoneId}/${endpoint}`;
    expect((await app.inject({ url })).statusCode).toBe(401);
    const response = await app.inject({ url, headers: { cookie } });
    expect(response.statusCode).toBe(status);
    if (role === "viewer") {
      expect(response.json().error).toBe("milestone_forbidden");
      expect(
        (
          await app.inject({
            url: `/api/milestones/invalid/${endpoint}?cursor=bad`,
            headers: { cookie },
          })
        ).statusCode,
      ).toBe(403);
    }
  } finally {
    await close();
  }
}
describe("milestone picker routes", (): void => {
  it.each([
    ["viewer", "candidates", 403],
    ["viewer", "mismatches", 403],
    ["uploader", "candidates", 200],
    ["uploader", "mismatches", 200],
    ["admin", "candidates", 200],
    ["admin", "mismatches", 200],
  ] as const)(
    "restricts the %s role on %s before parameter validation",
    _assertPickerRole,
  );
});
