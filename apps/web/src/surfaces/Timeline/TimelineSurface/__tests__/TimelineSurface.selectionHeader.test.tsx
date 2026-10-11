import { act, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { renderTimeline } from "./TimelineSurface.fixtures";
import { answerBulkTimeline } from "./timelineBulkTestHelpers";

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("timeline selection in the product header", () => {
  it("places Select photos immediately after Find and enters tick mode", async () => {
    answerBulkTimeline();
    renderTimeline();
    await screen.findByRole("button", { name: "Family photo 1" });
    const header = screen.getByRole("banner");
    const select = within(header).getByRole("button", {
      name: "Select photos",
    });
    const find = within(header).getByRole("link", { name: "Find" });
    const controls = Array.from(header.querySelectorAll("a, button"));
    expect(controls[controls.indexOf(find) + 1]).toBe(select);
    expect(
      screen.getAllByRole("button", { name: "Select photos" }),
    ).toHaveLength(1);
    await userEvent.click(select);
    await userEvent.click(
      screen.getByRole("button", { name: "Family photo 1" }),
    );
    expect(
      screen.getByRole("button", { name: "Family photo 1" }),
    ).toHaveAttribute("aria-pressed", "true");
    await userEvent.click(
      screen.getByRole("button", { name: "Done selecting" }),
    );
    await waitFor(() => {
      expect(
        within(header).getByRole("button", { name: "Select photos" }),
      ).toHaveFocus();
    });
  });

  it.each([false, true])(
    "removes the action away from the timeline and resets selection (active: %s)",
    async (isSelecting) => {
      answerBulkTimeline();
      const { router } = renderTimeline();
      const select = await screen.findByRole("button", {
        name: "Select photos",
      });
      if (isSelecting) {
        await userEvent.click(select);
        await userEvent.click(
          screen.getByRole("button", { name: "Family photo 1" }),
        );
      }
      await userEvent.click(screen.getByRole("link", { name: "People" }));
      await waitFor(() => {
        expect(router.state.location.pathname).toBe("/people");
      });
      expect(
        screen.queryByRole("button", { name: "Select photos" }),
      ).not.toBeInTheDocument();
      expect(
        screen.queryByRole("region", { name: "Edit ticked photos" }),
      ).not.toBeInTheDocument();
      await act(async () => {
        await router.navigate({ to: "/" });
      });
      expect(
        await within(screen.getByRole("banner")).findByRole("button", {
          name: "Select photos",
        }),
      ).toBeEnabled();
      expect(
        screen.getByRole("button", { name: "Family photo 1" }),
      ).not.toHaveAttribute("aria-pressed");
    },
  );

  it("returns focus to the header after saving a bulk edit", async () => {
    answerBulkTimeline();
    renderTimeline();
    await userEvent.click(
      await screen.findByRole("button", { name: "Select photos" }),
    );
    await userEvent.click(
      screen.getByRole("button", { name: "Family photo 1" }),
    );
    await userEvent.click(screen.getByRole("button", { name: "Add a tag" }));
    await userEvent.type(
      screen.getByRole("combobox", { name: "Tags" }),
      "summer{Enter}",
    );
    await userEvent.click(screen.getByRole("button", { name: "Tag all 1" }));
    await waitFor(() => {
      expect(
        within(screen.getByRole("banner")).getByRole("button", {
          name: "Select photos",
        }),
      ).toHaveFocus();
    });
  });
});
