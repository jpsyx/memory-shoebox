import { MantineProvider } from "@mantine/core";
import { QueryClientProvider } from "@tanstack/react-query";
import {
  act,
  fireEvent,
  render,
  screen,
  type RenderResult,
} from "@testing-library/react";
import { useRef, type ReactNode } from "react";
import { vi } from "vitest";
import type { ItemPresentation } from "../../../ItemViewer/ItemViewer.types";
import { useVideoTransport } from "../../../ItemViewer/useVideoTransport";
import { ItemCommentDraftProvider } from "../../../ItemConversation/ItemCommentDraftProvider/ItemCommentDraftProvider";
import { ItemComments } from "../../../ItemConversation/ItemComments/ItemComments";
import { TheaterCommentDock } from "../TheaterCommentDock";
import { useTheaterCommentDock } from "../../useTheaterCommentDock";
import { makeQueryClientFromItemDetail } from "@/testing/itemWriteTestHelpers";
import {
  ITEM_ID,
  makeComment,
  makeVideoDetail,
  SIGNED_IN,
} from "@/testing/itemFixtureHelpers";
import { theme } from "@/theme/theme";

const DETAIL = makeVideoDetail({
  comments: [
    makeComment({ body: "Our family memory", canDelete: true, canEdit: true }),
  ],
});
type Props = {
  presentation: ItemPresentation;
  itemId?: string;
  isUnavailable?: boolean;
};

function Harness({
  presentation,
  itemId = ITEM_ID,
  isUnavailable = false,
}: Readonly<Props>): ReactNode {
  const fieldRef = useRef<HTMLTextAreaElement>(null);
  const transport = useVideoTransport(itemId);
  const controller = useTheaterCommentDock({
    presentation,
    itemId,
    fieldRef,
    isUnavailable,
  });
  return (
    <>
      <button
        type="button"
        onClick={() => {
          transport.setPosition(6.25);
        }}
      >
        Seek 6.25
      </button>
      <button
        type="button"
        onClick={() => {
          transport.setPosition(12.5);
        }}
      >
        Seek 12.5
      </button>
      <button type="button">Outside</button>
      <button type="button" onClick={controller.open}>
        Comment action
      </button>
      <TheaterCommentDock
        presentation={presentation}
        controller={controller}
        commentCount={1}
        isUnavailable={isUnavailable}
      >
        <ItemComments
          detail={{ ...DETAIL, itemId }}
          viewer={SIGNED_IN}
          transport={transport}
          fieldRef={fieldRef}
          presentation={presentation}
        />
      </TheaterCommentDock>
    </>
  );
}

/** Renders the existing conversation inside the shared dock and draft owners. */
export function renderDock(
  initialPresentation: ItemPresentation = "theater",
): RenderResult & {
  show: (
    presentation: ItemPresentation,
    itemId?: string,
    isUnavailable?: boolean,
  ) => void;
  field: HTMLTextAreaElement;
  panel: HTMLElement;
} {
  const client = makeQueryClientFromItemDetail(DETAIL);
  const tree = (
    presentation: ItemPresentation,
    itemId = ITEM_ID,
    isUnavailable = false,
  ) => {
    return (
      <MantineProvider theme={theme}>
        <QueryClientProvider client={client}>
          <ItemCommentDraftProvider>
            <Harness
              presentation={presentation}
              itemId={itemId}
              isUnavailable={isUnavailable}
            />
          </ItemCommentDraftProvider>
        </QueryClientProvider>
      </MantineProvider>
    );
  };
  const result = render(tree(initialPresentation));
  return {
    ...result,
    show: (
      presentation: ItemPresentation,
      itemId?: string,
      isUnavailable?: boolean,
    ): void => {
      result.rerender(tree(presentation, itemId, isUnavailable));
    },
    field: result.container.querySelector("textarea")!,
    panel: result.container.querySelector<HTMLElement>(
      "[data-theater-comment-panel]",
    )!,
  };
}
/** Returns the collapsed dock control, including while it is aria-hidden. */
export function getCommentBubble(): HTMLElement {
  return screen.getByLabelText("Open comments, 1 comment");
}
/** Flushes the dock departure delay within a React update. */
export function advanceDockTimers(milliseconds: number): void {
  act(() => {
    vi.advanceTimersByTime(milliseconds);
  });
}
/** Enters the dock interaction region with a mouse pointer. */
export function hoverDock(element: HTMLElement): void {
  fireEvent.pointerEnter(element, { pointerType: "mouse" });
}
/** Leaves a dock region, optionally toward another owned control. */
export function leaveDock(
  element: HTMLElement,
  relatedTarget?: HTMLElement,
): void {
  fireEvent.pointerLeave(element, { pointerType: "mouse", relatedTarget });
}
