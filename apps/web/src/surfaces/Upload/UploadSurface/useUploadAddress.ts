import { useEffect, useRef } from "react";
import { useNavigate } from "@tanstack/react-router";
import type {
  UploadSnapshot,
  UploadSessionController,
} from "@/upload/uploadSessionController/uploadSessionController.types";
type Options = {
  controller: UploadSessionController;
  snapshot: UploadSnapshot;
  sessionId?: string;
  isAllowed: boolean;
};
function useUploadAddressUpdates({
  controller,
  snapshot,
  sessionId,
  isAllowed,
}: Readonly<Options>): void {
  const navigate = useNavigate();
  const previousSession = useRef(snapshot.detail?.sessionId);
  useEffect(
    function addressCreatedUpload() {
      if (!isAllowed || controller.getSnapshot().isBusy) {
        return;
      }
      if (snapshot.detail) {
        previousSession.current = snapshot.detail.sessionId;
        if (snapshot.detail.sessionId !== sessionId) {
          void navigate({
            to: "/upload",
            search: { session: snapshot.detail.sessionId },
            replace: true,
          });
        }
      } else if (snapshot.phase === "idle" && previousSession.current) {
        previousSession.current = undefined;
        void navigate({ to: "/upload", search: {}, replace: true });
      }
    },
    [
      controller,
      isAllowed,
      navigate,
      sessionId,
      snapshot.detail,
      snapshot.isBusy,
      snapshot.phase,
    ],
  );
}
function useUploadSignIn({
  snapshot,
  sessionId,
  isAllowed,
}: Readonly<Options>): void {
  const navigate = useNavigate();
  useEffect(
    function offerUploadSignIn() {
      if (isAllowed && snapshot.error?.code === "not_signed_in") {
        const address = snapshot.detail?.sessionId ?? sessionId;
        void navigate({
          to: "/sign-in",
          search: {
            redirect: address ? `/upload?session=${address}` : "/upload",
          },
          replace: true,
        });
      }
    },
    [
      isAllowed,
      navigate,
      sessionId,
      snapshot.error?.code,
      snapshot.detail?.sessionId,
    ],
  );
}
/** Reads addresses once, replaces fresh addresses and carries them to sign-in. */
export function useUploadAddress(options: Readonly<Options>): void {
  const { controller, sessionId, isAllowed } = options;
  const loaded = useRef<string | undefined>(undefined);
  useEffect(
    function readAddressedUpload() {
      const address = sessionId ?? "current";
      if (
        !isAllowed ||
        loaded.current === address ||
        (sessionId && controller.getSnapshot().detail?.sessionId === sessionId)
      ) {
        return;
      }
      loaded.current = address;
      void controller.loadSession(sessionId).catch(() => {});
    },
    [controller, isAllowed, sessionId],
  );
  useUploadAddressUpdates(options);
  useUploadSignIn(options);
}
