import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, it } from "vitest";
import { makeMilestoneDetailFromOverrides } from "@/testing/askingAndOccasionsFixtures";
import {
  renderAt,
  respondWith,
  recordedRequests,
} from "@/testing/surfaceHarness";
const detail = makeMilestoneDetailFromOverrides();

it("addresses an unfinished local date, retains words and saves after deliberate correction", async () => {
  respondWith({
    "GET /api/milestones": {
      status: 200,
      body: { milestones: [], nextCursor: null },
    },
    "POST /api/milestones": { status: 201, body: detail },
  });
  renderAt("/milestones?mode=create");
  await userEvent.type(
    await screen.findByLabelText("What happened"),
    "Retained occasion",
  );
  await userEvent.type(
    screen.getByLabelText("A line about it"),
    "Retained words",
  );
  await userEvent.click(
    screen.getByRole("button", { name: "Create it and find its photographs" }),
  );
  const date = screen.getByRole("button", { name: "When it happened" });
  expect(date).toHaveAttribute("aria-invalid", "true");
  expect(date).toHaveAccessibleDescription(/day|date/i);
  expect(screen.getByLabelText("What happened")).toHaveValue(
    "Retained occasion",
  );
  expect(screen.getByLabelText("A line about it")).toHaveValue(
    "Retained words",
  );
  expect(
    recordedRequests().filter((line) => {
      return line.startsWith("POST");
    }),
  ).toHaveLength(0);
  await userEvent.click(date);
  await userEvent.click(
    (await screen.findAllByRole("button", { name: /\d+ \w+ 2026/ }))[15]!,
  );
  await userEvent.click(
    screen.getByRole("button", { name: "Create it and find its photographs" }),
  );
  await waitFor(() => {
    expect(recordedRequests()).toContain("POST /api/milestones");
  });
});

it("associates server name and date refusals with retained controls and allows corrected resubmission", async () => {
  const path = `/api/milestones/${detail.milestone.milestoneId}`;
  respondWith({
    "GET /api/milestones": {
      status: 200,
      body: { milestones: [detail], nextCursor: null },
    },
    [`GET ${path}`]: { status: 200, body: detail },
    [`PATCH ${path}`]: {
      status: 400,
      body: {
        error: "invalid_request",
        message: "Invalid",
        details: {
          fieldErrors: {
            name: ["Choose a more specific name."],
            endsOn: ["Choose the last day again."],
          },
        },
      },
    },
  });
  renderAt(`/milestones?milestone=${detail.milestone.milestoneId}&mode=edit`);
  await userEvent.click(
    await screen.findByRole("button", { name: "Save the changes" }),
  );
  const name = screen.getByLabelText("What happened");
  await waitFor(() => {
    expect(name).toHaveAttribute("aria-invalid", "true");
  });
  expect(name).toHaveAccessibleDescription("Choose a more specific name.");
  expect(name).toHaveValue(detail.milestone.name);
  expect(
    screen.getByRole("button", { name: "When it ran" }),
  ).toHaveAccessibleDescription(/Choose the last day again/);
  await userEvent.clear(name);
  await userEvent.type(name, "Corrected occasion");
  await userEvent.click(
    screen.getByRole("switch", { name: /It ran over more than one day/ }),
  );
  await userEvent.click(
    screen.getByRole("button", { name: "When it happened" }),
  );
  await userEvent.click(
    (await screen.findAllByRole("button", { name: /\d+ \w+ 2026/ }))[16]!,
  );
  respondWith({
    "GET /api/milestones": {
      status: 200,
      body: { milestones: [detail], nextCursor: null },
    },
    [`GET ${path}`]: { status: 200, body: detail },
    [`PATCH ${path}`]: { status: 200, body: detail },
  });
  await userEvent.click(
    screen.getByRole("button", { name: "Save the changes" }),
  );
  await waitFor(() => {
    expect(recordedRequests()).toContain(`PATCH ${path}`);
  });
});
