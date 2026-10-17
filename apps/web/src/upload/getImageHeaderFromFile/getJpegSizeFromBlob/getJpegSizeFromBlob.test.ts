import { expect, it, vi } from "vitest";
import { getJpegSizeFromBlob } from "./getJpegSizeFromBlob";

/** One baseline, three-component 640 by 480 JPEG frame header. */
const FRAME = [
  0xff, 0xc0, 0, 17, 8, 1, 224, 2, 128, 3, 1, 0x22, 0, 2, 0x11, 1, 3, 0x11, 1,
];

it("skips frame-like bytes inside application metadata", async () => {
  const falseFrame = FRAME.map((value, index) => {
    return index === 7 ? 1 : value;
  });
  const bytes = [
    0xff,
    0xd8,
    0xff,
    0xe2,
    0,
    21,
    ...falseFrame,
    ...FRAME,
    0xff,
    0xd9,
  ];
  expect(await getJpegSizeFromBlob(new Blob([new Uint8Array(bytes)]))).toEqual({
    width: 640,
    height: 480,
  });
});

it.each([0xda, 0xd9])(
  "never searches scan data or bytes beyond end marker %i",
  async (marker) => {
    const bytes = [0xff, 0xd8, 0xff, marker, ...FRAME];
    expect(
      await getJpegSizeFromBlob(new Blob([new Uint8Array(bytes)])),
    ).toBeUndefined();
  },
);

it.each([0, 1, 65535])(
  "rejects impossible segment length %i",
  async (length) => {
    const bytes = [0xff, 0xd8, 0xff, 0xe2, length >> 8, length & 255, ...FRAME];
    expect(
      await getJpegSizeFromBlob(new Blob([new Uint8Array(bytes)])),
    ).toBeUndefined();
  },
);

it("accepts fill bytes and standalone TEM before a frame", async () => {
  const bytes = [0xff, 0xd8, 0xff, 0xff, 1, ...FRAME, 0xff, 0xd9];
  expect(await getJpegSizeFromBlob(new Blob([new Uint8Array(bytes)]))).toEqual({
    width: 640,
    height: 480,
  });
});

it("bounds header reads for excessive marker chains", async () => {
  const segments = Array.from({ length: 1000 }, () => {
    return [0xff, 0xe2, 0, 2];
  }).flat();
  const file = new Blob([new Uint8Array([0xff, 0xd8, ...segments, ...FRAME])]);
  const reads = vi.spyOn(file, "slice");
  expect(await getJpegSizeFromBlob(file)).toBeUndefined();
  expect(reads.mock.calls.length).toBeLessThan(300);
  expect(
    reads.mock.calls.reduce((total, [start = 0, end = file.size]) => {
      return total + end - start;
    }, 0),
  ).toBeLessThan(4096);
});
