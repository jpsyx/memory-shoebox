import type { RefObject } from "react";
import type { CommentTagFailure } from "@/api/comments/comments";
import type { CommentDraft } from "../commentDraftHelpers/commentDraftHelpers";
/** Controlled value and native field lifecycle shared by every conversation. */
export type CommentTagInputOptions = {
  itemId: string;
  value: CommentDraft;
  onChange: (value: CommentDraft) => void;
  onSubmit: () => void;
  fieldRef: RefObject<HTMLTextAreaElement | null>;
  isSending: boolean;
  portalTarget?: HTMLElement;
  tagFailure?: CommentTagFailure[];
  label?: string;
  placeholder?: string;
  onFocus?: () => void;
  autoFocus?: boolean;
};
