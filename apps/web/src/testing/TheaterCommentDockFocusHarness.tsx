import "@mantine/core/styles.css";
import { MantineProvider } from "@mantine/core";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createRoot } from "react-dom/client";
import { useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { ItemCommentDraftProvider } from "@/surfaces/Item/ItemConversation/ItemCommentDraftProvider";
import { ItemComments } from "@/surfaces/Item/ItemConversation/ItemComments/ItemComments";
import { TheaterCommentDock } from "@/surfaces/Item/ItemTheater/TheaterCommentDock";
import { useTheaterCommentDock } from "@/surfaces/Item/ItemTheater/useTheaterCommentDock";
import { useVideoTransport } from "@/surfaces/Item/ItemViewer/useVideoTransport";
import { makeVideoDetail, SIGNED_IN } from "./itemFixtureHelpers";
import { theme } from "@/theme/theme";
import "@/styles/tokens/tokens.css";

const DETAIL = makeVideoDetail({ comments: [] });
const CLIENT = new QueryClient();

/** Real shared components under browser CSS, isolated from routes and APIs. */
function TheaterCommentDockFocusHarness(): ReactNode {
  const [itemId, setItemId] = useState(DETAIL.itemId);
  const fieldRef = useRef<HTMLTextAreaElement>(null);
  const transport = useVideoTransport(itemId);
  const controller = useTheaterCommentDock({
    presentation: "theater",
    itemId,
    fieldRef,
    isUnavailable: false,
  });
  const setPosition = transport.setPosition;
  useLayoutEffect(() => {
    setPosition(6.25);
  }, [itemId, setPosition]);
  return (
    <>
      <button
        type="button"
        onClick={() => {
          setItemId("another-item");
        }}
      >
        Next item
      </button>
      <TheaterCommentDock
        presentation="theater"
        controller={controller}
        commentCount={0}
        isUnavailable={false}
      >
        <ItemComments
          presentation="theater"
          detail={{ ...DETAIL, itemId }}
          viewer={SIGNED_IN}
          transport={transport}
          fieldRef={fieldRef}
        />
      </TheaterCommentDock>
    </>
  );
}

createRoot(document.getElementById("root")!).render(
  <MantineProvider theme={theme}>
    <QueryClientProvider client={CLIENT}>
      <ItemCommentDraftProvider>
        <TheaterCommentDockFocusHarness />
      </ItemCommentDraftProvider>
    </QueryClientProvider>
  </MantineProvider>,
);
