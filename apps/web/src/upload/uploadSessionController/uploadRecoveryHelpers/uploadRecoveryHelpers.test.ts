import { describe, expect, it, vi } from "vitest";
import { makeUploadFileFromPosition } from "../__tests__/uploadSurfaceFixtures";
import { getResumeMatchesFromFiles } from "./uploadRecoveryHelpers";

const HASH_A = "a".repeat(64);
const HASH_B = "b".repeat(64);
function _pick(clientRef = "pick") {
  return {
    clientRef,
    file: new File([new Uint8Array(1000)], "IMG_0.jpg", { type: "image/jpeg" }),
  };
}

describe("recovery identity", () => {
  it("same filename and size with different hashes never guesses", async () => {
    const matches = await getResumeMatchesFromFiles({
      picks: [_pick()],
      rows: [{ ...makeUploadFileFromPosition(0), contentHash: HASH_A }],
      hashFile: async () => {
        return HASH_B;
      },
      signal: new AbortController().signal,
    });
    expect(matches.knownMatches).toEqual([]);
    expect(matches.unmatchedClientRefs).toEqual(["pick"]);
  });
  it("exact hashes win over ambiguous hashless metadata", async () => {
    const matches = await getResumeMatchesFromFiles({
      picks: [_pick()],
      rows: [
        makeUploadFileFromPosition(0),
        { ...makeUploadFileFromPosition(1), contentHash: HASH_A },
      ],
      hashFile: async () => {
        return HASH_A;
      },
      signal: new AbortController().signal,
    });
    expect(matches.knownMatches).toEqual([
      { fileId: makeUploadFileFromPosition(1).fileId, clientRef: "pick" },
    ]);
    expect(matches.ambiguous).toEqual([]);
  });
  it("metadata needs size and type as well as filename", async () => {
    const matches = await getResumeMatchesFromFiles({
      picks: [_pick()],
      rows: [{ ...makeUploadFileFromPosition(0), declaredBytes: 999 }],
      hashFile: async () => {
        return HASH_A;
      },
      signal: new AbortController().signal,
    });
    expect(matches.unmatchedClientRefs).toEqual(["pick"]);
  });
  it("hashless collisions require an explicit association", async () => {
    const rows = [
      makeUploadFileFromPosition(0),
      { ...makeUploadFileFromPosition(1), originalFilename: "IMG_0.jpg" },
    ];
    const matches = await getResumeMatchesFromFiles({
      picks: [_pick()],
      rows,
      hashFile: async () => {
        return HASH_A;
      },
      signal: new AbortController().signal,
    });
    expect(matches.knownMatches).toEqual([]);
    expect(matches.ambiguous).toEqual([
      {
        fileIds: rows.map((row) => {
          return row.fileId;
        }),
        clientRef: "pick",
      },
    ]);
  });
  it("hashes serially and stops after cancellation", async () => {
    const cancellation = new AbortController();
    const hashFile = vi.fn(async () => {
      cancellation.abort();
      return HASH_A;
    });
    await expect(
      getResumeMatchesFromFiles({
        picks: [_pick("first"), _pick("second")],
        rows: [],
        hashFile,
        signal: cancellation.signal,
      }),
    ).rejects.toThrow();
    expect(hashFile).toHaveBeenCalledTimes(1);
  });
  it("a failed read rejects instead of guessing metadata", async () => {
    await expect(
      getResumeMatchesFromFiles({
        picks: [_pick()],
        rows: [makeUploadFileFromPosition(0)],
        hashFile: async () => {
          throw new Error("read failed");
        },
        signal: new AbortController().signal,
      }),
    ).rejects.toThrow("read failed");
  });
  it("two different hashes competing for one hashless row require a choice", async () => {
    const first = _pick("first");
    const second = _pick("second");
    const matches = await getResumeMatchesFromFiles({
      picks: [first, second],
      rows: [makeUploadFileFromPosition(0)],
      hashFile: async (file) => {
        return file === first.file ? HASH_A : HASH_B;
      },
      signal: new AbortController().signal,
    });
    expect(matches.knownMatches).toEqual([]);
    expect(matches.ambiguous).toHaveLength(2);
  });
  it("exactly identified picks leave a unique hashless candidate unambiguous", async () => {
    const first = _pick("first");
    const second = _pick("second");
    const rows = [
      { ...makeUploadFileFromPosition(0), contentHash: HASH_A },
      { ...makeUploadFileFromPosition(1), originalFilename: "IMG_0.jpg" },
    ];
    const matches = await getResumeMatchesFromFiles({
      picks: [first, second],
      rows,
      hashFile: async (file) => {
        return file === first.file ? HASH_A : HASH_B;
      },
      signal: new AbortController().signal,
    });
    expect(matches.ambiguous).toEqual([]);
    expect(matches.knownMatches).toEqual([
      { fileId: rows[0]!.fileId, clientRef: "first" },
      { fileId: rows[1]!.fileId, clientRef: "second" },
    ]);
  });
  it("matches 1000 hashless rows within a linear manifest-read budget", async () => {
    let manifestHashReads = 0;
    const rows = Array.from({ length: 1000 }, (_, position) => {
      const row = makeUploadFileFromPosition(position);
      Object.defineProperty(row, "contentHash", {
        enumerable: true,
        get: () => {
          manifestHashReads += 1;
          if (manifestHashReads > 4000) {
            throw new Error(
              "Recovery exceeded the linear manifest-read budget.",
            );
          }
          return null;
        },
      });
      return row;
    });
    const picks = rows.map((row, position) => {
      return {
        clientRef: `pick-${position}`,
        file: new File([new Uint8Array(1000)], row.originalFilename, {
          type: "image/jpeg",
        }),
      };
    });
    const matches = await getResumeMatchesFromFiles({
      picks,
      rows,
      hashFile: async () => {
        return HASH_A;
      },
      signal: new AbortController().signal,
    });
    expect(matches.knownMatches).toHaveLength(1000);
    expect(matches.ambiguous).toEqual([]);
    expect(matches.knownMatches[999]).toEqual({
      fileId: "018f0000-0000-7000-8000-0000000003e7",
      clientRef: "pick-999",
    });
    expect(manifestHashReads).toBeLessThanOrEqual(4000);
  });
});
