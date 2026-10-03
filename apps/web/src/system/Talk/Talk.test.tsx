import { MantineProvider } from "@mantine/core";
import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { CommentDto, MemberRef } from "@memory-shoebox/shared";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import { CommentRow } from "@/system/Talk/CommentRow";
import { Composer } from "@/system/Talk/Composer";
import { Talk } from "@/system/Talk/Talk";
import classes from "@/system/system.module.css";
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
        isSending={false}
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
    _render(<Composer goesTo="x" isSending={false} onSend={onSend} />);

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

  it("keeps what was typed while the send was on its way", async () => {
    const onSend = vi.fn();
    _render(<Composer goesTo="x" isSending={false} onSend={onSend} />);

    const field = screen.getByRole("textbox", { name: "Say something" });
    await userEvent.type(field, "He has his mother's chin.");
    await userEvent.click(screen.getByRole("button", { name: /Send/ }));
    await userEvent.type(field, " And her eyes.");

    act(() => {
      onSend.mock.calls[0]?.[1]();
    });
    expect(field).toHaveValue("He has his mother's chin. And her eyes.");
  });

  it("keeps the words and says why when the send failed", async () => {
    _render(
      <Composer
        goesTo="x"
        isSending={false}
        onSend={() => {}}
        error="It did not send. It is still here, so try again."
      />,
    );

    const field = screen.getByRole("textbox", { name: "Say something" });
    await userEvent.type(field, "He has his mother's chin.");
    await userEvent.click(screen.getByRole("button", { name: /Send/ }));

    expect(screen.getByRole("alert")).toHaveTextContent("It did not send.");
    expect(field).toHaveValue("He has his mother's chin.");
  });

  it("says where a pinned comment will stand", () => {
    _render(
      <Composer
        goesTo="x"
        isSending={false}
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
    expect(
      screen.getByRole("textbox", { name: "What you wrote" }),
    ).toBeVisible();

    act(() => {
      onSaveEdit.mock.calls[0]?.[1]();
    });
    expect(
      screen.queryByRole("textbox", { name: "What you wrote" }),
    ).toBeNull();
    expect(screen.getByRole("button", { name: "Edit" })).toHaveFocus();
  });

  it("puts the cursor in the editor when Edit is pressed", async () => {
    _render(
      <CommentRow comment={{ ...COMMENT, canEdit: true }} viewer={VIEWER} />,
    );

    await userEvent.click(screen.getByRole("button", { name: "Edit" }));

    expect(
      screen.getByRole("textbox", { name: "What you wrote" }),
    ).toHaveFocus();
  });

  it("gives focus back to Edit when the editor is left", async () => {
    _render(
      <CommentRow comment={{ ...COMMENT, canEdit: true }} viewer={VIEWER} />,
    );

    await userEvent.click(screen.getByRole("button", { name: "Edit" }));
    await userEvent.click(
      screen.getByRole("button", { name: "Leave it as it was" }),
    );

    expect(screen.getByRole("button", { name: "Edit" })).toHaveFocus();
  });

  it("gives the editor the comment's whole width, as the body has", async () => {
    _render(
      <CommentRow comment={{ ...COMMENT, canEdit: true }} viewer={VIEWER} />,
    );

    await userEvent.click(screen.getByRole("button", { name: "Edit" }));
    const field = screen.getByRole("textbox", { name: "What you wrote" });
    const save = screen.getByRole("button", { name: "Save the change" });
    const note = screen.getByText("It will say it was edited.");

    // Each grid item of the comment that holds a part of the editor. Left in
    // the grid's first column, the field was as narrow as the author's name.
    const gridItems = Array.from(
      field.closest(`.${classes.comment}`)?.children ?? [],
    );
    for (const part of [field, save, note]) {
      const gridItem = gridItems.find((item) => {
        return item.contains(part);
      });
      expect(gridItem?.matches(`.${classes.commentSpan}`)).toBe(true);
    }
  });

  it("will not save words that are the ones already there", async () => {
    _render(
      <CommentRow comment={{ ...COMMENT, canEdit: true }} viewer={VIEWER} />,
    );

    await userEvent.click(screen.getByRole("button", { name: "Edit" }));
    const save = screen.getByRole("button", { name: "Save the change" });
    expect(save).toBeDisabled();

    await userEvent.type(
      screen.getByRole("textbox", { name: "What you wrote" }),
      " And her eyes.",
    );
    expect(save).toBeEnabled();
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

  it("deletes nothing when the dialog is kept", async () => {
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
      await screen.findByRole("button", { name: "Keep it" }),
    );

    expect(onDelete).not.toHaveBeenCalled();
  });

  it("asks an admin about this comment, and says nothing false of it", async () => {
    _render(
      <CommentRow
        comment={{ ...COMMENT, canEdit: false, canDelete: true }}
        viewer={VIEWER}
      />,
    );

    await userEvent.click(screen.getByRole("button", { name: "Delete" }));

    const dialog = await screen.findByRole("dialog", {
      name: "Delete this comment?",
    });
    expect(dialog).not.toHaveTextContent("photograph");
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
