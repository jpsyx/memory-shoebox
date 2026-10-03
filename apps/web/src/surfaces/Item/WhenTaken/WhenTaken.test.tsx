import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AttachedMilestone } from "@memory-shoebox/shared";
import {
  ITEM_ID,
  makeBurstDetail,
  makeItemDetail,
  OWN_UPLOADER_CAPABILITIES,
} from "@/testing/itemFixtures";
import {
  recordedBodyOf,
  recordedRequests,
  renderItem,
  respondWithItem,
} from "@/testing/itemHarness";

const MINE = makeItemDetail({ capabilities: OWN_UPLOADER_CAPABILITIES });

const CAPTURE_DATE = `POST /api/items/${ITEM_ID}/capture-date`;

/**
 * 22:30 UTC on 15 September, which is already 00:30 on the 16th in Madrid,
 * the harness's Shoebox timezone. A "today" read in UTC says the 15th, so the
 * test catches one on every machine; one read on the browser's own clock says
 * the 15th only west of Madrid, so it is caught on machines there.
 */
const NOW = new Date("2026-09-15T22:30:00.000Z");

/** One milestone attached to the item, spanning the day it was taken. */
function _milestone(
  overrides: Partial<AttachedMilestone> = {},
): AttachedMilestone {
  return {
    milestoneId: "018f0000-0000-7000-8000-00000000d201",
    name: "Mateo is here",
    startsOn: "2026-09-14",
    endsOn: "2026-09-14",
    blurb: null,
    spanContainsCapturedOn: true,
    mismatchAcknowledgedAt: null,
    ...overrides,
  };
}

/** The sheet, once the page has drawn it. */
async function _sheet() {
  return screen.findByRole("region", { name: "When this was taken" });
}

/** Opens the correction. */
async function _openTheCorrection() {
  const sheet = await _sheet();
  await userEvent.click(
    within(sheet).getByRole("button", { name: "Put the date right" }),
  );
  return sheet;
}

/** Opens the date picker on the month the field holds. */
async function _openThePicker(): Promise<void> {
  await userEvent.click(screen.getByLabelText("The day it was taken"));
}

/** Picks a day in the date picker. */
async function _pickDay(label: string): Promise<void> {
  await _openThePicker();
  await userEvent.click(await screen.findByRole("button", { name: label }));
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(NOW);
});

afterEach(() => {
  vi.useRealTimers();
});

describe("when it was taken", () => {
  it("says when, and where that came from", async () => {
    respondWithItem(MINE);
    renderItem(ITEM_ID);

    const sheet = await _sheet();
    expect(within(sheet).getByText("14 September 2026, 6:41 am")).toBeVisible();
    expect(
      within(sheet).getByText(/^Read off the file itself\./),
    ).toBeVisible();
  });

  it("says what the file said, after it was put right by hand", async () => {
    respondWithItem(
      makeItemDetail({
        capabilities: OWN_UPLOADER_CAPABILITIES,
        captureSource: "uploader_set",
        capturedAt: "2026-09-15T04:41:00.000Z",
        capturedOn: "2026-09-15",
        originalCapturedAt: "2026-09-14T04:41:00.000Z",
      }),
    );
    renderItem(ITEM_ID);

    const sheet = await _sheet();
    expect(within(sheet).getByText("15 September 2026, 6:41 am")).toBeVisible();
    expect(within(sheet).getByText(/^Put right by hand\./)).toBeVisible();
    await userEvent.click(
      within(sheet).getByRole("button", { name: "Put the date right" }),
    );
    expect(within(sheet).getByText(/The file said/)).toHaveTextContent(
      "The file said 14 September 2026, 6:41 am.",
    );
  });

  it("moves into the day as it opens, and back as it closes", async () => {
    respondWithItem(MINE);
    renderItem(ITEM_ID);

    const sheet = await _openTheCorrection();
    expect(within(sheet).getByLabelText("The day it was taken")).toHaveFocus();

    await userEvent.click(
      within(sheet).getByRole("button", { name: "Cancel" }),
    );
    expect(
      within(sheet).getByRole("button", { name: "Put the date right" }),
    ).toHaveFocus();
  });

  it("offers no day after today in the Shoebox's own timezone", async () => {
    respondWithItem(MINE);
    renderItem(ITEM_ID);

    await _openTheCorrection();
    await _openThePicker();

    expect(
      await screen.findByRole("button", { name: "16 September 2026" }),
    ).toBeEnabled();
    expect(
      screen.getByRole("button", { name: "17 September 2026" }),
    ).toBeDisabled();
  });
});

describe("what moving it will break", () => {
  it("announces nothing while the day has not moved", async () => {
    respondWithItem(
      makeBurstDetail(
        { position: 7, count: 45 },
        { capabilities: OWN_UPLOADER_CAPABILITIES },
      ),
    );
    renderItem("018f0000-0000-7000-8000-0000000f0007");

    const sheet = await _openTheCorrection();
    expect(within(sheet).getByRole("status")).toBeEmptyDOMElement();
  });

  it("warns before moving a frame out of its burst and outside its milestone", async () => {
    respondWithItem(
      makeBurstDetail(
        { position: 7, count: 45 },
        { capabilities: OWN_UPLOADER_CAPABILITIES, milestones: [_milestone()] },
      ),
    );
    renderItem("018f0000-0000-7000-8000-0000000f0007");

    const sheet = await _openTheCorrection();
    await _pickDay("15 September 2026");

    const status = within(sheet).getByRole("status");
    expect(status).toHaveTextContent(
      "Moving it off 14 September takes it out of its burst.",
    );
    expect(status).toHaveTextContent(/The other 44 stay where they are\./);
    expect(status).toHaveTextContent(
      "It also falls outside Mateo is here, and stays attached to it.",
    );
  });

  it("names only a milestone the move takes it out of, in a sentence of its own", async () => {
    respondWithItem(
      makeItemDetail({
        capabilities: OWN_UPLOADER_CAPABILITIES,
        milestones: [
          _milestone(),
          _milestone({
            milestoneId: "018f0000-0000-7000-8000-00000000d202",
            name: "The first week",
            startsOn: "2026-09-16",
            endsOn: "2026-09-20",
            spanContainsCapturedOn: false,
          }),
        ],
      }),
    );
    renderItem(ITEM_ID);

    const sheet = await _openTheCorrection();
    await _pickDay("15 September 2026");

    expect(within(sheet).getByRole("status").textContent).toBe(
      "It falls outside Mateo is here, and stays attached to it.",
    );
  });
});

describe("putting the date right", () => {
  it("keeps the clock time by sending only the day", async () => {
    respondWithItem(MINE, {
      [CAPTURE_DATE]: { body: MINE, status: 200 },
    });
    renderItem(ITEM_ID);

    await _openTheCorrection();
    await _pickDay("15 September 2026");
    await userEvent.click(screen.getByRole("button", { name: "Put it right" }));

    await waitFor(() => {
      expect(recordedBodyOf(CAPTURE_DATE)).toEqual({
        capturedOn: "2026-09-15",
      });
    });
  });

  it("sends the time only when it was changed", async () => {
    respondWithItem(MINE, {
      [CAPTURE_DATE]: { body: MINE, status: 200 },
    });
    renderItem(ITEM_ID);

    await _openTheCorrection();
    fireEvent.change(screen.getByLabelText("The time"), {
      target: { value: "07:15" },
    });
    await userEvent.click(screen.getByRole("button", { name: "Put it right" }));

    await waitFor(() => {
      expect(recordedBodyOf(CAPTURE_DATE)).toEqual({
        capturedOn: "2026-09-14",
        capturedTime: "07:15",
      });
    });
  });

  it("holds the fields and Cancel while the correction is out", async () => {
    let letTheCorrectionLand = () => {};
    respondWithItem(MINE, {
      [CAPTURE_DATE]: {
        body: { ...MINE, capturedOn: "2026-09-15" },
        status: 200,
        waitFor: new Promise<void>((settle) => {
          letTheCorrectionLand = settle;
        }),
      },
    });
    renderItem(ITEM_ID);

    const sheet = await _openTheCorrection();
    await _pickDay("15 September 2026");
    await userEvent.click(
      within(sheet).getByRole("button", { name: "Put it right" }),
    );

    expect(within(sheet).getByLabelText("The day it was taken")).toBeDisabled();
    expect(within(sheet).getByLabelText("The time")).toBeDisabled();
    expect(
      within(sheet).getByRole("button", { name: "Cancel" }),
    ).toBeDisabled();
    letTheCorrectionLand();
    expect(
      await within(sheet).findByRole("button", { name: "Put the date right" }),
    ).toHaveFocus();
  });

  it("asks nothing when nothing was changed", async () => {
    respondWithItem(MINE);
    renderItem(ITEM_ID);

    const sheet = await _openTheCorrection();
    await userEvent.click(
      within(sheet).getByRole("button", { name: "Put it right" }),
    );

    expect(
      within(sheet).getByRole("button", { name: "Put the date right" }),
    ).toBeVisible();
    expect(recordedRequests()).not.toContain(CAPTURE_DATE);
  });
});
