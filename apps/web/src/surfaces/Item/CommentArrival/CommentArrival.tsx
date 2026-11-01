import { useLayoutEffect, useRef, type ReactNode } from "react";
import { useLocation } from "@tanstack/react-router";
import type { ItemDetail } from "@memory-shoebox/shared";
import { useConversationJourney } from "@/session/ConversationJourneyProvider/ConversationJourneyProvider";
import {
  getCommentSearchFromSearch,
  getDraftIdFromKey,
  type ConversationReturn,
} from "@/session/conversationJourneyHelpers/conversationJourneyHelpers";
import type { TheaterMode } from "../ItemTheater/useTheaterMode/useTheaterMode";
import type { TheaterCommentDockController } from "../ItemTheater/useTheaterCommentDock";

type Props = {
  detail: ItemDetail;
  theater: TheaterMode;
  dock: TheaterCommentDockController;
  isAuthorized: boolean;
};
/** Reveals a readable arrival only after the current entry has fresh access. */
export function CommentArrival({
  detail,
  theater,
  dock,
  isAuthorized,
}: Readonly<Props>): ReactNode {
  const location = useLocation();
  const memory = useConversationJourney();
  const returning = memory?.readReturn();
  const journey =
    returning?.itemId === detail.itemId && returning.href === location.href
      ? returning
      : undefined;
  const commentId =
    journey?.commentId ?? getCommentSearchFromSearch(location.search).comment;
  const comment = detail.comments.find((candidate) => {
    return candidate.commentId === commentId;
  });
  useArrivalFocus({
    detail,
    theater,
    dock,
    isAuthorized,
    journey,
    commentId,
    arrivalKey: `${location.href}:${location.state.__TSR_key}`,
  });
  return isAuthorized && commentId && !comment ? (
    <p role="status" tabIndex={-1} data-comment-unavailable>
      That comment is no longer available.
    </p>
  ) : null;
}
type Arrival = Props & {
  journey?: ConversationReturn;
  commentId?: string;
  arrivalKey: string;
};
function useArrivalFocus(options: Readonly<Arrival>): void {
  const completed = useRef<string | undefined>(undefined);
  useLayoutEffect(() => {
    if (!options.isAuthorized || completed.current === options.arrivalKey) {
      return;
    }
    if (!_preparePresentation(options)) {
      return;
    }
    const root = options.theater.hostRef.current;
    if (!root) {
      return;
    }
    _focusArrival(root, options);
    completed.current = options.arrivalKey;
  }, [options]);
}
function _preparePresentation({
  journey,
  theater,
  detail,
  commentId,
  dock,
}: Readonly<Arrival>): boolean {
  if (
    journey &&
    journey.theater !== "page" &&
    theater.presentation !== "theater"
  ) {
    theater.restore?.(journey.theater, detail.itemId);
    return false;
  }
  if (
    (journey || commentId) &&
    theater.presentation === "theater" &&
    !dock.isOpen
  ) {
    dock.open();
    return false;
  }
  return true;
}
function _focusArrival(
  root: HTMLElement,
  { journey, commentId }: Readonly<Arrival>,
): void {
  const article = commentId
    ? Array.from(root.querySelectorAll<HTMLElement>("[data-comment-id]")).find(
        (node) => {
          return node.dataset.commentId === commentId;
        },
      )
    : undefined;
  const editorId = journey?.editor
    ? getDraftIdFromKey(journey.editor)
    : undefined;
  const field = editorId
    ? Array.from(
        root.querySelectorAll<HTMLTextAreaElement>(
          "textarea[data-conversation-editor]",
        ),
      ).find((node) => {
        return node.dataset.conversationEditor === editorId;
      })
    : undefined;
  if (journey) {
    _restoreScroll(root, journey);
  }
  if (field) {
    field.focus({ preventScroll: true });
  } else if (article) {
    if (!journey) {
      article.scrollIntoView?.({ block: "center" });
    }
    article.focus({ preventScroll: true });
  } else if (commentId) {
    root
      .querySelector<HTMLElement>("[data-comment-unavailable]")
      ?.focus({ preventScroll: true });
  }
}
function _restoreScroll(
  root: HTMLElement,
  journey: Readonly<ConversationReturn>,
): void {
  if (journey.scrollContainer === "window") {
    window.scrollTo({ top: journey.scrollTop, behavior: "instant" });
  } else {
    const threads = root.querySelector("[data-conversation-scroll]");
    if (threads) {
      threads.scrollTop = journey.scrollTop;
    }
  }
}
