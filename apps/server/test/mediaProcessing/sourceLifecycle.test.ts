import { readFile, stat } from "node:fs/promises";
import { expect, it } from "vitest";
import { processMediaSource } from "../../src/mediaProcessing/processMediaSource.ts";
import { makeIsolatedFingerprintFromImage } from "../../src/mediaProcessing/runtime/makeIsolatedFingerprintFromImage.ts";
import { createFakeB2Client } from "../helpers/createFakeB2Client/createFakeB2Client.ts";
import {
  createFixtureReader,
  createVerificationRunner,
  getFixturePath,
} from "./recipeTestHelpers.ts";

it("carries one metered source through probe, admitted photo decode and publication", async () => {
  const runner = await createVerificationRunner();
  const path = getFixturePath("oriented.jpg");
  const bytes = await readFile(path);
  const source = await createFixtureReader(path);
  const b2 = createFakeB2Client();
  b2.presignGet = async () => {
    return source.url;
  };
  let published = false;
  try {
    await processMediaSource({
      runner,
      b2,
      source: { kind: "photo", key: "original", byteSize: bytes.length },
      signal: new AbortController().signal,
      publish: async (outputs) => {
        expect(
          outputs.map((output) => {
            return output.purpose;
          }),
        ).toEqual(
          expect.arrayContaining(["thumb", "display", "display_small"]),
        );
        expect((await readFile(outputs[0]!.path)).length).toBe(
          outputs[0]!.byteSize,
        );
        published = true;
      },
    });
    expect(published).toBe(true);
    await expect(stat(runner.scratchPath)).rejects.toMatchObject({
      code: "ENOENT",
    });
  } finally {
    await runner.dispose();
    await source.close();
  }
});

it("produces a fingerprint for valid pixels and refuses corrupt bytes", async () => {
  const runner = await createVerificationRunner();
  try {
    const fingerprint = await makeIsolatedFingerprintFromImage({
      runner,
      bytes: await readFile(getFixturePath("oriented.jpg")),
      signal: new AbortController().signal,
    });
    expect(fingerprint).toMatch(/^v1:/);
    await expect(
      makeIsolatedFingerprintFromImage({
        runner,
        bytes: Buffer.from("invalid"),
        signal: new AbortController().signal,
      }),
    ).rejects.toThrow();
  } finally {
    await runner.dispose();
  }
});
