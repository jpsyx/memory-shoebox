import system from "@/system/system.module.css";
import { Button } from "@mantine/core";
import { type ReactNode } from "react";
import classes from "./UploadDayReveal.module.css";
type Props = {
  fileCount: number;
  visibleCount: number;
  onReveal: () => void;
};

/** Reveals the remaining files in this capture day. */
export function UploadDayReveal({
  fileCount,
  visibleCount,
  onReveal,
}: Readonly<Props>): ReactNode {
  return visibleCount < fileCount ? (
    <div className={classes.uploadDayRevealMore}>
      <span className={system.fileMeta}>
        and {fileCount - visibleCount} more from the same day. Ticking the day
        takes all eligible files.
      </span>
      <Button variant="default" size="sm" onClick={onReveal}>
        Show all {fileCount}
      </Button>
    </div>
  ) : null;
}
