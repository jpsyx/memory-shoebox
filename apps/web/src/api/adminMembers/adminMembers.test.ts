import { afterEach, describe, expect, it, vi } from "vitest";
import {
  inviteAdminMember,
  memberSuggestionsQueryOptions,
  changeMemberRole,
  removeMember,
  resendMemberInvitation,
  revokeMemberInvitation,
  revokeMemberSession,
} from "@/api/adminMembers/adminMembers";
import { makeMember } from "@/surfaces/Members/MembersSurface/__tests__/MembersSurface.fixtures";

afterEach(() => {
  return vi.unstubAllGlobals();
});
function _reply(body: unknown, status = 200) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => {
      return new Response(status === 204 ? null : JSON.stringify(body), {
        status,
      });
    }),
  );
}
describe("member administration transport", () => {
  it("normalizes an invitation through the existing helper and validates its reply", async () => {
    _reply(makeMember(), 201);
    await inviteAdminMember({
      email: "  PAPA@EXAMPLE.COM ",
      displayName: " Papá ",
      role: "viewer",
    });
    expect(fetch).toHaveBeenCalledWith(
      "/api/members",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          email: "papa@example.com",
          displayName: "Papá",
          role: "viewer",
        }),
      }),
    );
    _reply({ memberId: "broken" });
    await expect(
      inviteAdminMember({ email: "papa@example.com", role: "viewer" }),
    ).rejects.toThrow();
  });
  it("encodes normalized suggestion addresses and separates their cache keys", async () => {
    _reply({ suggestions: [], nextCursor: null });
    const query = memberSuggestionsQueryOptions("  Tomas+FAMILY@Example.com ");
    await query.queryFn!({} as never);
    expect(fetch).toHaveBeenCalledWith(
      "/api/member-suggestions?email=tomas%2Bfamily%40example.com",
      expect.anything(),
    );
    expect(query.queryKey).not.toEqual(
      memberSuggestionsQueryOptions("other@example.com").queryKey,
    );
    _reply({ suggestions: [{}], nextCursor: null });
    await expect(query.queryFn!({} as never)).rejects.toThrow();
  });
  it.each([
    [
      "PATCH",
      "/members/opaque%2Fid%3F",
      () => {
        return changeMemberRole({ memberId: "opaque/id?", role: "uploader" });
      },
    ],
    [
      "DELETE",
      "/members/opaque%2Fid%3F",
      () => {
        return removeMember("opaque/id?");
      },
    ],
    [
      "POST",
      "/members/opaque%2Fid%3F/invitation/resend",
      () => {
        return resendMemberInvitation("opaque/id?");
      },
    ],
    [
      "DELETE",
      "/members/opaque%2Fid%3F/invitation",
      () => {
        return revokeMemberInvitation("opaque/id?");
      },
    ],
  ] as const)("validates the %s %s response", async (method, path, request) => {
    _reply(makeMember());
    expect(await request()).toMatchObject({ displayName: "Papá" });
    expect(fetch).toHaveBeenCalledWith(
      `/api${path}`,
      expect.objectContaining({ method }),
    );
    _reply({});
    await expect(request()).rejects.toThrow();
  });
  it("sends only the role in PATCH", async () => {
    _reply(makeMember());
    await changeMemberRole({ memberId: "opaque", role: "uploader" });
    expect(fetch).toHaveBeenCalledWith(
      "/api/members/opaque",
      expect.objectContaining({ body: '{"role":"uploader"}' }),
    );
  });
  it("encodes both device path IDs and accepts an empty 204", async () => {
    _reply(undefined, 204);
    await expect(
      revokeMemberSession({ memberId: "member/?", sessionId: "session/#" }),
    ).resolves.toBeUndefined();
    expect(fetch).toHaveBeenCalledWith(
      "/api/members/member%2F%3F/sessions/session%2F%23",
      expect.objectContaining({ method: "DELETE" }),
    );
  });
});
