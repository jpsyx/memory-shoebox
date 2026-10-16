import { runtimeLabel } from "@/system/labelHelpers/labelHelpers";
import type { ReactNode } from "react";
import classes from "./PrintRuntime.module.css";

type Props = { durationMs: number | undefined };

/** Identifies a video and its duration before it is opened. */
export function PrintRuntime({ durationMs }: Readonly<Props>): ReactNode {
  return durationMs === undefined ? null : (
    <span className={classes.printRuntime}>
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M8 5.5v13l11-6.5z" />
      </svg>
      {runtimeLabel(durationMs)}
    </span>
  );
}
