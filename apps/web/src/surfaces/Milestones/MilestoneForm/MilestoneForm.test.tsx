import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { renderAt, respondWith } from "@/testing/surfaceHarness";
describe("occasion form presentation", () => {
  it("retains invalid input and explains required dates", async () => {
    respondWith({
      "GET /api/milestones": {
        body: { milestones: [], nextCursor: null },
        status: 200,
      },
    });
    renderAt("/milestones?mode=create");
    const input = await screen.findByLabelText("What happened");
    await userEvent.type(input, "Home");
    await userEvent.click(
      screen.getByRole("button", {
        name: "Create it and find its photographs",
      }),
    );
    expect(input).toHaveValue("Home");
    expect(await screen.findByRole("alert")).toHaveTextContent(/date|day/i);
  });
  it("offers multi-day date fields without inventing capture dates", async () => {
    respondWith({
      "GET /api/milestones": {
        body: { milestones: [], nextCursor: null },
        status: 200,
      },
    });
    renderAt("/milestones?mode=create");
    await userEvent.click(
      await screen.findByRole("switch", {
        name: /It ran over more than one day/,
      }),
    );
    await waitFor(() => {
      return expect(screen.getByText("When it ran")).toBeVisible();
    });
  });
});
