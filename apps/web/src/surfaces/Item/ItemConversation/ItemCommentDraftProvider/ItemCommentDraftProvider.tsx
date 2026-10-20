import {
  createContext,
  useCallback,
  useContext,
  useRef,
  useState,
  type ReactNode,
} from "react";

/** Main-composer values retained for one item-viewer visit. */
export type ItemCommentDraftValue = {
  body: string;
  atSeconds: number | undefined;
  hasStarted: boolean;
  revision: number;
};

type DraftUpdate = Partial<Omit<ItemCommentDraftValue, "revision">>;
type DraftMemory = {
  read: (itemId: string) => ItemCommentDraftValue;
  update: (itemId: string, updateValue: DraftUpdate) => void;
  remove: (itemId: string) => void;
};
type Props = { children: ReactNode };
const EMPTY_DRAFT: ItemCommentDraftValue = {
  body: "",
  atSeconds: undefined,
  hasStarted: false,
  revision: 0,
};
const DraftMemoryContext = createContext<DraftMemory | undefined>(undefined);

/** Owns ephemeral per-item drafts across composer and detail-query changes. */
export function ItemCommentDraftProvider({
  children,
}: Readonly<Props>): ReactNode {
  const drafts = useRef<ReadonlyMap<string, ItemCommentDraftValue>>(new Map());
  const revision = useRef(0);
  const [, renderValues] = useState(drafts.current);
  const read = useCallback<DraftMemory["read"]>((itemId) => {
    return drafts.current.get(itemId) ?? EMPTY_DRAFT;
  }, []);
  const update = useCallback<DraftMemory["update"]>((itemId, updateValue) => {
    revision.current += 1;
    drafts.current = new Map(drafts.current).set(itemId, {
      ...(drafts.current.get(itemId) ?? EMPTY_DRAFT),
      ...updateValue,
      revision: revision.current,
    });
    renderValues(drafts.current);
  }, []);
  const remove = useCallback<DraftMemory["remove"]>((itemId) => {
    if (!drafts.current.has(itemId)) {
      return;
    }
    const remainingDrafts = new Map(drafts.current);
    remainingDrafts.delete(itemId);
    drafts.current = remainingDrafts;
    renderValues(drafts.current);
  }, []);
  return (
    <DraftMemoryContext value={{ read, update, remove }}>
      {children}
    </DraftMemoryContext>
  );
}

/** Reads and changes the draft memory owned by the enclosing item surface. */
export function useItemCommentDraftMemory(): DraftMemory {
  const memory = useContext(DraftMemoryContext);
  if (memory === undefined) {
    throw new Error("Item comment drafts require ItemCommentDraftProvider.");
  }
  return memory;
}
