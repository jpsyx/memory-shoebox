/** Inputs for _ifdEntry. */
export type IfdEntryOptions = {
  tag: number;
  type: number;
  count: number;
  value: number[];
};

/** What a test JPEG's EXIF block says. Omit a field to leave its tag out. */
export type JpegExifFields = {
  orientation?: number;
  dateTimeOriginal?: string;
  offsetTimeOriginal?: string;
  pixelWidth?: number;
  pixelHeight?: number;
};

/** What a test `mvhd` says, before it is written as version 0 or 1. */
export type MovieHeaderFields = {
  version: 0 | 1;
  /** The instant the movie was created, in UTC. */
  createdAt: Date;
  timescale: number;
  duration: number;
};

/** What a test `tkhd` says, before it is written as version 0 or 1. */
export type TrackHeaderFields = {
  version: 0 | 1;
  /** The stored pixels, before the matrix turns them. */
  width: number;
  height: number;
  /** Quarter turns the matrix applies: a phone's portrait video is 1. */
  quarterTurns: 0 | 1 | 2 | 3;
};
