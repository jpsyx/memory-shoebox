/** Validated input metadata; unknown fields must fail admission. */
export type MediaProbe = {
  kind: "photo" | "video";
  width: number;
  height: number;
  frameRate: number | undefined;
  bitDepth: number;
  durationMs: number | undefined;
  hasAudio: boolean;
  transfer: "sdr" | "pq" | "hlg" | "unsupported";
  rotationDegrees: number;
  primaryImageCount: number;
};

/** Automatic work requires every runtime prerequisite. */
export type MediaRuntimeCapabilities = {
  available: boolean;
  reason: string | undefined;
};

/** One bounded command inside an existing job context. */
export type MediaChildOptions = {
  executable: string;
  args: readonly string[];
  signal: AbortSignal;
  timeoutMs: number;
  stdoutLimitBytes: number;
};
