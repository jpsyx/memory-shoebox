import {
  getCommentSearchFromSearch,
  type ConversationReturn,
  type DraftKey,
} from "./conversationJourneyHelpers";
/** Captures only source navigation, user focus and scroll metadata. */
export function getConversationReturnFromLink(
  options: Readonly<{
    link: HTMLAnchorElement;
    href: string;
    memberId: string;
    itemId?: string;
    commentId?: string;
  }>,
): ConversationReturn | undefined {
  const root = options.link.closest<HTMLElement>("[data-conversation-item]");
  const itemId = root?.dataset.conversationItem ?? options.itemId;
  if (!itemId) {
    return undefined;
  }
  if (!root) {
    return {
      itemId,
      memberId: options.memberId,
      href: `/items/${itemId}${options.commentId ? `?comment=${options.commentId}` : ""}`,
      commentId: options.commentId,
      scrollContainer: "window",
      scrollTop: 0,
      theater: "page",
    };
  }
  const url = new URL(options.href, "https://shoebox.invalid");
  if (url.pathname !== `/items/${itemId}`) {
    return undefined;
  }
  const search = getCommentSearchFromSearch(
    Object.fromEntries(url.searchParams),
  );
  const commentId =
    options.commentId ??
    options.link.closest<HTMLElement>("[data-comment-id]")?.dataset.commentId;
  const field = root.querySelector<HTMLTextAreaElement>(
    "textarea[data-conversation-focused]",
  );
  const editor = _getKeyFromField(field);
  const theater =
    root.dataset.conversationTheater === "native"
      ? "native"
      : root.dataset.conversationTheater === "window"
        ? "window"
        : "page";
  return {
    itemId,
    memberId: options.memberId,
    href: `/items/${itemId}${search.comment ? `?comment=${search.comment}` : ""}`,
    commentId,
    editor,
    theater,
    scrollContainer: theater === "page" ? "window" : "comments",
    scrollTop:
      theater === "page"
        ? window.scrollY
        : (root.querySelector("[data-conversation-scroll]")?.scrollTop ?? 0),
  };
}
function _getKeyFromField(
  field: HTMLTextAreaElement | null,
): DraftKey | undefined {
  if (!field?.dataset.conversationEditor) {
    return undefined;
  }
  const [itemId, mode, commentId] = JSON.parse(
    field.dataset.conversationEditor,
  ) as [string, "main" | "reply" | "edit", string];
  return mode === "main" ? { itemId, mode } : { itemId, mode, commentId };
}
