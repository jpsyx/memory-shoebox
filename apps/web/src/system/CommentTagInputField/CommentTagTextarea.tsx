import { Combobox } from "@mantine/core";
import type { ReactNode } from "react";
import { CommentDraftMirror } from "./CommentDraftMirror";
import classes from "./CommentTagInputField.module.css";
import type { CommentTagInputOptions } from "./CommentTagInputField.types";
import type { useCommentTagEditor } from "./useCommentTagEditor";
type Props = {
  input: Readonly<CommentTagInputOptions>;
  editor: ReturnType<typeof useCommentTagEditor>;
};
/**
 * The sole accessible editing surface; the visual mirror cannot receive
 * input.
 */
export function CommentTagTextarea({
  input,
  editor,
}: Readonly<Props>): ReactNode {
  return (
    <div className={classes.fieldWrap}>
      <CommentDraftMirror value={input.value} fieldRef={input.fieldRef} />
      <Combobox.Target withKeyboardNavigation={false}>
        <textarea
          ref={input.fieldRef}
          className={classes.field}
          rows={2}
          aria-label={input.label ?? "Write a comment"}
          placeholder={input.placeholder ?? "Write a comment…"}
          autoFocus={input.autoFocus}
          value={input.value.body}
          onFocus={input.onFocus}
          {...editor.fieldEvents}
        />
      </Combobox.Target>
    </div>
  );
}
