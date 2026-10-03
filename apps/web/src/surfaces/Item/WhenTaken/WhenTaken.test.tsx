import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
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

/** Opens the correction. */
async function _openTheCorrection() {
  const sheet = await screen.findByRole("region", {
    name: "When this was taken",
  });
  await userEvent.click(
    within(sheet).getByRole("button", { name: "Put the date right" }),
  );
  return sheet;
}

/** Picks a day in the date picker. */
async function _pickDay(label: string): Promise<void> {
  await userEvent.click(screen.getByLabelText("The day it was taken"));
  await userEvent.click(await screen.findByRole("button", { name: label }));
}

describe("when it was taken", () => {
  it("says when, and where that came from", async () => {
    respondWithItem(MINE);
    renderItem(ITEM_ID);

    const sheet = await screen.findByRole("region", {
      name: "When this was taken",
    });
    expect(within(sheet).getByText("14 September 2026, 6:41 am")).toBeVisible();
    expect(
      within(sheet).getByText(/^Read off the file itself\./),
    ).toBeVisible();
  });

  it("says what the file said before anything is put right", async () => {
    respondWithItem(MINE);
    renderItem(ITEM_ID);

    const sheet = await _openTheCorrection();
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

  it("warns before moving a frame out of its burst and outside its milestone", async () => {
    respondWithItem(
      makeBurstDetail(
        { position: 7, count: 45 },
        {
          capabilities: OWN_UPLOADER_CAPABILITIES,
          milestones: [
            {
              milestoneId: "018f0000-0000-7000-8000-00000000d201",
              name: "Mateo is here",
              startsOn: "2026-09-14",
              endsOn: "2026-09-14",
              blurb: null,
              spanContainsCapturedOn: true,
              mismatchAcknowledgedAt: null,
            },
          ],
        },
      ),
    );
    renderItem("018f0000-0000-7000-8000-0000000f0007");

    await _openTheCorrection();
    await _pickDay("15 September 2026");

    expect(screen.getByText(/takes it out of its burst/)).toBeVisible();
    expect(screen.getByText(/The other 44 stay where they are/)).toBeVisible();
    expect(screen.getByText("Mateo is here")).toBeVisible();
  });

  it("keeps the clock time by sending only the day", async () => {
    respondWithItem(MINE, {
      [`POST /api/items/${ITEM_ID}/capture-date`]: { body: MINE, status: 200 },
    });
    renderItem(ITEM_ID);

    await _openTheCorrection();
    await _pickDay("15 September 2026");
    await userEvent.click(screen.getByRole("button", { name: "Put it right" }));

    await waitFor(() => {
      expect(recordedBodyOf(`POST /api/items/${ITEM_ID}/capture-date`)).toEqual(
        {
          capturedOn: "2026-09-15",
        },
      );
    });
  });

  it("sends the time only when it was changed", async () => {
    respondWithItem(MINE, {
      [`POST /api/items/${ITEM_ID}/capture-date`]: { body: MINE, status: 200 },
    });
    renderItem(ITEM_ID);

    await _openTheCorrection();
    fireEvent.change(screen.getByLabelText("The time"), {
      target: { value: "07:15" },
    });
    await userEvent.click(screen.getByRole("button", { name: "Put it right" }));

    await waitFor(() => {
      expect(recordedBodyOf(`POST /api/items/${ITEM_ID}/capture-date`)).toEqual(
        {
          capturedOn: "2026-09-14",
          capturedTime: "07:15",
        },
      );
    });
  });

  it("holds Cancel while the correction is out", async () => {
    let letTheCorrectionLand = () => {};
    respondWithItem(MINE, {
      [`POST /api/items/${ITEM_ID}/capture-date`]: {
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
    expect(recordedRequests()).not.toContain(
      `POST /api/items/${ITEM_ID}/capture-date`,
    );
  });
});
