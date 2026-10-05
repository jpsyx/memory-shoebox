import { ApiRequestError } from "@/api/clientHelpers/clientHelpers";
const PREFLIGHT_COPY_BY_CODE: Record<string, string> = {
  occasion_busy:
    "This occasion is already being changed. Wait for that change, then review it before saving again.",
  occasion_changed:
    "The occasion or its attachments changed. Review the refreshed photographs before choosing again.",
  occasion_choices_unavailable:
    "Some chosen photographs are unavailable. Your choices are kept; restore access or cancel before saving.",
  occasion_choices_repeated:
    "The photographs repeated a page. Your choices are kept. Retry the save.",
} as const;

/** Explains failed authority reads while preserving choices or dates. */
export function milestonePreflightFailure({
  error,
  target,
}: Readonly<{ error: unknown; target: "choices" | "dates" }>): string {
  const knownCopy =
    error instanceof ApiRequestError
      ? PREFLIGHT_COPY_BY_CODE[error.code]
      : undefined;
  return (
    knownCopy ??
    (target === "choices"
      ? "The occasion could not be read. Your choices are kept. Refresh the occasion before saving."
      : "The occasion could not be read. Your dates are kept. Refresh the occasion before choosing again.")
  );
}
