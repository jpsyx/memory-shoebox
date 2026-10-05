import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { meQueryOptions } from "@/api/me/me";
import { createMeResponse } from "@/testing/createMeResponse";
import { countCallsTo } from "@/surfaces/Account/AccountSurface/__tests__/AccountSurface.fixtures";
import {
  ADMIN_ACCOUNT,
  INVITED,
  makeMember,
  renderMembers,
} from "@/surfaces/Members/MembersSurface/MembersSurface.fixtures";

afterEach(() => {
  return vi.unstubAllGlobals();
});
const SECOND_ADMIN = makeMember({
  memberId: "018f0000-0000-7000-8000-000000000004",
  displayName: "Mamá",
  email: "mama@example.com",
  isLastActiveAdmin: false,
});
async function _openInvite() {
  const user = userEvent.setup();
  await user.click(
    await screen.findByRole("button", { name: "Invite somebody" }),
  );
  return user;
}
describe("Members administration", () => {
  it("shows pending and expired invitations, roles and navigation", async () => {
    renderMembers({
      members: [
        makeMember(),
        INVITED,
        makeMember({
          ...INVITED,
          memberId: SECOND_ADMIN.memberId,
          displayName: "Mamá",
          invitation: {
            ...INVITED.invitation!,
            expiresAt: "2099-09-08T10:00:00.000Z",
            isPending: true,
          },
        }),
      ],
    });
    expect(await screen.findByText("Invitation expired")).toBeVisible();
    expect(screen.getByText("Invitation pending")).toBeVisible();
    expect(screen.getByRole("link", { name: "Groups" })).toHaveAttribute(
      "href",
      "/groups",
    );
    expect(
      screen.getByRole("link", { name: "Changes by Papá" }),
    ).toHaveAttribute(
      "href",
      `/changes?actorMemberId=${ADMIN_ACCOUNT.me.member.memberId}`,
    );
    expect(
      screen.getByRole("link", { name: "Back to my account" }),
    ).toHaveAttribute("href", "/account");
  });
  it("prefills a suggested name but preserves a deliberate edit when another suggestion arrives", async () => {
    let release = () => {};
    renderMembers({
      routes: {
        "GET /api/member-suggestions?email=tomas%40example.com": {
          body: {
            suggestions: [
              {
                person: {
                  personId: INVITED.memberId,
                  displayName: "Abuelo Tomás",
                },
                itemCount: 41,
              },
            ],
            nextCursor: null,
          },
          status: 200,
        },
        "GET /api/member-suggestions?email=mama%40example.com": {
          body: {
            suggestions: [
              {
                person: { personId: INVITED.memberId, displayName: "Mamá" },
                itemCount: 2,
              },
            ],
            nextCursor: null,
          },
          status: 200,
          waitFor: new Promise((settle) => {
            release = () => {
              return settle(undefined);
            };
          }),
        },
      },
    });
    const user = await _openInvite();
    await user.type(screen.getByLabelText("Their email"), "tomas@example.com");
    await waitFor(() => {
      return expect(screen.getByLabelText("What to call them")).toHaveValue(
        "Abuelo Tomás",
      );
    });
    await user.clear(screen.getByLabelText("What to call them"));
    await user.type(screen.getByLabelText("What to call them"), "Tío Tomás");
    await user.clear(screen.getByLabelText("Their email"));
    await user.type(screen.getByLabelText("Their email"), "mama@example.com");
    release();
    await waitFor(() => {
      return expect(
        countCallsTo("GET", "/api/member-suggestions?email=mama%40example.com"),
      ).toBeGreaterThan(0);
    });
    expect(screen.getByLabelText("What to call them")).toHaveValue("Tío Tomás");
  });
  it("validates fields before inviting and retains values on server field errors", async () => {
    renderMembers({
      routes: {
        "POST /api/members": {
          status: 400,
          body: {
            error: "invalid_request",
            message: "Invalid",
            details: {
              fieldErrors: { email: ["This address cannot be used."] },
            },
          },
        },
      },
    });
    const user = await _openInvite();
    await user.click(
      screen.getByRole("button", { name: "Send the invitation" }),
    );
    expect(
      await screen.findByText("Enter a valid email address."),
    ).toBeVisible();
    expect(countCallsTo("POST", "/api/members")).toBe(0);
    await user.type(screen.getByLabelText("Their email"), "new@example.com");
    await user.type(screen.getByLabelText("What to call them"), "New person");
    await user.click(
      screen.getByRole("button", { name: "Send the invitation" }),
    );
    expect(
      await screen.findByText("This address cannot be used."),
    ).toBeVisible();
    expect(screen.getByLabelText("What to call them")).toHaveValue(
      "New person",
    );
  });
  it("saves a role and invalidates related queries", async () => {
    const { queryClient } = renderMembers({
      members: [makeMember({ isLastActiveAdmin: false }), SECOND_ADMIN],
      routes: {
        [`PATCH /api/members/${SECOND_ADMIN.memberId}`]: {
          status: 200,
          body: { ...SECOND_ADMIN, role: "uploader" },
        },
      },
    });
    queryClient.setQueryData(["groups", "picker"], { groups: [] });
    const user = userEvent.setup();
    await user.click(
      await screen.findByRole("button", { name: "Change role for Mamá" }),
    );
    await user.selectOptions(screen.getByLabelText("Role"), "uploader");
    await user.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => {
      return expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });
    expect(countCallsTo("PATCH", `/api/members/${SECOND_ADMIN.memberId}`)).toBe(
      1,
    );
    expect(queryClient.getQueryState(["groups", "picker"])?.isInvalidated).toBe(
      true,
    );
  });
  it("blocks the last active admin's role Save and Remove before fetch, excluding invited admins", async () => {
    renderMembers();
    const user = userEvent.setup();
    await user.click(
      await screen.findByRole("button", { name: "Change role for Papá" }),
    );
    await user.selectOptions(screen.getByLabelText("Role"), "viewer");
    expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();
    expect(
      screen.getByText(/Make somebody else an active admin first/),
    ).toBeVisible();
    await user.click(screen.getByRole("button", { name: "Save" }));
    expect(
      countCallsTo("PATCH", `/api/members/${ADMIN_ACCOUNT.me.member.memberId}`),
    ).toBe(0);
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    await user.click(screen.getByRole("button", { name: "Remove Papá" }));
    expect(screen.getByRole("button", { name: "Remove them" })).toBeDisabled();
    expect(
      countCallsTo(
        "DELETE",
        `/api/members/${ADMIN_ACCOUNT.me.member.memberId}`,
      ),
    ).toBe(0);
  });
  it("keeps a concurrent last-admin refusal open with recovery copy", async () => {
    renderMembers({
      members: [makeMember({ isLastActiveAdmin: false }), SECOND_ADMIN],
      routes: {
        [`PATCH /api/members/${SECOND_ADMIN.memberId}`]: {
          status: 409,
          body: { error: "members_last_admin", message: "Conflict" },
        },
      },
    });
    const user = userEvent.setup();
    await user.click(
      await screen.findByRole("button", { name: "Change role for Mamá" }),
    );
    await user.selectOptions(screen.getByLabelText("Role"), "viewer");
    await user.click(screen.getByRole("button", { name: "Save" }));
    expect(
      await screen.findByText(/Make somebody else an active admin first/),
    ).toBeVisible();
    expect(screen.getByRole("dialog")).toBeVisible();
    expect(screen.getByLabelText("Role")).toHaveValue("viewer");
  });
  it("explains preserved content before removing a member", async () => {
    renderMembers({
      members: [makeMember({ isLastActiveAdmin: false }), SECOND_ADMIN],
      routes: {
        [`DELETE /api/members/${SECOND_ADMIN.memberId}`]: {
          status: 200,
          body: { ...SECOND_ADMIN, status: "removed" },
        },
      },
    });
    const user = userEvent.setup();
    await user.click(
      await screen.findByRole("button", { name: "Remove Mamá" }),
    );
    expect(
      screen.getByText(/Nothing they uploaded or wrote is deleted/),
    ).toBeVisible();
    await user.click(screen.getByRole("button", { name: "Remove them" }));
    await waitFor(() => {
      return expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });
  });
  it("shows resend throttling and prevents repeated sends during the wait", async () => {
    renderMembers({
      routes: {
        [`POST /api/members/${INVITED.memberId}/invitation/resend`]: {
          status: 429,
          body: {
            error: "rate_limited",
            message: "Wait",
            details: { retryAfterSeconds: 60 },
          },
        },
      },
    });
    const user = userEvent.setup();
    await user.click(
      await screen.findByRole("button", {
        name: "Send invitation again to Tomás",
      }),
    );
    expect(await screen.findByText(/Wait 60 seconds/)).toBeVisible();
    expect(
      screen.getByRole("button", { name: "Send invitation again to Tomás" }),
    ).toBeDisabled();
  });
  it("allows another resend after the server's retry deadline", async () => {
    renderMembers({
      routes: {
        [`POST /api/members/${INVITED.memberId}/invitation/resend`]: {
          status: 429,
          body: {
            error: "rate_limited",
            message: "Wait",
            details: { retryAfterSeconds: 1 },
          },
        },
      },
    });
    const user = userEvent.setup();
    const button = await screen.findByRole("button", {
      name: "Send invitation again to Tomás",
    });
    await user.click(button);
    expect(await screen.findByText(/Wait 1 seconds/)).toBeVisible();
    expect(button).toBeDisabled();
    await waitFor(
      () => {
        return expect(button).toBeEnabled();
      },
      { timeout: 2500 },
    );
  });
  it("revokes an invitation through a confirmation", async () => {
    renderMembers({
      routes: {
        [`DELETE /api/members/${INVITED.memberId}/invitation`]: {
          status: 200,
          body: { ...INVITED, status: "removed" },
        },
      },
    });
    const user = userEvent.setup();
    await user.click(
      await screen.findByRole("button", {
        name: "Revoke invitation for Tomás",
      }),
    );
    await user.click(screen.getByRole("button", { name: "Revoke invitation" }));
    await waitFor(() => {
      return expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });
    expect(
      countCallsTo("DELETE", `/api/members/${INVITED.memberId}/invitation`),
    ).toBe(1);
  });
  it.each([false, true])(
    "revokes an own device (current: %s)",
    async (isCurrent) => {
      const sessionId = INVITED.memberId;
      const device = {
        sessionId,
        deviceLabel: "Family phone",
        createdAt: "2026-09-01T10:00:00.000Z",
        lastUsedAt: "2026-09-01T10:00:00.000Z",
        expiresAt: "2099-09-01T10:00:00.000Z",
        isCurrent,
      };
      const { router } = renderMembers({
        members: [makeMember({ sessions: [device] })],
        routes: {
          [`DELETE /api/members/${ADMIN_ACCOUNT.me.member.memberId}/sessions/${sessionId}`]:
            { status: 204, body: undefined },
        },
      });
      const user = userEvent.setup();
      await user.click(
        await screen.findByRole("button", {
          name: "Sign out Family phone for Papá",
        }),
      );
      const dialog = await screen.findByRole("dialog");
      await user.click(
        within(dialog).getByRole("button", {
          name: isCurrent ? "Sign out here" : "Sign it out",
        }),
      );
      await waitFor(() => {
        return expect(
          countCallsTo(
            "DELETE",
            `/api/members/${ADMIN_ACCOUNT.me.member.memberId}/sessions/${sessionId}`,
          ),
        ).toBe(1);
      });
      if (isCurrent) {
        await waitFor(() => {
          return expect(router.state.location.pathname).toBe("/sign-in");
        });
      } else {
        await waitFor(() => {
          return expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
        });
      }
    },
  );
  it("does not read privileged members for a viewer", async () => {
    renderMembers({ account: createMeResponse({ role: "viewer" }) });
    expect(
      await screen.findByText("Only an admin can manage members."),
    ).toBeVisible();
    expect(countCallsTo("GET", "/api/members")).toBe(0);
  });
  it("refreshes authority after self-demotion and removes privileged controls", async () => {
    const { router } = renderMembers({
      members: [makeMember({ isLastActiveAdmin: false }), SECOND_ADMIN],
    });
    const originalFetch = fetch;
    let hasDemoted = false;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (path: string, init?: RequestInit) => {
        if (
          path === `/api/members/${ADMIN_ACCOUNT.me.member.memberId}` &&
          init?.method === "PATCH"
        ) {
          hasDemoted = true;
          return Response.json(
            makeMember({ role: "viewer", isLastActiveAdmin: false }),
          );
        }
        if (path === "/api/me" && hasDemoted) {
          return Response.json(createMeResponse({ role: "viewer" }));
        }
        if (path === "/api/members" && hasDemoted) {
          return Response.json({
            shape: "directory",
            members: [],
            nextCursor: null,
          });
        }
        return originalFetch(path, init);
      }),
    );
    const user = userEvent.setup();
    await user.click(
      await screen.findByRole("button", { name: "Change role for Papá" }),
    );
    await user.selectOptions(screen.getByLabelText("Role"), "viewer");
    await user.click(screen.getByRole("button", { name: "Save" }));
    expect(
      await screen.findByText("Only an admin can manage members."),
    ).toBeVisible();
    await waitFor(() => {
      return expect(
        router.state.matches.some((match) => {
          return (
            "viewer" in match.context && match.context.viewer.isAdmin === false
          );
        }),
      ).toBe(true);
    });
    expect(
      screen.queryByRole("button", { name: "Invite somebody" }),
    ).not.toBeInTheDocument();
  });
  it("clears private data and returns to sign-in after self-removal", async () => {
    const { router, queryClient } = renderMembers({
      members: [makeMember({ isLastActiveAdmin: false }), SECOND_ADMIN],
      routes: {
        [`DELETE /api/members/${ADMIN_ACCOUNT.me.member.memberId}`]: {
          status: 200,
          body: makeMember({ status: "removed" }),
        },
      },
    });
    queryClient.setQueryData(["groups", "picker"], { groups: [] });
    const user = userEvent.setup();
    await user.click(
      await screen.findByRole("button", { name: "Remove Papá" }),
    );
    await user.click(screen.getByRole("button", { name: "Remove them" }));
    await waitFor(() => {
      return expect(router.state.location.pathname).toBe("/sign-in");
    });
    expect(queryClient.getQueryData(["groups", "picker"])).toBeUndefined();
  });
  it("rechecks current authority before executing an open role confirmation", async () => {
    const { queryClient } = renderMembers({
      members: [makeMember({ isLastActiveAdmin: false }), SECOND_ADMIN],
    });
    const user = userEvent.setup();
    await user.click(
      await screen.findByRole("button", { name: "Change role for Mamá" }),
    );
    queryClient.setQueryData(
      meQueryOptions.queryKey,
      createMeResponse({ role: "viewer" }),
    );
    const save = screen.queryByRole("button", { name: "Save" });
    if (save !== null) {
      await user.click(save);
    }
    await screen.findByText("Only an admin can manage members.");
    expect(countCallsTo("PATCH", `/api/members/${SECOND_ADMIN.memberId}`)).toBe(
      0,
    );
  });
  it("refreshes account authority when a directory read refuses stale admin access", async () => {
    const { router } = renderMembers({
      routes: {
        "GET /api/members": {
          status: 403,
          body: { error: "members_forbidden", message: "Admin required" },
        },
      },
    });
    const originalFetch = fetch;
    let accountReads = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (path: string, init?: RequestInit) => {
        if (path === "/api/me") {
          accountReads += 1;
          return Response.json(
            accountReads === 1
              ? ADMIN_ACCOUNT
              : createMeResponse({ role: "viewer" }),
          );
        }
        return originalFetch(path, init);
      }),
    );
    expect(
      await screen.findByText("Only an admin can manage members."),
    ).toBeVisible();
    await waitFor(() => {
      return expect(
        router.state.matches.some((match) => {
          return (
            "viewer" in match.context && match.context.viewer.isAdmin === false
          );
        }),
      ).toBe(true);
    });
  });
  it("offers Retry after a failed directory read", async () => {
    renderMembers({
      routes: {
        "GET /api/members": {
          status: 500,
          body: { error: "server_error", message: "Unavailable" },
        },
      },
    });
    const user = userEvent.setup();
    await user.click(await screen.findByRole("button", { name: "Retry" }));
    await waitFor(() => {
      return expect(countCallsTo("GET", "/api/members")).toBe(2);
    });
  });
  it("disables invite fields and cancellation while the write is pending", async () => {
    let release = () => {};
    renderMembers({
      routes: {
        "POST /api/members": {
          status: 201,
          body: INVITED,
          waitFor: new Promise((settle) => {
            release = () => {
              return settle(undefined);
            };
          }),
        },
      },
    });
    const user = await _openInvite();
    await user.type(screen.getByLabelText("Their email"), "new@example.com");
    await user.click(
      screen.getByRole("button", { name: "Send the invitation" }),
    );
    expect(screen.getByLabelText("Their email")).toBeDisabled();
    expect(screen.getByRole("button", { name: "Cancel" })).toBeDisabled();
    release();
    expect(await screen.findByText(/Invitation queued for/)).toBeVisible();
  });
});
