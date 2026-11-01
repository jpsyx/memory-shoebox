import { Stack, Text } from "@mantine/core";
import type { ReactNode } from "react";
import type { AvatarCropDialogOptions } from "./AvatarCropDialog.types";
import { AvatarCropMoves } from "./AvatarCropMoves";
import { AvatarCropReset } from "./AvatarCropReset";
import { AvatarCropZoom } from "./AvatarCropZoom";
type Props = Pick<
  AvatarCropDialogOptions,
  "dimensions" | "onCrop" | "crop" | "isSaving" | "onChoose"
>;
/** Renders avatar crop controls. */
export function AvatarCropControls({
  dimensions,
  onCrop,
  crop,
  isSaving,
  onChoose,
}: Readonly<Props>): ReactNode {
  return (
    <Stack gap="sm">
      <Text>Zoom</Text>
      <AvatarCropZoom
        dimensions={dimensions}
        onCrop={onCrop}
        crop={crop}
        isSaving={isSaving}
      />
      <Text>Move photo</Text>
      <AvatarCropMoves
        onCrop={onCrop}
        crop={crop}
        isSaving={isSaving}
        dimensions={dimensions}
      />
      <AvatarCropReset
        onCrop={onCrop}
        isSaving={isSaving}
        dimensions={dimensions}
        onChoose={onChoose}
      />
    </Stack>
  );
}
