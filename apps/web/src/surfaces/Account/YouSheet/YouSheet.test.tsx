import { MantineProvider } from "@mantine/core";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import { YouSheet } from "@/surfaces/Account/YouSheet/YouSheet";
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
