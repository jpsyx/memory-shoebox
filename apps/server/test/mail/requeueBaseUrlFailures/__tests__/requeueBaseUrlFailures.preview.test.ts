import { describe, expect, it } from "vitest";
import {
  BASE_URL,
  createRequeueBaseUrlFailuresFixture,
} from "./requeueBaseUrlFailuresTestHelpers.ts";

describe("retained base URL failures", () => {
  it("preview leaves failed queue rows unchanged", async () => {
    const context = await createRequeueBaseUrlFailuresFixture();
    const before = await context.database
      .selectFrom("outbound_emails")
      .selectAll()
      .execute();
    const response = await context.app.inject({
      method: "PATCH",
      url: "/api/settings?preview=true",
      payload: { public: { baseUrl: BASE_URL } },
    });
    expect(response.statusCode).toBe(200);
    expect(response.json().isPreview).toBe(true);
    expect(
      await context.database
        .selectFrom("outbound_emails")
        .selectAll()
        .execute(),
    ).toEqual(before);
    await context.close();
  });
});
