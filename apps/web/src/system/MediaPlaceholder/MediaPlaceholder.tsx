import type { ReactNode } from "react";
import type { MediaRef } from "@memory-shoebox/shared";
import classes from "./MediaPlaceholder.module.css";

type Props = {
  altText: string;
  width: number;
  height: number;
  state: MediaRef["previewState"];
};

/** Keeps oriented layout and accessible description when no preview can be drawn. */
export function MediaPlaceholder({
  altText,
  width,
  height,
  state,
}: Readonly<Props>): ReactNode {
  return (
    <div
      role="img"
      aria-label={altText}
      className={classes.placeholder}
      style={{ aspectRatio: `${width} / ${height}` }}
    >
      <span>
        {state === "pending" ? "Preparing preview" : "Preview unavailable"}
      </span>
    </div>
  );
}
