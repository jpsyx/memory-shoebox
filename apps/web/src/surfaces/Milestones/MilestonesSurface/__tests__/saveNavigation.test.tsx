import { recordedRequests, renderAt } from "@/testing/surfaceHarness";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, it } from "vitest";
import {
  detail,
  installMilestoneAnswers,
  milestoneId,
} from "./installMilestoneAnswers";
it("shows per-viewer zero honestly and uses capability gates without creator lookup", async () => {
  const denied = { ...detail, canEdit: false, canDelete: false };
  installMilestoneAnswers({
    "GET /api/milestones": {
      body: { milestones: [denied], nextCursor: null },
      status: 200,
    },
  });
  renderAt("/milestones");
  expect(await screen.findByText("Home")).toBeVisible();
  expect(screen.getByText("0 items")).toBeVisible();
  expect(screen.queryByRole("button", { name: /Edit Home/ })).toBeNull();
  expect(screen.queryByRole("button", { name: /Delete Home/ })).toBeNull();
  expect(
    recordedRequests().some((line) => {
      return line.includes("/members");
    }),
  ).toBe(false);
});
it("Cancel from saved created mode returns to list without deletion", async () => {
  installMilestoneAnswers();
  const { router } = renderAt(
    `/milestones?milestone=${milestoneId}&mode=created`,
  );
  await userEvent.click(await screen.findByRole("button", { name: "Cancel" }));
  await waitFor(() => {
    return expect(router.state.location.search).toEqual({});
  });
  expect(
    recordedRequests().filter((line) => {
      return line.startsWith("DELETE");
    }),
  ).toHaveLength(0);
});
it("always addresses a confirmed create as created, including returned mismatches", async () => {
  installMilestoneAnswers({
    "POST /api/milestones": {
      body: { ...detail, mismatchCount: 2 },
      status: 201,
    },
  });
  const { router } = renderAt("/milestones?mode=create");
  await userEvent.type(await screen.findByLabelText("What happened"), "Home");
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
  await waitFor(() => {
    return expect(router.state.location.search).toEqual({
      milestone: milestoneId,
      mode: "created",
    });
  });
});
it("late edit cannot replace a new create form after address change", async () => {
  let finish: (() => void) | undefined;
  const reply = new Promise<void>((settle) => {
    finish = settle;
  });
  installMilestoneAnswers({
    [`PATCH /api/milestones/${milestoneId}`]: {
      body: { ...detail, mismatchCount: 2 },
      status: 200,
      waitFor: reply,
    },
  });
  const { router } = renderAt(`/milestones?milestone=${milestoneId}&mode=edit`);
  await userEvent.click(
    await screen.findByRole("button", { name: "Save the changes" }),
  );
  await router.navigate({ to: "/milestones", search: { mode: "create" } });
  const input = await screen.findByLabelText("What happened");
  await userEvent.type(input, "New words");
  finish?.();
  await waitFor(() => {
    return expect(
      recordedRequests().filter((line) => {
        return line === "GET /api/milestones";
      }),
    ).toHaveLength(2);
  });
  expect(router.state.location.search).toEqual({ mode: "create" });
  expect(input).toHaveValue("New words");
});
