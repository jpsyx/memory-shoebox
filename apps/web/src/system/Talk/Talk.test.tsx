import { MantineProvider } from "@mantine/core";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { CommentDto, MemberRef } from "@memory-shoebox/shared";
import type { ReactNode } from "react";
import { describe, expect, it } from "vitest";
import { CommentRow } from "@/system/Talk/CommentRow";
import { Composer } from "@/system/Talk/Composer";
import { Talk } from "@/system/Talk/Talk";
import { cssVariablesResolver } from "@/theme/cssVariablesResolver";
import { theme } from "@/theme/theme";

const VIEWER: MemberRef = { memberId: "m0", displayName: "Papá" };

const COMMENT: CommentDto = {
  commentId: "c1",
  author: { memberId: "m1", displayName: "Abuela Rosa" },
  body: "He has his mother's chin.",
  atSeconds: null,
  createdAt: "2026-09-26T09:00:00.000Z",
  editedAt: null,
  canEdit: false,
  canDelete: false,
  reactions: { kinds: [], myKind: null },
};

function _render(node: ReactNode) {
  return render(
    <MantineProvider theme={theme} cssVariablesResolver={cssVariablesResolver}>
      {node}
    </MantineProvider>,
  );
}

describe("the comments panel", () => {
  it("renders a thread with one comment in it", () => {
    _render(
      <Talk heading="What people said">
        <CommentRow comment={COMMENT} viewer={VIEWER} />
      </Talk>,
    );

    expect(screen.getByLabelText("Comments")).toBeVisible();
    expect(screen.getByText("Abuela Rosa")).toBeVisible();
    expect(screen.getByText("He has his mother's chin.")).toBeVisible();
  });

  it("offers no edit or delete to somebody the server said cannot", () => {
    _render(<CommentRow comment={COMMENT} viewer={VIEWER} />);

    expect(screen.queryByRole("button", { name: "Edit" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Delete" })).toBeNull();
  });

  it("splits the two, because the contract does", () => {
    _render(
      <CommentRow comment={{ ...COMMENT, canEdit: true }} viewer={VIEWER} />,
    );

    expect(screen.getByRole("button", { name: "Edit" })).toBeVisible();
    expect(screen.queryByRole("button", { name: "Delete" })).toBeNull();
  });

  it("enables Send once there are words to send", async () => {
    _render(<Composer goesTo="This goes to everybody who can see it." />);

    const send = screen.getByRole("button", { name: /Send/ });
    expect(send).toBeDisabled();

    await userEvent.type(
      screen.getByRole("textbox", { name: "Say something" }),
      "He has his mother's chin.",
    );

    expect(send).toBeEnabled();
  });
});
