/** Validated input metadata; unknown fields must fail admission. */
export type MediaProbe = {
  kind: "photo" | "video";
  width: number;
  height: number;
  frameRate: number | null;
  bitDepth: number;
  durationMs: number | null;
  hasAudio: boolean;
  transfer: "sdr" | "pq" | "hlg" | "unsupported";
  rotationDegrees: number;
  primaryImageCount: number;
};

/** Automatic work requires every runtime prerequisite. */
export type MediaRuntimeCapabilities = {
  available: boolean;
  reason: string | null;
};

/** One bounded command inside an existing job context. */
export type MediaChildOptions = {
  executable: string;
  args: readonly string[];
  signal: AbortSignal;
  timeoutMs: number;
  stdoutLimitBytes: number;
};
