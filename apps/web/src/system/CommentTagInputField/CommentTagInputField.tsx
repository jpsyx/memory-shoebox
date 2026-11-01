import { Combobox } from "@mantine/core";
import type { ReactNode } from "react";
import { CommentCharacterCount } from "./CommentCharacterCount";
import { CommentTagCorrections } from "./CommentTagCorrections";
import classes from "./CommentTagInputField.module.css";
import type { CommentTagInputOptions } from "./CommentTagInputField.types";
import { CommentTagPicker } from "./CommentTagPicker";
import { CommentTagTextarea } from "./CommentTagTextarea";
import { useCommentTagEditor } from "./useCommentTagEditor";
type Props = CommentTagInputOptions;
/** Accessible native text editing, paired with explicit member selection. */
export function CommentTagInputField({
  itemId,
  value,
  onChange,
  onSubmit,
  fieldRef,
  isSending,
  portalTarget,
  tagFailure,
  label,
  placeholder,
  onFocus,
  autoFocus,
}: Readonly<Props>): ReactNode {
  const input = {
    itemId,
    value,
    onChange,
    onSubmit,
    fieldRef,
    isSending,
    portalTarget,
    tagFailure,
    label,
    placeholder,
    onFocus,
    autoFocus,
  };
  const editor = useCommentTagEditor(input);
  return (
    <div className={classes.root}>
      <Combobox
        store={editor.store}
        onOptionSubmit={editor.select}
        position="top-start"
        portalProps={portalTarget ? { target: portalTarget } : undefined}
      >
        <CommentTagTextarea input={input} editor={editor} />
        {editor.isOpen ? (
          <CommentTagPicker
            members={editor.members}
            isLoading={editor.candidates.isFetching}
            isError={editor.candidates.isError}
            query={editor.query?.query ?? ""}
            onRetry={() => {
              void editor.candidates.refetch();
            }}
          />
        ) : null}
      </Combobox>
      <p className={classes.help}>Type @ to tag a member.</p>
      <CommentTagCorrections
        itemId={itemId}
        value={value}
        failures={tagFailure ?? []}
        onChange={editor.correct}
      />
      <span className={classes.announcement} role="status">
        {editor.announcement}
      </span>
      <CommentCharacterCount length={value.body.length} />
    </div>
  );
}
