import { MediaPlaceholder } from "@/system/MediaPlaceholder/MediaPlaceholder";
import type { MediaSource } from "@memory-shoebox/shared";
import type { ReactNode } from "react";
import type { Props as PrintProps } from "../Print.types";
import classes from "./PrintMedia.module.css";

type Props = {
  media: PrintProps["media"];
  thumbnail: {
    source: MediaSource | undefined;
    loading: "eager" | "lazy";
  };
};

/** Reserves the thumbnail's real proportions while its source enters view. */
export function PrintMedia({ media, thumbnail }: Readonly<Props>): ReactNode {
  return media.thumb === null ? (
    <MediaPlaceholder
      altText={media.altText}
      width={media.width}
      height={media.height}
      state={media.previewState}
    />
  ) : (
    <span
      className={classes.printMedia}
      style={{ aspectRatio: `${media.thumb.width} / ${media.thumb.height}` }}
    >
      <img
        src={thumbnail.source?.url}
        alt={media.altText}
        width={media.thumb.width}
        height={media.thumb.height}
        loading={thumbnail.loading}
      />
    </span>
  );
}
