import { describe, expect, it } from "vitest";
import { getMediaAdmissionFromProbe } from "../../src/mediaProcessing/runtime/getMediaAdmissionFromProbe.ts";
import type { MediaProbe } from "../../src/mediaProcessing/runtime/mediaRuntime.types.ts";

const PHOTO: MediaProbe = {
  kind: "photo",
  width: 6000,
  height: 4000,
  frameRate: null,
  bitDepth: 8,
  durationMs: null,
  hasAudio: false,
  transfer: "sdr",
  rotationDegrees: 0,
  primaryImageCount: 1,
};
const VIDEO: MediaProbe = {
  ...PHOTO,
  kind: "video",
  width: 3840,
  height: 2160,
  frameRate: 60,
  bitDepth: 10,
  durationMs: 1_800_000,
  hasAudio: true,
};

describe("media admission", () => {
  it.each([
    ["24 megapixels at 64 MiB", {}, 67_108_864, true],
    ["24 megapixels plus one", { width: 24_000_001, height: 1 }, 1024, false],
    ["64 MiB plus one", {}, 67_108_865, false],
    ["missing width", { width: 0 }, 1024, false],
    ["fractional dimensions", { width: 100.5 }, 1024, false],
    ["unknown bit depth", { bitDepth: 0 }, 1024, false],
    ["multiple primary images", { primaryImageCount: 2 }, 1024, false],
    ["missing primary", { primaryImageCount: 0 }, 1024, false],
    ["animated input", { frameRate: 25, durationMs: 1000 }, 1024, false],
    ["invalid rotation", { rotationDegrees: 45 }, 1024, false],
    ["unknown transfer", { transfer: "unsupported" }, 1024, false],
    ["empty source", {}, 0, false],
  ] as const)("handles photo %s", (_label, changes, sourceBytes, admitted) => {
    const result = getMediaAdmissionFromProbe({
      probe: { ...PHOTO, ...changes },
      sourceBytes,
    });
    expect(result.admitted).toBe(admitted);
    expect(result.reason === null).toBe(admitted);
  });

  it.each([
    ["landscape 4K", {}, true],
    ["portrait 4K", { width: 2160, height: 3840 }, true],
    ["larger HEVC", { width: 4096, height: 2160 }, false],
    ["over 60 fps", { frameRate: 60.01 }, false],
    ["missing frame rate", { frameRate: null }, false],
    ["over 10 bits", { bitDepth: 12 }, false],
    ["over 30 minutes", { durationMs: 1_800_001 }, false],
    ["missing duration", { durationMs: null }, false],
    ["invalid duration", { durationMs: Number.NaN }, false],
    ["unsupported HDR", { transfer: "unsupported" }, false],
    ["PQ HDR", { transfer: "pq" }, true],
    ["HLG HDR", { transfer: "hlg" }, true],
  ] as const)("handles video %s", (_label, changes, admitted) => {
    expect(
      getMediaAdmissionFromProbe({
        probe: { ...VIDEO, ...changes },
        sourceBytes: 100_000_000,
      }).admitted,
    ).toBe(admitted);
  });
});

import {
  getProbeFromFfprobe,
  getProbeFromHeifInfo,
  getMediaInputArguments,
} from "../../src/mediaProcessing/runtime/probeMedia.helpers.ts";
const VIDEO_METADATA = {
  streams: [
    {
      codec_type: "video",
      codec_name: "hevc",
      width: 2160,
      height: 3840,
      avg_frame_rate: "60000/1001",
      r_frame_rate: "60000/1001",
      pix_fmt: "yuv420p10le",
      duration: "10",
      color_transfer: "smpte2084",
      side_data_list: [{ rotation: -90 }],
    },
    { codec_type: "audio", codec_name: "aac" },
  ],
  format: { duration: "10" },
};
describe("bounded probe metadata", () => {
  it("extracts actual portrait HEVC and HDR metadata", () => {
    expect(
      getProbeFromFfprobe({
        stdout: JSON.stringify(VIDEO_METADATA),
        kind: "video",
      }),
    ).toEqual({
      kind: "video",
      width: 2160,
      height: 3840,
      frameRate: 60000 / 1001,
      bitDepth: 10,
      durationMs: 10000,
      hasAudio: true,
      transfer: "pq",
      rotationDegrees: 270,
      primaryImageCount: 1,
    });
  });
  it.each([
    "not json",
    "{}",
    JSON.stringify({ streams: [{ codec_type: "video", width: 0 }] }),
  ])("rejects corrupt metadata %s", (stdout) => {
    expect(() => {
      return getProbeFromFfprobe({ stdout, kind: "video" });
    }).toThrow("processing_probe_invalid");
  });
  it("refuses animated or multiple image packets", () => {
    const stdout = JSON.stringify({
      streams: [
        {
          codec_type: "video",
          codec_name: "png",
          width: 10,
          height: 10,
          pix_fmt: "rgba",
          nb_read_packets: "2",
        },
      ],
    });
    expect(() => {
      return getProbeFromFfprobe({ stdout, kind: "photo" });
    }).toThrow("processing_photo_not_still");
  });
  it("reads oriented HEIC primary metadata without decoding", () => {
    const stdout = "image: 32x64 (id=1), primary\n  thumbnail: 8x16\n";
    const boxes =
      "bit_depth_luma: 8\nbit_depth_chroma: 8\ntransfer_characteristics: 13\n";
    expect(getProbeFromHeifInfo({ stdout, boxes })).toMatchObject({
      width: 32,
      height: 64,
      bitDepth: 8,
      rotationDegrees: 0,
      primaryImageCount: 1,
      transfer: "sdr",
    });
  });
  it("rejects incomplete HEIC metadata and multiple primaries", () => {
    expect(() => {
      return getProbeFromHeifInfo({
        stdout: "image: 10x10 (id=1), primary",
        boxes: "",
      });
    }).toThrow("processing_probe_invalid");
    expect(() => {
      return getProbeFromHeifInfo({
        stdout: "image: 10x10 (id=1), primary\nimage: 10x10 (id=2)",
        boxes: "bit_depth_luma: 8\ntransfer_characteristics: 13",
      });
    }).toThrow("processing_photo_not_still");
  });
  it("restricts MOV demuxing and disables external references", () => {
    const args = getMediaInputArguments({
      format: "mov",
      input: "http://127.0.0.1:1234/opaque",
    });
    expect(args).toContain("http,tcp");
    expect(args).toContain("mov");
    expect(
      args.slice(
        args.indexOf("-enable_drefs"),
        args.indexOf("-enable_drefs") + 2,
      ),
    ).toEqual(["-enable_drefs", "0"]);
    expect(() => {
      return getMediaInputArguments({
        format: "mov",
        input: "https://private.invalid/secret",
      });
    }).toThrow("processing_input_invalid");
  });
});
