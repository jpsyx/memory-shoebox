import { recordedRequests, renderAt } from "@/testing/surfaceHarness";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import {
  detail,
  installMilestoneAnswers,
  milestoneId,
} from "./installMilestoneAnswers";
beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-09-15T12:00:00.000Z"));
});
afterEach(() => {
  vi.useRealTimers();
});
function _installUncertainEditAnswers(): {
  hasRecovered: boolean;
} {
  installMilestoneAnswers({
    [`PATCH /api/milestones/${milestoneId}`]: {
      body: { invalid: true },
      status: 200,
    },
  });
  const responseState: { hasRecovered: boolean } = { hasRecovered: false };

  const original = fetch;
  let hasSubmitted = false;

  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      if (init?.method === "PATCH") {
        hasSubmitted = true;
      }
      return hasSubmitted &&
        !responseState.hasRecovered &&
        url === `/api/milestones/${milestoneId}` &&
        init?.method !== "PATCH"
        ? new Response(
            JSON.stringify({
              error: "service_unavailable",
              message: "Offline",
            }),
            { status: 503 },
          )
        : original(url, init);
    }),
  );
  return responseState;
}

function _installConfirmedEditRefreshFailures(
  listRefresh: Readonly<Promise<void>>,
): void {
  const original = fetch;
  let hasSubmitted = false;
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      if (init?.method === "PATCH") {
        hasSubmitted = true;
      }
      if (
        hasSubmitted &&
        url === `/api/milestones/${milestoneId}` &&
        init?.method !== "PATCH"
      ) {
        return new Response(
          JSON.stringify({ error: "milestone_not_found", message: "Gone" }),
          { status: 404 },
        );
      }
      if (hasSubmitted && url === "/api/milestones") {
        await listRefresh;
      }
      return original(url, init);
    }),
  );
}

function _installRetainsCreateWordsAndUncertaintyWhenTheFetch2(): void {
  const original = fetch;
  let hasSubmitted = false;
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      if (init?.method === "POST") {
        hasSubmitted = true;
      }
      return hasSubmitted &&
        url === "/api/milestones" &&
        init?.method !== "POST"
        ? new Response(
            JSON.stringify({
              error: "service_unavailable",
              message: "Offline",
            }),
            { status: 503 },
          )
        : original(url, init);
    }),
  );
}

it("loads stored edit mode on refresh and uses Back for the list", async () => {
  installMilestoneAnswers();
  const { router } = renderAt(`/milestones?milestone=${milestoneId}&mode=edit`);
  expect(await screen.findByLabelText("What happened")).toHaveValue("Home");
  await userEvent.click(screen.getByRole("button", { name: "Cancel" }));
  await waitFor(() => {
    return expect(router.state.location.search).toEqual({});
  });
  router.history.back();
  expect(await screen.findByLabelText("What happened")).toHaveValue("Home");
});
it("retains edited words and uncertainty when PATCH and its detail refresh are uncertain", async () => {
  const responses0 = _installUncertainEditAnswers();
  renderAt(`/milestones?milestone=${milestoneId}&mode=edit`);
  const name = await screen.findByLabelText("What happened");
  await userEvent.clear(name);
  await userEvent.type(name, "Edited words stay");
  const blurb = screen.getByLabelText("A line about it");
  await userEvent.type(blurb, "More retained words");
  await userEvent.click(
    screen.getByRole("button", { name: "Save the changes" }),
  );
  await screen.findByText(
    "This occasion could not be read. Refresh it or return to the list.",
  );
  expect(screen.getByLabelText("What happened")).toBe(name);
  expect(name).toHaveValue("Edited words stay");
  expect(blurb).toHaveValue("More retained words");
  expect(screen.getByText(/The occasion may have been saved/)).toBeVisible();
  expect(
    screen.getByRole("button", { name: "Save the changes" }),
  ).toBeDisabled();
  expect(
    recordedRequests().filter((request) => {
      return request.startsWith("PATCH ");
    }),
  ).toHaveLength(1);
  responses0.hasRecovered = true;
  await userEvent.click(
    screen.getByRole("button", { name: "Refresh the occasion" }),
  );
  await waitFor(() => {
    expect(
      screen.queryByText(
        "This occasion could not be read. Refresh it or return to the list.",
      ),
    ).toBeNull();
  });
  expect(name).toHaveValue("Edited words stay");
  expect(
    screen.getByRole("button", { name: "Save the changes" }),
  ).toBeDisabled();
  expect(
    screen.getByRole("button", { name: "Return to the list and review" }),
  ).toBeEnabled();
});
it.each([0, 2] as const)(
  "honors confirmed PATCH with %i mismatches before failed detail/held list refresh",
  async (mismatchCount) => {
    let finishList: (() => void) | undefined;
    const listRefresh = new Promise<void>((finish) => {
      finishList = finish;
    });
    installMilestoneAnswers({
      [`PATCH /api/milestones/${milestoneId}`]: {
        body: { ...detail, mismatchCount },
        status: 200,
      },
    });
    _installConfirmedEditRefreshFailures(listRefresh);
    const { router } = renderAt(
      `/milestones?milestone=${milestoneId}&mode=edit`,
    );
    await userEvent.click(
      await screen.findByRole("button", { name: "Save the changes" }),
    );
    try {
      await waitFor(() => {
        expect(screen.queryByLabelText("What happened")).toBeNull();
      });
      expect(router.state.location.search).toEqual(
        mismatchCount === 0 ? {} : { milestone: milestoneId, mode: "fix" },
      );
    } finally {
      finishList?.();
    }
  },
);
it("retains create words and uncertainty when the directory refresh also fails", async () => {
  installMilestoneAnswers({
    "POST /api/milestones": { body: { invalid: true }, status: 201 },
  });
  _installRetainsCreateWordsAndUncertaintyWhenTheFetch2();
  renderAt("/milestones?mode=create");
  const name = await screen.findByLabelText("What happened");
  await userEvent.type(name, "New retained words");
  await userEvent.type(
    screen.getByLabelText("A line about it"),
    "Retained create blurb",
  );
  await userEvent.click(
    screen.getByRole("button", { name: "When it happened" }),
  );
  const days = await screen.findAllByRole("button", { name: /\d+ \w+ 2026/ });
  await userEvent.click(days[15]!);
  await userEvent.click(
    screen.getByRole("button", {
      name: "Create it and find its photographs",
    }),
  );
  await screen.findByText(
    "Milestones could not be refreshed. Refresh the list before starting another change.",
  );
  expect(screen.getByLabelText("What happened")).toBe(name);
  expect(name).toHaveValue("New retained words");
  expect(screen.getByLabelText("A line about it")).toHaveValue(
    "Retained create blurb",
  );
  expect(screen.getByText(/The occasion may have been saved/)).toBeVisible();
  expect(
    screen.getByRole("button", {
      name: "Create it and find its photographs",
    }),
  ).toBeDisabled();
  expect(
    screen.getByRole("button", { name: "Return to the list and review" }),
  ).toBeEnabled();
});
