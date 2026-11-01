import { Button } from "@mantine/core";
import type { ReactNode } from "react";
import type { AvatarCropDialogOptions } from "./AvatarCropDialog.types";

type Props = Pick<
  AvatarCropDialogOptions,
  "crop" | "isSaving" | "dimensions"
> & { zoom: (value: number) => void; delta: number };
/** Renders avatar crop zoom button. */
export function AvatarCropZoomButton({
  crop,
  isSaving,
  dimensions,
  zoom,
  delta,
}: Readonly<Props>): ReactNode {
  return (
    <Button
      variant="default"
      aria-label={delta < 0 ? "Zoom out" : "Zoom in"}
      onClick={() => {
        zoom(crop.zoom + delta);
      }}
      disabled={isSaving || !dimensions}
    >
      {delta < 0 ? "-" : "+"}
    </Button>
  );
}
