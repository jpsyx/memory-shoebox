import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { openItemDetails } from "@/testing/openItemDetails";
import {
  ITEM_ID,
  makeItemDetail,
  OTHER_UPLOADER_CAPABILITIES,
  PERSON_MATEO_ID,
  PERSON_SOFIA_ID,
} from "@/testing/itemFixtureHelpers";
import {
  getRecordedBodyFromRequest,
  getRecordedCountFromLine,
  renderItem,
  respondWithItem,
} from "@/testing/itemHarnessHelpers";
import { makeHold } from "@/testing/itemWriteTestHelpers";
import type { Answer } from "@/testing/surfaceHarness";

const OPTIONS_GET = `GET /api/items/${ITEM_ID}/people/options`;
const PERSON_PATCH = `PATCH /api/items/${ITEM_ID}/people/${PERSON_MATEO_ID}`;
const PERSON_DELETE = `DELETE /api/items/${ITEM_ID}/people/${PERSON_MATEO_ID}`;
const PEOPLE_PUT = `PUT /api/items/${ITEM_ID}/people`;
const DETAIL = makeItemDetail({ capabilities: OTHER_UPLOADER_CAPABILITIES });
const OPTIONS = {
  people: [
    {
      person: { personId: PERSON_MATEO_ID, displayName: "Mateo" },
      itemCount: 1,
      canRename: true,
      canDelete: true,
    },
    {
      person: { personId: PERSON_SOFIA_ID, displayName: "Pablo" },
      itemCount: 0,
      canRename: false,
      canDelete: false,
    },
  ],
};

async function _openEditor(routes: Record<string, Answer> = {}): Promise<void> {
  respondWithItem({
    detail: DETAIL,
    routes: { [OPTIONS_GET]: { body: OPTIONS, status: 200 }, ...routes },
  });
  renderItem(ITEM_ID);
  await openItemDetails();
  await userEvent.click(
    await screen.findByRole("button", { name: "+ Tag somebody" }),
  );
}

describe("person management from the tagging menu", () => {
  it("offers permitted actions for a tagged person and none for a member", async () => {
    await _openEditor();
    await userEvent.click(
      screen.getByRole("combobox", { name: "Who is in it" }),
    );
    expect(
      await screen.findByRole("button", { name: "Rename Mateo" }),
    ).toBeVisible();
    expect(screen.getByRole("button", { name: "Delete Mateo" })).toBeVisible();
    expect(screen.queryByRole("button", { name: "Rename Pablo" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Delete Pablo" })).toBeNull();
  });

  it("renames the existing person and updates the open editor without tagging", async () => {
    await _openEditor({
      [PERSON_PATCH]: {
        status: 200,
        body: {
          ...DETAIL,
          people: [{ personId: PERSON_MATEO_ID, displayName: "Matías" }],
        },
      },
    });
    await userEvent.click(screen.getByRole("combobox"));
    await userEvent.click(
      await screen.findByRole("button", { name: "Rename Mateo" }),
    );
    const modal = screen.getByRole("dialog", { name: "Rename Mateo" });
    await userEvent.clear(within(modal).getByRole("textbox", { name: "Name" }));
    await userEvent.type(
      within(modal).getByRole("textbox", { name: "Name" }),
      "Matías",
    );
    await userEvent.click(
      within(modal).getByRole("button", { name: "Save name" }),
    );
    await waitFor(() => {
      expect(screen.queryByRole("dialog", { name: "Rename Mateo" })).toBeNull();
    });
    expect(getRecordedBodyFromRequest(PERSON_PATCH)).toEqual({
      displayName: "Matías",
    });
    expect(getRecordedCountFromLine(PEOPLE_PUT)).toBe(0);
    expect(screen.getByText("Matías")).toBeVisible();
  });

  it("deletes the person and removes their pill without sending a tag replacement", async () => {
    await _openEditor({
      [PERSON_DELETE]: { status: 200, body: { ...DETAIL, people: [] } },
    });
    await userEvent.click(screen.getByRole("combobox"));
    await userEvent.click(
      await screen.findByRole("button", { name: "Delete Mateo" }),
    );
    await waitFor(() => {
      expect(getRecordedCountFromLine(PERSON_DELETE)).toBe(1);
    });
    await userEvent.click(screen.getByRole("button", { name: "Done" }));
    expect(screen.queryByRole("link", { name: "Mateo" })).toBeNull();
    expect(getRecordedCountFromLine(PEOPLE_PUT)).toBe(0);
  });

  it("preserves the tag and explains a stale delete permission", async () => {
    await _openEditor({
      [PERSON_DELETE]: {
        status: 409,
        body: { error: "person_used_elsewhere", message: "Tagged elsewhere." },
      },
    });
    await userEvent.click(screen.getByRole("combobox"));
    await userEvent.click(
      await screen.findByRole("button", { name: "Delete Mateo" }),
    );
    expect(await screen.findByRole("alert")).toHaveTextContent(
      /tagged elsewhere/i,
    );
    await userEvent.click(screen.getByRole("button", { name: "Done" }));
    expect(screen.getByRole("link", { name: "Mateo" })).toBeVisible();
  });

  it("filters member suggestions case-insensitively and tags the member by person id", async () => {
    await _openEditor({
      [PEOPLE_PUT]: {
        status: 200,
        body: {
          ...DETAIL,
          people: [...DETAIL.people, OPTIONS.people[1]!.person],
        },
      },
    });
    const field = screen.getByRole("combobox");
    await userEvent.type(field, "p");
    expect(await screen.findByRole("option", { name: /Pablo/ })).toBeVisible();
    await userEvent.clear(field);
    await userEvent.type(field, "P");
    await userEvent.click(await screen.findByRole("option", { name: /Pablo/ }));
    await waitFor(() => {
      expect(getRecordedBodyFromRequest(PEOPLE_PUT)).toEqual({
        people: [{ personId: PERSON_MATEO_ID }, { personId: PERSON_SOFIA_ID }],
      });
    });
  });
});

describe("tagging identity after person management", () => {
  it("can tag a member with the same name as an already tagged ad-hoc person", async () => {
    const people = [
      OPTIONS.people[0]!,
      {
        ...OPTIONS.people[1]!,
        person: { personId: PERSON_SOFIA_ID, displayName: "Mateo" },
      },
    ];
    await _openEditor({
      [OPTIONS_GET]: { status: 200, body: { people } },
      [PEOPLE_PUT]: {
        status: 200,
        body: {
          ...DETAIL,
          people: people.map((entry) => {
            return entry.person;
          }),
        },
      },
    });
    await userEvent.type(screen.getByRole("combobox"), "Mateo");
    const choices = await screen.findAllByRole("option", { name: /Mateo/ });
    expect(choices).toHaveLength(2);
    await userEvent.click(
      choices.find((choice) => {
        return !choice.hasAttribute("data-combobox-disabled");
      })!,
    );
    await waitFor(() => {
      expect(getRecordedBodyFromRequest(PEOPLE_PUT)).toEqual({
        people: [{ personId: PERSON_MATEO_ID }, { personId: PERSON_SOFIA_ID }],
      });
    });
    await userEvent.click(
      screen.getAllByRole("button", { name: "Untag Mateo" })[0]!,
    );
    await waitFor(() => {
      expect(getRecordedBodyFromRequest(PEOPLE_PUT)).toEqual({
        people: [{ personId: PERSON_SOFIA_ID }],
      });
    });
  });

  it("removes a deleted person from cached suggestions even if refresh fails", async () => {
    await _openEditor({
      [PERSON_DELETE]: { status: 200, body: { ...DETAIL, people: [] } },
    });
    await userEvent.click(screen.getByRole("combobox"));
    const deleteButton = await screen.findByRole("button", {
      name: "Delete Mateo",
    });
    const originalFetch = globalThis.fetch;
    vi.stubGlobal("fetch", (path: string, init?: RequestInit) => {
      return `${init?.method ?? "GET"} ${path}` === OPTIONS_GET
        ? Promise.resolve(
            new Response(
              JSON.stringify({ error: "internal", message: "offline" }),
              { status: 500 },
            ),
          )
        : originalFetch(path, init);
    });
    await userEvent.click(deleteButton);
    await waitFor(() => {
      expect(screen.queryByRole("button", { name: "Untag Mateo" })).toBeNull();
    });
    await waitFor(() => {
      expect(screen.getByRole("combobox")).toBeEnabled();
    });
    await userEvent.type(screen.getByRole("combobox"), "Mateo");
    expect(
      await screen.findByRole("option", { name: /^Mateo\s*new$/ }),
    ).toBeVisible();
    expect(getRecordedCountFromLine(PERSON_DELETE)).toBe(1);
  });
});

it("does not create a duplicate when selecting a differently cased pending name", async () => {
  const hold = makeHold();
  await _openEditor({
    [PEOPLE_PUT]: {
      body: {
        ...DETAIL,
        people: [...DETAIL.people, OPTIONS.people[1]!.person],
      },
      status: 200,
      waitFor: hold.hold,
    },
  });
  const input = screen.getByRole("combobox");
  await userEvent.type(input, "pablo{Enter}");
  await userEvent.click(await screen.findByRole("option", { name: /Pablo/ }));
  hold.letGo();
  await waitFor(() => {
    expect(screen.getByRole("button", { name: "Untag Pablo" })).toBeVisible();
  });
  expect(getRecordedCountFromLine(PEOPLE_PUT)).toBe(1);
});
