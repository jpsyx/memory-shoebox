import type { Viewer } from "@/session/requireSignedIn/requireSignedIn";
import { makeRemovalRequestFromOverrides } from "@/testing/askingAndOccasionsFixtureHelpers";
import { MantineProvider } from "@mantine/core";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { RemovalRequestCard } from "./RemovalRequestCard";
const VIEWER = {
  memberId: "member",
  displayName: "Mamá",
  role: "admin",
  isAdmin: true,
} as const satisfies Viewer;
function _render(
  overrides: Parameters<typeof makeRemovalRequestFromOverrides>[0] = {},
): ReturnType<typeof render> {
  return render(
    <MantineProvider>
      <RemovalRequestCard
        timezone="Europe/Madrid"
        request={makeRemovalRequestFromOverrides(overrides)}
        viewer={VIEWER}
        onDelete={vi.fn()}
        onDecline={vi.fn()}
        onWithdraw={vi.fn()}
      />
    </MantineProvider>,
  );
}
describe("removal request presentation", () => {
  it("uses capabilities rather than admin role and never permits proxy withdrawal", () => {
    _render({ canWithdraw: false, canDecline: false, canDeleteItem: false });
    expect(screen.queryByRole("button")).toBeNull();
  });
  it("preserves exact accented resolver and reply words as plain text", () => {
    const WORDS = "Sí, la guardamos.\n<b>Es nuestra.</b>";
    _render({
      state: "declined",
      canWithdraw: false,
      declineReason: WORDS,
      resolvedBy: { memberId: VIEWER.memberId, displayName: "José" },
    });
    expect(screen.getByText("What José said back")).toBeVisible();
    expect(screen.getByText(/Sí, la guardamos/).textContent).toBe(WORDS);
    expect(document.querySelector("b")).toBeNull();
  });
  it("renders Gone without a photograph or link when the item ID is null", () => {
    _render({
      itemId: null,
      media: null,
      state: "deleted",
      canWithdraw: false,
    });
    expect(screen.getByText("Gone")).toBeVisible();
    expect(screen.queryByRole("img")).toBeNull();
    expect(screen.queryByRole("link", { name: /photo/i })).toBeNull();
  });
  it("distinguishes an unavailable live item from a deleted one", () => {
    _render({ media: null, canWithdraw: false });
    expect(screen.getByText("Unavailable")).toBeVisible();
    expect(screen.queryByText("Gone")).toBeNull();
    expect(screen.queryByRole("link")).toBeNull();
  });
  it("replaces a failed live thumbnail with an unavailable marker while retaining request controls", () => {
    _render({ canWithdraw: false, canDecline: true });
    fireEvent.error(screen.getByRole("img"));
    expect(screen.getByText("Unavailable")).toBeVisible();
    expect(screen.queryByRole("img")).toBeNull();
    expect(
      screen.getByRole("link", { name: "Open the photograph" }),
    ).toBeVisible();
    expect(
      screen.getByRole("button", { name: "Keep it, and say why" }),
    ).toBeVisible();
  });
  it("uses allowed-no-reason copy and a live photograph link", () => {
    _render();
    expect(screen.getByText("No reason given.")).toBeVisible();
    expect(screen.getByRole("link", { name: /photograph/i })).toHaveAttribute(
      "href",
      expect.stringContaining("/items/"),
    );
  });
});
