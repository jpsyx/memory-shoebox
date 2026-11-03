import { EmailSheet } from "@/surfaces/Account/EmailSheet/EmailSheet";
import { NOTIFY_KINDS } from "@/surfaces/Account/notifyKinds";
import { cssVariablesResolver } from "@/theme/cssVariablesResolver";
import { theme } from "@/theme/theme";
import { MantineProvider } from "@mantine/core";
import type { NotifyPreferences } from "@memory-shoebox/shared";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";

function _inTheme(node: ReactNode): ReactNode {
  return (
    <MantineProvider theme={theme} cssVariablesResolver={cssVariablesResolver}>
      {node}
    </MantineProvider>
  );
}

const ALL_ON: NotifyPreferences = {
  onUpload: "daily" as const,
  onComment: "daily" as const,

  onRemoval: true,
  onCommentTag: "immediate" as const,
};

const ALL_OFF: NotifyPreferences = {
  onUpload: "off" as const,
  onComment: "off" as const,

  onRemoval: false,
  onCommentTag: "off" as const,
};

describe("the Email sheet", () => {
  it("sends all preferences when one frequency changes", async () => {
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

    await user.selectOptions(
      screen.getByLabelText("Comments and replies"),
      "off",
    );

    expect(onSave).toHaveBeenCalledWith({
      onUpload: "daily" as const,
      onComment: "off" as const,

      onRemoval: true,
      onCommentTag: "immediate" as const,
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

  it("offers to turn them back on only once they are all off", async () => {
    const onSave = vi.fn();
    const { rerender } = render(
      _inTheme(
        <EmailSheet
          notify={{ ...ALL_OFF, onUpload: "daily" as const }}
          onSave={onSave}
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
          onSave={onSave}
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
    await userEvent
      .setup()
      .click(screen.getByRole("button", { name: "Turn them back on" }));
    expect(onSave).toHaveBeenCalledWith(ALL_ON);
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

    await user.selectOptions(screen.getByLabelText("New photos/videos"), "off");
    await user.selectOptions(
      screen.getByLabelText("Comments and replies"),
      "off",
    );

    expect(onSave).toHaveBeenNthCalledWith(1, {
      ...ALL_ON,
      onUpload: "off" as const,
    });
    expect(onSave).toHaveBeenNthCalledWith(2, {
      ...ALL_ON,
      onComment: "off" as const,
    });
  });
});

it("offers the independent tag switch, explains the off state, and focuses its email link target once", async () => {
  const user = userEvent.setup();
  const onSave = vi.fn();
  const { rerender } = render(
    _inTheme(
      <EmailSheet
        notify={ALL_ON}
        onSave={onSave}
        isSaving={false}
        error={undefined}
        focusCommentTag
      />,
    ),
  );
  const toggle = screen.getByLabelText("Comment tags");
  expect(screen.getAllByRole("combobox")).toHaveLength(3);
  expect(screen.getAllByRole("switch")).toHaveLength(1);
  expect(toggle).toHaveFocus();
  await user.selectOptions(toggle, "off");
  expect(onSave).toHaveBeenCalledWith({
    ...ALL_ON,
    onCommentTag: "off" as const,
  });
  rerender(
    _inTheme(
      <EmailSheet
        notify={{ ...ALL_ON, onCommentTag: "off" as const }}
        onSave={onSave}
        isSaving={false}
        error={undefined}
        focusCommentTag
      />,
    ),
  );
  expect(
    screen.getByText(
      /You may still receive emails about your uploads or conversations/,
    ),
  ).toBeVisible();
  await user.selectOptions(screen.getByLabelText("New photos/videos"), "off");
  rerender(
    _inTheme(
      <EmailSheet
        notify={ALL_ON}
        onSave={onSave}
        isSaving={false}
        error={undefined}
        focusCommentTag
      />,
    ),
  );
  expect(screen.getByLabelText("New photos/videos")).toHaveFocus();
});

it("keeps focus and restores the saved tag value with a nearby failure", async () => {
  const user = userEvent.setup();
  const { rerender } = render(
    _inTheme(
      <EmailSheet
        notify={ALL_ON}
        onSave={vi.fn()}
        isSaving={false}
        error={undefined}
      />,
    ),
  );
  const toggle = screen.getByLabelText("Comment tags");
  await user.selectOptions(toggle, "off");
  rerender(
    _inTheme(
      <EmailSheet
        notify={ALL_ON}
        onSave={vi.fn()}
        isSaving={false}
        error="Failed"
      />,
    ),
  );
  expect(toggle).toHaveValue("immediate");
  expect(toggle).toHaveFocus();
  expect(toggle.closest("[data-notify-kind]")).toContainElement(
    screen.getByRole("alert"),
  );
  expect(screen.getByRole("alert")).toHaveTextContent(
    "Couldn't change that email preference. Try again.",
  );
});

it.each([false, true])(
  "restores a switch blurred by saving without stealing moved focus: %s",
  async (hasMovedFocus) => {
    const onSave = vi.fn();
    const view = (isSaving: boolean, error?: string) => {
      return _inTheme(
        <>
          <button>Another control</button>
          <EmailSheet
            notify={ALL_ON}
            onSave={onSave}
            isSaving={isSaving}
            error={error}
          />
        </>,
      );
    };
    const { rerender } = render(view(false));
    const toggle = screen.getByLabelText("Comment tags");
    await userEvent.setup().selectOptions(toggle, "off");
    rerender(view(true));
    expect(toggle).toBeDisabled();
    // Chromium blurs a newly disabled input; jsdom does not model that step.
    const otherControl = screen.getByRole("button", {
      name: "Another control",
    });
    otherControl.focus();
    otherControl.blur();
    expect(document.body).toHaveFocus();
    if (hasMovedFocus) {
      otherControl.focus();
    }
    rerender(view(false, "Failed"));
    expect(toggle).toHaveValue("immediate");
    expect(hasMovedFocus ? otherControl : toggle).toHaveFocus();
  },
);
