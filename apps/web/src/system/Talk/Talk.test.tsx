import { MantineProvider } from "@mantine/core";
import { render, screen } from "@testing-library/react";
import type { CommentDto, MemberRef } from "@memory-shoebox/shared";
import { describe, expect, it } from "vitest";
import { CommentRow } from "@/system/Talk/CommentRow/CommentRow";
import { Talk } from "@/system/Talk/Talk";
import { cssVariablesResolver } from "@/theme/cssVariablesResolver";
import { theme } from "@/theme/theme";

const VIEWER: MemberRef = { memberId: "m0", displayName: "Papá" };

const COMMENT: CommentDto = {
  commentId: "c1",
  author: { memberId: "m1", displayName: "Abuela Rosa" },
  body: "He has his mother's chin.",
  atSeconds: null,
  parentCommentId: null,
  createdAt: "2026-09-26T09:00:00.000Z",
  editedAt: null,
  canEdit: false,
  canDelete: false,
  reactions: { kinds: [], myKind: null },
};

describe("the comments panel", () => {
  it("renders a thread with one comment in it", () => {
    render(
      <MantineProvider
        theme={theme}
        cssVariablesResolver={cssVariablesResolver}
      >
        <Talk heading="What people said">
          <CommentRow comment={COMMENT} viewer={VIEWER} />
        </Talk>
      </MantineProvider>,
    );

    expect(screen.getByLabelText("Comments")).toBeVisible();
    expect(screen.getByText("Abuela Rosa")).toBeVisible();
    expect(screen.getByText("He has his mother's chin.")).toBeVisible();
  });
});
