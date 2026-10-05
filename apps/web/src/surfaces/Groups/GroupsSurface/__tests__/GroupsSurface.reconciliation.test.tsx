import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it, vi } from "vitest";
import {
  GROUP,
  USAGE,
  renderGroups,
} from "@/surfaces/Groups/GroupsSurface/__tests__/GroupsSurface.fixtures";
import { countCallsTo } from "@/surfaces/Account/AccountSurface/__tests__/AccountSurface.fixtures";

afterEach(() => {
  vi.unstubAllGlobals();
});
function failAccountAfterWrite(
  method: string,
  path: string,
): { allowRefresh: () => void } {
  const original = vi.mocked(fetch).getMockImplementation()!;
  let hasWritten = false;
  let hasRecovered = false;
  vi.mocked(fetch).mockImplementation(async (url, init) => {
    if (url === path && init?.method === method) hasWritten = true;
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
  const recovery = failAccountAfterWrite("POST", "/api/groups");
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
  const recovery = failAccountAfterWrite("DELETE", path);
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
    dialog.getByRole("button", { name: "Delete it anyway" }),
  ).toBeDisabled();
  expect(dialog.getByRole("button", { name: "Keep it" })).toBeDisabled();
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
