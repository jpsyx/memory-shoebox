import { afterEach, describe, expect, it, vi } from "vitest";
import {
  adminGroupsQueryOptions,
  createGroup,
  renameGroup,
  replaceGroupMembers,
  groupUsageQueryOptions,
  deleteGroup,
} from "@/api/adminGroups/adminGroups";
import {
  GROUP,
  USAGE,
} from "@/surfaces/Groups/GroupsSurface/__tests__/GroupsSurface.fixtures";

afterEach(() => {
  return vi.unstubAllGlobals();
});
function reply(body: unknown, status = 200) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => {
      return new Response(status === 204 ? null : JSON.stringify(body), {
        status,
      });
    }),
  );
}
describe("group administration transport", () => {
  it("keeps the admin list separate from picker data and rejects picker shape", async () => {
    reply({ shape: "admin", groups: [GROUP], nextCursor: null });
    expect(adminGroupsQueryOptions.queryKey).toEqual(["groups", "admin"]);
    expect(await adminGroupsQueryOptions.queryFn!({} as never)).toMatchObject({
      groups: [GROUP],
    });
    reply({ shape: "picker", groups: [], nextCursor: null });
    await expect(
      adminGroupsQueryOptions.queryFn!({} as never),
    ).rejects.toMatchObject({ code: "groups_forbidden", status: 403 });
  });
  it("creates normalized group names and sends the full membership", async () => {
    reply(GROUP, 201);
    await createGroup({
      name: " Cousins ",
      memberIds: [GROUP.members[0]!.memberId],
    });
    expect(fetch).toHaveBeenCalledWith(
      "/api/groups",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          name: "Cousins",
          memberIds: [GROUP.members[0]!.memberId],
        }),
      }),
    );
    reply({});
    await expect(createGroup({ name: "Cousins" })).rejects.toThrow();
  });
  it("renames without sending membership", async () => {
    reply(GROUP);
    await renameGroup({ groupId: "opaque/?", name: " Cousins " });
    expect(fetch).toHaveBeenCalledWith(
      "/api/groups/opaque%2F%3F",
      expect.objectContaining({ method: "PATCH", body: '{"name":"Cousins"}' }),
    );
    reply({});
    await expect(
      renameGroup({ groupId: GROUP.groupId, name: "Cousins" }),
    ).rejects.toThrow();
  });
  it("replaces membership with an exact set including empty sets", async () => {
    reply({ members: [], nextCursor: null });
    await replaceGroupMembers({ groupId: "opaque/?", memberIds: [] });
    expect(fetch).toHaveBeenCalledWith(
      "/api/groups/opaque%2F%3F/members",
      expect.objectContaining({ method: "PUT", body: '{"memberIds":[]}' }),
    );
    reply({});
    await expect(
      replaceGroupMembers({ groupId: GROUP.groupId, memberIds: [] }),
    ).rejects.toThrow();
  });
  it("reads validated usage and encodes opaque consent in DELETE query only", async () => {
    reply(USAGE);
    await groupUsageQueryOptions("opaque/?").queryFn!({} as never);
    expect(fetch).toHaveBeenCalledWith(
      "/api/groups/opaque%2F%3F/usage",
      expect.anything(),
    );
    reply(undefined, 204);
    await deleteGroup({
      groupId: "opaque/?",
      confirmationToken: USAGE.confirmationToken,
    });
    expect(fetch).toHaveBeenLastCalledWith(
      "/api/groups/opaque%2F%3F?confirmationToken=opaque%2F%2B%3F%3Dold",
      expect.objectContaining({ method: "DELETE" }),
    );
    expect(vi.mocked(fetch).mock.calls.at(-1)?.[1]?.body).toBeUndefined();
    await deleteGroup({ groupId: GROUP.groupId, confirmationToken: null });
    expect(fetch).toHaveBeenLastCalledWith(
      `/api/groups/${GROUP.groupId}`,
      expect.objectContaining({ method: "DELETE" }),
    );
    reply({});
    await expect(
      groupUsageQueryOptions(GROUP.groupId).queryFn!({} as never),
    ).rejects.toThrow();
  });
});
