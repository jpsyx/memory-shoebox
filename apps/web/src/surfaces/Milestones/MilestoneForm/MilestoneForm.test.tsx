import { makeMilestoneDetailFromOverrides } from "@/testing/askingAndOccasionsFixtureHelpers";
import { renderAt, respondWith } from "@/testing/surfaceHarness";
import { MantineProvider } from "@mantine/core";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import { MilestoneForm } from "./MilestoneForm";
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
  it("shows span date controls when multi-day is selected", async () => {
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

describe("I1: retained form presentation", () => {
  it("shows retained fields while unusable current authority disables submit", async () => {
    const queryClient = new QueryClient();
    const wrapper = ({ children }: { children: ReactNode }) => {
      return (
        <QueryClientProvider client={queryClient}>
          <MantineProvider>{children}</MantineProvider>
        </QueryClientProvider>
      );
    };
    const options = {
      detail: makeMilestoneDetailFromOverrides(),
      onSaved: vi.fn(),
      onCancel: vi.fn(),
      hasUsableAuthority: true,
    };
    const { rerender } = render(<MilestoneForm {...options} />, { wrapper });
    const name = screen.getByLabelText("What happened");
    await userEvent.clear(name);
    await userEvent.type(name, "Kept words");
    rerender(<MilestoneForm {...options} hasUsableAuthority={false} />);
    expect(screen.getByLabelText("What happened")).toBe(name);
    expect(name).toHaveValue("Kept words");
    expect(
      screen.getByRole("button", { name: "Save the changes" }),
    ).toBeDisabled();
    expect(screen.getByRole("button", { name: "Cancel" })).toBeEnabled();
    rerender(<MilestoneForm {...options} />);
    expect(name).toHaveValue("Kept words");
    expect(
      screen.getByRole("button", { name: "Save the changes" }),
    ).toBeEnabled();
  });
});
