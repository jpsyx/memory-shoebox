import { openItemDetails } from "@/testing/openItemDetails";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { LIMITS } from "@memory-shoebox/shared";
import {
  ITEM_ID,
  makeItemDetail,
  OTHER_UPLOADER_CAPABILITIES,
  PERSON_MATEO_ID,
} from "@/testing/itemFixtureHelpers";
import {
  getRecordedCountFromLine,
  getRecordedBodyFromRequest,
  renderItem,
  respondWithItem,
} from "@/testing/itemHarnessHelpers";

const PEOPLE_PUT = `PUT /api/items/${ITEM_ID}/people`;

const TAGS_PUT = `PUT /api/items/${ITEM_ID}/tags`;

const EDITABLE = makeItemDetail({ capabilities: OTHER_UPLOADER_CAPABILITIES });

/** An id for the nth of many, so a full set parses. */
function _idFromIndex(index: number): string {
  return `018f0000-0000-7000-8000-${String(index).padStart(12, "0")}`;
}

describe("focus in and out of the editors", () => {
  it("moves into the people field as it opens, and back as it closes", async () => {
    respondWithItem({ detail: EDITABLE });
    renderItem(ITEM_ID);
    await openItemDetails();

    await userEvent.click(
      await screen.findByRole("button", { name: "+ Tag somebody" }),
    );
    expect(
      screen.getByRole("combobox", { name: "Who is in it" }),
    ).toHaveFocus();

    await userEvent.click(screen.getByRole("button", { name: "Done" }));
    expect(
      screen.getByRole("button", { name: "+ Tag somebody" }),
    ).toHaveFocus();
  });

  it("moves into the tags field as it opens, and back as it closes", async () => {
    respondWithItem({ detail: EDITABLE });
    renderItem(ITEM_ID);
    await openItemDetails();

    await userEvent.click(
      await screen.findByRole("button", { name: "+ Add a tag" }),
    );
    expect(screen.getByRole("combobox", { name: "Tags" })).toHaveFocus();

    await userEvent.click(screen.getByRole("button", { name: "Done" }));
    expect(screen.getByRole("button", { name: "+ Add a tag" })).toHaveFocus();
  });
});

describe("the caps, and a change that changes nothing", () => {
  it("says so at the people cap, and saves nobody past it", async () => {
    respondWithItem({
      detail: makeItemDetail({
        capabilities: OTHER_UPLOADER_CAPABILITIES,
        people: Array.from({ length: LIMITS.itemMaxPeople }, (_, index) => {
          return {
            personId: _idFromIndex(index),
            displayName: `Cousin ${index + 1}`,
          };
        }),
      }),
    });
    renderItem(ITEM_ID);
    await openItemDetails();

    await userEvent.click(
      await screen.findByRole("button", { name: "+ Tag somebody" }),
    );
    expect(
      screen.getByText("Thirty people is as many as one photograph can carry."),
    ).toBeVisible();

    await userEvent.type(
      screen.getByRole("combobox", { name: "Who is in it" }),
      "Rosa{enter}",
    );
    expect(getRecordedCountFromLine(PEOPLE_PUT)).toBe(0);
  });

  it("says so at the tag cap", async () => {
    respondWithItem({
      detail: makeItemDetail({
        capabilities: OTHER_UPLOADER_CAPABILITIES,
        tags: Array.from({ length: LIMITS.itemMaxTags }, (_, index) => {
          return { tagId: _idFromIndex(index), name: `tag ${index + 1}` };
        }),
      }),
    });
    renderItem(ITEM_ID);
    await openItemDetails();

    await userEvent.click(
      await screen.findByRole("button", { name: "+ Add a tag" }),
    );
    expect(
      screen.getByText("Fifty tags is as many as one photograph can carry."),
    ).toBeVisible();
  });

  it("saves no tags for a repeat typed with a comma", async () => {
    respondWithItem({
      detail: EDITABLE,
      routes: {
        [TAGS_PUT]: { body: EDITABLE, status: 200 },
      },
    });
    renderItem(ITEM_ID);
    await openItemDetails();

    await userEvent.click(
      await screen.findByRole("button", { name: "+ Add a tag" }),
    );
    const field = screen.getByRole("combobox", { name: "Tags" });
    await userEvent.type(field, "Hospital,");
    // A real change after it, so the case waits on something that happens.
    await userEvent.type(field, "beach{enter}");

    await waitFor(() => {
      expect(getRecordedBodyFromRequest(TAGS_PUT)).toEqual({
        tags: ["hospital", "beach"],
      });
    });
    expect(getRecordedCountFromLine(TAGS_PUT)).toBe(1);
  });

  it("saves no people for a repeat typed with a comma", async () => {
    respondWithItem({
      detail: EDITABLE,
      routes: {
        [PEOPLE_PUT]: { body: EDITABLE, status: 200 },
      },
    });
    renderItem(ITEM_ID);
    await openItemDetails();

    await userEvent.click(
      await screen.findByRole("button", { name: "+ Tag somebody" }),
    );
    const field = screen.getByRole("combobox", { name: "Who is in it" });
    await userEvent.type(field, "mateo,");
    await userEvent.type(field, "Rosa{enter}");

    await waitFor(() => {
      expect(getRecordedBodyFromRequest(PEOPLE_PUT)).toEqual({
        people: [{ personId: PERSON_MATEO_ID }, { displayName: "Rosa" }],
      });
    });
    expect(getRecordedCountFromLine(PEOPLE_PUT)).toBe(1);
  });
});
