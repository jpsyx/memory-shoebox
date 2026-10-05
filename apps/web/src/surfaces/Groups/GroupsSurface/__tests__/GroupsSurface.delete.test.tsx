import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  GROUP,
  USAGE,
  renderGroups,
} from "@/surfaces/Groups/GroupsSurface/__tests__/GroupsSurface.fixtures";
import {
  countCallsTo,
  respondWith,
} from "@/surfaces/Account/AccountSurface/__tests__/AccountSurface.fixtures";

afterEach(() => {
  return vi.unstubAllGlobals();
});
function tokenPath(token: string) {
  return `/api/groups/${GROUP.groupId}?${new URLSearchParams({ confirmationToken: token })}`;
}
describe("Groups deletion consent", () => {
  it("shows both directions, affected names, and empty-only protection before DELETE", async () => {
    renderGroups({
      routes: {
        [`DELETE ${tokenPath(USAGE.confirmationToken!)}`]: {
          body: undefined,
          status: 204,
        },
      },
    });
    const user = userEvent.setup();
    await user.click(
      await screen.findByRole("button", { name: "Delete Cousins" }),
    );
    const dialog = within(await screen.findByRole("dialog"));
    expect(await dialog.findByText(/9 items lose access/)).toBeVisible();
    expect(dialog.getByText(/5 items gain access/)).toBeVisible();
    expect(dialog.getByText(/People losing access: Tomás/)).toBeVisible();
    expect(dialog.getByText(/People gaining access: Papá/)).toBeVisible();
    expect(dialog.getByText(/9 items keep an empty Only list/)).toBeVisible();
    expect(dialog.getByText(/Admins and each item's uploader/)).toBeVisible();
    await user.click(dialog.getByRole("button", { name: "Delete it anyway" }));
    await waitFor(() => {
      return expect(
        countCallsTo("DELETE", tokenPath(USAGE.confirmationToken!)),
      ).toBe(1);
    });
  });
  it.each(["groups_usage_changed", "groups_confirmation_required"])(
    "requires a second deliberate confirmation for %s even with identical counts",
    async (code) => {
      const fresh = { ...USAGE, confirmationToken: "fresh/+?=token" };
      renderGroups({
        routes: {
          [`DELETE ${tokenPath(USAGE.confirmationToken!)}`]: {
            status: 409,
            body: {
              error: code,
              message: "Review fresh usage.",
              details: fresh,
            },
          },
        },
      });
      const user = userEvent.setup();
      await user.click(
        await screen.findByRole("button", { name: "Delete Cousins" }),
      );
      await user.click(
        await screen.findByRole("button", { name: "Delete it anyway" }),
      );
      expect(
        await screen.findByText(
          /Usage changed. Review these consequences and confirm again/,
        ),
      ).toBeVisible();
      expect(countCallsTo("DELETE", tokenPath(USAGE.confirmationToken!))).toBe(
        1,
      );
      expect(countCallsTo("DELETE", tokenPath(fresh.confirmationToken))).toBe(
        0,
      );
      respondWith({
        [`DELETE ${tokenPath(fresh.confirmationToken)}`]: {
          body: undefined,
          status: 204,
        },
        "GET /api/groups": {
          body: { shape: "admin", groups: [], nextCursor: null },
          status: 200,
        },
      });
      await user.click(
        screen.getByRole("button", { name: "Delete it anyway" }),
      );
      await waitFor(() => {
        return expect(
          countCallsTo("DELETE", tokenPath(fresh.confirmationToken)),
        ).toBe(1);
      });
    },
  );
  it("disables deletion after usage read failure and permits Retry", async () => {
    renderGroups({
      routes: {
        [`GET /api/groups/${GROUP.groupId}/usage`]: {
          status: 503,
          body: { error: "failed", message: "Usage read failed." },
        },
      },
    });
    const user = userEvent.setup();
    await user.click(
      await screen.findByRole("button", { name: "Delete Cousins" }),
    );
    expect(await screen.findByText("Usage read failed.")).toBeVisible();
    expect(screen.getByRole("button", { name: "Delete it" })).toBeDisabled();
    respondWith({
      [`GET /api/groups/${GROUP.groupId}/usage`]: { status: 200, body: USAGE },
    });
    await user.click(screen.getByRole("button", { name: "Retry" }));
    expect(
      await screen.findByRole("button", { name: "Delete it anyway" }),
    ).toBeEnabled();
  });
  it("restores the exact edit trigger on Escape and uses directory fallback after deletion", async () => {
    renderGroups({
      routes: {
        [`DELETE ${tokenPath(USAGE.confirmationToken!)}`]: {
          status: 204,
          body: undefined,
        },
        "GET /api/groups": {
          status: 200,
          body: { shape: "admin", groups: [GROUP], nextCursor: null },
        },
      },
    });
    const user = userEvent.setup();
    const edit = await screen.findByRole("button", { name: "Edit Cousins" });
    await user.click(edit);
    await screen.findByRole("dialog");
    await user.keyboard("{Escape}");
    await waitFor(() => {
      return expect(edit).toHaveFocus();
    });
    await user.click(screen.getByRole("button", { name: "Delete Cousins" }));
    await screen.findByRole("button", { name: "Delete it anyway" });
    respondWith({
      [`DELETE ${tokenPath(USAGE.confirmationToken!)}`]: {
        status: 204,
        body: undefined,
      },
      "GET /api/groups": {
        status: 200,
        body: { shape: "admin", groups: [], nextCursor: null },
      },
    });
    await user.click(screen.getByRole("button", { name: "Delete it anyway" }));
    await waitFor(() => {
      return expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });
    await waitFor(() => {
      return expect(
        screen.getByRole("region", { name: "Groups directory" }),
      ).toHaveFocus();
    });
  });
  it("allows unused deletion with no token and keeps real failed writes visible", async () => {
    renderGroups({
      routes: {
        [`GET /api/groups/${GROUP.groupId}/usage`]: {
          status: 200,
          body: {
            ...USAGE,
            rules: [],
            narrowingItemCount: 0,
            wideningItemCount: 0,
            emptyAllowListItemCount: 0,
            membersLosingAccess: [],
            membersGainingAccess: [],
            confirmationToken: null,
          },
        },
        [`DELETE /api/groups/${GROUP.groupId}`]: {
          status: 409,
          body: {
            error: "groups_delete_restricted",
            message: "A rule still refers to this group.",
          },
        },
      },
    });
    const user = userEvent.setup();
    await user.click(
      await screen.findByRole("button", { name: "Delete Cousins" }),
    );
    await user.click(await screen.findByRole("button", { name: "Delete it" }));
    expect(
      await screen.findByText("A rule still refers to this group."),
    ).toBeVisible();
    expect(screen.getByRole("dialog")).toBeVisible();
  });
});
