import type {
  UploadSessionController,
  UploadSnapshot,
} from "@/upload/createUploadSessionController/createUploadSessionController.types";
import { Stack } from "@mantine/core";
import type { ReactNode } from "react";
import { UploadDone } from "./UploadDone/UploadDone";
import { UploadPartial } from "./UploadPartial";
import { UploadResume } from "./UploadResume/UploadResume";
import { UploadSending } from "./UploadSending/UploadSending";
import type { UploadPreviewQueue } from "@/upload/createUploadPreviewQueue/createUploadPreviewQueue.types";
import { UploadDraftDays } from "../UploadDraft/UploadDraftDays";
import { UploadRecoveryStorageNotice } from "./UploadRecoveryStorageNotice";
type Props = {
  snapshot: UploadSnapshot;
  controller: UploadSessionController;
  onPick: (files: readonly File[]) => void;
  onUploadMore: () => void;
  previews: UploadPreviewQueue;
  viewer: { memberId: string; isAdmin?: boolean };
};
/** Sending uses confirmed aggregates and the existing controller actions. */
export function UploadTransfer({
  snapshot,
  controller,
  onPick,
  onUploadMore,
  previews,
  viewer,
}: Readonly<Props>): ReactNode {
  const detail = snapshot.detail!;
  const isSending = snapshot.isRunning || snapshot.phase === "sending";
  return (
    <Stack gap="lg">
      <UploadRecoveryStorageNotice warning={snapshot.recoveryStorageWarning} />
      {isSending ? (
        <UploadSending snapshot={snapshot} previews={previews} />
      ) : null}
      {snapshot.phase === "done" ? (
        <UploadDone snapshot={snapshot} onUploadMore={onUploadMore} />
      ) : (
        <UploadResume
          snapshot={snapshot}
          controller={controller}
          onPick={onPick}
        />
      )}
      {!isSending && snapshot.phase !== "done" ? (
        <UploadPartial
          snapshot={snapshot}
          controller={controller}
          previews={previews}
        />
      ) : null}
      {!isSending && detail.state === "settled" && snapshot.phase !== "done" ? (
        <UploadDone snapshot={snapshot} onUploadMore={onUploadMore} />
      ) : null}
      {!isSending ? (
        <UploadDraftDays {...{ snapshot, controller, previews, viewer }} />
      ) : null}
    </Stack>
  );
}
