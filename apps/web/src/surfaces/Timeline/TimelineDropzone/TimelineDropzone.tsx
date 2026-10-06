import { Prose } from "@/system/typography/Prose";
import { useUploadSessionResources } from "@/upload/UploadSessionProvider/useUploadSessionResources";
import { Dropzone } from "@mantine/dropzone";
import { IconPhotoPlus } from "@tabler/icons-react";
import { useNavigate } from "@tanstack/react-router";
import type { ReactNode } from "react";
import classes from "./TimelineDropzone.module.css";

/** Captures file and recursive folder drops anywhere on the timeline. */
export function TimelineDropzone(): ReactNode {
  const navigate = useNavigate();
  const { controller, fileIntake } = useUploadSessionResources();
  return (
    <Dropzone.FullScreen
      role="region"
      aria-label="Drop files to upload"
      activateOnClick={false}
      activateOnKeyboard={false}
      classNames={{
        fullScreen: classes.timelineDropzoneOverlay,
        root: classes.timelineDropzoneRoot,
        inner: classes.timelineDropzoneContent,
      }}
      onDrop={(files) => {
        if (files.length === 0) {
          return;
        }
        fileIntake.stageFiles(files);
        const session = controller.getSnapshot().detail?.sessionId;
        void navigate({ to: "/upload", search: session ? { session } : {} });
      }}
    >
      <IconPhotoPlus size="3rem" stroke={1.5} aria-hidden="true" />
      <span className={classes.timelineDropzoneHeading}>
        Drop photos and videos to upload
      </span>
      <Prose onPanel>
        Drop files or a whole folder. You can review them before uploading.
      </Prose>
    </Dropzone.FullScreen>
  );
}
