import { describe, expect, it, vi } from "vitest";
import { getUploadSession } from "../uploadsHelpers";
import { makeUploadSurfaceDetail } from "@/upload/uploadSessionController/__tests__/uploadSurfaceFixtures";
import { getWholeUploadSession } from "./getWholeUploadSession";

describe("getWholeUploadSession", () => {
  it.each([undefined, ["failed", "refused"] as const])(
    "reads every page with stable deduplication (%s)",
    async (states) => {
      const manifest = makeUploadSurfaceDetail();
      const api = {
        getUploadSession: vi
          .fn<typeof getUploadSession>()
          .mockResolvedValueOnce({
            ...manifest,
            files: manifest.files.slice(0, 100),
            nextCursor: "page-two",
          })
          .mockResolvedValueOnce({
            ...manifest,
            files: manifest.files.slice(99, 200),
            nextCursor: "page-three",
          })
          .mockResolvedValueOnce({
            ...manifest,
            files: manifest.files.slice(200).toReversed(),
            nextCursor: null,
          }),
      };
      const detail = await getWholeUploadSession({
        sessionId: manifest.sessionId,
        states,
        read: api.getUploadSession,
      });
      expect(detail.files).toHaveLength(264);
      expect(
        new Set(
          detail.files.map((file) => {
            return file.fileId;
          }),
        ).size,
      ).toBe(264);
      expect(
        detail.files.map((file) => {
          return file.position;
        }),
      ).toEqual(
        Array.from({ length: 264 }, (_, position) => {
          return position;
        }),
      );
      expect(detail.nextCursor).toBeNull();
      expect(
        api.getUploadSession.mock.calls.map(([options]) => {
          return options.cursor;
        }),
      ).toEqual([undefined, "page-two", "page-three"]);
      expect(
        api.getUploadSession.mock.calls.every(([options]) => {
          return options.limit === 500;
        }),
      ).toBe(true);
      if (states) {
        expect(
          api.getUploadSession.mock.calls.every(([options]) => {
            return options.states?.join(",") === "failed,refused";
          }),
        ).toBe(true);
      }
    },
  );

  it("rejects a repeated cursor instead of looping", async () => {
    const read = vi
      .fn<typeof getUploadSession>()
      .mockResolvedValue(makeUploadSurfaceDetail({ nextCursor: "loop" }));
    await expect(
      getWholeUploadSession({ sessionId: "session", read }),
    ).rejects.toThrow(/cursor/iu);
    expect(read).toHaveBeenCalledTimes(2);
  });

  it("rejects a later page failure without publishing incomplete data", async () => {
    const displayed = makeUploadSurfaceDetail();
    const read = vi
      .fn<typeof getUploadSession>()
      .mockResolvedValueOnce({
        ...displayed,
        files: displayed.files.slice(0, 100),
        nextCursor: "later",
      })
      .mockRejectedValueOnce(new Error("offline"));
    await expect(
      getWholeUploadSession({ sessionId: displayed.sessionId, read }),
    ).rejects.toThrow("offline");
    expect(displayed.files).toHaveLength(264);
  });
});
