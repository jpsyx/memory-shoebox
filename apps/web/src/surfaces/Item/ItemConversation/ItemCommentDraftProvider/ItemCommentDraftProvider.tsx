import {
  ConversationJourneyContext,
  useConversationDraftOwner,
  useConversationJourney,
} from "@/session/ConversationJourneyProvider/ConversationJourneyProvider";
import {
  EMPTY_CONVERSATION_DRAFT,
  type ConversationDraft,
  type ConversationJourney,
} from "@/session/conversationJourneyHelpers/conversationJourneyHelpers";
import { createContext, useContext, type ReactNode } from "react";
/** Main-composer values owned by the signed-in conversation session. */
export type ItemCommentDraftValue = ConversationDraft;
type DraftUpdate = Partial<Omit<ItemCommentDraftValue, "revision">>;
type DraftMemory = {
  read: (itemId: string) => ItemCommentDraftValue;
  update: (itemId: string, value: DraftUpdate) => void;
  remove: (itemId: string, expectedRevision?: number) => void;
  retireItem: (itemId: string) => void;
};
const DraftMemoryContext = createContext<ConversationJourney | undefined>(
  undefined,
);
/**
 * Adapts existing main composers to the one session owner; standalone
 * fallback.
 */
export function ItemCommentDraftProvider({
  children,
}: Readonly<{ children: ReactNode }>): ReactNode {
  const memory = useConversationDraftOwner();
  return (
    <ConversationJourneyContext value={memory}>
      <DraftMemoryContext value={memory}>{children}</DraftMemoryContext>
    </ConversationJourneyContext>
  );
}
/** Reads and changes the shared main-composer draft without a parallel map. */
export function useItemCommentDraftMemory(): DraftMemory {
  const memory = useContext(DraftMemoryContext);
  useConversationJourney();
  if (!memory) {
    throw new Error("Item comment drafts require ItemCommentDraftProvider.");
  }
  return {
    read: (itemId) => {
      return (
        memory.readDraft({ itemId, mode: "main" }) ?? EMPTY_CONVERSATION_DRAFT
      );
    },
    update: (itemId, value) => {
      const key = { itemId, mode: "main" } as const;
      memory.writeDraft(key, {
        ...(memory.readDraft(key) ?? EMPTY_CONVERSATION_DRAFT),
        ...value,
      });
    },
    remove: (itemId, revision) => {
      return memory.removeDraft({ itemId, mode: "main" }, revision);
    },
    retireItem: memory.retireItem,
  };
}
