import type { KeyboardEvent } from "react";

/** Send through the form, preserving its validation and in-flight guard. */
export function submitCommentOnShortcut(
  event: KeyboardEvent<HTMLTextAreaElement>,
): void {
  if (
    event.key === "Enter" &&
    (event.metaKey || event.ctrlKey) &&
    !event.altKey &&
    !event.repeat &&
    !event.nativeEvent.isComposing
  ) {
    event.preventDefault();
    event.currentTarget.form?.requestSubmit();
  }
}
