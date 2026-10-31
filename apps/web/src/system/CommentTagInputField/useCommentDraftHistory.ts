import { hasSameCommentDraftOccurrences } from "../commentDraftHelpers/commentTagProvenance";
import { useEffect, useLayoutEffect, useRef, type RefObject } from "react";
import {
  makeCommentDraftFromEdit,
  type CommentDraft,
} from "../commentDraftHelpers/commentDraftHelpers";
type Selection = { start: number; end: number };
type Snapshot = Selection & { draft: CommentDraft };
type Options = {
  value: CommentDraft;
  onChange: (value: CommentDraft) => void;
  fieldRef: RefObject<HTMLTextAreaElement | null>;
};
type Memory = {
  past: Snapshot[];
  future: Snapshot[];
  lastValue: CommentDraft;
  pending?: Selection;
  before?: Selection;
};
/** Keeps reference, text, and selection snapshots in one local undo history. */
export function useCommentDraftHistory(
  options: Readonly<Options>,
): ReturnType<typeof _getHistoryActions> & ReturnType<typeof _getFieldActions> {
  const memory = useRef<Memory>({
    past: [],
    future: [],
    lastValue: options.value,
  });
  useHistorySelection(options, memory);
  const actions = _getHistoryActions(options, memory.current);
  useNativeHistory(options.fieldRef, memory, actions.undo);
  return {
    ...actions,
    ..._getFieldActions(options, memory.current, actions.change),
  };
}
function useHistorySelection(
  options: Readonly<Options>,
  memory: RefObject<Memory>,
): void {
  useLayoutEffect(() => {
    const state = memory.current;
    if (!hasSameCommentDraftOccurrences(state.lastValue, options.value)) {
      state.past = [];
      state.future = [];
      state.before = undefined;
    }
    state.lastValue = options.value;
    if (state.pending) {
      options.fieldRef.current?.setSelectionRange(
        state.pending.start,
        state.pending.end,
      );
      state.pending = undefined;
    }
  }, [options.value, options.fieldRef, memory]);
}
function _getHistoryActions(options: Readonly<Options>, state: Memory) {
  const apply = (snapshot: Snapshot) => {
    state.lastValue = snapshot.draft;
    state.pending = snapshot;
    options.onChange(snapshot.draft);
  };
  const snapshot = () => {
    return {
      draft: options.value,
      start: options.fieldRef.current?.selectionStart ?? 0,
      end: options.fieldRef.current?.selectionEnd ?? 0,
    };
  };
  return {
    change: (draft: CommentDraft, start: number, end = start) => {
      state.past.push({ ...snapshot(), ...state.before });
      state.future = [];
      state.before = undefined;
      apply({ draft, start, end });
    },
    undo: (isRedo = false) => {
      const source = isRedo ? state.future : state.past;
      const target = isRedo ? state.past : state.future;
      const previous = source.pop();
      if (previous) {
        target.push(snapshot());
        apply(previous);
      }
    },
  };
}
function _getFieldActions(
  options: Readonly<Options>,
  state: Memory,
  change: (draft: CommentDraft, start: number, end: number) => void,
) {
  return {
    onChange: () => {
      const field = options.fieldRef.current;
      if (!field) {
        return;
      }
      const edit = _getEditFromInput(
        options.value.body,
        field.value,
        state.before,
        field.selectionStart,
      );
      change(
        makeCommentDraftFromEdit({ draft: options.value, ...edit }),
        field.selectionStart,
        field.selectionEnd,
      );
    },
    captureSelection: () => {
      const field = options.fieldRef.current;
      if (field) {
        state.before = { start: field.selectionStart, end: field.selectionEnd };
      }
    },
  };
}
function useNativeHistory(
  fieldRef: Options["fieldRef"],
  memory: RefObject<Memory>,
  undo: (isRedo?: boolean) => void,
): void {
  useEffect(() => {
    const field = fieldRef.current;
    if (!field) {
      return;
    }
    const onBeforeInput = (event: InputEvent) => {
      if (
        event.inputType === "historyUndo" ||
        event.inputType === "historyRedo"
      ) {
        event.preventDefault();
        undo(event.inputType === "historyRedo");
        return;
      }
      memory.current.before = {
        start: field.selectionStart,
        end: field.selectionEnd,
      };
    };
    field.addEventListener("beforeinput", onBeforeInput);
    return () => {
      return field.removeEventListener("beforeinput", onBeforeInput);
    };
  }, [fieldRef, memory, undo]);
}
function _getEditFromInput(
  body: string,
  changed: string,
  before: Selection | undefined,
  caret: number,
): Selection & { text: string } {
  // Native replacement selections distinguish repeated strings and tagged text.
  if (before && before.start !== before.end) {
    return {
      ...before,
      text: changed.slice(
        before.start,
        changed.length - (body.length - before.end),
      ),
    };
  }
  const start =
    before && changed.length >= body.length
      ? Math.min(before.start, caret)
      : caret;
  const end = start + Math.max(0, body.length - changed.length + caret - start);
  if (
    body.slice(0, start) === changed.slice(0, start) &&
    body.slice(end) === changed.slice(caret)
  ) {
    return { start, end, text: changed.slice(start, caret) };
  }
  return _getReplacementFromBodies(body, changed);
}
function _getReplacementFromBodies(
  body: string,
  changed: string,
): Selection & { text: string } {
  // Only infer the changed interval, never identity from a name or its spelling.
  const commonStart =
    Array.from(
      { length: Math.min(body.length, changed.length) },
      (_, index) => {
        return index;
      },
    ).find((index) => {
      return body[index] !== changed[index];
    }) ?? Math.min(body.length, changed.length);
  const suffix =
    Array.from(
      { length: Math.min(body.length, changed.length) - commonStart },
      (_, index) => {
        return index;
      },
    ).find((index) => {
      return (
        body[body.length - index - 1] !== changed[changed.length - index - 1]
      );
    }) ?? Math.min(body.length, changed.length) - commonStart;
  return {
    start: commonStart,
    end: body.length - suffix,
    text: changed.slice(commonStart, changed.length - suffix),
  };
}
