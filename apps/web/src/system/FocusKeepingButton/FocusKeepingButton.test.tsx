import { MantineProvider } from "@mantine/core";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import { FocusKeepingButton } from "@/system/FocusKeepingButton/FocusKeepingButton";
import { cssVariablesResolver } from "@/theme/cssVariablesResolver";
import { theme } from "@/theme/theme";

function Providers({ children }: Readonly<{ children: ReactNode }>): ReactNode {
  return (
    <MantineProvider theme={theme} cssVariablesResolver={cssVariablesResolver}>
      {children}
    </MantineProvider>
  );
}

describe("a button that keeps focus", () => {
  it("keeps focus as it becomes unavailable, and is not pressed again", async () => {
    const onClick = vi.fn();
    const { rerender } = render(
      <FocusKeepingButton isUnavailable={false} onClick={onClick}>
        Save
      </FocusKeepingButton>,
      { wrapper: Providers },
    );
    const button = screen.getByRole("button", { name: "Save" });
    button.focus();
    await userEvent.keyboard("{Enter}");

    rerender(
      <FocusKeepingButton isUnavailable onClick={onClick}>
        Save
      </FocusKeepingButton>,
    );
    // `disabled` is what a browser takes focus away from, so it is not set.
    expect(button).toHaveFocus();
    expect(button).not.toBeDisabled();
    expect(button).toHaveAttribute("aria-disabled", "true");
    expect(button).toHaveAttribute("data-disabled");

    await userEvent.keyboard("{Enter}");
    await userEvent.click(button);
    expect(onClick).toHaveBeenCalledOnce();
  });

  it("sends no form while it is unavailable", async () => {
    const onSubmit = vi.fn();
    render(
      <form
        onSubmit={(event) => {
          event.preventDefault();
          onSubmit();
        }}
      >
        <FocusKeepingButton type="submit" isUnavailable>
          Send
        </FocusKeepingButton>
      </form>,
      { wrapper: Providers },
    );

    await userEvent.click(screen.getByRole("button", { name: "Send" }));

    expect(onSubmit).not.toHaveBeenCalled();
  });
});
