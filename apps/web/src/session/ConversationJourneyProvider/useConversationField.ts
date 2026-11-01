import { useLayoutEffect, useMemo, type RefObject } from "react";
import {
  getDraftIdFromKey,
  type ConversationJourney,
  type DraftKey,
} from "../conversationJourneyHelpers/conversationJourneyHelpers";
import { useConversationJourney } from "./ConversationJourneyProvider";
/**
 * Keeps a key stable without coupling its lifetime to render-created
 * objects.
 */
export function useStableConversationKey(key: Readonly<DraftKey>): DraftKey {
  const { itemId, mode, commentId } = key;
  return useMemo(() => {
    return mode === "main"
      ? { itemId, mode }
      : { itemId, mode, commentId: commentId! };
  }, [itemId, mode, commentId]);
}
/**
 * Saves native selection and exposes an anchor without moving ordinary
 * focus.
 */
export function useConversationField(
  key: Readonly<DraftKey>,
  fieldRef: RefObject<HTMLTextAreaElement | null>,
): void {
  const memory = useConversationJourney();
  const stableKey = useStableConversationKey(key);
  useLayoutEffect(() => {
    const field = fieldRef.current;
    if (!field || !memory) {
      return;
    }
    field.dataset.conversationEditor = getDraftIdFromKey(stableKey);
    const draft = memory.readDraft(stableKey);
    if (draft) {
      field.setSelectionRange(draft.selectionStart, draft.selectionEnd);
    }
    const select = () => {
      _saveSelection({ field, key: stableKey, memory });
    };
    const focus = () => {
      _markFocusedField(field);
    };
    field.addEventListener("select", select);
    field.addEventListener("keyup", select);
    field.addEventListener("blur", select);
    field.addEventListener("focus", focus);
    if (document.activeElement === field) {
      _markFocusedField(field);
    }
    return () => {
      field.removeEventListener("select", select);
      field.removeEventListener("keyup", select);
      field.removeEventListener("blur", select);
      field.removeEventListener("focus", focus);
    };
  }, [memory, stableKey, fieldRef]);
}
function _saveSelection({
  field,
  key,
  memory,
}: Readonly<{
  field: HTMLTextAreaElement;
  key: DraftKey;
  memory: ConversationJourney;
}>): void {
  const current = memory.readDraft(key);
  if (
    current &&
    (current.selectionStart !== field.selectionStart ||
      current.selectionEnd !== field.selectionEnd)
  ) {
    memory.writeDraft(key, {
      ...current,
      selectionStart: field.selectionStart,
      selectionEnd: field.selectionEnd,
    });
  }
}
function _markFocusedField(field: HTMLTextAreaElement): void {
  field
    .closest("[data-conversation-item]")
    ?.querySelectorAll("[data-conversation-focused]")
    .forEach((element) => {
      element.removeAttribute("data-conversation-focused");
    });
  field.dataset.conversationFocused = "true";
}
