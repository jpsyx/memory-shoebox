import { crc32, deflateSync } from "node:zlib";
import sharp from "sharp";
import { expect, it } from "vitest";
import { makeAvatarImageFromBytes } from "../../src/avatars/makeAvatarImageFromBytes.ts";

const crop = { centerX: 0.5, centerY: 0.5, zoom: 1 };
async function pixels(format: "png" | "jpeg" | "webp" = "png") {
  return sharp({
    create: { width: 20, height: 10, channels: 3, background: "red" },
  })
    [format]()
    .withMetadata({ orientation: 6 })
    .toBuffer();
}
it.each(["png", "jpeg", "webp"] as const)(
  "decodes still %s and removes metadata",
  async (format) => {
    const bytes = await pixels(format);
    const output = await makeAvatarImageFromBytes({
      bytes,
      contentType: `image/${format}`,
      crop,
    });
    const metadata = await sharp(output).metadata();
    expect(metadata).toMatchObject({ format: "webp", width: 256, height: 256 });
    expect(metadata.exif).toBeUndefined();
    expect(metadata.icc).toBeUndefined();
  },
);
it("orients before selecting and clamping the square", async () => {
  const red = await sharp({
    create: { width: 10, height: 10, channels: 3, background: "red" },
  })
    .png()
    .toBuffer();
  const bytes = await sharp({
    create: { width: 20, height: 10, channels: 3, background: "blue" },
  })
    .composite([{ input: red, left: 0, top: 0 }])
    .withMetadata({ orientation: 6 })
    .png()
    .toBuffer();
  const output = await makeAvatarImageFromBytes({
    bytes,
    contentType: "image/png",
    crop: { centerX: 1, centerY: 0, zoom: 1 },
  });
  const { data } = await sharp(output)
    .raw()
    .toBuffer({ resolveWithObject: true });
  expect(data[0]).toBeGreaterThan(240);
  expect(data[2]).toBeLessThan(15);
});
it.each([
  [Buffer.from("broken"), "image/png"],
  [
    Buffer.from(
      '<svg width="10" height="10"><rect width="10" height="10"/></svg>',
    ),
    "image/svg+xml",
  ],
  [Buffer.from("\0\0\0\x18ftypheic"), "image/heic"],
])("rejects corrupt and unsupported bytes", async (bytes, contentType) => {
  await expect(
    makeAvatarImageFromBytes({ bytes, contentType, crop }),
  ).rejects.toMatchObject({ statusCode: 400 });
});
it("rejects an actual format inconsistent with declared MIME", async () => {
  await expect(
    makeAvatarImageFromBytes({
      bytes: await pixels(),
      contentType: "image/jpeg",
      crop,
    }),
  ).rejects.toMatchObject({ statusCode: 400 });
});
it("rejects animation based on decoded pages", async () => {
  const bytes = await sharp(
    Buffer.from([255, 0, 0, 255, 0, 0, 0, 0, 255, 0, 0, 255]),
    { raw: { width: 2, height: 2, channels: 3, pageHeight: 1 } },
  )
    .webp({ loop: 0, delay: [100, 100] })
    .toBuffer();
  expect((await sharp(bytes).metadata()).pages).toBe(2);
  await expect(
    makeAvatarImageFromBytes({ bytes, contentType: "image/webp", crop }),
  ).rejects.toMatchObject({ statusCode: 400 });
});
it.each([
  { ...crop, zoom: NaN },
  { ...crop, zoom: 9 },
  { ...crop, centerX: Infinity },
  { ...crop, centerY: -1 },
])("validates crop before decoding", async (invalidCrop) => {
  await expect(
    makeAvatarImageFromBytes({
      bytes: await pixels(),
      contentType: "image/png",
      crop: invalidCrop,
    }),
  ).rejects.toMatchObject({ statusCode: 400 });
});
it("rejects more than 10 MiB independently of transport", async () => {
  await expect(
    makeAvatarImageFromBytes({
      bytes: Buffer.alloc(10485761),
      contentType: "image/png",
      crop,
    }),
  ).rejects.toMatchObject({ statusCode: 413 });
});
it("accepts 50MP and rejects the next row before raster allocation", async () => {
  const accepted = await sharp({
    create: { width: 10000, height: 5000, channels: 3, background: "red" },
  })
    .png()
    .toBuffer();
  const rejected = await sharp({
    create: { width: 10000, height: 5001, channels: 3, background: "red" },
  })
    .png()
    .toBuffer();
  expect(
    await sharp(
      await makeAvatarImageFromBytes({
        bytes: accepted,
        contentType: "image/png",
        crop,
      }),
    ).metadata(),
  ).toMatchObject({ width: 256, height: 256 });
  await expect(
    makeAvatarImageFromBytes({
      bytes: rejected,
      contentType: "image/png",
      crop,
    }),
  ).rejects.toMatchObject({ statusCode: 400 });
});

function pngChunk(type: string, data: Buffer): Buffer {
  const chunk = Buffer.alloc(data.length + 12);
  chunk.writeUInt32BE(data.length, 0);
  chunk.write(type, 4);
  data.copy(chunk, 8);
  chunk.writeUInt32BE(crc32(chunk.subarray(4, -4)), chunk.length - 4);
  return chunk;
}

function animatedPng(): Buffer {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(1, 0);
  header.writeUInt32BE(1, 4);
  header[8] = 8;
  header[9] = 2;
  const animation = Buffer.alloc(8);
  animation.writeUInt32BE(2, 0);
  const frame = (sequence: number) => {
    const bytes = Buffer.alloc(26);
    bytes.writeUInt32BE(sequence, 0);
    bytes.writeUInt32BE(1, 4);
    bytes.writeUInt32BE(1, 8);
    bytes.writeUInt16BE(1, 20);
    bytes.writeUInt16BE(10, 22);
    return bytes;
  };
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    pngChunk("IHDR", header),
    pngChunk("acTL", animation),
    pngChunk("fcTL", frame(0)),
    pngChunk("IDAT", deflateSync(Buffer.from([0, 255, 0, 0]))),
    pngChunk("fcTL", frame(1)),
    pngChunk(
      "fdAT",
      Buffer.concat([
        Buffer.from([0, 0, 0, 2]),
        deflateSync(Buffer.from([0, 0, 0, 255])),
      ]),
    ),
    pngChunk("IEND", Buffer.alloc(0)),
  ]);
}

it("rejects APNG even when the PNG decoder exposes only its first page", async () => {
  const bytes = animatedPng();
  expect(await sharp(bytes).metadata()).toMatchObject({
    format: "png",
    width: 1,
    height: 1,
  });
  await expect(
    makeAvatarImageFromBytes({ bytes, contentType: "image/png", crop }),
  ).rejects.toMatchObject({ statusCode: 400 });
});

it("accepts the exact 10 MiB input boundary", async () => {
  const bytes = Buffer.alloc(10485760);
  (await pixels()).copy(bytes);
  expect(
    await sharp(
      await makeAvatarImageFromBytes({ bytes, contentType: "image/png", crop }),
    ).metadata(),
  ).toMatchObject({ width: 256, height: 256 });
});

it("does not confuse text inside a PNG chunk with animation structure", async () => {
  const png = await pixels();
  const bytes = Buffer.concat([
    png.subarray(0, 33),
    pngChunk("tEXt", Buffer.from("Comment\0acTL")),
    png.subarray(33),
  ]);
  expect(
    await sharp(
      await makeAvatarImageFromBytes({ bytes, contentType: "image/png", crop }),
    ).metadata(),
  ).toMatchObject({ width: 256, height: 256 });
});

it.each(["truncated", "forged-length"])(
  "rejects %s PNG chunks without out-of-bounds reads",
  async (failure) => {
    const png = await pixels();
    const bytes =
      failure === "truncated" ? png.subarray(0, -9) : Buffer.from(png);
    if (failure === "forged-length") {
      bytes.writeUInt32BE(0xffffffff, 33);
    }
    await expect(
      makeAvatarImageFromBytes({ bytes, contentType: "image/png", crop }),
    ).rejects.toMatchObject({ statusCode: 400 });
  },
);

it("extracts the shared floored square for odd dimensions and fractional zoom", async () => {
  const square = await sharp({
    create: { width: 33, height: 33, channels: 3, background: "red" },
  })
    .png()
    .toBuffer();
  const bytes = await sharp({
    create: { width: 101, height: 57, channels: 3, background: "blue" },
  })
    .composite([{ input: square, left: 55, top: 4 }])
    .png()
    .toBuffer();
  const output = await makeAvatarImageFromBytes({
    bytes,
    contentType: "image/png",
    crop: { centerX: 0.71, centerY: 0.36, zoom: 1.7 },
  });
  const { data } = await sharp(output)
    .raw()
    .toBuffer({ resolveWithObject: true });
  expect(data[0]).toBeGreaterThan(240);
  expect(data[2]).toBeLessThan(15);
  expect(data.at(-3)).toBeGreaterThan(240);
  expect(data.at(-1)).toBeLessThan(15);
});

async function webpParityFixture(orientation: number): Promise<Buffer> {
  const width = 2501;
  const height = 1703;
  const imagePixels = Buffer.alloc(width * height * 4);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const offset = (y * width + x) * 4;
      imagePixels[offset] = Math.floor(x / 10) % 256;
      imagePixels[offset + 1] = Math.floor(y / 7) % 256;
      imagePixels[offset + 2] = ((x + y) >> 4) % 256;
      imagePixels[offset + 3] = 128 + ((x >> 5) % 128);
    }
  }
  return sharp(imagePixels, {
    raw: { width, height, channels: 4 },
  })
    .withMetadata({ orientation })
    .webp()
    .toBuffer();
}

it.each([
  ...[2, 3, 4].map((orientation) => {
    return {
      orientation,
      crop: { centerX: 0.71, centerY: 0.36, zoom: 1.7 },
      square: { left: 1275, top: 112, width: 1001, height: 1001 },
    };
  }),
  ...[5, 7, 8].map((orientation) => {
    return {
      orientation,
      crop: { centerX: 0.71, centerY: 0.36, zoom: 1.7 },
      square: { left: 702, top: 399, width: 1001, height: 1001 },
    };
  }),
  {
    orientation: 1,
    crop: { centerX: 0.71, centerY: 0.36, zoom: 1.7 },
    square: { left: 1275, top: 112, width: 1001, height: 1001 },
  },
  {
    orientation: 6,
    crop: { centerX: 0.71, centerY: 0.36, zoom: 1.7 },
    square: { left: 702, top: 399, width: 1001, height: 1001 },
  },
  {
    orientation: 1,
    crop: { centerX: 0.95, centerY: 0.1, zoom: 8 },
    square: { left: 2269, top: 64, width: 212, height: 212 },
  },
])(
  "preserves full-resolution WebP crop edges through reduced decode: $orientation/$crop.zoom",
  async ({ orientation, crop: chosenCrop, square }) => {
    const bytes = await webpParityFixture(orientation);
    const expected = await sharp(
      await sharp(bytes)
        .autoOrient()
        .extract(square)
        .resize(256, 256)
        .webp()
        .toBuffer(),
    )
      .ensureAlpha()
      .raw()
      .toBuffer();
    const output = await makeAvatarImageFromBytes({
      bytes,
      contentType: "image/webp",
      crop: chosenCrop,
    });
    const actual = await sharp(output).ensureAlpha().raw().toBuffer();
    expect(actual.length).toBe(expected.length);
    const error =
      actual.reduce((sum, value, index) => {
        return sum + Math.abs(value - expected[index]!);
      }, 0) / actual.length;
    expect(error).toBeLessThan(8);
    expect(await sharp(output).metadata()).toMatchObject({
      width: 256,
      height: 256,
    });
  },
);

it("preserves translucent WebP colors across the bounded raw-image stages", async () => {
  const bytes = await sharp({
    create: {
      width: 2501,
      height: 1703,
      channels: 4,
      background: { r: 30, g: 70, b: 110, alpha: 0.25 },
    },
  })
    .webp()
    .toBuffer();
  const output = await makeAvatarImageFromBytes({
    bytes,
    contentType: "image/webp",
    crop,
  });
  const imagePixels = await sharp(output).ensureAlpha().raw().toBuffer();
  expect(Math.abs(imagePixels[0]! - 30)).toBeLessThan(8);
  expect(Math.abs(imagePixels[1]! - 70)).toBeLessThan(8);
  expect(Math.abs(imagePixels[2]! - 110)).toBeLessThan(8);
  expect(Math.abs(imagePixels[3]! - 64)).toBeLessThan(2);
});
