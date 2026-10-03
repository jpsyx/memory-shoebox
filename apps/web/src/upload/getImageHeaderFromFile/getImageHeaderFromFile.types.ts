/** What an image's header says, read without decoding a pixel. */
export type ImageHeader = {
  /** EXIF `DateTimeOriginal` with no zone applied: "2026-09-14T06:41:32". */
  exifCapturedAtLocal: string | undefined;
  /** EXIF `OffsetTimeOriginal`, in minutes east of UTC. */
  exifOffsetMinutes: number | undefined;
  /** Post-orientation, so a portrait photograph reads as portrait. */
  width: number | undefined;
  height: number | undefined;
};
