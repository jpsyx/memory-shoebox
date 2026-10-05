import { LIMITS } from "@memory-shoebox/shared";
import { fireEvent, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { countCallsTo } from "@/surfaces/Account/AccountSurface/__tests__/AccountSurface.fixtures";
import {
  INVITED,
  renderMembers,
} from "@/surfaces/Members/MembersSurface/__tests__/memberFixtureHelpers";
function _renderDelayedSuggestions(): () => void {
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
  return () => {
    release();
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
});
async function _openInvite(): Promise<ReturnType<typeof userEvent.setup>> {
  const user = userEvent.setup();
  await user.click(
    await screen.findByRole("button", { name: "Invite somebody" }),
  );
  return user;
}
describe("Members administration", () => {
  it("marks an overlong display name without blaming a valid address", async () => {
    renderMembers();
    const user = await _openInvite();
    await user.type(screen.getByLabelText("Their email"), "new@example.com");
    const name = "x".repeat(LIMITS.memberDisplayNameMaxLength + 1);
    fireEvent.change(screen.getByLabelText("What to call them"), {
      target: { value: name },
    });
    await user.click(
      screen.getByRole("button", { name: "Send the invitation" }),
    );
    expect(
      await screen.findByText(
        `Use ${LIMITS.memberDisplayNameMaxLength} characters or fewer.`,
      ),
    ).toBeVisible();
    expect(screen.getByLabelText("What to call them")).toHaveAttribute(
      "aria-invalid",
      "true",
    );
    expect(screen.getByLabelText("What to call them")).toHaveValue(name);
    expect(screen.getByLabelText("Their email")).not.toHaveAttribute(
      "aria-invalid",
      "true",
    );
    expect(
      screen.queryByText("Enter a valid email address."),
    ).not.toBeInTheDocument();
    expect(countCallsTo("POST", "/api/members")).toBe(0);
  });
  it("prefills a suggested name but preserves a deliberate edit when another suggestion arrives", async () => {
    const release = _renderDelayedSuggestions();
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
  it("disables the invitation address and cancellation while sending", async () => {
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
