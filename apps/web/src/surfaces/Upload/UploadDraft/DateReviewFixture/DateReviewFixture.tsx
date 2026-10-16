import { MantineProvider } from "@mantine/core";
import type { ReactNode } from "react";
import type { UploadPreviewQueue } from "@/upload/createUploadPreviewQueue/createUploadPreviewQueue.types";
import type {
  UploadSessionController,
  UploadSnapshot,
} from "@/upload/createUploadSessionController/createUploadSessionController.types";
import { UploadUndated } from "../UploadUndated/UploadUndated";
import { UploadDraftFooter } from "../UploadDraftFooter";

type Props = {
  snapshot: UploadSnapshot;
  controller: UploadSessionController;
  previews: UploadPreviewQueue;
  onStart: () => void;
};

/**
 * Exercises date editing and the upload gate against controlled dependencies.
 */
export function DateReviewFixture({
  snapshot,
  controller,
  previews,
  onStart,
}: Readonly<Props>): ReactNode {
  return (
    <MantineProvider env="test">
      <UploadUndated
        snapshot={snapshot}
        controller={controller}
        previews={previews}
      />
      <UploadDraftFooter
        snapshot={snapshot}
        controller={controller}
        visibility={{ mode: "everyone", subjects: [] }}
        onStart={onStart}
      />
    </MantineProvider>
  );
}
