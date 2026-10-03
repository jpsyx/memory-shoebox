import { MantineProvider, Modal } from "@mantine/core";
import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { cssVariablesResolver } from "@/theme/cssVariablesResolver";
import { theme } from "@/theme/theme";

describe("the theme's dialog", () => {
  it("names its close button, so it is more than a button to a screen reader", async () => {
    render(
      <MantineProvider
        theme={theme}
        cssVariablesResolver={cssVariablesResolver}
      >
        <Modal opened onClose={() => {}} title="Delete this photograph?">
          It goes for good.
        </Modal>
      </MantineProvider>,
    );

    const dialog = await screen.findByRole("dialog", {
      name: "Delete this photograph?",
    });
    expect(
      within(dialog).getByRole("button", { name: "Close" }),
    ).toBeInTheDocument();
  });
});
