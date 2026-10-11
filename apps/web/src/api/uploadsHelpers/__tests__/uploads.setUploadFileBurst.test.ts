import { afterEach, expect, it, vi } from "vitest";
import * as uploads from "@/api/uploadsHelpers/uploadsHelpers";
import {
  FILE_DTO,
  FILE_ID,
  SESSION_DETAIL,
  SESSION_ID,
  onlyCall,
  respondWith,
} from "./uploadsTestHelpers";

afterEach(() => {
  vi.unstubAllGlobals();
});

it.each([true, false])(
  "saves a photo's burst exclusion as %s and reads its refreshed session",
  async (excluded) => {
    const burst = { groupId: "burst-one", photoCount: 3, isExcluded: excluded };
    respondWith({
      body: { ...SESSION_DETAIL, files: [{ ...FILE_DTO, burst }] },
      status: 200,
    });

    const detail = await uploads.setUploadFileBurst({
      sessionId: `${SESSION_ID}/extra`,
      fileId: `${FILE_ID}/photo`,
      excluded,
    });

    const { url, init } = onlyCall();
    expect(url).toBe(
      `/api/upload-sessions/${SESSION_ID}%2Fextra/files/${FILE_ID}%2Fphoto/burst`,
    );
    expect(init.method).toBe("PATCH");
    expect(JSON.parse(String(init.body))).toEqual({ excluded });
    expect(detail.files[0]?.burst).toEqual(burst);
  },
);
