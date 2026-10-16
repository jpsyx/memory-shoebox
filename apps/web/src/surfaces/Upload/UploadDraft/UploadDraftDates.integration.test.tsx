import {
  act,
  cleanup,
  fireEvent,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { renderDateReview } from "./DateReviewFixture/renderDateReview";

afterEach(cleanup);

describe("individual capture date review", () => {
  it("submits a bulk confirmation once and locks its button until the save settles", async () => {
    const harness = renderDateReview();
    const pending = Promise.withResolvers<void>();
    harness.controller.amendDates.mockReturnValueOnce(pending.promise);
    const confirmAll = screen.getByRole("button", { name: "Confirm all" });
    fireEvent.click(confirmAll);
    fireEvent.click(confirmAll);
    expect(confirmAll).toBeDisabled();
    expect(harness.controller.amendDates).toHaveBeenCalledTimes(1);
    await act(async () => {
      pending.reject(new Error("Save interrupted"));
    });
    expect(confirmAll).toBeEnabled();
  });

  it("locks every date when the controller publishes busy state", () => {
    const harness = renderDateReview();
    harness.publishBusy(true);
    expect(screen.getByRole("button", { name: "Confirm all" })).toBeDisabled();
    screen.getAllByLabelText("Capture date").forEach((input) => {
      expect(input).toBeDisabled();
    });
    screen
      .getAllByRole("button", { name: "Confirm date" })
      .forEach((button) => {
        expect(button).toBeDisabled();
      });
    expect(harness.controller.amendDates).not.toHaveBeenCalled();
    harness.publishBusy(false);
    expect(screen.getByRole("button", { name: "Confirm all" })).toBeEnabled();
  });

  it("submits each displayed date and waits for authoritative confirmation before enabling upload", async () => {
    const harness = renderDateReview();
    const files = harness.snapshot.detail!.files;
    const choices = [
      { fileId: files[1]!.fileId, capturedOn: "2026-09-12" },
      { fileId: files[3]!.fileId, capturedOn: "2026-09-16" },
    ];
    fireEvent.change(
      within(
        screen.getByRole("form", { name: "Date for photo 2" }),
      ).getByLabelText("Capture date"),
      { target: { value: "2026-09-12" } },
    );
    fireEvent.click(screen.getByRole("button", { name: "Confirm all" }));
    await waitFor(() => {
      expect(harness.controller.amendDates).toHaveBeenCalledExactlyOnceWith(
        choices,
      );
    });
    expect(screen.getByRole("button", { name: "Put 4 up" })).toBeDisabled();
    harness.publishConfirmed(choices);
    expect(
      screen.queryByRole("region", { name: "Review capture dates" }),
    ).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Put 4 up" })).toBeEnabled();
  });

  it("does not submit an empty date through either confirmation control", () => {
    const harness = renderDateReview();
    const row = screen.getByRole("form", { name: "Date for photo 2" });
    fireEvent.change(within(row).getByLabelText("Capture date"), {
      target: { value: "" },
    });
    const confirmAll = screen.getByRole("button", { name: "Confirm all" });
    const confirmDate = within(row).getByRole("button", {
      name: "Confirm date",
    });
    expect(confirmAll).toBeDisabled();
    expect(confirmDate).toBeDisabled();
    fireEvent.click(confirmAll);
    fireEvent.click(confirmDate);
    expect(harness.controller.amendDates).not.toHaveBeenCalled();
    fireEvent.change(within(row).getByLabelText("Capture date"), {
      target: { value: "2026-09-12" },
    });
    expect(confirmAll).toBeEnabled();
  });

  it("retains edited dates and blocks upload after a failed bulk save, then retries the same choices", async () => {
    const harness = renderDateReview();
    harness.controller.amendDates.mockRejectedValueOnce(
      new Error("Could not save all dates. Try again."),
    );
    const input = within(
      screen.getByRole("form", { name: "Date for photo 4" }),
    ).getByLabelText("Capture date");
    fireEvent.change(input, { target: { value: "2026-09-18" } });
    fireEvent.click(screen.getByRole("button", { name: "Confirm all" }));
    await waitFor(() => {
      expect(screen.getByRole("alert")).toHaveTextContent(
        "Could not save all dates",
      );
    });
    expect(input).toHaveValue("2026-09-18");
    expect(screen.getAllByRole("form")).toHaveLength(2);
    expect(screen.getByRole("button", { name: "Put 4 up" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Confirm all" }));
    await waitFor(() => {
      expect(harness.controller.amendDates).toHaveBeenCalledTimes(2);
    });
    const choices = harness.controller.amendDates.mock.calls[0]![0];
    expect(harness.controller.amendDates.mock.calls[1]![0]).toEqual(choices);
    expect(choices).toEqual([
      {
        fileId: harness.snapshot.detail!.files[1]!.fileId,
        capturedOn: "2026-09-14",
      },
      {
        fileId: harness.snapshot.detail!.files[3]!.fileId,
        capturedOn: "2026-09-18",
      },
    ]);
    harness.publishConfirmed(choices);
    expect(
      screen.queryByRole("region", { name: "Review capture dates" }),
    ).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Put 4 up" })).toBeEnabled();
  });

  it("removes only the confirmed row while retaining another row's independently edited day", async () => {
    const harness = renderDateReview();
    const firstRow = screen.getByRole("form", { name: "Date for photo 2" });
    const secondRow = screen.getByRole("form", { name: "Date for photo 4" });
    expect(within(firstRow).getByLabelText("Capture date")).toHaveValue(
      "2026-09-14",
    );
    expect(within(secondRow).getByLabelText("Capture date")).toHaveValue(
      "2026-09-16",
    );
    fireEvent.change(within(secondRow).getByLabelText("Capture date"), {
      target: { value: "2026-09-18" },
    });
    fireEvent.change(within(firstRow).getByLabelText("Capture date"), {
      target: { value: "2026-09-15" },
    });
    fireEvent.click(
      within(firstRow).getByRole("button", { name: "Confirm date" }),
    );
    const choices = [
      {
        fileId: harness.snapshot.detail!.files[1]!.fileId,
        capturedOn: "2026-09-15",
      },
    ];
    await waitFor(() => {
      expect(harness.controller.amendDates).toHaveBeenCalledExactlyOnceWith(
        choices,
      );
    });
    harness.publishConfirmed(choices);
    expect(
      screen.queryByRole("form", { name: "Date for photo 2" }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "1 date needs confirmation" }),
    ).toBeVisible();
    expect(within(secondRow).getByLabelText("Capture date")).toHaveValue(
      "2026-09-18",
    );
    expect(screen.getByRole("button", { name: "Put 4 up" })).toBeDisabled();
  });

  it("retains the visible thumbnail and edited date after failure, then submits the same row on retry", async () => {
    const harness = renderDateReview();
    const file = harness.snapshot.detail!.files[1]!;
    harness.publishPreview(file.fileId);
    const row = screen.getByRole("form", { name: "Date for photo 2" });
    expect(
      within(row).getByRole("img", { name: "Photo 2 to date" }),
    ).toHaveAttribute("src", "blob:preview-1");
    expect(screen.queryByText(file.originalFilename)).not.toBeInTheDocument();
    harness.controller.amendDates.mockRejectedValueOnce(
      new Error("Could not save. Try again."),
    );
    fireEvent.change(within(row).getByLabelText("Capture date"), {
      target: { value: "2026-09-12" },
    });
    fireEvent.click(within(row).getByRole("button", { name: "Confirm date" }));
    await waitFor(() => {
      expect(within(row).getByRole("alert")).toHaveTextContent(
        "Could not save",
      );
    });
    expect(within(row).getByLabelText("Capture date")).toHaveValue(
      "2026-09-12",
    );
    expect(
      within(row).getByRole("img", { name: "Photo 2 to date" }),
    ).toHaveAttribute("src", "blob:preview-1");
    expect(screen.getByRole("button", { name: "Put 4 up" })).toBeDisabled();
    fireEvent.click(within(row).getByRole("button", { name: "Confirm date" }));
    await waitFor(() => {
      expect(harness.controller.amendDates).toHaveBeenCalledTimes(2);
    });
    const choices = [{ fileId: file.fileId, capturedOn: "2026-09-12" }];
    expect(
      harness.controller.amendDates.mock.calls.map(([submitted]) => {
        return submitted;
      }),
    ).toEqual([choices, choices]);
    harness.publishConfirmed(choices);
    expect(
      screen.queryByRole("form", { name: "Date for photo 2" }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("form", { name: "Date for photo 4" }),
    ).toBeVisible();
  });
});
