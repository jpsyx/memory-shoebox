import { describe, expect, it } from "vitest";
import sharp from "sharp";
import { areVisualFingerprintsMatching } from "@memory-shoebox/shared";
import { makeVisualFingerprintFromImage } from "../../src/photos/makeVisualFingerprintFromImage.ts";

function _makePhoto(): Buffer {
  const circles = Array.from({ length: 25 }, (_, index) => {
    return `<circle cx="${(index * 71) % 380}" cy="${(index * 43) % 280}" r="${12 + index}" fill="rgb(${index * 9},${230 - index * 6},${index * 5})"/>`;
  }).join("");
  return Buffer.from(
    `<svg width="400" height="300"><rect width="400" height="300" fill="#742339"/>${circles}</svg>`,
  );
}

describe("decoding photo fingerprints", () => {
  it("distinguishes a nearby frame with a small subject movement", async () => {
    const fingerprints = await Promise.all(
      [0, 2].map(async (shift) => {
        const bytes = await sharp(
          Buffer.from(
            `<svg width="400" height="300"><rect width="400" height="300" fill="#284954"/><rect width="400" height="80" fill="#ddeef6"/><circle cx="${200 + shift}" cy="150" r="55" fill="#d7a78b"/><circle cx="${180 + shift}" cy="130" r="8" fill="#1d231a"/><circle cx="${220 + shift}" cy="130" r="8" fill="#1d231a"/><path d="M160 230L240 230L200 170Z" fill="#ca2679"/></svg>`,
          ),
        )
          .jpeg()
          .toBuffer();
        return makeVisualFingerprintFromImage(bytes);
      }),
    );
    expect(
      areVisualFingerprintsMatching({
        first: fingerprints[0]!,
        second: fingerprints[1]!,
      }),
    ).toBe(false);
  });
  it("matches resized JPEG exports after applying EXIF orientation", async () => {
    const original = await sharp(_makePhoto())
      .jpeg({ quality: 95 })
      .withMetadata({ orientation: 6 })
      .toBuffer();
    const exported = await sharp(original)
      .autoOrient()
      .resize(150)
      .jpeg({ quality: 75 })
      .toBuffer();
    const before = Buffer.from(original);
    const first = await makeVisualFingerprintFromImage(original);
    const second = await makeVisualFingerprintFromImage(exported);
    expect(first).toEqual(expect.any(String));
    expect(
      areVisualFingerprintsMatching({ first: first!, second: second! }),
    ).toBe(true);
    expect(original).toEqual(before);
  });

  it("leaves featureless images and unreadable files without visual identity", async () => {
    const blank = await sharp({
      create: { width: 100, height: 100, channels: 3, background: "white" },
    })
      .png()
      .toBuffer();
    expect(await makeVisualFingerprintFromImage(blank)).toBeUndefined();
    await expect(
      makeVisualFingerprintFromImage(Buffer.from("invalid")),
    ).rejects.toThrow();
  });
});
