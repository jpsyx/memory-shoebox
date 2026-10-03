import type { ManifestEntry } from "@memory-shoebox/shared";

/** The fields of an entry that depend on what kind of file this is. */
export type HeaderFacts = Pick<
  ManifestEntry,
  "capture" | "width" | "height" | "durationMs"
>;
