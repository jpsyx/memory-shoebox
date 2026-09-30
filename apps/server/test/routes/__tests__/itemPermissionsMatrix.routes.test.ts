import { describe, expect, it } from "vitest";
import { createTestApp } from "../../helpers/createTestApp.ts";
import { insertSignedInMember } from "../../helpers/insertSignedInMember.ts";
import {
  ROUTES,
  VIEWER_KINDS,
  makeMatrixFixture,
} from "./itemPermissionsMatrixTestHelpers.ts";

describe("who may change an item", () => {
  ROUTES.forEach((route) => {
    VIEWER_KINDS.forEach((kind) => {
      it(`${route.name} answers ${route.expected[kind]} for a ${kind}`, async () => {
        const { app, actors, itemId, close } = await makeMatrixFixture();

        const response = await app.inject({
          method: route.method,
          url: route.path(itemId),
          headers: { cookie: actors[kind] },
          ...(route.payload === undefined ? {} : { payload: route.payload }),
        });

        expect(response.statusCode).toBe(route.expected[kind]);
        await close();
      });
    });
  });

  it("refuses a viewer the visibility-rule route, which owns nothing", async () => {
    const { app, database, close } = await createTestApp();
    const { cookie } = await insertSignedInMember({
      database,
      member: { role: "viewer" },
    });

    const response = await app.inject({
      method: "POST",
      url: "/api/visibility-rules/resolve",
      headers: { cookie },
      payload: { mode: "everyone", subjects: [] },
    });

    expect(response.statusCode).toBe(403);
    expect(response.json().error).toBe("visibility_rule_forbidden");
    await close();
  });
});
