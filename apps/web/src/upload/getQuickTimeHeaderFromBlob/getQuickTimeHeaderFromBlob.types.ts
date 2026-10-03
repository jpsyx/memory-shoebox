/** What a QuickTime or MP4 header says: when, how long, and how big. */
export type QuickTimeHeader = {
  /** `mvhd` `creation_time`, UTC by specification, as ISO-8601. Not judged. */
  creationTime: string | undefined;
  durationMs: number | undefined;
  /** The first video track's displayed size, its rotation applied. */
  width: number | undefined;
  height: number | undefined;
};

/** Where one atom sits in the file. */
export type AtomPosition = { start: number; headerBytes: number; size: number };

/** The part of the file one walk may look in. */
export type AtomRange = { blob: Blob; start: number; end: number };
