import { readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { isAbsolute, join } from "node:path";
import { expect, it, vi } from "vitest";
import { getSeedArchiveArgumentsFromArgv } from "../scripts/seedArchive.ts";

it.each(["burst_008.jpg", "the-walk-poster.jpg"])(
  "reads committed %s from the default media directory outside the repository cwd",
  (file) => {
    const currentDirectoryRead = vi
      .spyOn(process, "cwd")
      .mockReturnValue(tmpdir());
    try {
      const argumentsFromArgv = getSeedArchiveArgumentsFromArgv([
        "--as",
        "admin@example.com",
      ]);
      expect(argumentsFromArgv).toBeDefined();
      const mediaDirectory = argumentsFromArgv!.mediaDirectory;
      expect(isAbsolute(mediaDirectory)).toBe(true);
      const artwork = readFileSync(join(mediaDirectory, file));
      expect(artwork.byteLength).toBeGreaterThan(100);
      expect([...artwork.subarray(0, 3)]).toEqual([255, 216, 255]);
    } finally {
      currentDirectoryRead.mockRestore();
    }
  },
);

it("keeps an explicit media directory ahead of the default", () => {
  expect(
    getSeedArchiveArgumentsFromArgv([
      "--media-dir",
      "./custom-media",
      "--as",
      "admin@example.com",
      "--no-objects",
    ]),
  ).toEqual({
    email: "admin@example.com",
    withObjects: false,
    mediaDirectory: "./custom-media",
  });
});
