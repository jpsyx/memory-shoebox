import { MantineProvider } from "@mantine/core";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import type { NotifyPreferences } from "@memory-shoebox/shared";
import { EmailSheet } from "@/surfaces/Account/EmailSheet";
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
});
