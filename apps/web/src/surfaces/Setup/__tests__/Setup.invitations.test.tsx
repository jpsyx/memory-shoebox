import {
  getSetupAnswerFromRequest,
  INVITED,
  makeSetupNavigationHarnessFromOptions,
} from "@/testing/setupNavigationTestHelpers";
import { LIMITS } from "@memory-shoebox/shared";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it, vi } from "vitest";
import { createUncertainInvitationScenario } from "./createUncertainInvitationScenario";

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

it("pending admin reload reaches invites, preserves successes and retries only failures", async () => {
  let complete = false;
  let failed = true;
  const requests: string[] = [];
  const { router } = makeSetupNavigationHarnessFromOptions({
    path: "/",
    answer: ({ path, init }) => {
      if (path === "/api/setup/progress") {
        return { body: { needsInvitations: !complete } };
      }
      if (path === "/api/setup/complete") {
        complete = true;
        return { body: null, status: 204 };
      }
      if (path === "/api/members" && init?.method === "POST") {
        const body = JSON.parse(String(init.body));
        requests.push(body.email);
        if (body.email === "two@example.com" && failed) {
          return {
            body: { error: "rate_limited", message: "Wait" },
            status: 429,
          };
        }
        return { body: { ...INVITED, email: body.email }, status: 201 };
      }
      return getSetupAnswerFromRequest({ path });
    },
  });
  const user = userEvent.setup();
  await user.type(await screen.findByLabelText("Email 1"), "one@example.com");
  await user.click(screen.getByRole("button", { name: "Add another person" }));
  await user.type(screen.getByLabelText("Email 2"), "two@example.com");
  await user.click(screen.getByRole("button", { name: "Send invitations" }));
  await screen.findByText("Invitation queued for one@example.com.");
  expect(requests).toEqual(["one@example.com", "two@example.com"]);
  failed = false;
  await user.click(screen.getByRole("button", { name: "Retry invitations" }));
  await waitFor(() => {
    return expect(router.state.location.pathname).toBe("/");
  });
  expect(requests).toEqual([
    "one@example.com",
    "two@example.com",
    "two@example.com",
  ]);
});
it("recovers a lost invitation response from a matching pending row", async () => {
  let complete = false;
  let posts = 0;
  const { router } = makeSetupNavigationHarnessFromOptions({
    path: "/setup/invite",
    answer: ({ path, init }) => {
      if (path === "/api/setup/progress") {
        return { body: { needsInvitations: !complete } };
      }
      if (path === "/api/setup/complete") {
        complete = true;
        return { body: null, status: 204 };
      }
      if (path === "/api/members" && init?.method === "POST") {
        posts++;
        throw new TypeError("Lost response");
      }
      if (path === "/api/members") {
        return {
          body: {
            shape: "admin",
            members: [INVITED],
            activeAdminCount: 1,
            nextCursor: null,
          },
        };
      }
      return getSetupAnswerFromRequest({ path });
    },
  });
  const user = userEvent.setup();
  await user.type(await screen.findByLabelText("Email 1"), "one@example.com");
  await user.click(screen.getByRole("button", { name: "Send invitations" }));
  await waitFor(() => {
    return expect(router.state.location.pathname).toBe("/");
  });
  expect(posts).toBe(1);
});
it("ordinary existing-member conflicts stay failures and allow skip", async () => {
  let complete = false;
  const { router } = makeSetupNavigationHarnessFromOptions({
    path: "/setup/invite",
    answer: ({ path, init }) => {
      if (path === "/api/setup/progress") {
        return { body: { needsInvitations: !complete } };
      }
      if (path === "/api/setup/complete") {
        complete = true;
        return { body: null, status: 204 };
      }
      if (path === "/api/members" && init?.method === "POST") {
        return {
          body: { error: "member_already_exists", message: "Exists" },
          status: 409,
        };
      }
      if (path === "/api/members") {
        return {
          body: {
            shape: "admin",
            members: [INVITED],
            activeAdminCount: 1,
            nextCursor: null,
          },
        };
      }
      return getSetupAnswerFromRequest({ path });
    },
  });
  const user = userEvent.setup();
  await user.type(await screen.findByLabelText("Email 1"), "one@example.com");
  await user.click(screen.getByRole("button", { name: "Send invitations" }));
  expect(await screen.findByText(/already has an account/)).toBeVisible();
  expect(
    screen.queryByText("Invitation queued for one@example.com."),
  ).toBeNull();
  await user.click(screen.getByRole("button", { name: "Skip for now" }));
  await waitFor(() => {
    return expect(router.state.location.pathname).toBe("/");
  });
});
it("invalid intended row prevents every invitation write and focuses its email", async () => {
  makeSetupNavigationHarnessFromOptions({
    path: "/setup/invite",
    answer: getSetupAnswerFromRequest,
  });
  const user = userEvent.setup();
  await user.type(await screen.findByLabelText("Email 1"), "one@example.com");
  await user.click(screen.getByRole("button", { name: "Add another person" }));
  await user.click(screen.getByRole("button", { name: "Send invitations" }));
  expect(screen.getByLabelText("Email 2")).toHaveFocus();
  expect(screen.getByLabelText("Email 2")).toBeInvalid();
  expect(screen.getByLabelText("Email 2")).toHaveAccessibleDescription();
  expect(
    vi.mocked(fetch).mock.calls.filter(([path, init]) => {
      return path === "/api/members" && init?.method === "POST";
    }),
  ).toHaveLength(0);
  expect(screen.getByLabelText("Role 1").tagName).toBe("SELECT");
});
it("attaches an invalid invitation name to its field and prevents every write", async () => {
  makeSetupNavigationHarnessFromOptions({
    path: "/setup/invite",
    answer: getSetupAnswerFromRequest,
  });
  const user = userEvent.setup();
  await user.type(await screen.findByLabelText("Email 1"), "one@example.com");
  const name = screen.getByLabelText("Name 1 (optional)");
  await user.type(name, "a".repeat(LIMITS.memberDisplayNameMaxLength + 1));
  await user.click(screen.getByRole("button", { name: "Send invitations" }));
  expect(name).toHaveFocus();
  expect(name).toBeInvalid();
  expect(name).toHaveAccessibleDescription();
  expect(screen.getByLabelText("Email 1")).not.toBeInvalid();
  expect(
    vi.mocked(fetch).mock.calls.filter(([path, init]) => {
      return path === "/api/members" && init?.method === "POST";
    }),
  ).toHaveLength(0);
});
it("an uncertain draft rechecks the pending directory before retrying a lost response", async () => {
  const scenario = createUncertainInvitationScenario();
  const { router } = makeSetupNavigationHarnessFromOptions({
    path: "/setup/invite",
    answer: scenario.answer,
  });
  const user = userEvent.setup();
  await user.type(await screen.findByLabelText("Email 1"), "one@example.com");
  await user.click(screen.getByRole("button", { name: "Send invitations" }));
  await screen.findByText(/Could not confirm this invitation/);
  scenario.setDirectoryAvailable();
  await user.click(screen.getByRole("button", { name: "Retry invitations" }));
  await waitFor(() => {
    expect(router.state.location.pathname).toBe("/");
  });
  expect(scenario.getPosts()).toBe(1);
});
it("repeated unavailable directory reads retain uncertain invitation recovery before any new write", async () => {
  const scenario = createUncertainInvitationScenario();
  const { router } = makeSetupNavigationHarnessFromOptions({
    path: "/setup/invite",
    answer: scenario.answer,
  });
  const user = userEvent.setup();
  await user.type(await screen.findByLabelText("Email 1"), "one@example.com");
  await user.click(screen.getByRole("button", { name: "Send invitations" }));
  await screen.findByText(/Could not confirm this invitation/);
  await user.click(screen.getByRole("button", { name: "Retry invitations" }));
  await waitFor(() => {
    expect(scenario.getReads()).toBe(2);
  });
  await waitFor(() => {
    expect(
      screen.getByRole("button", { name: "Retry invitations" }),
    ).not.toHaveAttribute("data-loading");
  });
  scenario.setDirectoryAvailable();
  await user.click(screen.getByRole("button", { name: "Retry invitations" }));
  await waitFor(() => {
    expect(router.state.location.pathname).toBe("/");
  });
  expect(scenario.getPosts()).toBe(1);
});
