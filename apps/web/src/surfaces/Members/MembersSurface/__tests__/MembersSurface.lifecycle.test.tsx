import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { countCallsTo } from "@/surfaces/Account/AccountSurface/__tests__/AccountSurface.fixtures";
import {
  ADMIN_ACCOUNT,
  INVITED,
  SECOND_ADMIN,
  makeMember,
  renderMembers,
} from "@/surfaces/Members/MembersSurface/__tests__/MembersSurface.fixtures";

afterEach(() => {
  vi.unstubAllGlobals();
});
describe("Members administration", () => {
  it("saves a role and invalidates related queries", async () => {
    const { queryClient } = renderMembers({
      members: [makeMember({ isLastActiveAdmin: false }), SECOND_ADMIN],
      routes: {
        [`PATCH /api/members/${SECOND_ADMIN.memberId}`]: {
          status: 200,
          body: { ...SECOND_ADMIN, role: "uploader" },
        },
      },
    });
    queryClient.setQueryData(["groups", "picker"], { groups: [] });
    const user = userEvent.setup();
    await user.click(
      await screen.findByRole("button", { name: "Change role for Mamá" }),
    );
    await user.selectOptions(screen.getByLabelText("Role"), "uploader");
    await user.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => {
      return expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });
    expect(countCallsTo("PATCH", `/api/members/${SECOND_ADMIN.memberId}`)).toBe(
      1,
    );
    expect(queryClient.getQueryState(["groups", "picker"])?.isInvalidated).toBe(
      true,
    );
  });
  it("blocks the last active admin's role Save and Remove before fetch, excluding invited admins", async () => {
    renderMembers();
    const user = userEvent.setup();
    await user.click(
      await screen.findByRole("button", { name: "Change role for Papá" }),
    );
    await user.selectOptions(screen.getByLabelText("Role"), "viewer");
    expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();
    expect(
      screen.getByText(/Make somebody else an active admin first/),
    ).toBeVisible();
    await user.click(screen.getByRole("button", { name: "Save" }));
    expect(
      countCallsTo("PATCH", `/api/members/${ADMIN_ACCOUNT.me.member.memberId}`),
    ).toBe(0);
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    await user.click(screen.getByRole("button", { name: "Remove Papá" }));
    expect(screen.getByRole("button", { name: "Remove them" })).toBeDisabled();
    expect(
      countCallsTo(
        "DELETE",
        `/api/members/${ADMIN_ACCOUNT.me.member.memberId}`,
      ),
    ).toBe(0);
  });
  it("keeps a concurrent last-admin refusal open with recovery copy", async () => {
    renderMembers({
      members: [makeMember({ isLastActiveAdmin: false }), SECOND_ADMIN],
      routes: {
        [`PATCH /api/members/${SECOND_ADMIN.memberId}`]: {
          status: 409,
          body: { error: "members_last_admin", message: "Conflict" },
        },
      },
    });
    const user = userEvent.setup();
    await user.click(
      await screen.findByRole("button", { name: "Change role for Mamá" }),
    );
    await user.selectOptions(screen.getByLabelText("Role"), "viewer");
    await user.click(screen.getByRole("button", { name: "Save" }));
    expect(
      await screen.findByText(/Make somebody else an active admin first/),
    ).toBeVisible();
    expect(screen.getByRole("dialog")).toBeVisible();
    expect(screen.getByLabelText("Role")).toHaveValue("viewer");
  });
  it("explains preserved content before removing a member", async () => {
    renderMembers({
      members: [makeMember({ isLastActiveAdmin: false }), SECOND_ADMIN],
      routes: {
        [`DELETE /api/members/${SECOND_ADMIN.memberId}`]: {
          status: 200,
          body: { ...SECOND_ADMIN, status: "removed" },
        },
      },
    });
    const user = userEvent.setup();
    await user.click(
      await screen.findByRole("button", { name: "Remove Mamá" }),
    );
    expect(
      screen.getByText(/Nothing they uploaded or wrote is deleted/),
    ).toBeVisible();
    await user.click(screen.getByRole("button", { name: "Remove them" }));
    await waitFor(() => {
      return expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });
  });
  it.each([false, true])(
    "revokes an own device (current: %s)",
    async (isCurrent) => {
      const sessionId = INVITED.memberId;
      const device = {
        sessionId,
        deviceLabel: "Family phone",
        createdAt: "2026-09-01T10:00:00.000Z",
        lastUsedAt: "2026-09-01T10:00:00.000Z",
        expiresAt: "2099-09-01T10:00:00.000Z",
        isCurrent,
      };
      const { router } = renderMembers({
        members: [makeMember({ sessions: [device] })],
        routes: {
          [`DELETE /api/members/${ADMIN_ACCOUNT.me.member.memberId}/sessions/${sessionId}`]:
            { status: 204, body: undefined },
        },
      });
      const user = userEvent.setup();
      await user.click(
        await screen.findByRole("button", {
          name: "Sign out Family phone for Papá",
        }),
      );
      const dialog = await screen.findByRole("dialog");
      await user.click(
        within(dialog).getByRole("button", {
          name: isCurrent ? "Sign out here" : "Sign it out",
        }),
      );
      await waitFor(() => {
        return expect(
          countCallsTo(
            "DELETE",
            `/api/members/${ADMIN_ACCOUNT.me.member.memberId}/sessions/${sessionId}`,
          ),
        ).toBe(1);
      });
      if (isCurrent) {
        await waitFor(() => {
          return expect(router.state.location.pathname).toBe("/sign-in");
        });
      } else {
        await waitFor(() => {
          return expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
        });
      }
    },
  );
});
