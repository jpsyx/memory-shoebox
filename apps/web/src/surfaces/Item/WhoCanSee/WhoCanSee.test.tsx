import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import type { VisibilitySummary } from "@memory-shoebox/shared";
import {
  ITEM_ID,
  makeItemDetail,
  OWN_UPLOADER_CAPABILITIES,
  SIGNED_IN,
} from "@/testing/itemFixtures";
import {
  recordedBodyOf,
  recordedRequests,
  renderItem,
  respondWithItem,
} from "@/testing/itemHarness";

const RULE_ID = "018f0000-0000-7000-8000-0000000a0201";

const JUST_ME: VisibilitySummary = {
  visibilityRuleId: RULE_ID,
  mode: "only",
  label: "Just me",
  subjects: [
    {
      kind: "member",
      id: SIGNED_IN.memberId,
      displayName: SIGNED_IN.displayName,
    },
  ],
};

const MINE = makeItemDetail({ capabilities: OWN_UPLOADER_CAPABILITIES });

/** The sheet, once the page has drawn it. */
async function _sheet() {
  return screen.findByRole("region", { name: "Who can see this" });
}

describe("who can see it", () => {
  it("says who can see it, in words, to the item's own uploader", async () => {
    respondWithItem(MINE);
    renderItem(ITEM_ID);

    const sheet = await _sheet();
    expect(within(sheet).getByText("Everyone")).toBeVisible();
    expect(
      within(sheet).getByText("Everybody in the Shoebox can open it."),
    ).toBeVisible();
  });

  it("saves nothing when nothing changed", async () => {
    respondWithItem(MINE);
    renderItem(ITEM_ID);

    const sheet = await _sheet();
    await userEvent.click(
      within(sheet).getByRole("button", { name: "Change who can see it" }),
    );
    await userEvent.click(within(sheet).getByRole("button", { name: "Save" }));

    expect(
      within(sheet).getByRole("button", { name: "Change who can see it" }),
    ).toBeVisible();
    expect(recordedRequests()).not.toContain(
      "POST /api/visibility-rules/resolve",
    );
  });

  it("finds the rule, then points the item at it", async () => {
    respondWithItem(MINE, {
      "POST /api/visibility-rules/resolve": {
        body: { visibilityRuleId: RULE_ID, visibility: JUST_ME },
        status: 200,
      },
      [`PATCH /api/items/${ITEM_ID}/visibility`]: {
        body: { ...MINE, visibility: JUST_ME },
        status: 200,
      },
    });
    renderItem(ITEM_ID);

    const sheet = await _sheet();
    await userEvent.click(
      within(sheet).getByRole("button", { name: "Change who can see it" }),
    );
    await userEvent.click(within(sheet).getByRole("radio", { name: "Only" }));
    await userEvent.click(within(sheet).getByLabelText("Only these"));
    await userEvent.click(await screen.findByRole("option", { name: /Papá/ }));
    await userEvent.click(within(sheet).getByRole("button", { name: "Save" }));

    expect(await within(sheet).findByText("Just me")).toBeVisible();
    expect(recordedBodyOf("POST /api/visibility-rules/resolve")).toEqual({
      mode: "only",
      subjects: [{ kind: "member", id: SIGNED_IN.memberId }],
    });
    expect(recordedBodyOf(`PATCH /api/items/${ITEM_ID}/visibility`)).toEqual({
      visibilityRuleId: RULE_ID,
    });
  });

  it("does not repoint the item at the rule it already has", async () => {
    respondWithItem(MINE, {
      "POST /api/visibility-rules/resolve": {
        body: {
          visibilityRuleId: "visibility-rule-everyone",
          visibility: MINE.visibility,
        },
        status: 200,
      },
    });
    renderItem(ITEM_ID);

    const sheet = await _sheet();
    await userEvent.click(
      within(sheet).getByRole("button", { name: "Change who can see it" }),
    );
    await userEvent.click(within(sheet).getByRole("radio", { name: "Only" }));
    await userEvent.click(within(sheet).getByLabelText("Only these"));
    await userEvent.click(await screen.findByRole("option", { name: /Papá/ }));
    await userEvent.click(within(sheet).getByRole("button", { name: "Save" }));

    await waitFor(() => {
      expect(recordedRequests()).toContain(
        "POST /api/visibility-rules/resolve",
      );
    });
    expect(recordedRequests()).not.toContain(
      `PATCH /api/items/${ITEM_ID}/visibility`,
    );
  });

  it("will not save Only with nobody named", async () => {
    respondWithItem(MINE);
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
    respondWithItem(
      makeItemDetail({
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
    );
    renderItem(ITEM_ID);

    const sheet = await _sheet();
    await userEvent.click(
      within(sheet).getByRole("button", { name: "Change who can see it" }),
    );

    expect(within(sheet).getByText("Tía Marisol")).toBeVisible();
  });
});
