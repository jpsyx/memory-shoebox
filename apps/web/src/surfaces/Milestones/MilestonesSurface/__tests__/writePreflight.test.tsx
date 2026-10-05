import { act, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, it } from "vitest";
import { makeMilestoneDetailFromOverrides } from "@/testing/askingAndOccasionsFixtures";
import { makeHold } from "@/testing/itemWriteTestHelpers";
import {
  renderAt,
  respondWith,
  recordedRequests,
  type Answer,
} from "@/testing/surfaceHarness";
const detail = makeMilestoneDetailFromOverrides();

it.each(["save", "leave", "permission", "read-error"] as const)(
  "checks current edit authority after a held preflight: %s",
  async (outcome) => {
    const held = makeHold();
    const path = `/api/milestones/${detail.milestone.milestoneId}`;
    const answer: Answer = { status: 200, body: detail };
    respondWith({
      "GET /api/milestones": {
        status: 200,
        body: { milestones: [detail], nextCursor: null },
      },
      [`GET ${path}`]: answer,
      [`PATCH ${path}`]: { status: 200, body: detail },
    });
    const { router } = renderAt(
      `/milestones?milestone=${detail.milestone.milestoneId}&mode=edit`,
    );
    const save = await screen.findByRole("button", {
      name: "Save the changes",
    });
    answer.waitFor = held.hold;
    if (outcome === "permission") {
      answer.body = { ...detail, canEdit: false };
    }
    if (outcome === "read-error") {
      answer.status = 503;
      answer.body = { error: "unavailable", message: "Unavailable" };
    }
    await userEvent.click(save);
    await waitFor(() => {
      expect(
        recordedRequests().filter((line) => {
          return line === `GET ${path}`;
        }),
      ).toHaveLength(2);
    });
    if (outcome === "leave") {
      await act(async () => {
        await router.navigate({ to: "/milestones", search: {} });
      });
    }
    await act(async () => {
      held.letGo();
    });
    await waitFor(() => {
      expect(router.options.context!.queryClient.isMutating()).toBe(0);
    });
    if (outcome === "read-error") {
      expect(screen.queryByText(/The occasion may have been saved/)).toBeNull();
    }
    expect(
      recordedRequests().filter((line) => {
        return line === `PATCH ${path}`;
      }),
    ).toHaveLength(outcome === "save" ? 1 : 0);
  },
);
