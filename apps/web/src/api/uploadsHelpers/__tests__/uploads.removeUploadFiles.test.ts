import { afterEach, expect, it, vi } from "vitest";
import * as uploads from "@/api/uploadsHelpers/uploadsHelpers";
import {
  FILE_ID,
  SESSION_ID,
  onlyCall,
  respondWith,
} from "./uploadsTestHelpers";

afterEach(() => {
  vi.unstubAllGlobals();
});

it("removes selected draft files with a JSON DELETE and accepts its empty response", async () => {
  respondWith({ body: undefined, status: 204 });

  const result = await uploads.removeUploadFiles({
    sessionId: `${SESSION_ID}/extra`,
    fileIds: [FILE_ID],
  });

  expect(result).toBeUndefined();
  const { url, init } = onlyCall();
  expect(url).toBe(`/api/upload-sessions/${SESSION_ID}%2Fextra/files`);
  expect(init.method).toBe("DELETE");
  expect(init.body).toBe(JSON.stringify({ fileIds: [FILE_ID] }));
  expect(new Headers(init.headers).get("content-type")).toBe(
    "application/json",
  );
});
