import { Button, Group, Stack, Text } from "@mantine/core";
import type { ReactNode } from "react";
import { AvatarCropControls } from "./AvatarCropControls";
import classes from "./AvatarCropDialog.module.css";
import type { AvatarCropDialogOptions } from "./AvatarCropDialog.types";
import { AvatarCropPreview } from "./AvatarCropPreview";
type Props = Pick<
  AvatarCropDialogOptions,
  | "error"
  | "onUseLatest"
  | "isSaving"
  | "onOverwrite"
  | "onCancel"
  | "onSave"
  | "dimensions"
  | "crop"
  | "url"
  | "onCrop"
  | "onChoose"
>;
/** Renders avatar crop body. */
export function AvatarCropBody({
  error,
  onUseLatest,
  isSaving,
  onOverwrite,
  onCancel,
  onSave,
  dimensions,
  crop,
  url,
  onCrop,
  onChoose,
}: Readonly<Props>): ReactNode {
  return (
    <Stack gap="md" className={classes.content}>
      <AvatarCropPreview dimensions={dimensions} crop={crop} url={url} />
      <AvatarCropControls
        dimensions={dimensions}
        onCrop={onCrop}
        crop={crop}
        isSaving={isSaving}
        onChoose={onChoose}
      />
      {error ? <Text role="alert">{error}</Text> : null}
      {onUseLatest ? (
        <Group>
          <Button variant="default" onClick={onUseLatest} disabled={isSaving}>
            Use latest photo
          </Button>
          <Button onClick={onOverwrite} loading={isSaving}>
            Save this photo instead
          </Button>
        </Group>
      ) : null}
      <Group justify="space-between" className={classes.footer}>
        <Button variant="default" onClick={onCancel} disabled={isSaving}>
          Cancel
        </Button>
        <Button
          onClick={onSave}
          loading={isSaving}
          disabled={!dimensions || !!onUseLatest}
        >
          {isSaving ? "Saving photo..." : "Save photo"}
        </Button>
      </Group>
    </Stack>
  );
}
