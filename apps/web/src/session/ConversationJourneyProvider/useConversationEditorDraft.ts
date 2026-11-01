import { useLayoutEffect, useMemo, useRef, type RefObject } from "react";
import { useConversationDraftOwner } from "./ConversationJourneyProvider";
import {
  EMPTY_CONVERSATION_DRAFT,
  type ConversationJourney,
  type DraftKey,
} from "../conversationJourneyHelpers/conversationJourneyHelpers";
import type { CommentDraft } from "@/system/commentDraftHelpers/commentDraftHelpers";
import {
  useConversationField,
  useStableConversationKey,
} from "./useConversationField";
type EditorDraft = {
  memory: ConversationJourney;
  key: DraftKey;
  draft: CommentDraft;
  fieldRef: RefObject<HTMLTextAreaElement | null>;
  setDraft: (draft: CommentDraft) => void;
  cancel: () => void;
};
/** One shared draft for reply/edit forms, including late acknowledgements. */
export function useConversationEditorDraft(
  draftKey: Readonly<DraftKey>,
  initial: Readonly<CommentDraft>,
): EditorDraft {
  const memory = useConversationDraftOwner();
  const key = useStableConversationKey(draftKey);
  const fieldRef = useRef<HTMLTextAreaElement>(null);
  useConversationField(key, fieldRef);
  const stored = memory.readDraft(key);
  const initialValue = useMemo(() => {
    return { ...EMPTY_CONVERSATION_DRAFT, ...initial, hasStarted: true };
  }, [initial]);
  useLayoutEffect(() => {
    if (!memory.readDraft(key)) {
      memory.writeDraft(key, initialValue);
    }
  }, [memory, key, initialValue]);
  const value = stored ?? initialValue;
  const draft = useMemo(() => {
    return { body: value.body, commentTags: value.commentTags };
  }, [value.body, value.commentTags]);
  return {
    memory,
    key,
    draft,
    fieldRef,
    setDraft: (updated: CommentDraft) => {
      memory.writeDraft(key, {
        ...(memory.readDraft(key) ?? initialValue),
        ...updated,
      });
    },
    cancel: () => {
      return memory.removeDraft(key);
    },
  };
}
