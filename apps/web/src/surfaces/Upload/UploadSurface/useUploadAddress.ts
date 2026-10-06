import type {
  UploadSessionController,
  UploadSnapshot,
} from "@/upload/createUploadSessionController/createUploadSessionController.types";
import { useNavigate } from "@tanstack/react-router";
import { useEffect, useRef } from "react";
import { useUploadSessionResources } from "@/upload/UploadSessionProvider/useUploadSessionResources";
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
      const hasFailedAddress =
        snapshot.error?.operation === "load" &&
        sessionId &&
        snapshot.detail?.sessionId !== sessionId;
      if (!isAllowed || controller.getSnapshot().isBusy || hasFailedAddress) {
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
      snapshot.error?.operation,
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
        const address = sessionId ?? snapshot.detail?.sessionId;
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
/**
 * Reads addresses once, replaces fresh addresses and carries them to sign-in.
 */
export function useUploadAddress(options: Readonly<Options>): void {
  const { controller, sessionId, isAllowed } = options;
  const { fileIntake } = useUploadSessionResources();
  const loaded = useRef<string | undefined>(undefined);
  useEffect(
    function readAddressedUpload() {
      const address = sessionId ?? "current";
      if (
        !isAllowed ||
        loaded.current === address ||
        (sessionId &&
          controller.getSnapshot().detail?.sessionId === sessionId &&
          fileIntake.getPendingFileCount() === 0)
      ) {
        return;
      }
      loaded.current = address;
      void fileIntake.loadSession(sessionId).catch(() => {});
    },
    [controller, fileIntake, isAllowed, sessionId],
  );
  useUploadAddressUpdates(options);
  useUploadSignIn(options);
}
