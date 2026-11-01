import type { CommentDraft } from "@/system/commentDraftHelpers/commentDraftHelpers";
import {
  makeCommentDraftFromSavedTagIds,
  recordSavedCommentTagIdsInPlace,
} from "@/system/commentDraftHelpers/commentTagProvenance";
import type { CommentTag, CommentTagInput } from "@memory-shoebox/shared";
import { idSchema } from "@memory-shoebox/shared";

/** One editor in an item's conversation. */
export type DraftKey = { itemId: string } & (
  | { mode: "main"; commentId?: never }
  | { mode: "reply" | "edit"; commentId: string }
);
/** Private user input retained only for this signed-in tab lifetime. */
export type ConversationDraft = CommentDraft & {
  revision: number;
  selectionStart: number;
  selectionEnd: number;
  atSeconds: number | undefined;
  hasStarted: boolean;
};
/** A single collection visit, with no media or server comment snapshots. */
export type ConversationReturn = {
  itemId: string;
  href: string;
  memberId: string;
  commentId?: string;
  editor?: DraftKey;
  scrollContainer: "window" | "comments";
  scrollTop: number;
  theater: "page" | "window" | "native";
};
/**
 * Session-owned actions; retired action closures can never reach a new
 * owner.
 */
export type ConversationJourney = {
  readDraft: (key: Readonly<DraftKey>) => ConversationDraft | undefined;
  writeDraft: (
    key: Readonly<DraftKey>,
    value: Readonly<Omit<ConversationDraft, "revision">>,
  ) => void;
  removeDraft: (key: Readonly<DraftKey>, expectedRevision?: number) => void;
  rememberReturn: (value: Readonly<ConversationReturn>) => void;
  readReturn: () => ConversationReturn | undefined;
  retireItem: (itemId: string) => void;
  clear: () => void;
  retire: () => void;
  acknowledge: (
    key: Readonly<DraftKey>,
    submitted: Readonly<ConversationDraft>,
    tags: readonly CommentTag[],
  ) => void;
  subscribe: (listener: () => void) => () => void;
  getSnapshot: () => number;
};
type Memory = {
  drafts: Map<string, ConversationDraft>;
  acknowledgements: Map<string, WeakMap<CommentTagInput, string>>;
  returning?: ConversationReturn;
  revision: number;
  active: boolean;
  listeners: Set<() => void>;
};
/** The empty user-owned draft, without a retained server comment snapshot. */
export const EMPTY_CONVERSATION_DRAFT: ConversationDraft = {
  body: "",
  commentTags: [],
  revision: 0,
  selectionStart: 0,
  selectionEnd: 0,
  atSeconds: undefined,
  hasStarted: false,
};
/** Stable identity shared by memory and accessible editor anchors. */
export function getDraftIdFromKey(key: Readonly<DraftKey>): string {
  return JSON.stringify([key.itemId, key.mode, key.commentId]);
}
function _notify(memory: Memory): void {
  memory.revision += 1;
  memory.listeners.forEach((listener) => {
    return listener();
  });
}
/** Creates one isolated conversation owner. */
export function createConversationJourney(
  isCurrent: () => boolean = () => {
    return true;
  },
): ConversationJourney {
  const memory: Memory = {
    drafts: new Map(),
    acknowledgements: new Map(),
    revision: 0,
    active: true,
    listeners: new Set(),
  };
  const current = () => {
    return memory.active && isCurrent();
  };
  return {
    ..._getReadActions(memory, current),
    ..._getWriteActions(memory, current),
    ..._getRetirementActions(memory, current),
    rememberReturn: (value) => {
      if (current()) {
        memory.returning = { ...value };
        _notify(memory);
      }
    },
  };
}
function _getReadActions(
  memory: Memory,
  current: () => boolean,
): Pick<
  ConversationJourney,
  "readDraft" | "readReturn" | "subscribe" | "getSnapshot"
> {
  return {
    readDraft: (key) => {
      return current() ? memory.drafts.get(getDraftIdFromKey(key)) : undefined;
    },
    readReturn: () => {
      return current() ? memory.returning : undefined;
    },
    subscribe: (listener) => {
      memory.listeners.add(listener);
      return () => {
        memory.listeners.delete(listener);
      };
    },
    getSnapshot: () => {
      return memory.revision;
    },
  };
}
function _getWriteActions(
  memory: Memory,
  current: () => boolean,
): Pick<ConversationJourney, "writeDraft" | "removeDraft" | "acknowledge"> {
  return {
    writeDraft: (key, value) => {
      if (current()) {
        _writeDraft(memory, getDraftIdFromKey(key), value);
      }
    },
    removeDraft: (key, revision) => {
      if (current()) {
        _removeDraft(memory, getDraftIdFromKey(key), revision);
      }
    },
    acknowledge: (key, submitted, tags) => {
      if (current()) {
        _acknowledge(memory, { id: getDraftIdFromKey(key), submitted, tags });
      }
    },
  };
}
function _writeDraft(
  memory: Memory,
  id: string,
  value: Readonly<Omit<ConversationDraft, "revision">>,
): void {
  const tagIds =
    memory.acknowledgements.get(id) ?? new WeakMap<CommentTagInput, string>();
  memory.acknowledgements.set(id, tagIds);
  memory.drafts.set(id, {
    ...value,
    ...makeCommentDraftFromSavedTagIds({ draft: value, tagIds }),
    revision: memory.revision + 1,
  });
  _notify(memory);
}
function _removeDraft(memory: Memory, id: string, revision?: number): void {
  if (revision !== undefined && memory.drafts.get(id)?.revision !== revision) {
    return;
  }
  memory.drafts.delete(id);
  memory.acknowledgements.delete(id);
  _notify(memory);
}
function _acknowledge(
  memory: Memory,
  {
    id,
    submitted,
    tags,
  }: Readonly<{
    id: string;
    submitted: ConversationDraft;
    tags: readonly CommentTag[];
  }>,
): void {
  const draft = memory.drafts.get(id);
  const tagIds = memory.acknowledgements.get(id);
  if (!draft || !tagIds) {
    return;
  }
  recordSavedCommentTagIdsInPlace({ submitted, savedTags: tags, tagIds });
  memory.drafts.set(id, {
    ...draft,
    ...makeCommentDraftFromSavedTagIds({ draft, tagIds }),
  });
  _notify(memory);
}
function _getRetirementActions(
  memory: Memory,
  current: () => boolean,
): Pick<ConversationJourney, "retireItem" | "clear" | "retire"> {
  return {
    retireItem: (itemId) => {
      if (!current()) {
        return;
      }
      Array.from(memory.drafts.keys()).forEach((key) => {
        if ((JSON.parse(key) as unknown[])[0] === itemId) {
          memory.drafts.delete(key);
          memory.acknowledgements.delete(key);
        }
      });
      if (memory.returning?.itemId === itemId) {
        memory.returning = undefined;
      }
      _notify(memory);
    },
    clear: () => {
      if (current()) {
        _clear(memory);
      }
    },
    retire: () => {
      memory.active = false;
      _clear(memory);
    },
  };
}
function _clear(memory: Memory): void {
  memory.drafts.clear();
  memory.acknowledgements.clear();
  memory.returning = undefined;
  _notify(memory);
}
/** Parses the only supported item arrival search field. */
export function getCommentSearchFromSearch(search: Record<string, unknown>): {
  comment?: string;
} {
  const comment = idSchema.safeParse(search.comment);
  return comment.success ? { comment: comment.data } : {};
}
/** Whether a native link activation belongs to the current tab. */
export function isSameTabActivation(
  event: Readonly<{
    button: number;
    metaKey: boolean;
    ctrlKey: boolean;
    shiftKey: boolean;
    altKey: boolean;
    defaultPrevented: boolean;
  }>,
): boolean {
  return (
    !event.defaultPrevented &&
    event.button === 0 &&
    !event.metaKey &&
    !event.ctrlKey &&
    !event.shiftKey &&
    !event.altKey
  );
}
