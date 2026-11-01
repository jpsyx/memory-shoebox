import type { ReactNode } from "react";
import classes from "./CommentTagInputField.module.css";
type Props = { length: number };
/** Reports approaching and exceeded comment length limits. */
export function CommentCharacterCount({ length }: Readonly<Props>): ReactNode {
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
