import { makeMilestoneDetailFromOverrides } from "@/testing/askingAndOccasionsFixtureHelpers";
import { makeHold } from "@/testing/itemWriteTestHelpers";
import {
  recordedRequests,
  renderAt,
  respondWith,
  type Answer,
} from "@/testing/surfaceHarness";
import type { MilestoneDetail } from "@memory-shoebox/shared";
import { act, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, it } from "vitest";
function _installSendsOnePatchOnlyWhileTheHeldAnswers0(): {
  held: { hold: Promise<void>; letGo: () => void };
  path: string;
  answer: Answer;
} {
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
  return { held, path, answer };
}

const detail = makeMilestoneDetailFromOverrides() satisfies MilestoneDetail;

it.each(["save", "leave", "permission", "read-error"] as const)(
  "sends one PATCH only while the held preflight still grants an active edit: %s",
  async (outcome) => {
    const responses0 = _installSendsOnePatchOnlyWhileTheHeldAnswers0();
    const { router } = renderAt(
      `/milestones?milestone=${detail.milestone.milestoneId}&mode=edit`,
    );
    const save = await screen.findByRole("button", {
      name: "Save the changes",
    });
    responses0.answer.waitFor = responses0.held.hold;
    if (outcome === "permission") {
      responses0.answer.body = { ...detail, canEdit: false };
    }
    if (outcome === "read-error") {
      responses0.answer.status = 503;
      responses0.answer.body = { error: "unavailable", message: "Unavailable" };
    }
    await userEvent.click(save);
    await waitFor(() => {
      expect(
        recordedRequests().filter((line) => {
          return line === `GET ${responses0.path}`;
        }),
      ).toHaveLength(2);
    });
    if (outcome === "leave") {
      await act(async () => {
        await router.navigate({ to: "/milestones", search: {} });
      });
    }
    await act(async () => {
      responses0.held.letGo();
    });
    await waitFor(() => {
      expect(router.options.context!.queryClient.isMutating()).toBe(0);
    });
    if (outcome === "read-error") {
      expect(screen.queryByText(/The occasion may have been saved/)).toBeNull();
    }
    expect(
      recordedRequests().filter((line) => {
        return line === `PATCH ${responses0.path}`;
      }),
    ).toHaveLength(outcome === "save" ? 1 : 0);
  },
);
