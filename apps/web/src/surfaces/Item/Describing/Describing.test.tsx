import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import {
  ITEM_ID,
  makeItemDetail,
  OTHER_UPLOADER_CAPABILITIES,
} from "@/testing/itemFixtures";
import {
  recordedBodyOf,
  renderItem,
  respondWithItem,
} from "@/testing/itemHarness";

const EDITABLE = makeItemDetail({ capabilities: OTHER_UPLOADER_CAPABILITIES });

/** The sheet and its field. */
async function _field() {
  const sheet = await screen.findByRole("region", { name: "Describing it" });
  return {
    sheet,
    field: within(sheet).getByRole("textbox", {
      name: "Describe this photograph",
    }),
  };
}

describe("describing it", () => {
  it("starts empty while there is no override, and quotes what is read out instead", async () => {
    respondWithItem(EDITABLE);
    renderItem(ITEM_ID);

    const { sheet, field } = await _field();
    expect(field).toHaveValue("");
    expect(
      within(sheet).getByText(/“Mateo, Papá and Mamá, 14 September 2026”/),
    ).toBeVisible();
  });

  it("starts from the override, never from the generated line", async () => {
    respondWithItem(
      makeItemDetail({
        capabilities: OTHER_UPLOADER_CAPABILITIES,
        altTextOverride: "Papá in scrubs holding Mateo",
        media: { ...EDITABLE.media, altText: "Papá in scrubs holding Mateo" },
      }),
    );
    renderItem(ITEM_ID);

    const { field } = await _field();
    expect(field).toHaveValue("Papá in scrubs holding Mateo");
  });

  it("saves a description, and the photograph reads it out", async () => {
    respondWithItem(EDITABLE, {
      [`PATCH /api/items/${ITEM_ID}`]: {
        body: makeItemDetail({
          capabilities: OTHER_UPLOADER_CAPABILITIES,
          altTextOverride: "Papá in scrubs holding Mateo",
          media: { ...EDITABLE.media, altText: "Papá in scrubs holding Mateo" },
        }),
        status: 200,
      },
    });
    renderItem(ITEM_ID);

    const { sheet, field } = await _field();
    expect(
      within(sheet).getByRole("button", { name: "Save the description" }),
    ).toBeDisabled();
    await userEvent.type(field, "Papá in scrubs holding Mateo");
    await userEvent.click(
      within(sheet).getByRole("button", { name: "Save the description" }),
    );

    expect(
      await screen.findByRole("img", { name: "Papá in scrubs holding Mateo" }),
    ).toBeVisible();
    expect(recordedBodyOf(`PATCH /api/items/${ITEM_ID}`)).toEqual({
      altText: "Papá in scrubs holding Mateo",
    });
  });

  it("clears the override back to the generated line with a null", async () => {
    respondWithItem(
      makeItemDetail({
        capabilities: OTHER_UPLOADER_CAPABILITIES,
        altTextOverride: "Papá in scrubs",
      }),
      { [`PATCH /api/items/${ITEM_ID}`]: { body: EDITABLE, status: 200 } },
    );
    renderItem(ITEM_ID);

    const { sheet, field } = await _field();
    await userEvent.clear(field);
    await userEvent.click(
      within(sheet).getByRole("button", { name: "Save the description" }),
    );

    await waitFor(() => {
      expect(recordedBodyOf(`PATCH /api/items/${ITEM_ID}`)).toEqual({
        altText: null,
      });
    });
  });
});
