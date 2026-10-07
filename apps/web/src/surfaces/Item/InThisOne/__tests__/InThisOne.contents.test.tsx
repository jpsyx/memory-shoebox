import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import {
  ITEM_ID,
  makeItemDetail,
  OTHER_UPLOADER_CAPABILITIES,
  PERSON_ELENA_ID,
  PERSON_MATEO_ID,
  PERSON_SOFIA_ID,
  TAG_HOSPITAL_ID,
} from "@/testing/itemFixtureHelpers";
import {
  getRecordedBodyFromRequest,
  renderItem,
  respondWithItem,
} from "@/testing/itemHarnessHelpers";
import type { PeopleResponse } from "@memory-shoebox/shared";

const DIRECTORY: PeopleResponse = {
  people: [
    {
      person: { personId: PERSON_SOFIA_ID, displayName: "Sofía" },
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
    respondWithItem({ detail: makeItemDetail() });
    renderItem(ITEM_ID);

    expect(await screen.findByRole("link", { name: "Mateo" })).toHaveAttribute(
      "href",
      `/?person=${PERSON_MATEO_ID}`,
    );
    expect(screen.getByRole("link", { name: "hospital" })).toHaveAttribute(
      "href",
      `/?tag=${TAG_HOSPITAL_ID}`,
    );
  });

  it("offers no editor to somebody the server says cannot", async () => {
    respondWithItem({ detail: makeItemDetail() });
    renderItem(ITEM_ID);

    await screen.findByRole("link", { name: "Mateo" });
    expect(screen.queryByRole("button", { name: "+ Tag somebody" })).toBeNull();
    expect(screen.queryByRole("button", { name: "+ Add a tag" })).toBeNull();
  });

  it("announces the two openers as buttons rather than toggles", async () => {
    respondWithItem({ detail: EDITABLE });
    renderItem(ITEM_ID);

    expect(
      await screen.findByRole("button", { name: "+ Tag somebody" }),
    ).not.toHaveAttribute("aria-pressed");
    expect(
      screen.getByRole("button", { name: "+ Add a tag" }),
    ).not.toHaveAttribute("aria-pressed");
  });

  it("tags somebody new by name, and the alt text follows in the same answer", async () => {
    const answer = makeItemDetail({
      capabilities: OTHER_UPLOADER_CAPABILITIES,
      people: [
        { personId: PERSON_MATEO_ID, displayName: "Mateo" },
        { personId: PERSON_ELENA_ID, displayName: "Bisabuela Elena" },
      ],
      media: {
        ...EDITABLE.media,
        altText: "Mateo and Bisabuela Elena, 14 September 2026",
      },
    });
    respondWithItem({
      detail: EDITABLE,
      routes: {
        "GET /api/people": { body: DIRECTORY, status: 200 },
        [`PUT /api/items/${ITEM_ID}/people`]: { body: answer, status: 200 },
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

    await waitFor(() => {
      expect(
        getRecordedBodyFromRequest(`PUT /api/items/${ITEM_ID}/people`),
      ).toEqual({
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
    respondWithItem({
      detail: EDITABLE,
      routes: {
        "GET /api/people": { body: DIRECTORY, status: 200 },
        [`PUT /api/items/${ITEM_ID}/people`]: { body: EDITABLE, status: 200 },
      },
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
      expect(
        getRecordedBodyFromRequest(`PUT /api/items/${ITEM_ID}/people`),
      ).toEqual({
        people: [{ personId: PERSON_MATEO_ID }, { personId: PERSON_SOFIA_ID }],
      });
    });
  });

  it("puts the people back, and says so, when the save fails", async () => {
    respondWithItem({
      detail: EDITABLE,
      routes: {
        [`PUT /api/items/${ITEM_ID}/people`]: {
          body: { error: "internal", message: "x" },
          status: 500,
        },
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
    expect(screen.getByText("Mateo")).toBeVisible();
  });

  it("replaces the tag set as a tag is added", async () => {
    respondWithItem({
      detail: EDITABLE,
      routes: {
        [`PUT /api/items/${ITEM_ID}/tags`]: { body: EDITABLE, status: 200 },
      },
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
      expect(
        getRecordedBodyFromRequest(`PUT /api/items/${ITEM_ID}/tags`),
      ).toEqual({
        tags: ["hospital", "beach"],
      });
    });
  });

  it("puts the tags back, and says so, when the save fails", async () => {
    respondWithItem({
      detail: EDITABLE,
      routes: {
        [`PUT /api/items/${ITEM_ID}/tags`]: {
          body: { error: "internal", message: "x" },
          status: 500,
        },
      },
    });
    renderItem(ITEM_ID);

    await userEvent.click(
      await screen.findByRole("button", { name: "+ Add a tag" }),
    );
    await userEvent.type(
      screen.getByRole("combobox", { name: "Tags" }),
      "beach{enter}",
    );

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "That did not go through",
    );
    await waitFor(() => {
      expect(screen.queryByText("beach")).toBeNull();
    });
    expect(screen.getByText("hospital")).toBeVisible();
  });

  it("sends the smaller set as a tag is taken off", async () => {
    const twoTags = makeItemDetail({
      capabilities: OTHER_UPLOADER_CAPABILITIES,
      tags: [
        { tagId: TAG_HOSPITAL_ID, name: "hospital" },
        { tagId: "018f0000-0000-7000-8000-00000000e202", name: "beach" },
      ],
    });
    respondWithItem({
      detail: twoTags,
      routes: {
        [`PUT /api/items/${ITEM_ID}/tags`]: { body: EDITABLE, status: 200 },
      },
    });
    renderItem(ITEM_ID);

    await userEvent.click(
      await screen.findByRole("button", { name: "+ Add a tag" }),
    );
    // Backspace in an empty field takes off the last pill: the pill's own
    // cross is hidden from assistive technology, so this is the way in.
    await userEvent.type(
      screen.getByRole("combobox", { name: "Tags" }),
      "{backspace}",
    );

    await waitFor(() => {
      expect(
        getRecordedBodyFromRequest(`PUT /api/items/${ITEM_ID}/tags`),
      ).toEqual({
        tags: ["hospital"],
      });
    });
  });
});
