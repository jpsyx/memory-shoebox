import type { GetSettingsResponse } from "@memory-shoebox/shared";
import { vi } from "vitest";
/** Delays Settings responses and returns the action that releases the read. */
export function deferSettingsRead(
  canonical: Readonly<GetSettingsResponse>,
): () => void {
  const original = vi.mocked(fetch).getMockImplementation()!;
  let finish = () => {};
  const freshRead = new Promise<void>((settle) => {
    finish = settle;
  });
  vi.mocked(fetch).mockImplementation(async (path, init) => {
    if (path === "/api/settings" && init?.method !== "PATCH") {
      await freshRead;
      return Response.json(canonical);
    }
    return original(path, init);
  });
  return finish;
}
