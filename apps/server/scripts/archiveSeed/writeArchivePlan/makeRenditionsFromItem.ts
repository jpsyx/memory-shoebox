// apps/server/scripts/archiveSeed/writeArchivePlan/makeRenditionsFromItem.ts
import type { PlannedItem } from "../archivePlan.ts";

/** One rendition a planned item needs: what to call it, and how big it is. */
export type PlannedRendition = {
  purpose: string;
  file: string;
  contentType: string;
  width: number;
  height: number;
};

/** The two renditions a photo has: a thumbnail, and its display image. */
function _photoRenditions(item: PlannedItem): PlannedRendition[] {
  const isPortrait = ["bath", "pram", "firstSteps"].includes(item.scene);
  return [
    {
      purpose: "thumb",
      file: `${item.scene}-thumb.jpg`,
      contentType: "image/jpeg",
      width: isPortrait ? 267 : 400,
      height: isPortrait ? 400 : 267,
    },
    {
      purpose: "display",
      file: `${item.scene}.jpg`,
      contentType: "image/jpeg",
      width: isPortrait ? 1067 : 1600,
      height: isPortrait ? 1600 : 1067,
    },
  ];
}

/** The four renditions a video has: a thumb, a poster, and both formats. */
function _videoRenditions(item: PlannedItem): PlannedRendition[] {
  return [
    {
      purpose: "thumb",
      file: `${item.scene}-thumb.jpg`,
      contentType: "image/jpeg",
      width: 400,
      height: 267,
    },
    {
      purpose: "poster",
      file: `${item.scene}-poster.jpg`,
      contentType: "image/jpeg",
      width: 960,
      height: 640,
    },
    {
      purpose: "video_mp4",
      file: `${item.scene}.mp4`,
      contentType: "video/mp4",
      width: 960,
      height: 640,
    },
    {
      purpose: "video_webm",
      file: `${item.scene}.webm`,
      contentType: "video/webm",
      width: 960,
      height: 640,
    },
  ];
}

/** The renditions one planned item needs, and what each is called. */
export function makeRenditionsFromItem(item: PlannedItem): PlannedRendition[] {
  return item.kind === "video"
    ? _videoRenditions(item)
    : _photoRenditions(item);
}
