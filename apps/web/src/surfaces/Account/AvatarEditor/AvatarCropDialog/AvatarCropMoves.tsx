import { Button, Group } from "@mantine/core";
import type { ReactNode } from "react";
import type { AvatarCropDialogOptions } from "./AvatarCropDialog.types";

type Props = Pick<
  AvatarCropDialogOptions,
  "onCrop" | "crop" | "isSaving" | "dimensions"
>;
/** Renders avatar crop moves. */
export function AvatarCropMoves({
  onCrop,
  crop,
  isSaving,
  dimensions,
}: Readonly<Props>): ReactNode {
  const move = (x: number, y: number) => {
    onCrop({
      ...crop,
      centerX: Math.max(0, Math.min(1, crop.centerX + x)),
      centerY: Math.max(0, Math.min(1, crop.centerY + y)),
    });
  };
  return (
    <Group gap="xs">
      {[
        { label: "Up", x: 0, y: 0.05 },
        { label: "Left", x: 0.05, y: 0 },
        { label: "Right", x: -0.05, y: 0 },
        { label: "Down", x: 0, y: -0.05 },
      ].map(({ label, x, y }) => {
        return (
          <Button
            key={label}
            variant="default"
            aria-label={`Move photo ${label.toLowerCase()}`}
            onClick={() => {
              move(x, y);
            }}
            disabled={isSaving || !dimensions}
          >
            {label}
          </Button>
        );
      })}
    </Group>
  );
}
