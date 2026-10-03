import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import {
  ITEM_ID,
  makeItemDetail,
  OTHER_UPLOADER_CAPABILITIES,
  PERSON_MATEO_ID,
  TAG_HOSPITAL_ID,
} from "@/testing/itemFixtures";
import {
  recordedBodyOf,
  renderItem,
  respondWithItem,
} from "@/testing/itemHarness";

const SOFIA_ID = "018f0000-0000-7000-8000-00000000e102";

const DIRECTORY = {
  people: [
    {
      person: { personId: SOFIA_ID, displayName: "Sofía" },
      itemCount: 3,
      firstCapturedOn: "2026-09-01",
      lastCapturedOn: "2026-09-20",
      face: null,
    },
  ],
  nextCursor: null,
  peopleCount: 1,
};

const EDITABLE = makeItemDetail({ capabilities: OTHER_UPLOADER_CAPABILITIES });

describe("who and what is in it", () => {
  it("links each person and tag to the pile filtered by them", async () => {
    respondWithItem(makeItemDetail());
    renderItem(ITEM_ID);

    expect(await screen.findByRole("link", { name: "Mateo" })).toHaveAttribute(
      "href",
      `/?person=${PERSON_MATEO_ID}`,
    );
    expect(screen.getByRole("link", { name: "hospital" })).toHaveAttribute(
      "href",
      `/?tag=${TAG_HOSPITAL_ID}`,
    );
    expect(screen.getByText(/never says who may open it/)).toBeVisible();
  });

  it("offers no editor to somebody the server says cannot", async () => {
    respondWithItem(makeItemDetail());
    renderItem(ITEM_ID);

    await screen.findByRole("link", { name: "Mateo" });
    expect(screen.queryByRole("button", { name: "+ Tag somebody" })).toBeNull();
    expect(screen.queryByRole("button", { name: "+ Add a tag" })).toBeNull();
  });

  it("tags somebody new by name, and the alt text follows in the same answer", async () => {
    const answer = makeItemDetail({
      capabilities: OTHER_UPLOADER_CAPABILITIES,
      people: [
        { personId: PERSON_MATEO_ID, displayName: "Mateo" },
        {
          personId: "018f0000-0000-7000-8000-00000000e103",
          displayName: "Bisabuela Elena",
        },
      ],
      media: {
        ...EDITABLE.media,
        altText: "Mateo and Bisabuela Elena, 14 September 2026",
      },
    });
    respondWithItem(EDITABLE, {
      "GET /api/people": { body: DIRECTORY, status: 200 },
      [`PUT /api/items/${ITEM_ID}/people`]: { body: answer, status: 200 },
    });
    renderItem(ITEM_ID);

    await userEvent.click(
      await screen.findByRole("button", { name: "+ Tag somebody" }),
    );
    await userEvent.type(
      screen.getByRole("combobox", { name: "Who is in it" }),
      "Bisabuela Elena{enter}",
    );

    await waitFor(() => {
      expect(recordedBodyOf(`PUT /api/items/${ITEM_ID}/people`)).toEqual({
        people: [
          { personId: PERSON_MATEO_ID },
          { displayName: "Bisabuela Elena" },
        ],
      });
    });
    expect(
      await screen.findByRole("img", {
        name: "Mateo and Bisabuela Elena, 14 September 2026",
      }),
    ).toBeVisible();
  });

  it("tags somebody the archive knows by id", async () => {
    respondWithItem(EDITABLE, {
      "GET /api/people": { body: DIRECTORY, status: 200 },
      [`PUT /api/items/${ITEM_ID}/people`]: { body: EDITABLE, status: 200 },
    });
    renderItem(ITEM_ID);

    await userEvent.click(
      await screen.findByRole("button", { name: "+ Tag somebody" }),
    );
    // Typed in two halves, so the name only lands once the directory has: the
    // option appearing is what says the archive knows her.
    const field = screen.getByRole("combobox", { name: "Who is in it" });
    await userEvent.type(field, "Sof");
    await screen.findByRole("option", { name: /Sofía/ });
    await userEvent.type(field, "ía{enter}");

    await waitFor(() => {
      expect(recordedBodyOf(`PUT /api/items/${ITEM_ID}/people`)).toEqual({
        people: [{ personId: PERSON_MATEO_ID }, { personId: SOFIA_ID }],
      });
    });
  });

  it("puts the people back, and says so, when the save fails", async () => {
    respondWithItem(EDITABLE, {
      [`PUT /api/items/${ITEM_ID}/people`]: {
        body: { error: "internal", message: "x" },
        status: 500,
      },
    });
    renderItem(ITEM_ID);

    await userEvent.click(
      await screen.findByRole("button", { name: "+ Tag somebody" }),
    );
    await userEvent.type(
      screen.getByRole("combobox", { name: "Who is in it" }),
      "Bisabuela Elena{enter}",
    );

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "That did not go through",
    );
    await waitFor(() => {
      expect(screen.queryByText("Bisabuela Elena")).toBeNull();
    });
  });

  it("replaces the tag set as a tag is added", async () => {
    respondWithItem(EDITABLE, {
      [`PUT /api/items/${ITEM_ID}/tags`]: { body: EDITABLE, status: 200 },
    });
    renderItem(ITEM_ID);

    await userEvent.click(
      await screen.findByRole("button", { name: "+ Add a tag" }),
    );
    await userEvent.type(
      screen.getByRole("combobox", { name: "Tags" }),
      "beach{enter}",
    );

    await waitFor(() => {
      expect(recordedBodyOf(`PUT /api/items/${ITEM_ID}/tags`)).toEqual({
        tags: ["hospital", "beach"],
      });
    });
  });
});
