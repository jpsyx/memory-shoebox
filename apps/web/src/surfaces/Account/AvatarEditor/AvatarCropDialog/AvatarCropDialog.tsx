import { Modal } from "@mantine/core";
import { useMediaQuery } from "@mantine/hooks";
import type { ReactNode } from "react";
import { AvatarCropBody } from "./AvatarCropBody";
import classes from "./AvatarCropDialog.module.css";
import type { AvatarCropDialogOptions } from "./AvatarCropDialog.types";
type Props = Pick<
  AvatarCropDialogOptions,
  | "opened"
  | "onCancel"
  | "onClosed"
  | "isSaving"
  | "error"
  | "onUseLatest"
  | "onOverwrite"
  | "onSave"
  | "dimensions"
  | "crop"
  | "url"
  | "onCrop"
  | "onChoose"
>;
/** Renders avatar crop dialog. */
export function AvatarCropDialog({
  opened,
  onCancel,
  onClosed,
  isSaving,
  error,
  onUseLatest,
  onOverwrite,
  onSave,
  dimensions,
  crop,
  url,
  onCrop,
  onChoose,
}: Readonly<Props>): ReactNode {
  const isPhone = useMediaQuery("(max-width: 40em)");
  return (
    <Modal
      opened={opened}
      onClose={onCancel}
      returnFocus={false}
      onExitTransitionEnd={onClosed}
      title="Adjust your photo"
      fullScreen={isPhone}
      closeButtonProps={{ "aria-label": "Close" }}
      closeOnClickOutside={false}
      closeOnEscape={!isSaving}
      withCloseButton={!isSaving}
      size="md"
      classNames={{ body: classes.body }}
    >
      <AvatarCropBody
        error={error}
        onUseLatest={onUseLatest}
        isSaving={isSaving}
        onOverwrite={onOverwrite}
        onCancel={onCancel}
        onSave={onSave}
        dimensions={dimensions}
        crop={crop}
        url={url}
        onCrop={onCrop}
        onChoose={onChoose}
      />
    </Modal>
  );
}
