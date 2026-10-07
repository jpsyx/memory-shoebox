import classes from "@/system/system.module.css";
import { Prose } from "@/system/typography/Prose";
import { IconPhotoPlus } from "@tabler/icons-react";
import type { ReactNode } from "react";
type Props = {
  onPick: (files: readonly File[]) => void;
  onOpen: () => void;
  isDisabled: boolean;
};
/** Native drop target and keyboard button use the same file declaration. */
export function UploadDropzone({
  onPick,
  onOpen,
  isDisabled,
}: Readonly<Props>): ReactNode {
  return (
    <button
      type="button"
      disabled={isDisabled}
      className={classes.dropzone}
      onClick={onOpen}
      onDragOver={(event) => {
        event.preventDefault();
      }}
      onDrop={(event) => {
        event.preventDefault();
        if (!isDisabled) {
          onPick(Array.from(event.dataTransfer.files));
        }
      }}
    >
      <IconPhotoPlus size="3rem" stroke={1.5} aria-hidden="true" />
      <span className={classes.lede}>Drop photos and videos here</span>
      <Prose onPanel>Or choose them from this device.</Prose>
    </button>
  );
}
