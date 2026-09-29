import { MantineProvider } from "@mantine/core";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import type { NotifyPreferences } from "@memory-shoebox/shared";
import { EmailSheet } from "@/surfaces/Account/EmailSheet";
import { NOTIFY_KINDS } from "@/surfaces/Account/notifyKinds";
import { YouSheet } from "@/surfaces/Account/YouSheet";
import { createMeResponse } from "@/testing/createMeResponse";
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

describe("the You sheet", () => {
  it("shows the resolved name as a placeholder when none was ever typed", () => {
    const { me } = createMeResponse({
      displayName: "abuela",
      storedDisplayName: null,
    });

    render(
      _inTheme(
        <YouSheet
          me={me}
          onSave={vi.fn()}
          isSaving={false}
          savedAt={undefined}
          error={undefined}
        />,
      ),
    );

    const field = screen.getByLabelText("Your name");
    expect(field).toHaveValue("");
    expect(field).toHaveAttribute("placeholder", "abuela");
  });

  it("keeps the save button disabled until the name actually changes", async () => {
    const user = userEvent.setup();
    const { me } = createMeResponse({
      displayName: "Abuela",
      storedDisplayName: "Abuela",
    });

    render(
      _inTheme(
        <YouSheet
          me={me}
          onSave={vi.fn()}
          isSaving={false}
          savedAt={undefined}
          error={undefined}
        />,
      ),
    );

    const field = screen.getByLabelText("Your name");
    const button = screen.getByRole("button", { name: "Save your name" });
    expect(button).toBeDisabled();

    await user.type(field, "!");
    expect(button).toBeEnabled();

    await user.type(field, "{backspace}");
    expect(button).toBeDisabled();
  });

  it("saves the trimmed name", async () => {
    const user = userEvent.setup();
    const onSave = vi.fn();
    const { me } = createMeResponse({
      displayName: "Abuela",
      storedDisplayName: "",
    });

    render(
      _inTheme(
        <YouSheet
          me={me}
          onSave={onSave}
          isSaving={false}
          savedAt={undefined}
          error={undefined}
        />,
      ),
    );

    const field = screen.getByLabelText("Your name");
    await user.type(field, "  Abuela Rosa  ");
    await user.click(screen.getByRole("button", { name: "Save your name" }));

    expect(onSave).toHaveBeenCalledWith({ displayName: "Abuela Rosa" });
  });

  it("clears the name back to the fallback when emptied", async () => {
    const user = userEvent.setup();
    const onSave = vi.fn();
    const { me } = createMeResponse({
      displayName: "Abuela",
      storedDisplayName: "Abuela Rosa",
    });

    render(
      _inTheme(
        <YouSheet
          me={me}
          onSave={onSave}
          isSaving={false}
          savedAt={undefined}
          error={undefined}
        />,
      ),
    );

    const field = screen.getByLabelText("Your name");
    await user.clear(field);
    await user.click(screen.getByRole("button", { name: "Save your name" }));

    expect(onSave).toHaveBeenCalledWith({ displayName: null });
  });

  it("shows the address as unchangeable, and says why", () => {
    const { me } = createMeResponse({ email: "abuela@example.com" });

    render(
      _inTheme(
        <YouSheet
          me={me}
          onSave={vi.fn()}
          isSaving={false}
          savedAt={undefined}
          error={undefined}
        />,
      ),
    );

    expect(screen.getByLabelText("Your email")).toHaveAttribute("readonly");
    expect(screen.getByText(/This address cannot be changed/)).toBeVisible();
  });

  it("disables the save button while a save is in flight, even once the text changes", async () => {
    const user = userEvent.setup();
    const { me } = createMeResponse({
      displayName: "Abuela",
      storedDisplayName: "Abuela",
    });

    render(
      _inTheme(
        <YouSheet
          me={me}
          onSave={vi.fn()}
          isSaving={true}
          savedAt={undefined}
          error={undefined}
        />,
      ),
    );

    const button = screen.getByRole("button", { name: "Save your name" });
    expect(button).toBeDisabled();

    await user.type(screen.getByLabelText("Your name"), "!");
    expect(button).toBeDisabled();
  });

  it("shows Saved. once savedAt is set, and hides it again once the field changes", async () => {
    const user = userEvent.setup();
    const { me } = createMeResponse({
      displayName: "Abuela",
      storedDisplayName: "Abuela",
    });

    render(
      _inTheme(
        <YouSheet
          me={me}
          onSave={vi.fn()}
          isSaving={false}
          savedAt={Date.now()}
          error={undefined}
        />,
      ),
    );

    expect(screen.getByText("Saved.")).toBeVisible();

    await user.type(screen.getByLabelText("Your name"), "!");
    expect(screen.queryByText("Saved.")).not.toBeInTheDocument();
  });

  it("renders the error sentence under the field when one is given", () => {
    const { me } = createMeResponse();

    render(
      _inTheme(
        <YouSheet
          me={me}
          onSave={vi.fn()}
          isSaving={false}
          savedAt={undefined}
          error="That did not save. Try again."
        />,
      ),
    );

    expect(screen.getByText("That did not save. Try again.")).toBeVisible();
  });
});

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

  it("disables every switch and both bulk buttons while a save is in flight", () => {
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
