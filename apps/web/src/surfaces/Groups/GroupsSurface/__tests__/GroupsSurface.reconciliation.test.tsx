import { act, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it, vi } from "vitest";
import {
  GROUP,
  USAGE,
  renderGroups,
} from "@/surfaces/Groups/GroupsSurface/__tests__/renderGroups";
import { countCallsTo } from "@/surfaces/Account/AccountSurface/__tests__/AccountSurface.fixtures";
function _renderDeletedUsageRecovery(): {
  path: string;
  usagePath: string;
  recovery: ReturnType<typeof _failAccountAfterWrite>;
} {
  const path = `/api/groups/${GROUP.groupId}?${new URLSearchParams({ confirmationToken: USAGE.confirmationToken! })}`;
  const usagePath = `/api/groups/${GROUP.groupId}/usage`;
  renderGroups({
    routes: { [`DELETE ${path}`]: { status: 204, body: undefined } },
  });
  const recovery = _failAccountAfterWrite({
    method: "DELETE",
    path,
  });
  const original = vi.mocked(fetch).getMockImplementation()!;
  let hasDeleted = false;
  vi.mocked(fetch).mockImplementation(async (url, init) => {
    if (url === path && init?.method === "DELETE") {
      hasDeleted = true;
    }
    if (url === usagePath && hasDeleted) {
      return Response.json(
        { error: "groups_not_found", message: "Not found." },
        { status: 404 },
      );
    }
    return original(url, init);
  });
  return { path, usagePath, recovery };
}

afterEach(() => {
  vi.unstubAllGlobals();
});
function _failAccountAfterWrite({
  method,
  path,
}: Readonly<{ method: string; path: string }>): { allowRefresh: () => void } {
  const original = vi.mocked(fetch).getMockImplementation()!;
  let hasWritten = false;
  let hasRecovered = false;
  vi.mocked(fetch).mockImplementation(async (url, init) => {
    if (url === path && init?.method === method) {
      hasWritten = true;
    }
    if (url === "/api/me" && hasWritten && !hasRecovered) {
      return Response.json(
        {
          error: "temporarily_unavailable",
          message: "Account refresh unavailable.",
        },
        { status: 503 },
      );
    }
    return original(url, init);
  });
  return {
    allowRefresh: () => {
      hasRecovered = true;
    },
  };
}
it("retains truthful creation success and retries only reconciliation after /me fails", async () => {
  renderGroups({
    routes: { "POST /api/groups": { status: 201, body: GROUP } },
  });
  const recovery = _failAccountAfterWrite({
    method: "POST",
    path: "/api/groups",
  });
  const user = userEvent.setup();
  await user.click(await screen.findByRole("button", { name: "New group" }));
  await user.type(screen.getByLabelText("What to call it"), "Family");
  await user.click(screen.getByRole("button", { name: "Create the group" }));
  expect(await screen.findByText("The group has been created.")).toBeVisible();
  expect(screen.getByText("Account refresh unavailable.")).toBeVisible();
  expect(
    screen.getByRole("button", { name: "Create the group" }),
  ).toBeDisabled();
  expect(screen.getByRole("button", { name: "Cancel" })).toBeDisabled();
  expect(screen.getByRole("button", { name: "Edit Cousins" })).toBeDisabled();
  expect(countCallsTo("POST", "/api/groups")).toBe(1);
  recovery.allowRefresh();
  await user.click(
    screen.getByRole("button", { name: "Retry account refresh" }),
  );
  await waitFor(() => {
    expect(screen.queryByText("A new group")).not.toBeInTheDocument();
  });
  expect(countCallsTo("POST", "/api/groups")).toBe(1);
  expect(screen.getByRole("button", { name: "New group" })).toBeEnabled();
});
it("retains truthful deletion success and retries only reconciliation after /me fails", async () => {
  const path = `/api/groups/${GROUP.groupId}?${new URLSearchParams({ confirmationToken: USAGE.confirmationToken! })}`;
  renderGroups({
    routes: { [`DELETE ${path}`]: { status: 204, body: undefined } },
  });
  const recovery = _failAccountAfterWrite({
    method: "DELETE",
    path,
  });
  const user = userEvent.setup();
  await user.click(
    await screen.findByRole("button", { name: "Delete Cousins" }),
  );
  await user.click(
    await screen.findByRole("button", { name: "Delete it anyway" }),
  );
  expect(await screen.findByText("The group has been deleted.")).toBeVisible();
  const dialog = within(screen.getByRole("dialog"));
  expect(dialog.getByText("Account refresh unavailable.")).toBeVisible();
  expect(
    dialog.queryByRole("button", { name: "Delete it anyway" }),
  ).not.toBeInTheDocument();
  expect(
    dialog.queryByRole("button", { name: "Keep it" }),
  ).not.toBeInTheDocument();
  await user.keyboard("{Escape}");
  expect(screen.getByRole("dialog")).toBeVisible();
  expect(countCallsTo("DELETE", path)).toBe(1);
  recovery.allowRefresh();
  await user.click(
    dialog.getByRole("button", { name: "Retry account refresh" }),
  );
  await waitFor(() => {
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
  expect(countCallsTo("DELETE", path)).toBe(1);
});

it("recovers the persisted lock through reads after leaving and returning to Groups", async () => {
  const { router, queryClient } = renderGroups({
    routes: { "POST /api/groups": { status: 201, body: GROUP } },
  });
  queryClient.setDefaultOptions({ queries: { retry: false, gcTime: 1 } });
  const recovery = _failAccountAfterWrite({
    method: "POST",
    path: "/api/groups",
  });
  const user = userEvent.setup();
  await user.click(await screen.findByRole("button", { name: "New group" }));
  await user.type(screen.getByLabelText("What to call it"), "Family");
  await user.click(screen.getByRole("button", { name: "Create the group" }));
  expect(await screen.findByText("Account refresh unavailable.")).toBeVisible();
  await act(async () => {
    await router.navigate({ to: "/account" });
  });
  await waitFor(() => {
    expect(router.state.location.pathname).toBe("/account");
  });
  await act(async () => {
    await new Promise((done) => {
      setTimeout(done, 20);
    });
  });
  await act(async () => {
    await router.navigate({ to: "/groups" });
  });
  expect(
    await screen.findByRole("button", { name: "New group" }),
  ).toBeDisabled();
  expect(await screen.findByText("The group has been created.")).toBeVisible();
  const retry = screen.getByRole("button", { name: "Retry account refresh" });
  recovery.allowRefresh();
  await user.click(retry);
  await waitFor(() => {
    expect(screen.getByRole("button", { name: "New group" })).toBeEnabled();
  });
  expect(screen.getByRole("button", { name: "Edit Cousins" })).toBeEnabled();
  expect(countCallsTo("POST", "/api/groups")).toBe(1);
  expect(
    screen.queryByRole("button", { name: "Retry account refresh" }),
  ).not.toBeInTheDocument();
});
it("never rereads deleted usage or displays consent recovery after persisted deletion", async () => {
  const { path, usagePath, recovery } = _renderDeletedUsageRecovery();
  const user = userEvent.setup();
  await user.click(
    await screen.findByRole("button", { name: "Delete Cousins" }),
  );
  await user.click(
    await screen.findByRole("button", { name: "Delete it anyway" }),
  );
  expect(await screen.findByText("Account refresh unavailable.")).toBeVisible();
  expect(screen.getByText("The group has been deleted.")).toBeVisible();
  expect(screen.queryByText("Not found.")).not.toBeInTheDocument();
  expect(
    screen.queryByRole("button", { name: "Retry" }),
  ).not.toBeInTheDocument();
  expect(screen.queryByText(/items lose access/)).not.toBeInTheDocument();
  expect(countCallsTo("GET", usagePath)).toBe(1);
  expect(countCallsTo("DELETE", path)).toBe(1);
  recovery.allowRefresh();
  await user.click(
    screen.getByRole("button", { name: "Retry account refresh" }),
  );
  await waitFor(() => {
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
  expect(countCallsTo("GET", usagePath)).toBe(1);
  expect(countCallsTo("DELETE", path)).toBe(1);
});
