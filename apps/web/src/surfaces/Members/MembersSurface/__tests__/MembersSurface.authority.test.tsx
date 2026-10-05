import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { meQueryOptions } from "@/api/me/me";
import { createMeResponse } from "@/testing/createMeResponse";
import { countCallsTo } from "@/surfaces/Account/AccountSurface/__tests__/AccountSurface.fixtures";
import {
  ADMIN_ACCOUNT,
  SECOND_ADMIN,
  makeMemberFromOverrides,
  renderMembers,
} from "@/surfaces/Members/MembersSurface/__tests__/memberFixtureHelpers";
function _renderSelfDemotion(): void {
  renderMembers({
    members: [
      makeMemberFromOverrides({ isLastActiveAdmin: false }),
      SECOND_ADMIN,
    ],
  });
  const originalFetch = fetch;
  let hasDemoted = false;
  vi.stubGlobal(
    "fetch",
    vi.fn(async (path: string, init?: RequestInit) => {
      if (
        path === `/api/members/${ADMIN_ACCOUNT.me.member.memberId}` &&
        init?.method === "PATCH"
      ) {
        hasDemoted = true;
        return Response.json(
          makeMemberFromOverrides({
            role: "viewer",
            isLastActiveAdmin: false,
          }),
        );
      }
      if (path === "/api/me" && hasDemoted) {
        return Response.json(createMeResponse({ role: "viewer" }));
      }
      if (path === "/api/members" && hasDemoted) {
        return Response.json({
          shape: "directory",
          members: [],
          nextCursor: null,
        });
      }
      return originalFetch(path, init);
    }),
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
});
describe("Members administration", () => {
  it("refreshes authority after self-demotion and removes privileged controls", async () => {
    _renderSelfDemotion();
    const user = userEvent.setup();
    await user.click(
      await screen.findByRole("button", { name: "Change role for Papá" }),
    );
    await user.selectOptions(screen.getByLabelText("Role"), "viewer");
    await user.click(screen.getByRole("button", { name: "Save" }));
    expect(
      await screen.findByText("Only an admin can manage members."),
    ).toBeVisible();
    expect(
      screen.queryByRole("button", { name: "Invite somebody" }),
    ).not.toBeInTheDocument();
  });
  it("clears private data and returns to sign-in after self-removal", async () => {
    const { router, queryClient } = renderMembers({
      members: [
        makeMemberFromOverrides({ isLastActiveAdmin: false }),
        SECOND_ADMIN,
      ],
      routes: {
        [`DELETE /api/members/${ADMIN_ACCOUNT.me.member.memberId}`]: {
          status: 200,
          body: makeMemberFromOverrides({ status: "removed" }),
        },
      },
    });
    queryClient.setQueryData(["groups", "picker"], { groups: [] });
    const user = userEvent.setup();
    await user.click(
      await screen.findByRole("button", { name: "Remove Papá" }),
    );
    await user.click(screen.getByRole("button", { name: "Remove them" }));
    await waitFor(() => {
      return expect(router.state.location.pathname).toBe("/sign-in");
    });
    expect(queryClient.getQueryData(["groups", "picker"])).toBeUndefined();
  });
  it("sends no role PATCH after cached admin authority is lost with a confirmation open", async () => {
    const { queryClient } = renderMembers({
      members: [
        makeMemberFromOverrides({ isLastActiveAdmin: false }),
        SECOND_ADMIN,
      ],
    });
    const user = userEvent.setup();
    await user.click(
      await screen.findByRole("button", { name: "Change role for Mamá" }),
    );
    queryClient.setQueryData(
      meQueryOptions.queryKey,
      createMeResponse({ role: "viewer" }),
    );
    const save = screen.queryByRole("button", { name: "Save" });
    if (save !== null) {
      await user.click(save);
    }
    await screen.findByText("Only an admin can manage members.");
    expect(countCallsTo("PATCH", `/api/members/${SECOND_ADMIN.memberId}`)).toBe(
      0,
    );
  });
  it("refreshes account authority when a directory read refuses stale admin access", async () => {
    renderMembers({
      routes: {
        "GET /api/members": {
          status: 403,
          body: { error: "members_forbidden", message: "Admin required" },
        },
      },
    });
    const originalFetch = fetch;
    let accountReads = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (path: string, init?: RequestInit) => {
        if (path === "/api/me") {
          accountReads += 1;
          return Response.json(
            accountReads === 1
              ? ADMIN_ACCOUNT
              : createMeResponse({ role: "viewer" }),
          );
        }
        return originalFetch(path, init);
      }),
    );
    expect(
      await screen.findByText("Only an admin can manage members."),
    ).toBeVisible();
  });
});
