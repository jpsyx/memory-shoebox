/** Inputs for _makeIfdEntryFromField. */
export type MakeIfdEntryFromFieldOptions = {
  tag: number;
  type: number;
  count: number;
  value: Buffer;
};

/** Inputs for _writeClip. */
export type WriteClipOptions = {
  pattern: "testsrc" | "testsrc2";
  codecArgs: string[];
  creationTime: string;
  targetPath: string;
};

/** The tags this generator writes, and nothing else. */
export type ExifTags = {
  /** 6 is "rotate 90 degrees clockwise to display", a phone held upright. */
  orientation: number;
  /** `YYYY:MM:DD HH:MM:SS`, the camera's wall clock. */
  dateTimeOriginal: string;
  /** `+HH:MM`, or undefined for a camera that writes no offset. */
  offsetTimeOriginal: string | undefined;
};
