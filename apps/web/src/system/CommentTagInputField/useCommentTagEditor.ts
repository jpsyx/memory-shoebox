import { commentTagCandidatesQueryOptions } from "@/api/commentTagCandidates/commentTagCandidates";
import { getFailedCommentTagsFromDraft } from "@/api/comments/comments";
import { useCombobox } from "@mantine/core";
import { useQuery } from "@tanstack/react-query";
import {
  useEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type RefObject,
  type TextareaHTMLAttributes,
} from "react";
import {
  getCommentTagQueryFromSelection,
  makeCommentDraftFromMemberSelection,
  type CommentDraft,
} from "../commentDraftHelpers/commentDraftHelpers";
import type { CommentTagInputOptions } from "./CommentTagInputField.types";
import { onCommentTagInputKeyDown } from "./commentTagKeyboard";
import { useCommentDraftHistory } from "./useCommentDraftHistory";
type Editor = ReturnType<typeof useCommentTagQuery> &
  ReturnType<typeof _getEditingHandlers> & {
    composing: RefObject<boolean>;
    announcement: string;
    fieldEvents: Pick<
      TextareaHTMLAttributes<HTMLTextAreaElement>,
      | "onChange"
      | "onSelect"
      | "onKeyDown"
      | "onBlur"
      | "onCompositionStart"
      | "onCompositionEnd"
    >;
  };
/**
 * Coordinates the explicit picker and local text history without write
 * ownership.
 */
export function useCommentTagEditor(
  props: Readonly<CommentTagInputOptions>,
): Editor {
  const [announcement, setAnnouncement] = useState("");
  const composing = useRef(false);
  const history = useCommentDraftHistory({
    ...props,
    onChange: (draft) => {
      if (draft.commentTags.length < props.value.commentTags.length) {
        setAnnouncement("Comment tag removed.");
      }
      props.onChange(draft);
    },
  });
  const picker = useCommentTagQuery(props);
  const handlers = _getEditingHandlers({
    props,
    history,
    picker,
    composing,
    setAnnouncement,
  });
  return {
    ...picker,
    ...handlers,
    composing,
    announcement,
    fieldEvents: {
      onChange: handlers.onChange,
      onSelect: picker.onSelect,
      onKeyDown: handlers.onKeyDown,
      onBlur: picker.close,
      onCompositionStart: () => {
        composing.current = true;
      },
      onCompositionEnd: () => {
        composing.current = false;
      },
    },
  };
}
function useCommentTagQuery(props: Readonly<CommentTagInputOptions>) {
  const [selection, setSelection] = useState({ start: 0, end: 0 });
  const [dismissed, setDismissed] = useState<string>();
  const query = getCommentTagQueryFromSelection({
    ...props.value,
    ...selection,
  });
  const signature = JSON.stringify([props.value.body, query]);
  const isOpen = query !== undefined && signature !== dismissed;
  const store = useCombobox({
    opened: isOpen,
    onDropdownClose: () => {
      return store.resetSelectedOption();
    },
  });
  const candidates = useCandidates(props.itemId, query?.query ?? "", isOpen);
  const members = candidates.isFetching ? [] : (candidates.data?.members ?? []);
  useFirstOption(store, isOpen, candidates, signature);
  const onSelect = () => {
    return _readSelection(props.fieldRef, setSelection);
  };
  return {
    query,
    isOpen,
    store,
    candidates,
    members,
    onSelect,
    setSelection,
    close: () => {
      return setDismissed(signature);
    },
    reopen: () => {
      return setDismissed(undefined);
    },
  };
}
type HandlersOptions = {
  props: Readonly<CommentTagInputOptions>;
  history: ReturnType<typeof useCommentDraftHistory>;
  picker: ReturnType<typeof useCommentTagQuery>;
  composing: { current: boolean };
  setAnnouncement: (message: string) => void;
};
function _getEditingHandlers(options: Readonly<HandlersOptions>) {
  const { props, history, picker, composing } = options;
  const select = (memberId: string) => {
    return _selectMember(options, memberId);
  };
  const correct = (draft: CommentDraft, caret: number) => {
    history.change(draft, caret);
    picker.setSelection({ start: caret, end: caret });
    picker.reopen();
    props.fieldRef.current?.focus();
  };
  return {
    select,
    correct,
    onChange: () => {
      picker.reopen();
      history.onChange();
      picker.onSelect();
    },
    onKeyDown: (event: KeyboardEvent<HTMLTextAreaElement>) => {
      onCommentTagInputKeyDown({
        event,
        composing: composing.current,
        isOpen: picker.isOpen,
        store: picker.store,
        close: picker.close,
        select: () => {
          return picker.store.clickSelectedOption();
        },
        undo: history.undo,
        hasMembers: picker.members.length > 0,
        submit: () => {
          return _submitComment(props);
        },
      });
    },
  };
}
function _submitComment(props: Readonly<CommentTagInputOptions>): void {
  if (
    !props.isSending &&
    props.value.body.trim() !== "" &&
    props.value.body.length <= 4000 &&
    getFailedCommentTagsFromDraft({
      draft: props.value,
      failures: props.tagFailure ?? [],
    }).length === 0
  ) {
    props.onSubmit();
  }
}

function useCandidates(itemId: string, query: string, enabled: boolean) {
  return useQuery({
    ...commentTagCandidatesQueryOptions({
      itemId,
      query,
    }),
    enabled,
  });
}

function _readSelection(
  fieldRef: CommentTagInputOptions["fieldRef"],
  setSelection: (selection: { start: number; end: number }) => void,
): void {
  const field = fieldRef.current;
  if (field) {
    setSelection({ start: field.selectionStart, end: field.selectionEnd });
  }
}

function _selectMember(
  {
    props,
    history,
    picker,
    composing,
    setAnnouncement,
  }: Readonly<HandlersOptions>,
  memberId: string,
): void {
  const member = picker.members.find((candidate) => {
    return candidate.memberId === memberId;
  });
  if (!member || !picker.query || composing.current) {
    return;
  }
  history.captureSelection();
  const draft = makeCommentDraftFromMemberSelection({
    draft: props.value,
    ...picker.query,
    member,
  });
  history.change(draft, picker.query.start + member.displayName.length + 2);
  picker.close();
  setAnnouncement(`${member.displayName} added to comment.`);
  props.fieldRef.current?.focus();
}

function useFirstOption(
  store: ReturnType<typeof useCombobox>,
  isOpen: boolean,
  candidates: ReturnType<typeof useCandidates>,
  signature: string,
): void {
  const { selectFirstOption } = store;
  useEffect(() => {
    if (isOpen) {
      selectFirstOption();
    }
  }, [
    isOpen,
    candidates.data,
    candidates.isFetching,
    signature,
    selectFirstOption,
  ]);
}
