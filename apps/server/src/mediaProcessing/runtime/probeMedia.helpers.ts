import { isAbsolute } from "node:path";
import { z } from "zod";
import { appConfig } from "../../../../../app.config.ts";
import type { MediaProbe } from "./mediaRuntime.types.ts";

const STREAM = z.object({
  codec_type: z.string(),
  codec_name: z.string().optional(),
  width: z.number().int().positive().optional(),
  height: z.number().int().positive().optional(),
  avg_frame_rate: z.string().optional(),
  r_frame_rate: z.string().optional(),
  pix_fmt: z.string().optional(),
  bits_per_raw_sample: z.string().optional(),
  duration: z.string().optional(),
  color_transfer: z.string().optional(),
  nb_read_packets: z.string().optional(),
  side_data_list: z
    .array(z.object({ rotation: z.number().optional() }))
    .optional(),
});
const METADATA = z.object({
  streams: z.array(STREAM).max(16),
  format: z.object({ duration: z.string().optional() }).optional(),
});
const STILL_FIELDS = {
  kind: "photo",
  frameRate: null,
  durationMs: null,
  hasAudio: false,
  rotationDegrees: 0,
} as const;
const FORMATS = new Set(["mov", "jpeg_pipe", "png_pipe", "webp_pipe"]);

/** Only the credential-free loopback source or an absolute owned file is valid. */
export function getMediaInputArguments(
  options: Readonly<{ format: string; input: string }>,
): string[] {
  if (!FORMATS.has(options.format)) {
    throw new Error("processing_input_invalid");
  }
  const isFile = isAbsolute(options.input);
  if (!isFile) {
    const url = new URL(options.input);
    if (
      url.protocol !== "http:" ||
      url.hostname !== "127.0.0.1" ||
      !url.port ||
      url.username ||
      url.password ||
      url.search ||
      url.hash
    ) {
      throw new Error("processing_input_invalid");
    }
  }
  return [
    "-protocol_whitelist",
    isFile ? "file" : "http,tcp",
    "-format_whitelist",
    options.format,
    "-f",
    options.format,
    ...(options.format === "mov"
      ? ["-enable_drefs", "0", "-use_absolute_path", "0"]
      : []),
    "-threads",
    "1",
  ];
}

function _getRate(value: string | undefined): number {
  const parts = value?.split("/").map(Number);
  return parts?.length === 2 ? parts[0]! / parts[1]! : Number(value);
}

function _getBitDepth(stream: z.infer<typeof STREAM>): number {
  const explicit = Number(stream.bits_per_raw_sample);
  if (explicit > 0) {
    return explicit;
  }
  const pixelFormat = stream.pix_fmt ?? "";
  const deep = /(?:p|gray|rgb|bgr|rgba|bgra)(9|10|12|14|16)(?:le|be)?$/.exec(
    pixelFormat,
  );
  if (deep !== null) {
    return Number(deep[1]);
  }
  return /^(?:yuvj?\d+p|yuva\d+p|rgb24|bgr24|rgba|bgra|argb|abgr|gray|pal8|gbrp)$/.test(
    pixelFormat,
  )
    ? 8
    : 0;
}

function _getTransfer(transfer: string | undefined): MediaProbe["transfer"] {
  if (transfer === "smpte2084") {
    return "pq";
  }
  if (transfer === "arib-std-b67") {
    return "hlg";
  }
  return transfer === undefined ||
    [
      "bt709",
      "iec61966-2-1",
      "smpte170m",
      "bt470bg",
      "gamma22",
      "gamma28",
    ].includes(transfer)
    ? "sdr"
    : "unsupported";
}

/** Parses bounded, schema-checked metadata, rejecting ambiguous still images. */
export function getProbeFromFfprobe(
  options: Readonly<{ stdout: string; kind: "photo" | "video" }>,
): MediaProbe {
  _checkMetadataSize([options.stdout]);
  const parsed = METADATA.safeParse(_parseJson(options.stdout));
  if (!parsed.success) {
    throw new Error("processing_probe_invalid");
  }
  const streams = parsed.data.streams.filter((stream) => {
    return stream.codec_type === "video";
  });
  const stream = streams[0];
  if (
    streams.length !== 1 ||
    stream?.width === undefined ||
    stream.height === undefined ||
    _getBitDepth(stream) === 0
  ) {
    throw new Error("processing_probe_invalid");
  }
  if (
    options.kind === "photo" &&
    (stream.nb_read_packets !== "1" ||
      !["mjpeg", "png", "webp"].includes(stream.codec_name ?? ""))
  ) {
    throw new Error("processing_photo_not_still");
  }
  if (
    options.kind === "video" &&
    !["h264", "hevc"].includes(stream.codec_name ?? "")
  ) {
    throw new Error("processing_format_unsupported");
  }
  return {
    ..._getStreamFields(stream, options.kind, parsed.data),
    kind: options.kind,
    width: stream.width,
    height: stream.height,
    hasAudio: parsed.data.streams.some((candidate) => {
      return candidate.codec_type === "audio";
    }),
    primaryImageCount: 1,
  };
}

function _getStreamFields(
  stream: Readonly<z.infer<typeof STREAM>>,
  kind: MediaProbe["kind"],
  metadata: Readonly<z.infer<typeof METADATA>>,
): Pick<
  MediaProbe,
  "frameRate" | "durationMs" | "bitDepth" | "transfer" | "rotationDegrees"
> {
  const rotation =
    stream.side_data_list?.find((data) => {
      return data.rotation !== undefined;
    })?.rotation ?? 0;
  return {
    frameRate:
      kind === "photo"
        ? null
        : Math.max(
            _getRate(stream.avg_frame_rate),
            _getRate(stream.r_frame_rate),
          ),
    durationMs: kind === "photo" ? null : _getDurationMsFromMetadata(metadata),
    bitDepth: _getBitDepth(stream),
    transfer: _getTransfer(stream.color_transfer),
    rotationDegrees: ((rotation % 360) + 360) % 360,
  };
}

function _getDurationMsFromMetadata(
  metadata: Readonly<z.infer<typeof METADATA>>,
): number | null {
  const relevantStreams = metadata.streams.filter((stream) => {
    return stream.codec_type === "video" || stream.codec_type === "audio";
  });
  const streamDurations = relevantStreams.map((stream) => {
    return stream.duration;
  });
  if (
    metadata.format?.duration === undefined &&
    streamDurations.includes(undefined)
  ) {
    return null;
  }
  const durations = [metadata.format?.duration, ...streamDurations]
    .filter((duration) => {
      return duration !== undefined;
    })
    .map(Number);
  if (
    durations.length === 0 ||
    durations.some((duration) => {
      return !Number.isFinite(duration) || duration <= 0;
    })
  ) {
    return null;
  }
  const durationMs = Math.max(...durations) * 1000;
  return Number.isFinite(durationMs) ? durationMs : null;
}

function _parseJson(value: string): unknown {
  try {
    return JSON.parse(value);
  } catch {
    throw new Error("processing_probe_invalid");
  }
}

/** libheif reports oriented dimensions; recipes must not rotate them again. */
export function getProbeFromHeifInfo(
  options: Readonly<{ stdout: string; boxes: string }>,
): MediaProbe {
  _checkMetadataSize([options.stdout, options.boxes]);
  const images = [
    ...options.stdout.matchAll(/^image: (\d+)x(\d+) \(id=\d+\)(.*)$/gm),
  ];
  if (images.length > 1) {
    throw new Error("processing_photo_not_still");
  }
  const primary = images[0];
  const depths = [
    ...options.boxes.matchAll(/bit_depth_(?:luma|chroma): (\d+)/g),
  ].map((match) => {
    return Number(match[1]);
  });
  const transfers = [
    ...options.boxes.matchAll(/transfer_characteristics: (\d+)/g),
  ].map((match) => {
    return Number(match[1]);
  });
  if (
    primary === undefined ||
    !primary[3]?.includes("primary") ||
    depths.length === 0 ||
    transfers.length === 0
  ) {
    throw new Error("processing_probe_invalid");
  }
  return {
    ...STILL_FIELDS,
    width: Number(primary[1]),
    height: Number(primary[2]),
    bitDepth: Math.max(...depths),
    transfer: transfers.every((value) => {
      return [1, 6, 13, 14, 15].includes(value);
    })
      ? "sdr"
      : "unsupported",
    primaryImageCount: images.length,
  };
}

function _checkMetadataSize(values: readonly string[]): void {
  const bytes = values.reduce((sum, value) => {
    return sum + Buffer.byteLength(value);
  }, 0);
  if (bytes > appConfig.mediaProcessing.probeMetadataBytes) {
    throw new Error("processing_stdout_limit");
  }
}
