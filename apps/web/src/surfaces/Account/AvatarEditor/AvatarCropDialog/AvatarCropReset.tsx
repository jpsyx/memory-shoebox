import { Button, Group } from "@mantine/core";
import type { ReactNode } from "react";
import type { AvatarCropDialogOptions } from "./AvatarCropDialog.types";

type Props = Pick<
  AvatarCropDialogOptions,
  "onCrop" | "isSaving" | "dimensions" | "onChoose"
>;
/** Renders avatar crop reset. */
export function AvatarCropReset({
  onCrop,
  isSaving,
  dimensions,
  onChoose,
}: Readonly<Props>): ReactNode {
  return (
    <Group>
      <Button
        variant="default"
        onClick={() => {
          onCrop({ centerX: 0.5, centerY: 0.5, zoom: 1 });
        }}
        disabled={isSaving || !dimensions}
      >
        Reset
      </Button>
      <Button variant="subtle" onClick={onChoose} disabled={isSaving}>
        Choose another photo
      </Button>
    </Group>
  );
}
