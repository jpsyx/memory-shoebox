import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import {
  ITEM_ID,
  makeComment,
  makeItemDetail,
  makeVideoDetail,
  OWN_UPLOADER_CAPABILITIES,
  SIGNED_IN,
} from "@/testing/itemFixtureHelpers";
import {
  getRecordedBodyFromRequest,
  getRecordedCountFromLine,
  renderItem,
  respondWithItem,
} from "@/testing/itemHarnessHelpers";

describe("the shared photo and video view", () => {
  it.each(["photo", "video"] as const)(
    "keeps %s details behind More and restores focus without replacing the media",
    async (kind) => {
      const detail = (kind === "photo" ? makeItemDetail : makeVideoDetail)({
        capabilities: OWN_UPLOADER_CAPABILITIES,
      });
      respondWithItem({ detail });
      const { container } = renderItem(ITEM_ID);
      const more = await screen.findByRole("button", {
        name: `More ${kind} details`,
      });
      const media = container.querySelector(
        kind === "photo" ? "main img" : "video",
      );
      expect(
        screen.queryByRole("link", { name: "Download the original" }),
      ).toBeNull();
      await userEvent.click(more);
      const drawer = await screen.findByRole("dialog", {
        name: kind === "photo" ? "Photo details" : "Video details",
      });
      await waitFor(() => {
        expect(
          within(drawer).getByRole("link", { name: "Download the original" }),
        ).toBeVisible();
      });
      await userEvent.keyboard("{Escape}");
      await waitFor(() => {
        return expect(drawer).not.toBeInTheDocument();
      });
      await waitFor(() => {
        return expect(more).toHaveFocus();
      });
      expect(
        container.querySelector(kind === "photo" ? "main img" : "video"),
      ).toBe(media);
      expect(getRecordedCountFromLine(`GET /api/items/${ITEM_ID}`)).toBe(1);
    },
  );

  it("focuses the photo composer from the reaction bar and sends without a video timestamp", async () => {
    respondWithItem({
      detail: makeItemDetail(),
      routes: {
        [`POST /api/items/${ITEM_ID}/comments`]: {
          status: 201,
          body: makeComment({ author: SIGNED_IN, body: "Lovely day." }),
        },
      },
    });
    renderItem(ITEM_ID);
    await userEvent.click(
      await screen.findByRole("button", { name: "Comment on this photo" }),
    );
    const field = screen.getByRole("textbox", { name: "Write a comment" });
    expect(field).toHaveFocus();
    await userEvent.type(field, "Lovely day.");
    await userEvent.keyboard("{Control>}{Enter}{/Control}");
    expect(await screen.findByText("Lovely day.")).toBeVisible();
    expect(
      getRecordedBodyFromRequest(`POST /api/items/${ITEM_ID}/comments`),
    ).toEqual({ body: "Lovely day.", atSeconds: null });
    expect(
      screen.queryByRole("button", { name: /Whole video|Reply to/ }),
    ).toBeNull();
    expect(field).toHaveValue("");
  });
});
