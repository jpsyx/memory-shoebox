const UNITS = ["B", "KB", "MB", "GB"] as const;

/** Compact upload size copy; accounting continues to use the original bytes. */
export function uploadSizeLabel(bytes: number): string {
  const magnitude =
    bytes > 0 ? Math.floor(Math.log(bytes) / Math.log(1024)) : 0;
  const unitIndex = Math.min(UNITS.length - 1, Math.max(0, magnitude));
  const rounded = Math.round((bytes / 1024 ** unitIndex) * 10) / 10;
  const displayIndex =
    rounded >= 1024 && unitIndex < UNITS.length - 1 ? unitIndex + 1 : unitIndex;
  const amount = (bytes / 1024 ** displayIndex).toLocaleString("en-GB", {
    maximumFractionDigits: 1,
  });
  return `${amount} ${UNITS[displayIndex]}`;
}
