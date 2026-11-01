import type { KeyboardEvent } from "react";
import type { useCombobox } from "@mantine/core";

type Options = {
  event: KeyboardEvent<HTMLTextAreaElement>;
  composing: boolean;
  isOpen: boolean;
  store: ReturnType<typeof useCombobox>;
  close: () => void;
  select: () => void;
  undo: (isRedo?: boolean) => void;
  submit: () => void;
  hasMembers: boolean;
};

function _onPickerKey({
  event,
  close,
  store,
  hasMembers,
  select,
}: Readonly<Options>): boolean {
  if (["ArrowDown", "ArrowUp", "Escape", "Enter"].includes(event.key)) {
    event.stopPropagation();
  }
  if (event.key === "Escape" || event.key === "Tab") {
    close();
    if (event.key === "Escape") {
      event.preventDefault();
    }
    return true;
  }
  if (event.key === "ArrowDown" || event.key === "ArrowUp") {
    event.preventDefault();
    if (event.key === "ArrowDown") {
      store.selectNextOption();
    } else {
      store.selectPreviousOption();
    }
    return true;
  }
  if (event.key === "Enter") {
    if (hasMembers) {
      event.preventDefault();
      select();
    } else {
      close();
      if (event.metaKey || event.ctrlKey) {
        event.preventDefault();
      }
    }
    return true;
  }
  return false;
}

/** Gives native editing, member selection and submission distinct keys. */
export function onCommentTagInputKeyDown(options: Readonly<Options>): void {
  const { event, composing, isOpen, close, undo, submit } = options;
  if (composing || event.nativeEvent.isComposing || event.keyCode === 229) {
    return;
  }
  const shortcut = event.metaKey || event.ctrlKey;
  if (
    shortcut &&
    (event.key.toLowerCase() === "z" || event.key.toLowerCase() === "y")
  ) {
    event.preventDefault();
    event.stopPropagation();
    undo(event.shiftKey || event.key.toLowerCase() === "y");
    close();
    return;
  }
  if (event.repeat && event.key === "Enter" && (shortcut || isOpen)) {
    event.preventDefault();
    event.stopPropagation();
    return;
  }
  if (isOpen && _onPickerKey(options)) {
    return;
  }
  if (event.key === "Enter" && shortcut) {
    event.preventDefault();
    event.stopPropagation();
    submit();
  }
}
