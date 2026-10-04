import { Stack } from "@mantine/core";
import { getRouteApi } from "@tanstack/react-router";
import { useEffect, useRef, type ReactNode } from "react";
import {
  useUploadSessionController,
  useUploadPreviewQueue,
} from "@/upload/UploadSessionProvider/useUploadSessionController";
import { useUploadSnapshot } from "@/upload/UploadSessionProvider/useUploadSnapshot";
import { TopBar } from "@/system/Chrome/TopBar";
import { Page } from "@/system/Chrome/Page";
import { UploadSurfaceHeading } from "./UploadSurfaceHeading";
import { Prose } from "@/system/typography/Prose";
import { isFocusLost } from "@/system/focusHelpers";
import { UploadSurfaceBody } from "./UploadSurfaceBody";
import { useUploadSurfaceState } from "./useUploadSurfaceState";
type Props = { sessionId?: string };
function useUploadTransitionFocus(
  phase: import("@/upload/uploadSessionController/uploadSessionController.types").UploadPhase,
) {
  const root = useRef<HTMLDivElement>(null);
  const previousPhase = useRef(phase);
  useEffect(
    function focusUploadTransition() {
      const shouldRestore =
        previousPhase.current !== "loading" &&
        phase !== "loading" &&
        phase !== "idle";
      previousPhase.current = phase;
      if (shouldRestore && isFocusLost()) {
        const heading = root.current?.querySelector<HTMLElement>("h1");
        if (heading) {
          heading.tabIndex = -1;
          heading.focus();
        }
      }
    },
    [phase],
  );
  return root;
}
/** Surface 8 uses the controller kept alive by the signed-in shell. */
export function UploadSurface({ sessionId }: Readonly<Props>): ReactNode {
  const { viewer, settings } = getRouteApi("/_app").useRouteContext();
  const controller = useUploadSessionController();
  const previews = useUploadPreviewQueue();
  const snapshot = useUploadSnapshot(controller);
  const isAllowed = viewer.role !== "viewer";
  const state = useUploadSurfaceState({
    controller,
    snapshot,
    sessionId,
    isAllowed,
  });
  const root = useUploadTransitionFocus(snapshot.phase);
  return (
    <>
      <TopBar back={{ label: "Back to the pile", to: "/" }} />
      <Page wide>
        <Stack
          ref={root}
          gap="lg"
          aria-label={`Upload to ${settings.shoeboxName}`}
        >
          <UploadSurfaceHeading snapshot={snapshot} isAllowed={isAllowed} />
          {isAllowed ? (
            <>
              <UploadSurfaceBody
                key={viewer.memberId}
                snapshot={snapshot}
                controller={controller}
                previews={previews}
                viewer={viewer}
                state={state}
              />
            </>
          ) : (
            <Prose onPanel>
              Viewers can enjoy everything shared with them in the Shoebox. A
              poster or admin can put files up.
            </Prose>
          )}
        </Stack>
      </Page>
    </>
  );
}
