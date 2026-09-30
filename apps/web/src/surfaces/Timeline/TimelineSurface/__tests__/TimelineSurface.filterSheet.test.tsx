import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it } from "vitest";
import {
  recordedUrls,
  renderTimeline,
  respondWith,
} from "./TimelineSurface.fixtures";

/**
 * Real UUIDs rather than the task file's shorthand ("t1", "p1"): every id
 * on the wire goes through `tagRefSchema` / `personRefSchema`, both of which
 * require `idSchema` (`z.uuid()`). A short mnemonic id fails that
 * validation, `apiFetch` throws, and the facets query never resolves, which
 * silently starves every test below of the facets it renders against.
 */
const TAG_HOSPITAL_ID = "018f0000-0000-7000-8000-0000000e0001";
const TAG_BEACH_ID = "018f0000-0000-7000-8000-0000000e0002";
const PERSON_ELENA_ID = "018f0000-0000-7000-8000-0000000f0001";

const FACETS = {
  tags: [
    {
      tag: { tagId: TAG_HOSPITAL_ID, name: "hospital" },
      isSelected: false,
      narrowedCount: 412,
      ownCount: null,
    },
    {
      tag: { tagId: TAG_BEACH_ID, name: "beach" },
      isSelected: false,
      narrowedCount: 0,
      ownCount: null,
    },
  ],
  people: [
    {
      person: { personId: PERSON_ELENA_ID, displayName: "Elena" },
      isSelected: false,
      narrowedCount: 23,
      ownCount: null,
    },
  ],
  resultCount: 2147,
};

describe("the filter sheet", () => {
  beforeEach(() => {
    respondWith({ "GET /api/filters/facets": { body: FACETS, status: 200 } });
  });

  it("opens on the whole archive rather than an empty results page", async () => {
    renderTimeline("/?find=true");
    expect(await screen.findByText("Find something")).toBeTruthy();
    expect(await screen.findByText("27")).toBeTruthy();
  });

  it("puts every chip's count beside it", async () => {
    renderTimeline("/?find=true");
    expect(
      await screen.findByRole("button", { name: /hospital/ }),
    ).toBeTruthy();
    expect(screen.getByText("412")).toBeTruthy();
  });

  it("leaves a zero chip on the row, quiet and still announced", async () => {
    renderTimeline("/?find=true");
    const beach = await screen.findByRole("button", { name: /beach/ });
    expect(beach.getAttribute("aria-disabled")).toBe("true");
    expect(beach.isConnected).toBe(true);
  });

  it("puts a pressed chip in the URL, so a filter is an address", async () => {
    // The harness renders on a memory history, which never touches
    // `window.location`: the URL a navigation actually lands on is
    // `router.state.location`, exactly as `SignInCard.code.test.tsx` reads it.
    const { router } = renderTimeline("/?find=true");
    await userEvent.click(
      await screen.findByRole("button", { name: /hospital/ }),
    );
    await waitFor(() => {
      expect(router.state.location.searchStr).toContain(TAG_HOSPITAL_ID);
    });
  });

  it("asks the tag vocabulary once, after the typing has stopped", async () => {
    renderTimeline("/?find=true");
    const field = await screen.findByLabelText("Words in a tag or a name");
    await userEvent.type(field, "hosp");
    await waitFor(
      () => {
        expect(
          recordedUrls().filter((url) => {
            return url.startsWith("/api/tags");
          }).length,
        ).toBe(1);
      },
      { timeout: 2000 },
    );
  });

  it("says which filter is doing the excluding when nothing matches", async () => {
    respondWith({
      "GET /api/timeline": {
        body: { days: [], nextCursor: null, resultCount: 0 },
        status: 200,
      },
      "GET /api/filters/facets": {
        body: {
          tags: [
            {
              tag: { tagId: TAG_BEACH_ID, name: "beach" },
              isSelected: true,
              narrowedCount: null,
              ownCount: 141,
            },
          ],
          people: [
            {
              person: { personId: PERSON_ELENA_ID, displayName: "Elena" },
              isSelected: true,
              narrowedCount: null,
              ownCount: 23,
            },
          ],
          resultCount: 0,
        },
        status: 200,
      },
    });
    renderTimeline(`/?tag=${TAG_BEACH_ID}&person=${PERSON_ELENA_ID}`);
    expect(await screen.findByText(/Nothing matches/)).toBeTruthy();
    expect(screen.getByText(/23/)).toBeTruthy();
    expect(screen.getByText(/141/)).toBeTruthy();
    expect(screen.getByRole("button", { name: /Drop beach/ })).toBeTruthy();
  });
});
