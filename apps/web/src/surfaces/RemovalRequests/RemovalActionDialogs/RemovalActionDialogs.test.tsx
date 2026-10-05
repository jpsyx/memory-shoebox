import type { Viewer } from "@/session/requireSignedIn/requireSignedIn";
import { makeRemovalRequestFromOverrides } from "@/testing/askingAndOccasionsFixtureHelpers";
import { MantineProvider } from "@mantine/core";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { RemovalActions } from "../useRemovalActions/useRemovalActions";
import { RemovalActionDialogs } from "./RemovalActionDialogs";
const VIEWER = {
  memberId: "member",
  displayName: "Mamá",
  role: "admin",
  isAdmin: true,
} as const satisfies Viewer;
function _actions(): RemovalActions {
  return {
    target: makeRemovalRequestFromOverrides(),
    dialog: "decline",
    openDelete: vi.fn(),
    openDecline: vi.fn(),
    close: vi.fn(),
    confirmDelete: vi.fn(),
    confirmDecline: vi.fn(),
    withdraw: vi.fn(),
    isPending: false,
    error: undefined,
    fieldErrors: {},
  };
}
describe("answer dialogs", () => {
  it("keeps failed words on closing and reopening, resets on another request", async () => {
    const actions = _actions();
    const view = render(
      <MantineProvider>
        <RemovalActionDialogs actions={actions} viewer={VIEWER} />
      </MantineProvider>,
    );
    await userEvent.type(screen.getByRole("textbox"), "Sí, <b>ours</b>");
    view.rerender(
      <MantineProvider>
        <RemovalActionDialogs
          actions={{ ...actions, dialog: undefined, error: "Try again" }}
          viewer={VIEWER}
        />
      </MantineProvider>,
    );
    view.rerender(
      <MantineProvider>
        <RemovalActionDialogs actions={actions} viewer={VIEWER} />
      </MantineProvider>,
    );
    expect(screen.getByRole("textbox")).toHaveValue("Sí, <b>ours</b>");
    view.rerender(
      <MantineProvider>
        <RemovalActionDialogs
          actions={{
            ...actions,
            target: makeRemovalRequestFromOverrides({ requestId: "other" }),
          }}
          viewer={VIEWER}
        />
      </MantineProvider>,
    );
    expect(screen.getByRole("textbox")).toHaveValue("");
  });
  it("offers the visibility editor as a native link while preserving the request", async () => {
    const actions = _actions();
    render(
      <MantineProvider>
        <RemovalActionDialogs actions={actions} viewer={VIEWER} />
      </MantineProvider>,
    );
    const link = screen.getByRole("link", {
      name: "Change who can see it instead",
    });
    expect(link).toHaveAttribute("href", `/items/${actions.target?.itemId}`);
    expect(screen.getByText(/Who can see this/)).toBeVisible();
    expect(actions.confirmDecline).not.toHaveBeenCalled();
  });
  it("omits the alternative when media is null and announces failures", async () => {
    const actions = {
      ..._actions(),
      target: makeRemovalRequestFromOverrides({ media: null }),
      error: "Please try again",
    };
    render(
      <MantineProvider>
        <RemovalActionDialogs actions={actions} viewer={VIEWER} />
      </MantineProvider>,
    );
    await waitFor(() => {
      return expect(screen.getByRole("alert")).toHaveTextContent(
        "Please try again",
      );
    });
    expect(screen.queryByRole("link")).toBeNull();
  });
});

describe("decline dialog entry focus", () => {
  it("places the opening keyboard focus in the responder words", async () => {
    render(
      <MantineProvider>
        <RemovalActionDialogs actions={_actions()} viewer={VIEWER} />
      </MantineProvider>,
    );
    await waitFor(() => {
      expect(screen.getByRole("textbox")).toHaveFocus();
    });
  });
});
