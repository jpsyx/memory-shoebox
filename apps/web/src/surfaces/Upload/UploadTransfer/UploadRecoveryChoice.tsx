import { Prose } from "@/system/typography/Prose";
import type {
  UploadSessionController,
  UploadSnapshot,
} from "@/upload/uploadSessionController/uploadSessionController.types";
import { Button } from "@mantine/core";
import { useState, type ReactNode } from "react";
import { UploadIncomingOriginal } from "./UploadIncomingOriginal";
import { UploadSavedOriginalPicker } from "./UploadSavedOriginalPicker";
type Props = { snapshot: UploadSnapshot; controller: UploadSessionController };

/** A native id-valued picker disambiguates one original before transfer. */
export function UploadRecoveryChoice({
  snapshot,
  controller,
}: Readonly<Props>): ReactNode {
  const match = snapshot.recoveryMatches.ambiguous[0]!;
  const [choice, setChoice] = useState("");
  const onConfirm = () => {
    void controller
      .confirmRecoveryMatch({ fileId: choice, clientRef: match.clientRef })
      .catch(() => {});
  };
  return (
    <>
      <UploadIncomingOriginal clientRef={match.clientRef} snapshot={snapshot} />
      <Prose onPanel={snapshot.detail?.state === "draft"}>
        This chosen file could match more than one saved original. Choose which
        one it is before any transfer starts.
      </Prose>
      <UploadSavedOriginalPicker
        snapshot={snapshot}
        choice={choice}
        onChange={setChoice}
      />
      <Button
        variant={snapshot.detail?.state === "draft" ? "panel-filled" : "filled"}
        disabled={snapshot.isBusy || !match.fileIds.includes(choice)}
        onClick={onConfirm}
      >
        Use this original
      </Button>
      <Button
        variant={snapshot.detail?.state === "draft" ? "panel" : "default"}
        disabled={snapshot.isBusy}
        onClick={() => {
          void controller.skipRecoveryMatch(match.clientRef).catch(() => {});
        }}
      >
        Skip this chosen file
      </Button>
      <Prose onPanel={snapshot.detail?.state === "draft"}>
        If you cannot identify it, skip it and choose the original again. Its
        saved row stays missing.
      </Prose>
    </>
  );
}
