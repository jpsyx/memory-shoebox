import { MantineProvider } from "@mantine/core";
import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { CommentDto, MemberRef } from "@memory-shoebox/shared";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
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
    _render(
      <Composer
        goesTo="This goes to everybody who can see it."
        onSend={() => {}}
      />,
    );

    const send = screen.getByRole("button", { name: /Send/ });
    expect(send).toBeDisabled();

    await userEvent.type(
      screen.getByRole("textbox", { name: "Say something" }),
      "He has his mother's chin.",
    );

    expect(send).toBeEnabled();
  });

  it("sends the words, and clears them only once they have arrived", async () => {
    const onSend = vi.fn();
    _render(<Composer goesTo="x" onSend={onSend} />);

    const field = screen.getByRole("textbox", { name: "Say something" });
    await userEvent.type(field, "He has his mother's chin.");
    await userEvent.click(screen.getByRole("button", { name: /Send/ }));

    expect(onSend).toHaveBeenCalledWith(
      "He has his mother's chin.",
      expect.any(Function),
    );
    expect(field).toHaveValue("He has his mother's chin.");

    act(() => {
      onSend.mock.calls[0]?.[1]();
    });
    expect(field).toHaveValue("");
  });

  it("keeps the words and says why when the send failed", async () => {
    _render(
      <Composer
        goesTo="x"
        onSend={() => {}}
        error="It did not send. It is still here, so try again."
      />,
    );

    expect(screen.getByRole("alert")).toHaveTextContent("It did not send.");
  });

  it("says where a pinned comment will stand", () => {
    _render(
      <Composer
        goesTo="x"
        onSend={() => {}}
        pinnedAt={4}
        onClearPin={() => {}}
      />,
    );

    expect(
      screen.getByRole("textbox", { name: "Say something at 0:04" }),
    ).toBeVisible();
    expect(screen.getByRole("button", { name: "Unpin" })).toBeVisible();
  });

  it("saves an edit, and closes only once it has landed", async () => {
    const onSaveEdit = vi.fn();
    _render(
      <CommentRow
        comment={{ ...COMMENT, canEdit: true }}
        viewer={VIEWER}
        onSaveEdit={onSaveEdit}
      />,
    );

    await userEvent.click(screen.getByRole("button", { name: "Edit" }));
    const field = screen.getByRole("textbox", { name: "What you wrote" });
    await userEvent.clear(field);
    await userEvent.type(field, "His father's chin, then.");
    await userEvent.click(
      screen.getByRole("button", { name: "Save the change" }),
    );

    expect(onSaveEdit).toHaveBeenCalledWith(
      "His father's chin, then.",
      expect.any(Function),
    );
    act(() => {
      onSaveEdit.mock.calls[0]?.[1]();
    });
    expect(
      screen.queryByRole("textbox", { name: "What you wrote" }),
    ).toBeNull();
  });

  it("deletes once the dialog is confirmed", async () => {
    const onDelete = vi.fn();
    _render(
      <CommentRow
        comment={{ ...COMMENT, canDelete: true }}
        viewer={VIEWER}
        onDelete={onDelete}
      />,
    );

    await userEvent.click(screen.getByRole("button", { name: "Delete" }));
    await userEvent.click(
      await screen.findByRole("button", { name: "Delete it" }),
    );

    expect(onDelete).toHaveBeenCalledOnce();
  });

  it("draws the server's words rather than a local copy", () => {
    const { rerender } = _render(
      <CommentRow comment={COMMENT} viewer={VIEWER} />,
    );

    rerender(
      <MantineProvider
        theme={theme}
        cssVariablesResolver={cssVariablesResolver}
      >
        <CommentRow
          comment={{ ...COMMENT, body: "Edited elsewhere." }}
          viewer={VIEWER}
        />
      </MantineProvider>,
    );

    expect(screen.getByText("Edited elsewhere.")).toBeVisible();
  });
});
