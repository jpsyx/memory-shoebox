import { afterEach, describe, expect, it, vi } from "vitest";
import {
  adminGroupsQueryOptions,
  createGroup,
  renameGroup,
  replaceGroupMembers,
  makeGroupUsageQueryOptionsFromGroupId,
  deleteGroup,
} from "@/api/adminGroupsHelpers/adminGroupsHelpers";
import {
  GROUP,
  USAGE,
} from "@/surfaces/Groups/GroupsSurface/__tests__/renderGroups";

afterEach(() => {
  return vi.unstubAllGlobals();
});
function _reply({
  body,
  status = 200,
}: Readonly<{ body: unknown; status?: number }>): void {
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
    _reply({
      body: { shape: "admin", groups: [GROUP], nextCursor: null },
    });
    expect(adminGroupsQueryOptions.queryKey).toEqual(["groups", "admin"]);
    expect(await adminGroupsQueryOptions.queryFn!({} as never)).toMatchObject({
      groups: [GROUP],
    });
    _reply({
      body: { shape: "picker", groups: [], nextCursor: null },
    });
    await expect(
      adminGroupsQueryOptions.queryFn!({} as never),
    ).rejects.toMatchObject({ code: "groups_forbidden", status: 403 });
  });
  it("creates normalized group names and sends the full membership", async () => {
    _reply({
      body: GROUP,
      status: 201,
    });
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
    _reply({
      body: {},
    });
    await expect(createGroup({ name: "Cousins" })).rejects.toThrow();
  });
  it("renames without sending membership", async () => {
    _reply({
      body: GROUP,
    });
    await renameGroup({ groupId: "opaque/?", name: " Cousins " });
    expect(fetch).toHaveBeenCalledWith(
      "/api/groups/opaque%2F%3F",
      expect.objectContaining({ method: "PATCH", body: '{"name":"Cousins"}' }),
    );
    _reply({
      body: {},
    });
    await expect(
      renameGroup({ groupId: GROUP.groupId, name: "Cousins" }),
    ).rejects.toThrow();
  });
  it("replaces membership with an exact set including empty sets", async () => {
    _reply({
      body: { members: [], nextCursor: null },
    });
    await replaceGroupMembers({ groupId: "opaque/?", memberIds: [] });
    expect(fetch).toHaveBeenCalledWith(
      "/api/groups/opaque%2F%3F/members",
      expect.objectContaining({ method: "PUT", body: '{"memberIds":[]}' }),
    );
    _reply({
      body: {},
    });
    await expect(
      replaceGroupMembers({ groupId: GROUP.groupId, memberIds: [] }),
    ).rejects.toThrow();
  });
  it("reads validated usage and encodes opaque consent in DELETE query only", async () => {
    _reply({
      body: USAGE,
    });
    await makeGroupUsageQueryOptionsFromGroupId("opaque/?").queryFn!(
      {} as never,
    );
    expect(fetch).toHaveBeenCalledWith(
      "/api/groups/opaque%2F%3F/usage",
      expect.anything(),
    );
    _reply({
      body: undefined,
      status: 204,
    });
    await deleteGroup({
      groupId: "opaque/?",
      confirmationToken: USAGE.confirmationToken ?? undefined,
    });
    expect(fetch).toHaveBeenLastCalledWith(
      "/api/groups/opaque%2F%3F?confirmationToken=opaque%2F%2B%3F%3Dold",
      expect.objectContaining({ method: "DELETE" }),
    );
    expect(vi.mocked(fetch).mock.calls.at(-1)?.[1]?.body).toBeUndefined();
    await deleteGroup({ groupId: GROUP.groupId, confirmationToken: undefined });
    expect(fetch).toHaveBeenLastCalledWith(
      `/api/groups/${GROUP.groupId}`,
      expect.objectContaining({ method: "DELETE" }),
    );
    _reply({
      body: {},
    });
    await expect(
      makeGroupUsageQueryOptionsFromGroupId(GROUP.groupId).queryFn!(
        {} as never,
      ),
    ).rejects.toThrow();
  });
});
