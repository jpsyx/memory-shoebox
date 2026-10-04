import type { ReactNode } from "react";
import type { UploadPhase } from "@/upload/uploadSessionController/uploadSessionController.types";
import classes from "../upload.module.css";
const PHASE_COPY: Record<UploadPhase, string> = {
  idle: "Ready to choose files.",
  loading: "Reading saved batch.",
  declaring: "Saving chosen files.",
  draft: "Batch ready. Every accepted file will go up.",
  checking: "Checking picked files.",
  resume: "Saved batch ready to resume.",
  sending: "Sending files. Keep this tab open.",
  partial: "Some files are not up. What arrived stays saved.",
  done: "Batch finished.",
  unavailable: "Batch unavailable.",
};
type Props = { phase: UploadPhase };
/** Announces phase changes, never individual byte events. */
export function UploadStateNotice({ phase }: Readonly<Props>): ReactNode {
  return (
    <p
      role="status"
      aria-live="polite"
      aria-atomic="true"
      className={classes.srOnly}
    >
      {PHASE_COPY[phase]}
    </p>
  );
}
