import { act, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { it, expect, vi } from "vitest";
import { renderMembers, INVITED } from "./MembersSurface.fixtures";
import { MEMBER_CONTINUATION_QUERY_KEY } from "@/surfaces/Members/useMemberContinuationGate";
import { countCallsTo } from "@/surfaces/Account/AccountSurface/__tests__/AccountSurface.fixtures";

it("retains a committed invitation recovery after route changes and normal cache expiry", async () => {
  vi.spyOn(window, "scrollTo").mockImplementation(() => {});
  const { router, queryClient } = renderMembers({
    routes: {
      "POST /api/members": {
        status: 201,
        body: { ...INVITED, email: "new@example.com" },
      },
    },
  });
  queryClient.setDefaultOptions({ queries: { retry: false, gcTime: 1 } });
  const user = userEvent.setup();
  await user.click(
    await screen.findByRole("button", { name: "Invite somebody" }),
  );
  await user.type(screen.getByLabelText("Their email"), "new@example.com");
  const originalFetch = fetch;
  let failAccount = true;
  vi.stubGlobal(
    "fetch",
    vi.fn(async (path: string, init?: RequestInit) => {
      if (path === "/api/me" && failAccount)
        return Response.json(
          { error: "unavailable", message: "Account temporarily unavailable" },
          { status: 503 },
        );
      return originalFetch(path, init);
    }),
  );
  await user.click(screen.getByRole("button", { name: "Send the invitation" }));
  await screen.findByRole("button", { name: "Refresh your account" });
  expect(countCallsTo("POST", "/api/members")).toBe(1);
  failAccount = false;
  await act(async () => {
    await router.navigate({ to: "/account" });
  });
  await act(async () => {
    await new Promise((done) => {
      return setTimeout(done, 20);
    });
  });
  expect(queryClient.getQueryData(MEMBER_CONTINUATION_QUERY_KEY)).toMatchObject(
    { hasCommitted: true },
  );
  await act(async () => {
    await router.navigate({ to: "/members" });
  });
  await user.click(
    await screen.findByRole("button", { name: "Refresh your account" }),
  );
  await waitFor(() => {
    expect(
      screen.queryByRole("button", { name: "Refresh your account" }),
    ).not.toBeInTheDocument();
  });
  expect(countCallsTo("POST", "/api/members")).toBe(1);
});
