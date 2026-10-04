import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { makeItemSummaryFromOverrides } from "@/testing/askingAndOccasionsFixtures";
import {
  getRecordedBodyFromRequest,
  renderAt,
  respondWith,
} from "@/testing/surfaceHarness";
const ITEM = makeItemSummaryFromOverrides();
const PATH = `/api/items/${ITEM.itemId}/removal-requests`;
describe("optional request words", () => {
  it("retains the original refused draft while sending trimmed optional words", async () => {
    respondWith({
      [`GET ${PATH}`]: {
        status: 200,
        body: {
          item: ITEM,
          nextCursor: null,
          removalRequests: [],
          canRequestRemoval: true,
        },
      },
      [`POST ${PATH}`]: {
        status: 400,
        body: { error: "validation_error", message: "Invalid" },
      },
    });
    renderAt(`/items/${ITEM.itemId}/removal`);
    const input = await screen.findByRole("textbox", {
      name: "Why, if you want to say",
    });
    await userEvent.type(input, "  Keep these words  ");
    await userEvent.click(
      screen.getByRole("button", { name: "Send the request" }),
    );
    expect(await screen.findByRole("alert")).toBeVisible();
    expect(input).toHaveValue("  Keep these words  ");
    expect(getRecordedBodyFromRequest(`POST ${PATH}`)).toEqual({
      reason: "Keep these words",
    });
  });
});
