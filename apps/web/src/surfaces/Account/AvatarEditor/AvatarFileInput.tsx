import type { ReactNode } from "react";
import classes from "./AvatarEditor.module.css";
import { useAvatarEditor } from "./useAvatarEditor";

type Props = { editor: ReturnType<typeof useAvatarEditor> };
/** Renders the avatar file input controls. */
export function AvatarFileInput({ editor }: Readonly<Props>): ReactNode {
  return (
    <input
      ref={editor.input}
      className={classes.file}
      type="file"
      accept="image/jpeg,image/png,image/webp"
      aria-label="Choose photo file"
      onChange={(event) => {
        editor.onFile(event.currentTarget.files?.[0]);
        event.currentTarget.value = "";
      }}
    />
  );
}
