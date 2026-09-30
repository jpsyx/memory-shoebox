import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it } from "vitest";
import { renderPeople, respondWithPeople } from "./people.fixtures";

/**
 * Real UUIDs rather than the task file's shorthand ("p1", "p2"): every id on
 * the wire goes through `personRefSchema`, which requires `idSchema`
 * (`z.uuid()`). A short mnemonic id fails that validation, `apiFetch` throws,
 * and the directory query never resolves, which silently starves every test
 * below of the people it renders against.
 */
const PERSON_MATEO_ID = "018f0000-0000-7000-8000-0000000f0002";
const PERSON_SOFIA_ID = "018f0000-0000-7000-8000-0000000f0003";

const DIRECTORY = {
  people: [
    {
      person: { personId: PERSON_MATEO_ID, displayName: "Mateo" },
      itemCount: 412,
      firstCapturedOn: "2026-01-01",
      lastCapturedOn: "2026-09-27",
      face: {
        url: "https://example.invalid/f.jpg",
        expiresAt: "2099-01-01T00:00:00.000Z",
        width: 400,
        height: 400,
      },
    },
    {
      person: { personId: PERSON_SOFIA_ID, displayName: "Sofía" },
      itemCount: 0,
      firstCapturedOn: null,
      lastCapturedOn: null,
      face: null,
    },
  ],
  nextCursor: null,
  peopleCount: 10,
};

describe("the people directory", () => {
  beforeEach(() => {
    respondWithPeople({ "GET /api/people": { body: DIRECTORY, status: 200 } });
  });

  it("draws everybody tagged in the archive", async () => {
    renderPeople();
    expect(await screen.findByText("Mateo")).toBeTruthy();
    expect(screen.getByText("Sofía")).toBeTruthy();
  });

  it("says `Nothing yet` rather than a count for somebody unphotographed", async () => {
    renderPeople();
    expect(await screen.findByText("Nothing yet")).toBeTruthy();
  });

  it("draws the ghost frame rather than a broken image for a missing face", async () => {
    const { container } = renderPeople();
    await screen.findByText("Sofía");
    expect(container.querySelectorAll("img").length).toBe(1);
  });

  it("says how much of the directory is hidden when it is narrowed", async () => {
    renderPeople("/people?q=a");
    expect(await screen.findByText("2 of 10 people")).toBeTruthy();
  });

  it("says only the total when nothing is typed", async () => {
    renderPeople();
    expect(await screen.findByText("10 people")).toBeTruthy();
  });

  it("filters the pile rather than opening a page for a person", async () => {
    // The harness renders on a memory history, which never touches
    // `window.location`: the URL a navigation actually lands on is
    // `router.state.location`, exactly as `SignInCard.code.test.tsx` reads it.
    const { router } = renderPeople();
    await userEvent.click(await screen.findByRole("link", { name: /Mateo/ }));
    await waitFor(() => {
      expect(router.state.location.pathname).toBe("/");
      expect(router.state.location.searchStr).toContain(PERSON_MATEO_ID);
    });
  });

  it("says nothing about who holds an account", async () => {
    renderPeople();
    await screen.findByText("Mateo");
    expect(screen.queryByText(/member/i)).toBeNull();
  });
});
