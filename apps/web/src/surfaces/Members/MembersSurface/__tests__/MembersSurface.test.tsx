import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createMeResponse } from "@/testing/createMeResponse";
import { countCallsTo } from "@/surfaces/Account/AccountSurface/__tests__/AccountSurface.fixtures";
import {
  ADMIN_ACCOUNT,
  INVITED,
  SECOND_ADMIN,
  makeMemberFromOverrides,
  renderMembers,
} from "@/surfaces/Members/MembersSurface/__tests__/memberFixtureHelpers";

afterEach(() => {
  vi.unstubAllGlobals();
});
describe("Members administration", () => {
  it("shows invitation states and group, viewer and history destinations", async () => {
    renderMembers({
      members: [
        makeMemberFromOverrides(),
        INVITED,
        makeMemberFromOverrides({
          ...INVITED,
          memberId: SECOND_ADMIN.memberId,
          displayName: "Mamá",
          invitation: {
            ...INVITED.invitation!,
            expiresAt: "2099-09-08T10:00:00.000Z",
            isPending: true,
          },
        }),
      ],
    });
    expect(await screen.findByText("Invitation expired")).toBeVisible();
    expect(screen.getByText("Invitation pending")).toBeVisible();
    expect(screen.getByRole("link", { name: "Groups" })).toHaveAttribute(
      "href",
      "/groups",
    );
    expect(
      screen.getByRole("link", { name: "Changes by Papá" }),
    ).toHaveAttribute(
      "href",
      `/changes?actorMemberId=${ADMIN_ACCOUNT.me.member.memberId}`,
    );
    expect(
      screen.getByRole("link", { name: "Back to my account" }),
    ).toHaveAttribute("href", "/account");
  });
  it("does not read privileged members for a viewer", async () => {
    renderMembers({ account: createMeResponse({ role: "viewer" }) });
    expect(
      await screen.findByText("Only an admin can manage members."),
    ).toBeVisible();
    expect(countCallsTo("GET", "/api/members")).toBe(0);
  });
  it("offers Retry after a failed directory read", async () => {
    renderMembers({
      routes: {
        "GET /api/members": {
          status: 500,
          body: { error: "server_error", message: "Unavailable" },
        },
      },
    });
    const user = userEvent.setup();
    await user.click(await screen.findByRole("button", { name: "Retry" }));
    await waitFor(() => {
      return expect(countCallsTo("GET", "/api/members")).toBe(2);
    });
  });
});
