import { describe, expect, it } from "vitest";
import {
  makeAtomBytes,
  makeLargeAtomBytes,
  makeMvhdAtomBytes,
  makeTkhdAtomBytes,
} from "@/testing/mediaBytes";
import {
  getDisplaySizeFromTkhdBody,
  getMovieTimesFromMvhdBody,
  getQuickTimeHeaderFromBlob,
} from "@/upload/getQuickTimeHeaderFromBlob/getQuickTimeHeaderFromBlob";

const CREATED_AT = new Date("2026-09-14T06:41:32.000Z");

/** "qt  " and a zero minor version. */
const FTYP = makeAtomBytes("ftyp", [0x71, 0x74, 0x20, 0x20, 0, 0, 0, 0]);
const MDAT = makeAtomBytes("mdat", new Array<number>(4096).fill(7));

/** A nine-second header, the way a phone writes one. */
const MVHD = makeMvhdAtomBytes({
  version: 0,
  createdAt: CREATED_AT,
  timescale: 600,
  duration: 600 * 9,
});

/** A portrait phone video's track: landscape pixels, turned a quarter. */
const PORTRAIT_TRAK = makeAtomBytes(
  "trak",
  makeTkhdAtomBytes({ version: 0, width: 1920, height: 1080, quarterTurns: 1 }),
);

/** A movie made of these atoms, in this order. */
function _movieBlob(atoms: readonly number[][]): Blob {
  return new Blob([new Uint8Array(atoms.flat())]);
}

/** An atom's body: everything after its 8-byte header. */
function _bodyOf(atom: readonly number[]): Uint8Array {
  return new Uint8Array(atom.slice(8));
}

describe("getMovieTimesFromMvhdBody", () => {
  it("reads a version 0 header's 32-bit times", () => {
    const atom = makeMvhdAtomBytes({
      version: 0,
      createdAt: CREATED_AT,
      timescale: 600,
      duration: 600 * 42,
    });

    expect(getMovieTimesFromMvhdBody(_bodyOf(atom))).toEqual({
      creationTime: "2026-09-14T06:41:32.000Z",
      durationMs: 42_000,
    });
  });

  it("reads a version 1 header's 64-bit times", () => {
    const atom = makeMvhdAtomBytes({
      version: 1,
      createdAt: CREATED_AT,
      timescale: 1000,
      duration: 1500,
    });

    expect(getMovieTimesFromMvhdBody(_bodyOf(atom))).toEqual({
      creationTime: "2026-09-14T06:41:32.000Z",
      durationMs: 1500,
    });
  });

  it("reports a zero creation time as the 1904 epoch, for the server to refuse", () => {
    const atom = makeMvhdAtomBytes({
      version: 0,
      createdAt: new Date("1904-01-01T00:00:00.000Z"),
      timescale: 600,
      duration: 600,
    });

    expect(getMovieTimesFromMvhdBody(_bodyOf(atom))?.creationTime).toBe(
      "1904-01-01T00:00:00.000Z",
    );
  });

  it("reads the all-ones duration and a zero timescale as unknown", () => {
    const unknown = makeMvhdAtomBytes({
      version: 0,
      createdAt: CREATED_AT,
      timescale: 600,
      duration: 0xffffffff,
    });
    const unscaled = makeMvhdAtomBytes({
      version: 0,
      createdAt: CREATED_AT,
      timescale: 0,
      duration: 100,
    });

    expect(getMovieTimesFromMvhdBody(_bodyOf(unknown))?.durationMs).toBeNull();
    expect(getMovieTimesFromMvhdBody(_bodyOf(unscaled))?.durationMs).toBeNull();
  });

  it("refuses a body too short to be a header", () => {
    expect(getMovieTimesFromMvhdBody(new Uint8Array([0, 0, 0, 0]))).toBeNull();
    expect(
      getMovieTimesFromMvhdBody(
        new Uint8Array([1, ...new Array<number>(20).fill(0)]),
      ),
    ).toBeNull();
  });
});

describe("getDisplaySizeFromTkhdBody", () => {
  it("swaps the box for a quarter turn, as a portrait phone video has", () => {
    const atom = makeTkhdAtomBytes({
      version: 0,
      width: 1920,
      height: 1080,
      quarterTurns: 1,
    });

    expect(getDisplaySizeFromTkhdBody(_bodyOf(atom))).toEqual({
      width: 1080,
      height: 1920,
    });
  });

  it("leaves it for no turn or a half turn, in either version", () => {
    const upright = makeTkhdAtomBytes({
      version: 1,
      width: 3840,
      height: 2160,
      quarterTurns: 0,
    });
    const upsideDown = makeTkhdAtomBytes({
      version: 0,
      width: 1920,
      height: 1080,
      quarterTurns: 2,
    });

    expect(getDisplaySizeFromTkhdBody(_bodyOf(upright))).toEqual({
      width: 3840,
      height: 2160,
    });
    expect(getDisplaySizeFromTkhdBody(_bodyOf(upsideDown))).toEqual({
      width: 1920,
      height: 1080,
    });
  });

  it("answers null for a track with no size, and for a body too short", () => {
    const audio = makeTkhdAtomBytes({
      version: 0,
      width: 0,
      height: 0,
      quarterTurns: 0,
    });

    expect(getDisplaySizeFromTkhdBody(_bodyOf(audio))).toBeNull();
    expect(getDisplaySizeFromTkhdBody(new Uint8Array(40))).toBeNull();
  });
});

describe("getQuickTimeHeaderFromBlob", () => {
  it("finds moov at the end of the file and reads its times and its turned size", async () => {
    const blob = _movieBlob([
      FTYP,
      MDAT,
      makeAtomBytes("moov", [...MVHD, ...PORTRAIT_TRAK]),
    ]);

    await expect(getQuickTimeHeaderFromBlob(blob)).resolves.toEqual({
      creationTime: "2026-09-14T06:41:32.000Z",
      durationMs: 9000,
      width: 1080,
      height: 1920,
    });
  });

  it("steps over a 64-bit mdat, the shape a file over 4 GB has", async () => {
    const blob = _movieBlob([
      FTYP,
      makeLargeAtomBytes("mdat", new Array<number>(1024).fill(1)),
      makeAtomBytes("moov", MVHD),
    ]);

    const header = await getQuickTimeHeaderFromBlob(blob);

    expect(header.creationTime).toBe("2026-09-14T06:41:32.000Z");
  });

  it("skips an audio track to the video track behind it", async () => {
    const audio = makeAtomBytes(
      "trak",
      makeTkhdAtomBytes({ version: 0, width: 0, height: 0, quarterTurns: 0 }),
    );
    const moov = makeAtomBytes("moov", [
      ...makeAtomBytes("udta", new Array<number>(40).fill(0)),
      ...MVHD,
      ...audio,
      ...PORTRAIT_TRAK,
    ]);

    const header = await getQuickTimeHeaderFromBlob(_movieBlob([FTYP, moov]));

    expect([header.width, header.height]).toEqual([1080, 1920]);
    expect(header.durationMs).toBe(9000);
  });

  it("answers nothing for a file with no moov", async () => {
    await expect(
      getQuickTimeHeaderFromBlob(_movieBlob([FTYP, MDAT])),
    ).resolves.toEqual({
      creationTime: null,
      durationMs: null,
      width: null,
      height: null,
    });
  });

  it("answers the size alone for a moov with no mvhd", async () => {
    const header = await getQuickTimeHeaderFromBlob(
      _movieBlob([FTYP, makeAtomBytes("moov", PORTRAIT_TRAK)]),
    );

    expect(header).toEqual({
      creationTime: null,
      durationMs: null,
      width: 1080,
      height: 1920,
    });
  });

  it("stops rather than looping on a size field that cannot be real", async () => {
    const garbage = new Blob([
      new Uint8Array([0, 0, 0, 3, 0x66, 0x72, 0x65, 0x65]),
    ]);

    await expect(getQuickTimeHeaderFromBlob(garbage)).resolves.toEqual({
      creationTime: null,
      durationMs: null,
      width: null,
      height: null,
    });
  });
});
