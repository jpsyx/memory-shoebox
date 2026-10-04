import { Stack } from "@mantine/core";
import type { ReactNode } from "react";
import { UploadSending } from "./UploadSending";
import { UploadResume } from "./UploadResume";
import { UploadPartial } from "./UploadPartial";
import { UploadDone } from "./UploadDone";
import type {
  UploadSnapshot,
  UploadSessionController,
} from "@/upload/uploadSessionController/uploadSessionController.types";
type Props = {
  snapshot: UploadSnapshot;
  controller: UploadSessionController;
  onPick: (files: readonly File[]) => void;
  onUploadMore: () => void;
};
/** Sending uses confirmed aggregates and the existing controller actions. */
export function UploadTransfer({
  snapshot,
  controller,
  onPick,
  onUploadMore,
}: Readonly<Props>): ReactNode {
  const detail = snapshot.detail!;
  const isSending = snapshot.isRunning || snapshot.phase === "sending";
  return (
    <Stack gap="lg">
      {isSending ? (
        <UploadSending snapshot={snapshot} />
      ) : snapshot.phase !== "done" ? (
        <UploadPartial snapshot={snapshot} controller={controller} />
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
      {!isSending && detail.state === "settled" && snapshot.phase !== "done" ? (
        <UploadDone snapshot={snapshot} onUploadMore={onUploadMore} />
      ) : null}
    </Stack>
  );
}
