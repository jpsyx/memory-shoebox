import type { MediaRef } from "@memory-shoebox/shared";
import { clsx } from "clsx";
import type { ReactNode } from "react";
import classes from "./MediaPlaceholder.module.css";

type Props = {
  altText: string;
  width: number;
  height: number;
  state: MediaRef["previewState"];
  /** The host surface's media-box constraints. */
  className?: string;
  /** Short status copy for fixed thumbnail boxes. */
  isCompact?: boolean;
};

/** Keeps oriented layout and accessible description when no preview can be drawn. */
export function MediaPlaceholder({
  altText,
  width,
  height,
  state,
  className,
  isCompact = false,
}: Readonly<Props>): ReactNode {
  const sizing = {
    aspectRatio: `${width} / ${height}`,
    "--media-aspect-ratio": width / height,
  };
  const label = isCompact
    ? state === "pending"
      ? "Preparing"
      : "Unavailable"
    : state === "pending"
      ? "Preparing preview"
      : "Preview unavailable";
  return (
    <div
      role="img"
      aria-label={altText}
      aria-description={label}
      className={clsx(classes.MediaPlaceholder, className)}
      style={sizing}
    >
      <span>{label}</span>
    </div>
  );
}
