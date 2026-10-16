import { getRecordedCountFromLine } from "@/testing/surfaceHarnessHelpers";
import {
  act,
  fireEvent,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { renderTimeline } from "./timelineSurfaceTestHelpers";
import {
  answerBulkTimeline,
  tickBothTimelinePhotos,
} from "./timelineBulkTestHelpers";

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("timeline bulk operation lifetime", () => {
  it.each([
    { label: "filter", search: { from: "2026-09-01" } },
    { label: "jump", search: { at: "2026-09-01" } },
  ])("clears tick mode when the $label changes", async ({ search }) => {
    answerBulkTimeline();
    const { router } = renderTimeline();
    await tickBothTimelinePhotos();
    expect(
      screen.getByRole("button", { name: "Family photo 2" }),
    ).toHaveAttribute("aria-pressed", "true");
    await act(async () => {
      await router.navigate({ to: "/", search });
    });
    expect(
      await screen.findByRole("button", { name: "Select photos" }),
    ).toBeEnabled();
    expect(
      screen.queryByRole("region", { name: "Edit ticked photos" }),
    ).not.toBeInTheDocument();
    await userEvent.click(
      screen.getByRole("button", { name: "Select photos" }),
    );
    expect(
      screen.getByRole("button", { name: "Family photo 2" }),
    ).toHaveAttribute("aria-pressed", "false");
    expect(screen.getByRole("button", { name: "Delete" })).toBeDisabled();
  });

  it("locks cancellation, Escape and repeat submit until deletion settles", async () => {
    let finishDeletion!: () => void;
    const waitForDeletion = new Promise<void>((settle) => {
      finishDeletion = settle;
    });
    answerBulkTimeline({
      "POST /api/items/bulk-edit": {
        body: undefined,
        status: 204,
        waitFor: waitForDeletion,
      },
    });
    renderTimeline();
    await tickBothTimelinePhotos();
    await userEvent.click(screen.getByRole("button", { name: "Delete" }));
    const dialog = screen.getByRole("dialog");
    const confirmation = within(dialog).getByRole("button", {
      name: "Delete 2 permanently",
    });
    fireEvent.click(confirmation);
    fireEvent.click(confirmation);
    await waitFor(() => {
      expect(confirmation).toBeDisabled();
    });
    expect(
      within(dialog).getByRole("button", { name: "Cancel" }),
    ).toBeDisabled();
    await userEvent.keyboard("{Escape}");
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(getRecordedCountFromLine("POST /api/items/bulk-edit")).toBe(1);
    await act(async () => {
      finishDeletion();
    });
    await waitFor(() => {
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });
    expect(getRecordedCountFromLine("POST /api/items/bulk-edit")).toBe(1);
  });
});
