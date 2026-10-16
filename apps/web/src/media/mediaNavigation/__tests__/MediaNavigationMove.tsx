import type { ReactNode } from "react";
import { QueryClient } from "@tanstack/react-query";
import { useItemNavigationMove } from "@/surfaces/Item/ItemViewer/ItemNavigation/useItemNavigationMove";
import { makeItemDetail } from "@/testing/itemFixtureHelpers";

/** Drives the viewer movement hook against the test's mocked router. */
export function MediaNavigationMove(): ReactNode {
  const movement = useItemNavigationMove({
    context: {
      detail: makeItemDetail(),
      selection: { tags: [], people: [] },
      queryClient: new QueryClient(),
      memberId: "member",
    },
    targets: { next: { itemId: "target" } },
    isUnavailable: false,
  });
  return (
    <>
      <button
        onClick={() => {
          void movement.move("next");
        }}
      >
        Move
      </button>
      <output>{movement.error}</output>
    </>
  );
}
