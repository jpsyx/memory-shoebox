import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import {
  ITEM_ID,
  makeItemDetail,
  OTHER_UPLOADER_CAPABILITIES,
  PERSON_MATEO_ID,
} from "@/testing/itemFixtures";
import {
  recordedBodyOf,
  renderItem,
  respondWithItem,
} from "@/testing/itemHarness";
import type { Answer } from "@/testing/surfaceHarness";

const PEOPLE_PUT = `PUT /api/items/${ITEM_ID}/people`;

const ELENA_ID = "018f0000-0000-7000-8000-00000000e103";

const SOFIA_ID = "018f0000-0000-7000-8000-00000000e102";

/** The people directory: Sofía, and Tío Andrés to show it has arrived. */
const DIRECTORY = {
  people: [
    {
      person: { personId: SOFIA_ID, displayName: "Sofía" },
      itemCount: 3,
      firstCapturedOn: "2026-09-01",
      lastCapturedOn: "2026-09-20",
      face: null,
    },
    {
      person: {
        personId: "018f0000-0000-7000-8000-00000000e104",
        displayName: "Tío Andrés",
      },
      itemCount: 7,
      firstCapturedOn: "2026-09-01",
      lastCapturedOn: "2026-09-20",
      face: null,
    },
  ],
  nextCursor: null,
  peopleCount: 2,
};

const EDITABLE = makeItemDetail({ capabilities: OTHER_UPLOADER_CAPABILITIES });

/** What the first save answers: Elena, now a person with an id. */
const WITH_ELENA = makeItemDetail({
  capabilities: OTHER_UPLOADER_CAPABILITIES,
  people: [
    { personId: PERSON_MATEO_ID, displayName: "Mateo" },
    { personId: ELENA_ID, displayName: "Bisabuela Elena" },
  ],
});

/**
 * Answers one request line from a list, in turn, rather than the same way
 * every time: the harness keys one answer to a route, and a case here needs
 * a save that lands and then one that fails. Every request still goes
 * through the harness's own fetch first, so it is recorded as usual.
 */
function _answerInTurn(line: string, answers: readonly Answer[]): void {
  const harnessFetch = globalThis.fetch;
  let callCount = 0;
  vi.stubGlobal("fetch", async (path: string, init?: RequestInit) => {
    const response = await harnessFetch(path, init);
    if (`${init?.method ?? "GET"} ${path}` !== line) {
      return response;
    }
    const answer = answers[Math.min(callCount, answers.length - 1)];
    callCount += 1;
    await answer?.waitFor;
    return new Response(JSON.stringify(answer?.body), {
      status: answer?.status ?? 500,
      headers: { "content-type": "application/json" },
    });
  });
}

/** Opens the people field and adds two names, the first save still out. */
async function _addTwoNames(): Promise<void> {
  await userEvent.click(
    await screen.findByRole("button", { name: "+ Tag somebody" }),
  );
  const field = screen.getByRole("combobox", { name: "Who is in it" });
  await userEvent.type(field, "Bisabuela Elena{enter}");
  await userEvent.type(field, "Rosa{enter}");
}

describe("people saved one after another", () => {
  it("sends a person the save before made, never a second time by name", async () => {
    let letTheFirstLand = (): void => {};
    respondWithItem(EDITABLE, {
      [PEOPLE_PUT]: {
        body: WITH_ELENA,
        status: 200,
        waitFor: new Promise<void>((settle) => {
          letTheFirstLand = settle;
        }),
      },
    });
    renderItem(ITEM_ID);

    await _addTwoNames();
    letTheFirstLand();

    await waitFor(() => {
      expect(recordedBodyOf(PEOPLE_PUT)).toEqual({
        people: [
          { personId: PERSON_MATEO_ID },
          { personId: ELENA_ID },
          { displayName: "Rosa" },
        ],
      });
    });
  });

  it("puts the field back to what the server has, a save that landed included", async () => {
    let letTheFirstLand = (): void => {};
    respondWithItem(EDITABLE);
    _answerInTurn(PEOPLE_PUT, [
      {
        body: WITH_ELENA,
        status: 200,
        waitFor: new Promise<void>((settle) => {
          letTheFirstLand = settle;
        }),
      },
      { body: { error: "internal", message: "x" }, status: 500 },
    ]);
    renderItem(ITEM_ID);

    await _addTwoNames();
    letTheFirstLand();

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "That did not go through",
    );
    await waitFor(() => {
      expect(screen.queryByText("Rosa")).toBeNull();
    });
    expect(screen.getByText("Bisabuela Elena")).toBeVisible();
  });

  it("keeps the person a name had, tagged, taken off and tagged again", async () => {
    respondWithItem(EDITABLE);
    _answerInTurn(PEOPLE_PUT, [
      { body: WITH_ELENA, status: 200 },
      { body: EDITABLE, status: 200 },
      { body: WITH_ELENA, status: 200 },
    ]);
    renderItem(ITEM_ID);

    await userEvent.click(
      await screen.findByRole("button", { name: "+ Tag somebody" }),
    );
    const field = screen.getByRole("combobox", { name: "Who is in it" });
    await userEvent.type(field, "Bisabuela Elena{enter}");
    await userEvent.type(field, "{backspace}");
    await userEvent.type(field, "Bisabuela Elena{enter}");

    // Off the item by then, and the directory is not asked again under an
    // open editor: only the first save's answer still knows who she is.
    await waitFor(() => {
      expect(recordedBodyOf(PEOPLE_PUT)).toEqual({
        people: [{ personId: PERSON_MATEO_ID }, { personId: ELENA_ID }],
      });
    });
  });

  it("matches a known name against the directory as the save goes out", async () => {
    let letTheDirectoryLand = (): void => {};
    let letTheSavesLand = (): void => {};
    respondWithItem(EDITABLE, {
      "GET /api/people": {
        body: DIRECTORY,
        status: 200,
        waitFor: new Promise<void>((settle) => {
          letTheDirectoryLand = settle;
        }),
      },
      [PEOPLE_PUT]: {
        body: EDITABLE,
        status: 200,
        waitFor: new Promise<void>((settle) => {
          letTheSavesLand = settle;
        }),
      },
    });
    renderItem(ITEM_ID);

    await userEvent.click(
      await screen.findByRole("button", { name: "+ Tag somebody" }),
    );
    const field = screen.getByRole("combobox", { name: "Who is in it" });
    // Rosa's save goes out and is held; Sofía's queues behind it, typed
    // before the directory has said who she is.
    await userEvent.type(field, "Rosa{enter}");
    await userEvent.type(field, "Sofía{enter}");
    letTheDirectoryLand();
    await userEvent.type(field, "Tío");
    await screen.findByRole("option", { name: /Tío Andrés/ });
    letTheSavesLand();

    await waitFor(() => {
      expect(recordedBodyOf(PEOPLE_PUT)).toEqual({
        people: [
          { personId: PERSON_MATEO_ID },
          { displayName: "Rosa" },
          { personId: SOFIA_ID },
        ],
      });
    });
  });
});
