import { describe, expect, it } from "vitest";
import { createTestApp } from "../../../helpers/createTestApp.ts";
import { insertSignedInMember } from "../../../helpers/insertSignedInMember.ts";
import {
  insertItem,
  insertMember,
} from "../../../helpers/seedHelpers/seedHelpers.ts";

async function _assertRequiresTagsEvenForAdminsAndForbidsViewers3(): Promise<void> {
  const { app, database, close } = await createTestApp();
  try {
    const admin = await insertSignedInMember({
      database,
      token: "admin",
      member: { role: "admin" },
    });
    const itemId = await insertItem(database, {
      uploadedBy: await insertMember(database),
    });
    expect(
      (
        await app.inject({
          method: "POST",
          url: `/api/items/${itemId}/removal-requests`,
          headers: { cookie: admin.cookie },
          payload: {},
        })
      ).json().error,
    ).toBe("removal_request_forbidden");
    const viewer = await insertSignedInMember({
      database,
      member: { role: "viewer" },
    });
    expect(
      (
        await app.inject({
          url: "/api/removal-requests",
          headers: { cookie: viewer.cookie },
        })
      ).json().error,
    ).toBe("removal_queue_forbidden");
  } finally {
    await close();
  }
}
describe("removal requests", (): void => {
  it(
    "requires tags even for admins and forbids viewers from the removal queue",
    _assertRequiresTagsEvenForAdminsAndForbidsViewers3,
  );
});
