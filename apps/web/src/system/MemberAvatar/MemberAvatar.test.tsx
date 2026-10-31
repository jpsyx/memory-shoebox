import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { createMeResponse } from "@/testing/createMeResponse";
import { MemberAvatar } from "./MemberAvatar";
const avatar = {
  avatarId: "018f0000-0000-7000-8000-000000000010",
  url: "https://example.com/old",
  issuedAt: "2026-10-31T00:00:00.000Z",
  expiresAt: "2099-10-31T01:00:00.000Z",
};
afterEach(() => {
  return vi.unstubAllGlobals();
});
it("reserves the requested size and decorates the name with initials", () => {
  render(
    <MemberAvatar
      member={createMeResponse({ displayName: "John M" }).me.member}
      size={30}
    />,
  );
  expect(screen.getByText("JM")).toHaveAttribute("aria-hidden", "true");
  expect(screen.getByText("JM")).toHaveStyle({ width: "30px", height: "30px" });
});
it("renews a failed source once then falls back without a retry loop", async () => {
  const account = createMeResponse({ displayName: "John M", avatar });
  const client = new QueryClient();
  client.setQueryData(["me"], account);
  const fetcher = vi.fn(async () => {
    return Response.json({
      avatar: { ...avatar, url: "https://example.com/new" },
    });
  });
  vi.stubGlobal("fetch", fetcher);
  render(
    <QueryClientProvider client={client}>
      <MemberAvatar member={account.me.member} size={30} />
    </QueryClientProvider>,
  );
  const image = screen.getByAltText("");
  fireEvent.error(image);
  await vi.waitFor(() => {
    return expect(screen.getByAltText("")).toHaveAttribute(
      "src",
      "https://example.com/new",
    );
  });
  fireEvent.error(screen.getByAltText(""));
  expect(screen.getByText("JM")).toBeVisible();
  expect(fetcher).toHaveBeenCalledTimes(1);
});
