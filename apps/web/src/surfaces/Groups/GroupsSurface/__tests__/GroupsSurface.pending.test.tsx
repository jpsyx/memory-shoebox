import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it, vi } from "vitest";
import {
  GROUP,
  renderGroups,
} from "@/surfaces/Groups/GroupsSurface/__tests__/GroupsSurface.fixtures";
import { countCallsTo } from "@/surfaces/Account/AccountSurface/__tests__/AccountSurface.fixtures";

afterEach(() => {
  return vi.unstubAllGlobals();
});
it("protects the edit draft and disables its controls while saving", async () => {
  let release = () => {};
  const waitForWrite = new Promise<void>((settle) => {
    release = settle;
  });
  renderGroups({
    routes: {
      [`PUT /api/groups/${GROUP.groupId}/members`]: {
        status: 200,
        body: { members: GROUP.members, nextCursor: null },
        waitFor: waitForWrite,
      },
    },
  });
  const user = userEvent.setup();
  await user.click(await screen.findByRole("button", { name: "Edit Cousins" }));
  await user.click(
    within(screen.getByRole("dialog")).getByRole("button", { name: "Save" }),
  );
  await waitFor(() => {
    return expect(
      countCallsTo("PUT", `/api/groups/${GROUP.groupId}/members`),
    ).toBe(1);
  });
  expect(screen.getByLabelText("What to call it")).toBeDisabled();
  expect(screen.getByRole("button", { name: "Cancel" })).toBeDisabled();
  await user.keyboard("{Escape}");
  expect(screen.getByRole("dialog")).toBeVisible();
  expect(
    screen.queryByRole("button", { name: "Close" }),
  ).not.toBeInTheDocument();
  release();
  await waitFor(() => {
    return expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
});

it("disables row actions when the member directory read fails", async () => {
  renderGroups({
    routes: {
      "GET /api/members": {
        status: 503,
        body: { error: "failed", message: "Directory unavailable." },
      },
    },
  });
  expect(await screen.findByText("Directory unavailable.")).toBeVisible();
  expect(screen.getByRole("button", { name: "New group" })).toBeDisabled();
  expect(screen.getByRole("button", { name: "Edit Cousins" })).toBeDisabled();
  expect(screen.getByRole("button", { name: "Delete Cousins" })).toBeDisabled();
});
