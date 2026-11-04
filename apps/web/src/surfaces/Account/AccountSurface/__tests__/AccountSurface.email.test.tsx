import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { renderAccount, respondWith } from "./accountSurfaceTestHelpers";

beforeEach(() => {
  vi.spyOn(window, "scrollTo").mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

it("opens and focuses the explicit email preference without changing it", async () => {
  respondWith();
  renderAccount("/account?email=comment-tag");
  const toggle = await screen.findByLabelText("Comment tags");
  await waitFor(() => {
    expect(toggle).toHaveFocus();
  });
  expect(toggle).toHaveValue("immediate");
  const requests = vi.mocked(fetch).mock.calls;
  expect(
    requests.some(([, init]) => {
      return init?.method === "PATCH";
    }),
  ).toBe(false);
});

it("ignores arbitrary preference targets", async () => {
  respondWith();
  const router = renderAccount("/account?email=https%3A%2F%2Fevil.example");
  const toggle = await screen.findByLabelText("Comment tags");
  expect(toggle).not.toHaveFocus();
  expect(router.state.matches.at(-1)?.search).toHaveProperty(
    "email",
    undefined,
  );
});

it("keeps the preference destination through sign-in", async () => {
  respondWith({
    "GET /api/me": { body: { error: "unauthorized" }, status: 401 },
  });
  const router = renderAccount("/account?email=comment-tag");
  await waitFor(() => {
    expect(router.state.location.pathname).toBe("/sign-in");
  });
  expect(router.state.location.search.redirect).toBe(
    "/account?email=comment-tag",
  );
});

it("rolls back a failed tag preference save and retains focus at the affected row", async () => {
  respondWith({
    "PATCH /api/me": {
      body: { error: "internal_error", message: "Failed" },
      status: 500,
    },
  });
  renderAccount("/account?email=comment-tag");
  const toggle = await screen.findByLabelText("Comment tags");
  await userEvent.setup().selectOptions(toggle, "off");
  await screen.findByText("That did not save. Try again.");
  expect(toggle).toHaveValue("immediate");
  expect(toggle).toHaveFocus();
});
