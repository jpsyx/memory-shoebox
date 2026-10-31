import { Combobox } from "@mantine/core";
import type { ReactNode } from "react";
import { CommentTagCorrections } from "./CommentTagCorrections";
import { CommentTagPicker } from "./CommentTagPicker";
import { CommentTagTextarea } from "./CommentTagTextarea";
import { useCommentTagEditor } from "./useCommentTagEditor";
import type { CommentTagInputOptions } from "./CommentTagInputField.types";
import classes from "./CommentTagInputField.module.css";
type Props = CommentTagInputOptions;
/** Accessible native text editing, paired with explicit member selection. */
export function CommentTagInputField(props: Readonly<Props>): ReactNode {
  const editor = useCommentTagEditor(props);
  return (
    <div className={classes.root}>
      <Combobox
        store={editor.store}
        onOptionSubmit={editor.select}
        position="top-start"
        portalProps={
          props.portalTarget ? { target: props.portalTarget } : undefined
        }
      >
        <CommentTagTextarea input={props} editor={editor} />
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
        itemId={props.itemId}
        value={props.value}
        failures={props.tagFailure ?? []}
        onChange={editor.correct}
      />
      <span className={classes.announcement} role="status">
        {editor.announcement}
      </span>
      {_characterCount(props.value.body.length)}
    </div>
  );
}
function _characterCount(length: number): ReactNode {
  if (length < 3800) {
    return null;
  }
  return (
    <p className={classes.counter} role={length > 4000 ? "alert" : undefined}>
      {length > 4000
        ? `Remove ${length - 4000} characters to post.`
        : `${length} / 4,000`}
    </p>
  );
}
