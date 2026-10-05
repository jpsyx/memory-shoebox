import { act, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  GROUP,
  renderGroups,
} from "@/surfaces/Groups/GroupsSurface/__tests__/GroupsSurface.fixtures";
import {
  countCallsTo,
  getBodiesSentTo,
  respondWith,
} from "@/surfaces/Account/AccountSurface/__tests__/AccountSurface.fixtures";
import { createMeResponse } from "@/testing/createMeResponse";
import { meQueryOptions } from "@/api/me/me";

afterEach(() => {
  return vi.unstubAllGlobals();
});
describe("Groups", () => {
  it("creates inline with member chips including invited identities and excluding removed", async () => {
    renderGroups({
      routes: { "POST /api/groups": { body: GROUP, status: 201 } },
    });
    const user = userEvent.setup();
    await user.click(await screen.findByRole("button", { name: "New group" }));
    await user.type(screen.getByLabelText("What to call it"), "New cousins");
    await user.click(screen.getByRole("combobox", { name: "Who is in it" }));
    expect(
      screen.queryByRole("option", { name: /Removed/ }),
    ).not.toBeInTheDocument();
    await user.click(screen.getByRole("option", { name: /Tomás/ }));
    await user.click(screen.getByRole("button", { name: "Create the group" }));
    await waitFor(() => {
      return expect(getBodiesSentTo("POST", "/api/groups")).toEqual([
        { name: "New cousins", memberIds: [GROUP.members[0]!.memberId] },
      ]);
    });
  });
  it("binds local validation to name and retains input after request failure", async () => {
    renderGroups({
      routes: {
        "POST /api/groups": {
          body: {
            error: "groups_name_taken",
            message: "This name is already used.",
          },
          status: 409,
        },
      },
    });
    const user = userEvent.setup();
    await user.click(await screen.findByRole("button", { name: "New group" }));
    await user.click(screen.getByRole("button", { name: "Create the group" }));
    expect(screen.getByLabelText("What to call it")).toHaveAttribute(
      "aria-invalid",
      "true",
    );
    expect(countCallsTo("POST", "/api/groups")).toBe(0);
    await user.type(screen.getByLabelText("What to call it"), "Duplicate");
    await user.click(screen.getByRole("button", { name: "Create the group" }));
    expect(await screen.findByText("This name is already used.")).toBeVisible();
    expect(screen.getByLabelText("What to call it")).toHaveValue("Duplicate");
  });
  it("records partial rename and retries only failed replacement with added and removed people", async () => {
    const renamed = { ...GROUP, name: "Family" };
    renderGroups({
      routes: {
        [`PATCH /api/groups/${GROUP.groupId}`]: { body: renamed, status: 200 },
        [`PUT /api/groups/${GROUP.groupId}/members`]: {
          body: {
            error: "temporary_failure",
            message: "Membership could not be saved.",
          },
          status: 503,
        },
      },
    });
    const user = userEvent.setup();
    await user.click(
      await screen.findByRole("button", { name: "Edit Cousins" }),
    );
    const dialog = within(screen.getByRole("dialog"));
    await user.clear(dialog.getByLabelText("What to call it"));
    await user.type(dialog.getByLabelText("What to call it"), "Family");
    await user.click(dialog.getByRole("combobox", { name: "Who is in it" }));
    await user.keyboard("{Backspace}");
    await user.click(dialog.getByRole("combobox", { name: "Who is in it" }));
    await user.click(screen.getByRole("option", { name: /Papá/ }));
    await user.click(dialog.getByRole("button", { name: "Save" }));
    expect(await screen.findByText(/Name saved as Family/)).toBeVisible();
    expect(
      await screen.findByText("Membership could not be saved."),
    ).toBeVisible();
    respondWith({
      [`PUT /api/groups/${GROUP.groupId}/members`]: {
        body: { members: [], nextCursor: null },
        status: 200,
      },
      "GET /api/groups": {
        body: { shape: "admin", groups: [renamed], nextCursor: null },
        status: 200,
      },
    });
    await user.click(dialog.getByRole("button", { name: "Save" }));
    await waitFor(() => {
      return expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });
    expect(countCallsTo("PATCH", `/api/groups/${GROUP.groupId}`)).toBe(0);
    expect(
      getBodiesSentTo("PUT", `/api/groups/${GROUP.groupId}/members`),
    ).toEqual([{ memberIds: [createMeResponse().me.member.memberId] }]);
  });
  it("does not request privileged data for viewer or uploader", async () => {
    renderGroups({ account: createMeResponse({ role: "uploader" }) });
    expect(
      await screen.findByText("Only an admin can manage groups."),
    ).toBeVisible();
    expect(countCallsTo("GET", "/api/groups")).toBe(0);
    expect(countCallsTo("GET", "/api/members")).toBe(0);
  });
  it("checks current cached authority at execution and closes entry on authority loss", async () => {
    const { queryClient } = renderGroups();
    const user = userEvent.setup();
    await user.click(await screen.findByRole("button", { name: "New group" }));
    await user.type(screen.getByLabelText("What to call it"), "Family");
    act(() => {
      return queryClient.setQueryData(
        meQueryOptions.queryKey,
        createMeResponse({ role: "viewer" }),
      );
    });
    expect(
      await screen.findByText("Only an admin can manage groups."),
    ).toBeVisible();
    expect(countCallsTo("POST", "/api/groups")).toBe(0);
  });
  it("provides Retry for a failed administrative list", async () => {
    renderGroups({
      routes: {
        "GET /api/groups": {
          body: { error: "failed", message: "Groups read failed." },
          status: 503,
        },
      },
    });
    const user = userEvent.setup();
    expect(await screen.findByText("Groups read failed.")).toBeVisible();
    respondWith({
      "GET /api/groups": {
        body: { shape: "admin", groups: [], nextCursor: null },
        status: 200,
      },
    });
    await user.click(screen.getByRole("button", { name: "Retry" }));
    expect(await screen.findByText("No groups yet.")).toBeVisible();
  });
});
