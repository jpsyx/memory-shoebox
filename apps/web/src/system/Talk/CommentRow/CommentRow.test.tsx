import { MantineProvider } from "@mantine/core";
import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { CommentDto, MemberRef } from "@memory-shoebox/shared";
import { useState, type ComponentProps, type ReactNode } from "react";
import { describe, expect, it, vi, type Mock } from "vitest";
import editorClasses from "@/system/Talk/CommentRow/CommentEditor/CommentEditor.module.css";
import actionsClasses from "@/system/Talk/CommentRow/CommentEditor/CommentEditorActions/CommentEditorActions.module.css";
import ownActionsClasses from "@/system/Talk/CommentRow/CommentOwnActions/CommentOwnActions.module.css";
import { CommentRow } from "@/system/Talk/CommentRow/CommentRow";
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

/** The theme, around whatever is rendered or rerendered. */
function _Providers({
  children,
}: Readonly<{ children: ReactNode }>): ReactNode {
  return (
    <MantineProvider theme={theme} cssVariablesResolver={cssVariablesResolver}>
      {children}
    </MantineProvider>
  );
}

function _render(node: ReactNode) {
  return render(node, { wrapper: _Providers });
}

/** Your own comment, whose edits stay out, saving, once one is sent. */
function _renderSavingRow(): Mock<(body: string) => void> {
  const onSaveEdit = vi.fn<(body: string) => void>();
  function Harness(): ReactNode {
    const [isSaving, setIsSaving] = useState(false);
    return (
      <CommentRow
        comment={{ ...COMMENT, canEdit: true }}
        viewer={VIEWER}
        isSaving={isSaving}
        onSaveEdit={({ body }) => {
          onSaveEdit(body);
          setIsSaving(true);
        }}
      />
    );
  }
  _render(<Harness />);
  return onSaveEdit;
}

/** The grid item of the comment that holds `part`. */
function _getGridItemFromPart(part: Element): Element | undefined {
  return Array.from(part.closest(`.${classes.comment}`)?.children ?? []).find(
    (item) => {
      return item.contains(part);
    },
  );
}

describe("one comment", () => {
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

  it("saves an edit, and closes only once it has landed", async () => {
    const onSaveEdit =
      vi.fn<NonNullable<ComponentProps<typeof CommentRow>["onSaveEdit"]>>();
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

    expect(onSaveEdit).toHaveBeenCalledWith({
      body: "His father's chin, then.",
      onSaved: expect.any(Function),
    });
    expect(
      screen.getByRole("textbox", { name: "What you wrote" }),
    ).toBeVisible();

    act(() => {
      onSaveEdit.mock.calls[0]?.[0].onSaved();
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

  it("gives the editor's field, Save and note the classes that span the comment's columns", async () => {
    _render(
      <CommentRow comment={{ ...COMMENT, canEdit: true }} viewer={VIEWER} />,
    );

    await userEvent.click(screen.getByRole("button", { name: "Edit" }));
    const field = screen.getByRole("textbox", { name: "What you wrote" });

    expect(
      _getGridItemFromPart(field)?.matches(
        `.${editorClasses.commentEditorField}`,
      ),
    ).toBe(true);
    [
      screen.getByRole("button", { name: "Save the change" }),
      screen.getByText("It will say it was edited."),
    ].forEach((part) => {
      expect(
        _getGridItemFromPart(part)?.matches(
          `.${actionsClasses.commentEditorActions}`,
        ),
      ).toBe(true);
    });
  });

  it("puts Edit and Delete in one grid item with the class that spans the comment's columns", () => {
    _render(
      <CommentRow
        comment={{ ...COMMENT, canEdit: true, canDelete: true }}
        viewer={VIEWER}
      />,
    );

    const gridItem = _getGridItemFromPart(
      screen.getByRole("button", { name: "Edit" }),
    );
    expect(
      gridItem?.matches(`.${ownActionsClasses.commentOwnActionsRow}`),
    ).toBe(true);
    expect(
      gridItem?.contains(screen.getByRole("button", { name: "Delete" })),
    ).toBe(true);
  });

  it("will not save words that are the ones already there", async () => {
    const onSaveEdit = vi.fn();
    _render(
      <CommentRow
        comment={{ ...COMMENT, canEdit: true }}
        viewer={VIEWER}
        onSaveEdit={onSaveEdit}
      />,
    );

    await userEvent.click(screen.getByRole("button", { name: "Edit" }));
    const save = screen.getByRole("button", { name: "Save the change" });
    expect(save).toHaveAttribute("aria-disabled", "true");
    await userEvent.click(save);
    expect(onSaveEdit).not.toHaveBeenCalled();

    await userEvent.type(
      screen.getByRole("textbox", { name: "What you wrote" }),
      " And her eyes.",
    );
    expect(save).not.toHaveAttribute("aria-disabled");
  });

  it("keeps focus on Save the change while it saves, and saves once", async () => {
    const onSaveEdit = _renderSavingRow();

    await userEvent.click(screen.getByRole("button", { name: "Edit" }));
    await userEvent.type(
      screen.getByRole("textbox", { name: "What you wrote" }),
      " And her eyes.",
    );
    const save = screen.getByRole("button", { name: "Save the change" });
    save.focus();
    await userEvent.keyboard("{Enter}");

    expect(save).toHaveTextContent("Saving");
    expect(save).toHaveFocus();
    expect(save).not.toBeDisabled();
    expect(save).toHaveAttribute("aria-disabled", "true");
    await userEvent.keyboard("{Enter}");
    expect(onSaveEdit).toHaveBeenCalledOnce();
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

  it("titles an admin's delete of somebody else's comment 'Delete this comment?'", async () => {
    _render(
      <CommentRow
        comment={{ ...COMMENT, canEdit: false, canDelete: true }}
        viewer={VIEWER}
      />,
    );

    await userEvent.click(screen.getByRole("button", { name: "Delete" }));

    expect(
      await screen.findByRole("dialog", { name: "Delete this comment?" }),
    ).toBeInTheDocument();
  });

  it("draws the server's words rather than a local copy", () => {
    const { rerender } = _render(
      <CommentRow comment={COMMENT} viewer={VIEWER} />,
    );

    rerender(
      <CommentRow
        comment={{ ...COMMENT, body: "Edited elsewhere." }}
        viewer={VIEWER}
      />,
    );

    expect(screen.getByText("Edited elsewhere.")).toBeVisible();
  });
});
