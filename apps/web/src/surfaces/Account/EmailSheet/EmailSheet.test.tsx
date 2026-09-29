import { MantineProvider } from "@mantine/core";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import type { NotifyPreferences } from "@memory-shoebox/shared";
import { EmailSheet } from "@/surfaces/Account/EmailSheet/EmailSheet";
import { NOTIFY_KINDS } from "@/surfaces/Account/notifyKinds";
import { cssVariablesResolver } from "@/theme/cssVariablesResolver";
import { theme } from "@/theme/theme";

function _inTheme(node: ReactNode): ReactNode {
  return (
    <MantineProvider theme={theme} cssVariablesResolver={cssVariablesResolver}>
      {node}
    </MantineProvider>
  );
}

const ALL_ON: NotifyPreferences = {
  onUpload: true,
  onComment: true,
  onReply: true,
  onRemoval: true,
};

const ALL_OFF: NotifyPreferences = {
  onUpload: false,
  onComment: false,
  onReply: false,
  onRemoval: false,
};

describe("the Email sheet", () => {
  it("sends all four switches when one is flipped", async () => {
    const user = userEvent.setup();
    const onSave = vi.fn();

    render(
      _inTheme(
        <EmailSheet
          notify={ALL_ON}
          onSave={onSave}
          isSaving={false}
          error={undefined}
        />,
      ),
    );

    await user.click(
      screen.getByLabelText("Somebody writes on something you wrote on"),
    );

    expect(onSave).toHaveBeenCalledWith({
      onUpload: true,
      onComment: true,
      onReply: false,
      onRemoval: true,
    });
  });

  it("turns them all off in one write", async () => {
    const user = userEvent.setup();
    const onSave = vi.fn();

    render(
      _inTheme(
        <EmailSheet
          notify={ALL_ON}
          onSave={onSave}
          isSaving={false}
          error={undefined}
        />,
      ),
    );

    await user.click(screen.getByRole("button", { name: "Turn them all off" }));

    expect(onSave).toHaveBeenCalledWith(ALL_OFF);
  });

  it("offers to turn them back on only once they are all off", () => {
    const { rerender } = render(
      _inTheme(
        <EmailSheet
          notify={{ ...ALL_OFF, onUpload: true }}
          onSave={vi.fn()}
          isSaving={false}
          error={undefined}
        />,
      ),
    );

    expect(
      screen.queryByRole("button", { name: "Turn them back on" }),
    ).not.toBeInTheDocument();

    rerender(
      _inTheme(
        <EmailSheet
          notify={ALL_OFF}
          onSave={vi.fn()}
          isSaving={false}
          error={undefined}
        />,
      ),
    );

    expect(
      screen.getByRole("button", { name: "Turn them back on" }),
    ).toBeVisible();
    expect(
      screen.getByRole("button", { name: "Turn them all off" }),
    ).toBeDisabled();
  });

  it("says that sign-in codes are not on the list", () => {
    render(
      _inTheme(
        <EmailSheet
          notify={ALL_ON}
          onSave={vi.fn()}
          isSaving={false}
          error={undefined}
        />,
      ),
    );

    expect(
      screen.getByText(/Sign-in codes are not on this list/),
    ).toBeVisible();
  });

  it("disables every switch and the bulk button while a save is in flight", () => {
    render(
      _inTheme(
        <EmailSheet
          notify={ALL_ON}
          onSave={vi.fn()}
          isSaving={true}
          error={undefined}
        />,
      ),
    );

    for (const kind of NOTIFY_KINDS) {
      expect(screen.getByLabelText(kind.label)).toBeDisabled();
    }
    expect(
      screen.getByRole("button", { name: "Turn them all off" }),
    ).toBeDisabled();
  });

  // Its own case, because the two bulk buttons are never on screen together:
  // "Turn them back on" appears only once every switch is off. A single test
  // rendering one `notify` can therefore only ever reach one of them, and
  // this one was the half nothing covered.
  it("disables turning them back on while a save is in flight", () => {
    render(
      _inTheme(
        <EmailSheet
          notify={ALL_OFF}
          onSave={vi.fn()}
          isSaving={true}
          error={undefined}
        />,
      ),
    );

    expect(
      screen.getByRole("button", { name: "Turn them back on" }),
    ).toBeDisabled();
  });

  it("renders the error sentence when one is given", () => {
    render(
      _inTheme(
        <EmailSheet
          notify={ALL_ON}
          onSave={vi.fn()}
          isSaving={false}
          error="That did not save. Try again."
        />,
      ),
    );

    expect(screen.getByText("That did not save. Try again.")).toBeVisible();
  });

  it("computes each flip from the current notify prop, even in quick succession", async () => {
    // Neither switch's own click waits for the other, and this component
    // holds no state of its own (its `Props` docstring says why): each call
    // spreads whatever `notify` it currently has. Nothing in this test
    // updates that prop between the two clicks, so the second call's spread
    // is still the original, unflipped `notify`, exactly the staleness the
    // docstring's "update the cache optimistically" requirement exists to
    // prevent once a real caller is driving this.
    const user = userEvent.setup();
    const onSave = vi.fn();

    render(
      _inTheme(
        <EmailSheet
          notify={ALL_ON}
          onSave={onSave}
          isSaving={false}
          error={undefined}
        />,
      ),
    );

    await user.click(screen.getByLabelText("Somebody puts photographs up"));
    await user.click(
      screen.getByLabelText("Somebody writes on something of yours"),
    );

    expect(onSave).toHaveBeenNthCalledWith(1, { ...ALL_ON, onUpload: false });
    expect(onSave).toHaveBeenNthCalledWith(2, { ...ALL_ON, onComment: false });
  });
});
