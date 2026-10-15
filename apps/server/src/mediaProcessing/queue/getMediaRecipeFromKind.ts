import { createHash } from "node:crypto";
import { appConfig } from "../../../../../app.config.ts";

/** Identity includes every admission budget and approved encoding policy. */
export function getMediaRecipeFromKind(kind: string): string {
  const policy = {
    limits: appConfig.mediaProcessing,
    input:
      "jpeg-png-still-webp-heic-primary;mp4-mov-h264-hevc;forced-demux-no-external",
    photo:
      "jpeg85-75-65-55-45;webp82-effort4-saving15pct;no-upscale;oriented-srgb",
    video:
      "x264-main3.1-crf23;one-thread;yuv420p;aac;faststart;full-validation",
    color:
      "tagged-sdr-to-bt709-limited;pq-hlg-zscale-hable;h264-hevc-absent-range-limited;unknown-required-tags-refused",
    geometry:
      "post-orientation-dar-fit-coded-canvas-and-output;even;sar1;no-upscale",
    reader:
      "1024-requests;2-concurrent;15s-idle;min(2*source+16MiB,16GiB+16MiB)",
  };
  return `${kind}-v1-${createHash("sha256").update(JSON.stringify(policy)).digest("hex").slice(0, 24)}`;
}
