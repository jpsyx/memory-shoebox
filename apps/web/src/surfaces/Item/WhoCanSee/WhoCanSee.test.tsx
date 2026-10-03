import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import {
  ITEM_ID,
  JUST_ME_VISIBILITY,
  makeItemDetail,
  OWN_UPLOADER_CAPABILITIES,
  SIGNED_IN,
} from "@/testing/itemFixtureHelpers";
import {
  getRecordedCountFromLine,
  getRecordedBodyFromRequest,
  recordedRequests,
  renderItem,
  respondWithItem,
} from "@/testing/itemHarnessHelpers";

const RULE_ID = "018f0000-0000-7000-8000-0000000a0201";

const COUSINS_ID = "018f0000-0000-7000-8000-0000000a0002";

const RESOLVE = "POST /api/visibility-rules/resolve";

const MINE = makeItemDetail({ capabilities: OWN_UPLOADER_CAPABILITIES });

/** The sheet, once the page has drawn it. */
async function _sheet(): Promise<HTMLElement> {
  return screen.findByRole("region", { name: "Who can see this" });
}

/** Opens the editor, chooses Only and names one subject from the list. */
async function _chooseOnly(
  options: Readonly<{ sheet: HTMLElement; subject: string | RegExp }>,
): Promise<void> {
  const { sheet, subject } = options;
  await userEvent.click(
    within(sheet).getByRole("button", { name: "Change who can see it" }),
  );
  await userEvent.click(within(sheet).getByRole("radio", { name: "Only" }));
  await userEvent.click(within(sheet).getByLabelText("Only these"));
  await userEvent.click(await screen.findByRole("option", { name: subject }));
}

describe("who can see it", () => {
  it("says who can see it, in words, to the item's own uploader", async () => {
    respondWithItem({ detail: MINE });
    renderItem(ITEM_ID);

    const sheet = await _sheet();
    expect(within(sheet).getByText("Everyone")).toBeVisible();
    expect(
      within(sheet).getByText("Everybody in the Shoebox can open it."),
    ).toBeVisible();
  });

  it("saves nothing when nothing changed", async () => {
    respondWithItem({ detail: MINE });
    renderItem(ITEM_ID);

    const sheet = await _sheet();
    await userEvent.click(
      within(sheet).getByRole("button", { name: "Change who can see it" }),
    );
    await userEvent.click(within(sheet).getByRole("button", { name: "Save" }));

    expect(
      within(sheet).getByRole("button", { name: "Change who can see it" }),
    ).toHaveFocus();
    expect(recordedRequests()).not.toContain(RESOLVE);
  });

  it("moves focus to the rule's own mode as it opens, and back as it closes", async () => {
    respondWithItem({ detail: MINE });
    renderItem(ITEM_ID);

    const sheet = await _sheet();
    await userEvent.click(
      within(sheet).getByRole("button", { name: "Change who can see it" }),
    );
    expect(
      within(sheet).getByRole("radio", { name: "Everyone" }),
    ).toHaveFocus();

    await userEvent.click(
      within(sheet).getByRole("button", { name: "Cancel" }),
    );
    expect(
      within(sheet).getByRole("button", { name: "Change who can see it" }),
    ).toHaveFocus();
  });

  it("finds the rule, then points the item at it", async () => {
    respondWithItem({
      detail: MINE,
      routes: {
        [RESOLVE]: {
          body: { visibilityRuleId: RULE_ID, visibility: JUST_ME_VISIBILITY },
          status: 200,
        },
        [`PATCH /api/items/${ITEM_ID}/visibility`]: {
          body: { ...MINE, visibility: JUST_ME_VISIBILITY },
          status: 200,
        },
      },
    });
    renderItem(ITEM_ID);

    const sheet = await _sheet();
    await _chooseOnly({ sheet, subject: /Papá/ });
    await userEvent.click(within(sheet).getByRole("button", { name: "Save" }));

    expect(await within(sheet).findByText("Just me")).toBeVisible();
    expect(getRecordedBodyFromRequest(RESOLVE)).toEqual({
      mode: "only",
      subjects: [{ kind: "member", id: SIGNED_IN.memberId }],
    });
    expect(
      getRecordedBodyFromRequest(`PATCH /api/items/${ITEM_ID}/visibility`),
    ).toEqual({
      visibilityRuleId: RULE_ID,
    });
  });

  it("does not repoint the item at the rule it already has", async () => {
    respondWithItem({
      detail: MINE,
      routes: {
        [RESOLVE]: {
          body: {
            visibilityRuleId: "visibility-rule-everyone",
            visibility: MINE.visibility,
          },
          status: 200,
        },
      },
    });
    renderItem(ITEM_ID);

    const sheet = await _sheet();
    await _chooseOnly({ sheet, subject: /Papá/ });
    await userEvent.click(within(sheet).getByRole("button", { name: "Save" }));

    await waitFor(() => {
      expect(recordedRequests()).toContain(RESOLVE);
    });
    expect(recordedRequests()).not.toContain(
      `PATCH /api/items/${ITEM_ID}/visibility`,
    );
  });

  it("will not save Only with nobody named", async () => {
    respondWithItem({ detail: MINE });
    renderItem(ITEM_ID);

    const sheet = await _sheet();
    await userEvent.click(
      within(sheet).getByRole("button", { name: "Change who can see it" }),
    );
    await userEvent.click(within(sheet).getByRole("radio", { name: "Only" }));

    expect(within(sheet).getByRole("button", { name: "Save" })).toBeDisabled();
    expect(
      within(sheet).getByText("Name somebody first, or choose Everyone."),
    ).toBeVisible();
  });

  it("offers the people the rule already names while the member list is not there", async () => {
    respondWithItem({
      detail: makeItemDetail({
        capabilities: OWN_UPLOADER_CAPABILITIES,
        visibility: {
          visibilityRuleId: RULE_ID,
          mode: "only",
          label: null,
          subjects: [
            {
              kind: "member",
              id: "018f0000-0000-7000-8000-00000000c003",
              displayName: "Tía Marisol",
            },
          ],
        },
      }),
    });
    renderItem(ITEM_ID);

    const sheet = await _sheet();
    await userEvent.click(
      within(sheet).getByRole("button", { name: "Change who can see it" }),
    );

    expect(within(sheet).getByText("Tía Marisol")).toBeVisible();
  });

  it("holds Save, where focus stays, and Cancel while a save is out", async () => {
    let letTheResolveLand = () => {};
    respondWithItem({
      detail: MINE,
      routes: {
        [RESOLVE]: {
          body: { visibilityRuleId: RULE_ID, visibility: JUST_ME_VISIBILITY },
          status: 200,
          waitFor: new Promise<void>((settle) => {
            letTheResolveLand = settle;
          }),
        },
        [`PATCH /api/items/${ITEM_ID}/visibility`]: {
          body: { ...MINE, visibility: JUST_ME_VISIBILITY },
          status: 200,
        },
      },
    });
    renderItem(ITEM_ID);

    const sheet = await _sheet();
    await _chooseOnly({ sheet, subject: /Papá/ });
    const save = within(sheet).getByRole("button", { name: "Save" });
    save.focus();
    await userEvent.keyboard("{Enter}");

    expect(save).toHaveTextContent("Saving");
    expect(save).toHaveFocus();
    expect(save).toHaveAttribute("aria-disabled", "true");
    await userEvent.keyboard("{Enter}");
    const cancel = within(sheet).getByRole("button", { name: "Cancel" });
    expect(cancel).toHaveAttribute("aria-disabled", "true");
    await userEvent.click(cancel);
    // Still open: Cancel waits with Save rather than closing under it.
    expect(save).toBeInTheDocument();
    expect(getRecordedCountFromLine(RESOLVE)).toBe(1);
    letTheResolveLand();
    expect(await within(sheet).findByText("Just me")).toBeVisible();
  });

  it("keeps the editor open, and says so, when the save fails", async () => {
    respondWithItem({
      detail: MINE,
      routes: {
        [RESOLVE]: { body: { error: "internal", message: "x" }, status: 500 },
      },
    });
    renderItem(ITEM_ID);

    const sheet = await _sheet();
    await _chooseOnly({ sheet, subject: /Papá/ });
    await userEvent.click(within(sheet).getByRole("button", { name: "Save" }));

    expect(await within(sheet).findByRole("alert")).toHaveTextContent(
      "That did not go through",
    );
    expect(within(sheet).getByRole("button", { name: "Save" })).toBeEnabled();
    expect(
      within(sheet).queryByRole("button", { name: "Change who can see it" }),
    ).toBeNull();
  });

  it("names a group as a group", async () => {
    respondWithItem({
      detail: MINE,
      routes: {
        "GET /api/groups": {
          body: {
            shape: "picker",
            groups: [{ groupId: COUSINS_ID, name: "Cousins" }],
            nextCursor: null,
          },
          status: 200,
        },
        [RESOLVE]: {
          body: { visibilityRuleId: RULE_ID, visibility: JUST_ME_VISIBILITY },
          status: 200,
        },
        [`PATCH /api/items/${ITEM_ID}/visibility`]: {
          body: { ...MINE, visibility: JUST_ME_VISIBILITY },
          status: 200,
        },
      },
    });
    renderItem(ITEM_ID);

    const sheet = await _sheet();
    await _chooseOnly({ sheet, subject: "Cousins" });
    await userEvent.click(within(sheet).getByRole("button", { name: "Save" }));

    await waitFor(() => {
      expect(getRecordedBodyFromRequest(RESOLVE)).toEqual({
        mode: "only",
        subjects: [{ kind: "group", id: COUSINS_ID }],
      });
    });
  });
});
