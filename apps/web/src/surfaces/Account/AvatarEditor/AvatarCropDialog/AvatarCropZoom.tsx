import { Group, Slider } from "@mantine/core";
import type { ReactNode } from "react";
import classes from "./AvatarCropDialog.module.css";
import type { AvatarCropDialogOptions } from "./AvatarCropDialog.types";
import { AvatarCropZoomButton } from "./AvatarCropZoomButton";
type Props = Pick<
  AvatarCropDialogOptions,
  "dimensions" | "onCrop" | "crop" | "isSaving"
>;
/** Renders avatar crop zoom. */
export function AvatarCropZoom({
  dimensions,
  onCrop,
  crop,
  isSaving,
}: Readonly<Props>): ReactNode {
  const maximum = Math.min(8, dimensions?.width ?? 8, dimensions?.height ?? 8);
  const zoom = (value: number) => {
    onCrop({
      ...crop,
      zoom: Math.max(1, Math.min(maximum, value)),
    });
  };
  const disabled = isSaving || !dimensions;
  return (
    <Group wrap="nowrap">
      <AvatarCropZoomButton
        crop={crop}
        isSaving={isSaving}
        dimensions={dimensions}
        zoom={zoom}
        delta={-0.1}
      />
      <Slider
        thumbLabel="Photo zoom"
        min={1}
        max={maximum}
        step={0.1}
        value={crop.zoom}
        onChange={zoom}
        disabled={disabled}
        className={classes.slider}
      />
      <AvatarCropZoomButton
        crop={crop}
        isSaving={isSaving}
        dimensions={dimensions}
        zoom={zoom}
        delta={0.1}
      />
    </Group>
  );
}
