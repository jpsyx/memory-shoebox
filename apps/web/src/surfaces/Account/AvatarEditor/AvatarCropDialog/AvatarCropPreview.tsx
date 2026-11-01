import { Text } from "@mantine/core";
import type { ReactNode } from "react";
import { getPreviewFromAvatarCrop } from "../avatarCropHelpers/avatarCropHelpers";
import classes from "./AvatarCropDialog.module.css";
import type { AvatarCropDialogOptions } from "./AvatarCropDialog.types";

type Props = Pick<AvatarCropDialogOptions, "dimensions" | "crop" | "url">;
/** Renders avatar crop preview. */
export function AvatarCropPreview({
  dimensions,
  crop,
  url,
}: Readonly<Props>): ReactNode {
  const preview = dimensions
    ? getPreviewFromAvatarCrop({
        ...dimensions,
        crop: crop,
        size: 264,
      })
    : undefined;
  return (
    <div className={classes.preview} aria-label="Photo crop preview">
      {preview ? (
        <img
          src={url}
          alt=""
          style={{
            width: `${(preview.width / 264) * 100}%`,
            height: `${(preview.height / 264) * 100}%`,
            left: `${(preview.left / 264) * 100}%`,
            top: `${(preview.top / 264) * 100}%`,
          }}
        />
      ) : (
        <Text role="status">Opening photo...</Text>
      )}
    </div>
  );
}
