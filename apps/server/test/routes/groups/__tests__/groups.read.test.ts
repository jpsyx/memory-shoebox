import type { FastifyInstance } from "fastify";
import { describe, expect, it } from "vitest";
import { prepareRoleSelectedGroupFixture } from "./groupsTestHelpers.ts";

async function _expectForbiddenGroupMutations(
  options: Readonly<{
    app: FastifyInstance;
    groupId: string;
    cookies: ReadonlyArray<string | undefined>;
  }>,
): Promise<void> {
  const { app, groupId, cookies } = options;
  await Promise.all(
    cookies.map(async (cookie) => {
      const expectedStatus = cookie ? 403 : 401;
      const requests = [
        {
          method: "POST" as const,
          url: "/api/groups",
          payload: { name: "Forbidden" },
        },
        {
          method: "PATCH" as const,
          url: `/api/groups/${groupId}`,
          payload: { name: "Forbidden" },
        },
        {
          method: "PUT" as const,
          url: `/api/groups/${groupId}/members`,
          payload: { memberIds: [] },
        },
        { method: "DELETE" as const, url: `/api/groups/${groupId}` },
        { method: "GET" as const, url: `/api/groups/${groupId}/usage` },
      ];
      await Promise.all(
        requests.map(async (request) => {
          expect(
            (
              await app.inject({
                ...request,
                headers: cookie ? { cookie } : {},
              })
            ).statusCode,
          ).toBe(expectedStatus);
        }),
      );
    }),
  );
}

describe("groups", () => {
  it("selects admin and picker rows, forbids viewers and anonymous callers", async () => {
    const { uploader, viewer, group, app, close } =
      await prepareRoleSelectedGroupFixture();
    await _expectForbiddenGroupMutations({
      app,
      groupId: group.groupId,
      cookies: [uploader.cookie, viewer.cookie, undefined],
    });
    expect(
      (
        await app.inject({
          url: "/api/groups",
          headers: { cookie: viewer.cookie },
        })
      ).json().error,
    ).toBe("groups_forbidden");
    expect((await app.inject({ url: "/api/groups" })).statusCode).toBe(401);
    await close();
  });
});
