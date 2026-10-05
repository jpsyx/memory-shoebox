import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  INVITED,
  SECOND_ADMIN,
  makeMember,
  renderMembers,
} from "@/surfaces/Members/MembersSurface/__tests__/MembersSurface.fixtures";

afterEach(() => {
  vi.unstubAllGlobals();
});
const DEVICE = {
  sessionId: INVITED.memberId,
  deviceLabel: "Family phone",
  createdAt: "2026-09-01T10:00:00.000Z",
  lastUsedAt: "2026-09-01T10:00:00.000Z",
  expiresAt: "2099-09-01T10:00:00.000Z",
  isCurrent: false,
};

describe("Members confirmation focus", () => {
  it.each([
    "Change role for Mamá",
    "Remove Mamá",
    "Revoke invitation for Tomás",
    "Sign out Family phone for Mamá",
  ])("restores keyboard focus to %s after Escape", async (name) => {
    renderMembers({
      members: [
        makeMember({ isLastActiveAdmin: false }),
        { ...SECOND_ADMIN, sessions: [DEVICE] },
        INVITED,
      ],
    });
    const user = userEvent.setup();
    const trigger = await screen.findByRole("button", { name });
    trigger.focus();
    await user.keyboard("{Enter}");
    await screen.findByRole("dialog");
    await user.keyboard("{Escape}");
    await waitFor(() => {
      return expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });
    await waitFor(
      () => {
        return expect(trigger).toHaveFocus();
      },
      { timeout: 2000 },
    );
  });
  it("keeps its protected focus and controls during a pending role save", async () => {
    let release = () => {};
    renderMembers({
      members: [makeMember({ isLastActiveAdmin: false }), SECOND_ADMIN],
      routes: {
        [`PATCH /api/members/${SECOND_ADMIN.memberId}`]: {
          status: 200,
          body: { ...SECOND_ADMIN, role: "viewer" },
          waitFor: new Promise((settle) => {
            release = () => {
              settle(undefined);
            };
          }),
        },
      },
    });
    const user = userEvent.setup();
    const trigger = await screen.findByRole("button", {
      name: "Change role for Mamá",
    });
    trigger.focus();
    await user.keyboard("{Enter}");
    await user.selectOptions(screen.getByLabelText("Role"), "viewer");
    await user.click(screen.getByRole("button", { name: "Save" }));
    await user.keyboard("{Escape}");
    expect(screen.getByRole("dialog")).toBeVisible();
    expect(screen.getByRole("button", { name: "Cancel" })).toBeDisabled();
    expect(screen.getByLabelText("Role")).toBeDisabled();
    release();
    await waitFor(() => {
      return expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });
    await waitFor(() => {
      return expect(trigger).toHaveFocus();
    });
  });
  it("returns focus to the directory after removal deletes the opening row", async () => {
    const members = [makeMember({ isLastActiveAdmin: false }), SECOND_ADMIN];
    const directory = {
      shape: "admin",
      members,
      nextCursor: null,
      activeAdminCount: 2,
    };
    renderMembers({
      members,
      routes: {
        "GET /api/members": { status: 200, body: directory },
        [`DELETE /api/members/${SECOND_ADMIN.memberId}`]: {
          status: 200,
          body: { ...SECOND_ADMIN, status: "removed" },
        },
      },
    });
    const originalFetch = fetch;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (path: string, init?: RequestInit) => {
        if (
          path === `/api/members/${SECOND_ADMIN.memberId}` &&
          init?.method === "DELETE"
        ) {
          directory.members = directory.members.filter((member) => {
            return member.memberId !== SECOND_ADMIN.memberId;
          });
          directory.activeAdminCount = 1;
        }
        return originalFetch(path, init);
      }),
    );
    const user = userEvent.setup();
    const trigger = await screen.findByRole("button", { name: "Remove Mamá" });
    trigger.focus();
    await user.keyboard("{Enter}");
    await screen.findByRole("dialog");
    await user.click(screen.getByRole("button", { name: "Remove them" }));
    await waitFor(() => {
      return expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });
    expect(trigger).not.toBeInTheDocument();
    await waitFor(() => {
      return expect(
        screen.getByRole("region", { name: "Member administration" }),
      ).toHaveFocus();
    });
  });
});
