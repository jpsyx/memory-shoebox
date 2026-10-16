import { makeMilestoneDetailFromOverrides } from "@/testing/askingAndOccasionsFixtureHelpers";
import {
  getRecordedBodyFromRequest,
  recordedRequests,
} from "@/testing/surfaceHarnessHelpers";
import type { DirectoryPerson } from "@memory-shoebox/shared";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { renderTimeline } from "./timelineSurfaceTestHelpers";
import {
  answerBulkTimeline,
  BULK_ITEM_IDS,
  tickBothTimelinePhotos,
} from "./timelineBulkTestHelpers";

const FIRST_PERSON_ID = "018f0000-0000-7000-8000-00000000e001";
const SECOND_PERSON_ID = "018f0000-0000-7000-8000-00000000e002";
const BULK_PATH = "POST /api/items/bulk-edit";

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

function _makePerson(
  personId: string,
  displayName: string,
  itemCount: number,
): DirectoryPerson {
  return {
    person: { personId, displayName },
    itemCount,
    firstCapturedOn: "2026-09-01",
    lastCapturedOn: "2026-09-02",
    face: null,
  };
}

async function _openPeople(people: readonly DirectoryPerson[]): Promise<void> {
  answerBulkTimeline({
    "GET /api/people": {
      body: { people, peopleCount: people.length, nextCursor: null },
      status: 200,
    },
  });
  renderTimeline();
  await tickBothTimelinePhotos();
  await userEvent.click(screen.getByRole("button", { name: "Tag somebody" }));
  await waitFor(() => {
    expect(screen.queryByText("Loading people…")).not.toBeInTheDocument();
  });
}

describe("timeline bulk labels and occasions", () => {
  it("carries a known person by ID and an explicitly accepted new name", async () => {
    await _openPeople([_makePerson(FIRST_PERSON_ID, "Elena", 3)]);
    const input = screen.getByRole("combobox", { name: "Who is in them" });
    await userEvent.type(input, "Elena{Enter}");
    await userEvent.type(input, "Abuela Rosa{Enter}");
    expect(recordedRequests()).not.toContain(BULK_PATH);
    await userEvent.click(screen.getByRole("button", { name: "Tag all 2" }));
    await waitFor(() => {
      expect(getRecordedBodyFromRequest(BULK_PATH)).toEqual({
        action: "people",
        itemIds: BULK_ITEM_IDS,
        people: [{ personId: FIRST_PERSON_ID }, { displayName: "Abuela Rosa" }],
      });
    });
  });

  it("requires an explicit ID choice when two people have the same name", async () => {
    await _openPeople([
      _makePerson(FIRST_PERSON_ID, "Alex", 3),
      _makePerson(SECOND_PERSON_ID, "Alex", 8),
    ]);
    await userEvent.type(
      screen.getByRole("combobox", { name: "Who is in them" }),
      "Alex{Enter}",
    );
    await userEvent.click(screen.getByRole("button", { name: "Tag all 2" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Choose which Alex",
    );
    expect(recordedRequests()).not.toContain(BULK_PATH);
    await userEvent.click(
      screen.getByRole("combobox", { name: "Which Alex?" }),
    );
    await userEvent.click(
      screen.getByRole("option", {
        name: `Alex, 8 photographs (${SECOND_PERSON_ID})`,
      }),
    );
    await userEvent.click(screen.getByRole("button", { name: "Tag all 2" }));
    await waitFor(() => {
      expect(getRecordedBodyFromRequest(BULK_PATH)).toEqual({
        action: "people",
        itemIds: BULK_ITEM_IDS,
        people: [{ personId: SECOND_PERSON_ID }],
      });
    });
  });

  it("attaches the chosen milestone to the frozen selection without date edits", async () => {
    const milestone = makeMilestoneDetailFromOverrides();
    answerBulkTimeline({
      "GET /api/milestones": {
        body: { milestones: [milestone], nextCursor: null },
        status: 200,
      },
    });
    renderTimeline();
    await tickBothTimelinePhotos();
    await userEvent.click(
      screen.getByRole("button", { name: "Put under a milestone" }),
    );
    expect(screen.getByRole("button", { name: "Attach 2" })).toBeDisabled();
    await userEvent.click(
      await screen.findByRole("button", { name: /Home.*1 attached/ }),
    );
    expect(recordedRequests()).not.toContain(BULK_PATH);
    await userEvent.click(screen.getByRole("button", { name: "Attach 2" }));
    await waitFor(() => {
      expect(getRecordedBodyFromRequest(BULK_PATH)).toEqual({
        action: "milestone",
        itemIds: BULK_ITEM_IDS,
        milestoneId: milestone.milestone.milestoneId,
      });
    });
  });

  it.each([
    {
      action: "Add a tag",
      path: "/api/tags",
      input: "Tags",
      submit: "Tag all 2",
    },
    {
      action: "Tag somebody",
      path: "/api/people",
      input: "Who is in them",
      submit: "Tag all 2",
    },
  ])(
    "blocks $action submissions after its directory fails",
    async ({ action, path, input, submit }) => {
      answerBulkTimeline({
        [`GET ${path}`]: {
          body: { error: "unavailable", message: "Unavailable" },
          status: 503,
        },
      });
      renderTimeline();
      await tickBothTimelinePhotos();
      await userEvent.click(screen.getByRole("button", { name: action }));
      expect(await screen.findByRole("alert")).toHaveTextContent(
        "directory could not be loaded",
      );
      await userEvent.type(
        screen.getByRole("combobox", { name: input }),
        "New name{Enter}",
      );
      expect(screen.getByRole("button", { name: submit })).toBeDisabled();
      expect(screen.getByRole("button", { name: "Retry list" })).toBeEnabled();
      expect(recordedRequests()).not.toContain(BULK_PATH);
    },
  );

  it("blocks occasion attachment after the milestone directory fails", async () => {
    answerBulkTimeline({
      "GET /api/milestones": {
        body: { error: "unavailable", message: "Unavailable" },
        status: 503,
      },
    });
    renderTimeline();
    await tickBothTimelinePhotos();
    await userEvent.click(
      screen.getByRole("button", { name: "Put under a milestone" }),
    );
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Milestones could not be loaded",
    );
    expect(screen.getByRole("button", { name: "Attach 2" })).toBeDisabled();
    expect(
      screen.getByRole("button", { name: "Retry milestones" }),
    ).toBeEnabled();
    expect(recordedRequests()).not.toContain(BULK_PATH);
  });
});
