import { CREATED_SESSION } from "@/surfaces/SignIn/SignInCard/__tests__/SignInCard.fixtures";
import {
  ADMIN,
  fillSetupAccount,
  getSetupAnswerFromRequest,
  makeSetupNavigationHarnessFromOptions,
} from "@/testing/setupNavigationTestHelpers";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it, vi } from "vitest";

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

it("cold deep load opens setup and reviews a normalized permanent address before creation", async () => {
  let initialized = false;
  let submitted: unknown;
  const { router, client } = makeSetupNavigationHarnessFromOptions({
    path: "/items/abc",
    answer: ({ path, init }) => {
      if (path === "/api/setup" && init?.method === "POST") {
        submitted = JSON.parse(String(init.body));
        initialized = true;
        return { body: { ...CREATED_SESSION, ...ADMIN }, status: 201 };
      }
      if (path === "/api/setup") {
        return { body: { isRequired: !initialized } };
      }
      if (path === "/api/setup/progress") {
        return { body: { needsInvitations: true } };
      }
      return getSetupAnswerFromRequest({ path });
    },
  });
  const user = await fillSetupAccount();
  expect(submitted).toBeUndefined();
  expect(screen.getByText("owner@example.com")).toBeVisible();
  expect(screen.getByText(/permanent sign-in address/)).toBeVisible();
  await user.click(screen.getByRole("button", { name: "Create your Shoebox" }));
  await screen.findByRole("heading", { name: "Invite your people." });
  expect(submitted).toMatchObject({
    admin: { email: "owner@example.com" },
    public: { baseUrl: window.location.origin },
    shoebox: { timezone: Intl.DateTimeFormat().resolvedOptions().timeZone },
  });
  expect(submitted).not.toHaveProperty("mail");
  expect(client.getQueryData(["me"])).toMatchObject({ me: ADMIN.me });
  expect(router.state.location.pathname).toBe("/setup/invite");
});
it.each([true, false])(
  "lost creation response recovers cookie=%s or goes to ordinary sign-in",
  async (hasCookie) => {
    let created = false;
    const { router } = makeSetupNavigationHarnessFromOptions({
      path: "/setup",
      answer: ({ path, init }) => {
        if (path === "/api/setup" && init?.method === "POST") {
          created = true;
          throw new TypeError("Lost response");
        }
        if (path === "/api/setup") {
          return { body: { isRequired: !created } };
        }
        if (path === "/api/me") {
          return hasCookie && created
            ? { body: ADMIN }
            : {
                body: { error: "not_signed_in", message: "No session" },
                status: 401,
              };
        }
        if (path === "/api/setup/progress") {
          return { body: { needsInvitations: true } };
        }
        return getSetupAnswerFromRequest({ path });
      },
    });
    const user = await fillSetupAccount();
    await user.click(
      screen.getByRole("button", { name: "Create your Shoebox" }),
    );
    await waitFor(() => {
      return expect(router.state.location.pathname).toBe(
        hasCookie ? "/setup/invite" : "/sign-in",
      );
    });
    expect(router.state.location.search).toEqual({});
  },
);
it("a stale setup tab receives conflict then follows sign-in", async () => {
  let created = false;
  const { router } = makeSetupNavigationHarnessFromOptions({
    path: "/setup",
    answer: ({ path, init }) => {
      if (path === "/api/setup" && init?.method === "POST") {
        created = true;
        return {
          body: { error: "setup_already_completed", message: "Configured" },
          status: 409,
        };
      }
      if (path === "/api/setup") {
        return { body: { isRequired: !created } };
      }
      if (path === "/api/me") {
        return {
          body: { error: "not_signed_in", message: "No session" },
          status: 401,
        };
      }
      return getSetupAnswerFromRequest({ path });
    },
  });
  const user = await fillSetupAccount();
  await user.click(screen.getByRole("button", { name: "Create your Shoebox" }));
  await waitFor(() => {
    return expect(router.state.location.pathname).toBe("/sign-in");
  });
});
it("nested server validation maps to the labelled field and focuses it", async () => {
  makeSetupNavigationHarnessFromOptions({
    path: "/setup",
    answer: ({ path, init }) => {
      return path === "/api/setup"
        ? init?.method === "POST"
          ? {
              body: {
                error: "invalid_request",
                message: "Invalid",
                details: {
                  fieldErrors: { "admin.email": ["Use a different email."] },
                },
              },
              status: 400,
            }
          : { body: { isRequired: true } }
        : getSetupAnswerFromRequest({ path });
    },
  });
  const user = await fillSetupAccount();
  await user.click(screen.getByRole("button", { name: "Create your Shoebox" }));
  expect(await screen.findByText("Use a different email.")).toBeVisible();
  await waitFor(() => {
    return expect(screen.getByLabelText("Your email")).toHaveFocus();
  });
});
it("falls back to UTC for an invalid browser timezone and leaves optional sender blank", async () => {
  vi.spyOn(Intl.DateTimeFormat.prototype, "resolvedOptions").mockReturnValue({
    ...Intl.DateTimeFormat().resolvedOptions(),
    timeZone: "Invalid/Zone",
  });
  makeSetupNavigationHarnessFromOptions({
    path: "/setup",
    answer: ({ path }) => {
      return path === "/api/setup"
        ? { body: { isRequired: true } }
        : getSetupAnswerFromRequest({ path });
    },
  });
  expect(await screen.findByLabelText("Timezone")).toHaveValue("UTC");
  expect(screen.getByLabelText("Sender email (optional)")).toHaveValue("");
});
it("review Back preserves edits, sender differs from inbox, and setup writes no browser storage", async () => {
  const localWrites = vi.spyOn(Storage.prototype, "setItem");
  let created = false;
  let submitted: unknown;
  const { router } = makeSetupNavigationHarnessFromOptions({
    path: "/setup",
    answer: ({ path, init }) => {
      if (path === "/api/setup" && init?.method === "POST") {
        submitted = JSON.parse(String(init.body));
        created = true;
        return { body: { ...CREATED_SESSION, ...ADMIN }, status: 201 };
      }
      if (path === "/api/setup") {
        return { body: { isRequired: !created } };
      }
      if (path === "/api/setup/progress") {
        return { body: { needsInvitations: true } };
      }
      return getSetupAnswerFromRequest({ path });
    },
  });
  const user = await fillSetupAccount();
  await user.click(screen.getByRole("button", { name: "Go back and edit" }));
  expect(screen.getByLabelText("Your name")).toHaveValue("Owner");
  await user.type(
    screen.getByLabelText("Sender email (optional)"),
    "family@example.com",
  );
  await user.clear(screen.getByLabelText("Public URL"));
  await user.type(
    screen.getByLabelText("Public URL"),
    "https://family.example.com",
  );
  await user.click(screen.getByRole("button", { name: "Review your email" }));
  await user.click(screen.getByRole("button", { name: "Create your Shoebox" }));
  await screen.findByRole("heading", { name: "Invite your people." });
  expect(submitted).toMatchObject({
    mail: { fromAddress: "family@example.com", fromName: null },
    public: { baseUrl: "https://family.example.com" },
  });
  expect(localWrites).not.toHaveBeenCalled();
  expect(router.state.location.search).toEqual({});
  expect(
    await screen.findByText(/Set a sender email in Shoebox settings/),
  ).toBeVisible();
});
it("a creation rejection without field details still explains how to retry", async () => {
  makeSetupNavigationHarnessFromOptions({
    path: "/setup",
    answer: ({ path, init }) => {
      if (path === "/api/setup") {
        return init?.method === "POST"
          ? {
              body: { error: "invalid_request", message: "Invalid request" },
              status: 400,
            }
          : { body: { isRequired: true } };
      }
      return getSetupAnswerFromRequest({ path });
    },
  });
  const user = await fillSetupAccount();
  await user.click(screen.getByRole("button", { name: "Create your Shoebox" }));
  expect(await screen.findByRole("alert")).toHaveTextContent(/try again/);
});

it("marks and focuses the invalid admin name and email before review", async () => {
  makeSetupNavigationHarnessFromOptions({
    path: "/setup",
    answer: ({ path }) => {
      return path === "/api/setup"
        ? { body: { isRequired: true } }
        : getSetupAnswerFromRequest({ path });
    },
  });
  const user = userEvent.setup();
  const name = await screen.findByLabelText("Your name");
  const email = screen.getByLabelText("Your email");
  await user.type(email, "owner@example.com");
  await user.click(screen.getByRole("button", { name: "Review your email" }));
  expect(name).toHaveAttribute("aria-invalid", "true");
  await waitFor(() => {
    expect(name).toHaveFocus();
  });
  await user.type(name, "Owner");
  await user.clear(email);
  await user.click(screen.getByRole("button", { name: "Review your email" }));
  expect(email).toHaveAttribute("aria-invalid", "true");
  await waitFor(() => {
    expect(email).toHaveFocus();
  });
});
