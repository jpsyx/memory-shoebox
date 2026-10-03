import { screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { ItemCapabilities, MeResponse } from "@memory-shoebox/shared";
import { createMeResponse } from "@/testing/createMeResponse";
import {
  ITEM_ID,
  makeItemDetail,
  OTHER_UPLOADER_CAPABILITIES,
  OWN_UPLOADER_CAPABILITIES,
  VIEWER_CAPABILITIES,
} from "@/testing/itemFixtureHelpers";
import { renderItem, respondWithItem } from "@/testing/itemHarnessHelpers";

/**
 * Every control a capability gates, by the role and the words it is drawn
 * with: the uploader's six, and the ask for it to come down.
 */
const CONTROLS = {
  tags: { role: "button", name: "+ Add a tag" },
  people: { role: "button", name: "+ Tag somebody" },
  describe: { role: "textbox", name: "Describe this photograph" },
  visibility: { role: "button", name: "Change who can see it" },
  date: { role: "button", name: "Put the date right" },
  delete: { role: "button", name: "Delete this photograph" },
  removal: { role: "link", name: "Ask for this to come down" },
} as const;

type Control = keyof typeof CONTROLS;

/** Which of the controls the page drew, once it has drawn the photograph. */
async function _drawnControls(
  options: Readonly<{ capabilities: ItemCapabilities; me: MeResponse }>,
): Promise<Control[]> {
  respondWithItem({
    detail: makeItemDetail({ capabilities: options.capabilities }),
    routes: {
      "GET /api/me": { body: options.me, status: 200 },
    },
  });
  renderItem(ITEM_ID);
  await screen.findByRole("img", { name: /14 September 2026/ });
  return (Object.keys(CONTROLS) as Control[]).filter((control) => {
    const { role, name } = CONTROLS[control];
    return screen.queryByRole(role, { name }) !== null;
  });
}

describe("which controls are drawn", () => {
  it.each([
    ["a viewer", "viewer", VIEWER_CAPABILITIES, []],
    [
      "an uploader who did not upload it",
      "uploader",
      OTHER_UPLOADER_CAPABILITIES,
      ["tags", "people", "describe"],
    ],
    [
      "the item's own uploader",
      "uploader",
      OWN_UPLOADER_CAPABILITIES,
      ["tags", "people", "describe", "visibility", "date", "delete"],
    ],
    [
      "a viewer's role holding every capability",
      "viewer",
      { ...OWN_UPLOADER_CAPABILITIES, canRequestRemoval: true },
      ["tags", "people", "describe", "visibility", "date", "delete", "removal"],
    ],
  ] as const)(
    "draws for %s exactly what ItemCapabilities allows",
    async (_who, role, capabilities, expected) => {
      expect(
        await _drawnControls({ capabilities, me: createMeResponse({ role }) }),
      ).toEqual(expected);
    },
  );

  it("reads the capabilities and never the role", async () => {
    expect(
      await _drawnControls({
        capabilities: VIEWER_CAPABILITIES,
        me: createMeResponse({ role: "admin" }),
      }),
    ).toEqual([]);
  });

  it("offers asking for it to come down on canRequestRemoval alone", async () => {
    expect(
      await _drawnControls({
        capabilities: { ...VIEWER_CAPABILITIES, canRequestRemoval: true },
        me: createMeResponse({ role: "viewer" }),
      }),
    ).toEqual(["removal"]);
  });
});
