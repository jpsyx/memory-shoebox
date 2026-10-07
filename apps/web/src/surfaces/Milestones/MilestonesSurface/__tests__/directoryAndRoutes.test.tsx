import { createMeResponse } from "@/testing/createMeResponse";
import { recordedRequests, renderAt } from "@/testing/surfaceHarness";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, it, vi } from "vitest";
import {
  detail,
  installMilestoneAnswers,
  milestoneId,
} from "./installMilestoneAnswers";
it("hides New milestone for a viewer", async () => {
  installMilestoneAnswers({
    "GET /api/me": {
      body: createMeResponse({ role: "viewer" }),
      status: 200,
    },
    "GET /api/milestones": {
      body: {
        milestones: [{ ...detail, canEdit: false, canDelete: false }],
        nextCursor: null,
      },
      status: 200,
    },
  });
  renderAt("/milestones");
  await screen.findByText("Home");
  expect(screen.queryByRole("button", { name: "New milestone" })).toBeNull();
});
it("follows an empty cursor page and deduplicates IDs", async () => {
  installMilestoneAnswers();
  const original = fetch;
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      return url === "/api/milestones"
        ? new Response(
            JSON.stringify({ milestones: [], nextCursor: "opaque+page" }),
          )
        : url === "/api/milestones?cursor=opaque%2Bpage"
          ? new Response(
              JSON.stringify({
                milestones: [detail, detail],
                nextCursor: null,
              }),
            )
          : original(url, init);
    }),
  );
  renderAt("/milestones");
  await userEvent.click(
    await screen.findByRole("button", { name: "Load more milestones" }),
  );
  expect(await screen.findByText("Home")).toBeVisible();
  expect(screen.getAllByText("Home")).toHaveLength(1);
});
it("saving an edit with mismatches addresses fix", async () => {
  installMilestoneAnswers({
    [`PATCH /api/milestones/${milestoneId}`]: {
      body: { ...detail, mismatchCount: 2 },
      status: 200,
    },
  });
  const { router } = renderAt(`/milestones?milestone=${milestoneId}&mode=edit`);
  await userEvent.click(
    await screen.findByRole("button", { name: "Save the changes" }),
  );
  await waitFor(() => {
    return expect(router.state.location.search).toEqual({
      milestone: milestoneId,
      mode: "fix",
    });
  });
});
it("malformed addresses render a safe route error without mutation", async () => {
  installMilestoneAnswers();
  renderAt("/milestones?milestone=bad%2Fid&mode=delete");
  expect(
    await screen.findByText("This occasion address is not valid."),
  ).toBeVisible();
  expect(
    recordedRequests().filter((line) => {
      return /^(POST|PATCH|DELETE)/.test(line);
    }),
  ).toHaveLength(0);
});
it("returns an edit without mismatches to the list", async () => {
  installMilestoneAnswers({
    [`PATCH /api/milestones/${milestoneId}`]: { body: detail, status: 200 },
  });
  const { router } = renderAt(`/milestones?milestone=${milestoneId}&mode=edit`);
  await userEvent.click(
    await screen.findByRole("button", { name: "Save the changes" }),
  );
  await waitFor(() => {
    return expect(router.state.location.search).toEqual({});
  });
});
it("uses the real inclusive span and zero visible count without a contact fixture", async () => {
  installMilestoneAnswers();
  renderAt(`/milestones?milestone=${milestoneId}&mode=empty`);
  expect(
    await screen.findByText("Nothing is attached for you to see yet."),
  ).toBeVisible();
  expect(screen.getByText("This day is day 1 of the 2.")).toBeVisible();
  expect(
    screen.getByRole("button", { name: "Attach photographs" }),
  ).toBeEnabled();
  expect(screen.queryByRole("button", { name: /Ask .* for hers/ })).toBeNull();
});
