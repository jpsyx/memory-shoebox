import { appConfig } from "../../../../../app.config.ts";
import { getMediaInputArguments } from "../runtime/probeMedia.helpers.ts";
import type { MediaProbe } from "../runtime/mediaRuntime.types.ts";

function _getFilters(probe: Readonly<MediaProbe>): string {
  const portrait = [90, 270].includes(probe.rotationDegrees)
    ? probe.width > probe.height
    : probe.height > probe.width;
  const limits = appConfig.mediaProcessing.playback;
  const width = portrait ? limits.shortEdge : limits.longEdge;
  const height = portrait ? limits.longEdge : limits.shortEdge;
  const hdr =
    probe.transfer === "sdr"
      ? []
      : [
          // Read actual input primaries/matrix; missing color metadata fails closed.
          `zscale=tin=${probe.transfer === "pq" ? "smpte2084" : "arib-std-b67"}:t=linear:p=bt2020:m=gbr:npl=100`,
          "format=gbrpf32le",
          "tonemap=tonemap=hable:desat=2",
          "zscale=p=bt709:t=bt709:m=bt709:r=limited",
        ];
  return [
    `scale=w='min(${width},iw)':h='min(${height},ih)':force_original_aspect_ratio=decrease:force_divisible_by=2`,
    "setsar=1",
    ...hdr,
    "format=yuv420p",
    "setparams=range=limited:color_primaries=bt709:color_trc=bt709:colorspace=bt709",
    `fps=${Math.min(probe.frameRate!, limits.frameRate)}`,
  ]
    .filter(Boolean)
    .join(",");
}

const LIMITS = appConfig.mediaProcessing.playback;
const ENCODING_ARGUMENTS = [
  "-c:v",
  "libx264",
  "-profile:v",
  "main",
  "-level:v",
  "3.1",
  "-preset",
  "medium",
  "-crf",
  "23",
  "-maxrate",
  String(LIMITS.videoBitsPerSecond),
  "-bufsize",
  String(LIMITS.videoBitsPerSecond * 2),
  "-sc_threshold",
  "0",
  "-threads",
  "1",
  "-pix_fmt",
  "yuv420p",
  "-color_primaries",
  "bt709",
  "-color_trc",
  "bt709",
  "-colorspace",
  "bt709",
  "-color_range",
  "tv",
  "-c:a",
  "aac",
  "-b:a",
  String(LIMITS.audioBitsPerSecond),
  "-ac",
  "2",
  "-ar",
  "48000",
  "-metadata:s:v:0",
  "rotate=0",
  "-movflags",
  "+faststart",
  "-f",
  "mp4",
];
const PREFIX = [
  "-v",
  "error",
  "-xerror",
  "-nostdin",
  "-n",
  "-filter_threads",
  "1",
  "-filter_complex_threads",
  "1",
];
const MAPPING = [
  "-map",
  "0:v:0",
  "-map",
  "0:a:0?",
  "-map_metadata",
  "-1",
  "-map_chapters",
  "-1",
];

function _getTimingArguments(probe: Readonly<MediaProbe>): string[] {
  const keyframeFrames = Math.max(
    1,
    Math.round(
      Math.min(probe.frameRate!, LIMITS.frameRate) * LIMITS.keyframeSeconds,
    ),
  );
  return [
    "-t",
    String(probe.durationMs! / 1000),
    "-g",
    String(keyframeFrames),
    "-force_key_frames",
    `expr:gte(t,n_forced*${LIMITS.keyframeSeconds})`,
  ];
}

/** The Main/3.1 playback recipe, retaining forced input/protocol restrictions. */
export function makeVideoArgumentsFromProbe(
  options: Readonly<{
    probe: MediaProbe;
    inputUrl: string;
    outputPath: string;
  }>,
): string[] {
  const { probe, inputUrl, outputPath } = options;
  if (
    probe.kind !== "video" ||
    probe.transfer === "unsupported" ||
    probe.frameRate === null
  ) {
    throw new Error("processing_input_invalid");
  }
  // FFmpeg applies the input display transform once and clears its matrix.
  return [
    ...PREFIX,
    ...getMediaInputArguments({ format: "mov", input: inputUrl }),
    "-i",
    inputUrl,
    ...MAPPING,
    "-vf",
    _getFilters(probe),
    ..._getTimingArguments(probe),
    ...ENCODING_ARGUMENTS,
    outputPath,
  ];
}
