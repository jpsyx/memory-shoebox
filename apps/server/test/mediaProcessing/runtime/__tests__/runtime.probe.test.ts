import type { MediaProcessRunner } from "../../../../src/mediaProcessing/runtime/createMediaProcessRunner.ts";
import { readdir, stat } from "node:fs/promises";
import { createServer } from "node:http";
import { join } from "node:path";
import { expect, it } from "vitest";
import { probeMedia } from "../../../../src/mediaProcessing/runtime/probeMedia/probeMedia.ts";
import { installRuntimeScratchFixture } from "./runtimeTestHelpers.ts";

const _makeScratch = installRuntimeScratchFixture();

async function _withProbeSource({
  bytes,
  check,
}: {
  bytes: Buffer;
  check: (inputUrl: string, getSent: () => number) => Promise<void>;
}): Promise<void> {
  let sent = 0;
  const server = createServer((request, response) => {
    const match = /^bytes=(\d+)-(\d+)$/.exec(request.headers.range ?? "");
    const start = Number(match?.[1]);
    const end = Math.min(Number(match?.[2]), bytes.length - 1);
    const body = bytes.subarray(start, end + 1);
    sent += body.length;
    response.writeHead(206, {
      "content-range": `bytes ${start}-${end}/${bytes.length}`,
      "content-length": body.length,
    });
    response.end(body);
  });
  await new Promise<void>((resolve) => {
    return server.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address();
  if (address === null || typeof address === "string") {
    throw new Error("invalid test address");
  }
  try {
    await check(`http://127.0.0.1:${address.port}/source`, () => {
      return sent;
    });
  } finally {
    await new Promise<void>((resolve) => {
      return server.close(() => {
        return resolve();
      });
    });
  }
}

function _makeProbeRunner(scratchPath: string): MediaProcessRunner {
  return {
    scratchPath,
    run: async (options) => {
      if (options.executable === "/bin/true") {
        return { stdout: "", exitCode: 0 };
      }
      if (options.executable === "heif-info") {
        return { stdout: "truncated", exitCode: 1 };
      }
      return {
        stdout: JSON.stringify({
          streams: [
            {
              codec_type: "video",
              codec_name: "png",
              width: 10,
              height: 10,
              pix_fmt: "rgba",
              nb_read_packets: "1",
            },
          ],
        }),
        exitCode: 0,
      };
    },
    dispose: async () => {},
  };
}

it("bounds HEIC inspection to 16 MiB and refuses unreadable metadata", async () => {
  const bytes = Buffer.alloc(17 * 1024 ** 2);
  bytes.write("ftypheic", 4);
  const runner = _makeProbeRunner(await _makeScratch());
  await _withProbeSource({
    bytes,
    check: async (inputUrl, getSent) => {
      await expect(
        probeMedia({ inputUrl, runner, signal: new AbortController().signal }),
      ).rejects.toThrow("processing_probe_invalid");
      expect(getSent()).toBe(16 * 1024 ** 2);
      expect((await stat(join(runner.scratchPath, "probe-input"))).size).toBe(
        16 * 1024 ** 2,
      );
    },
  });
});

it("rejects nested playlists before any decoder command or secondary request", async () => {
  const runner = _makeProbeRunner(await _makeScratch());
  await _withProbeSource({
    bytes: Buffer.from(
      "#EXTM3U\n#EXT-X-STREAM-INF:BANDWIDTH=100\nhttp://external.invalid/private",
    ),
    check: async (inputUrl, getSent) => {
      await expect(
        probeMedia({ inputUrl, runner, signal: new AbortController().signal }),
      ).rejects.toThrow("processing_format_unsupported");
      expect(getSent()).toBe(32);
      expect(await readdir(runner.scratchPath)).toEqual([]);
    },
  });
});

it("refuses APNG even when a decoder reports only its first packet", async () => {
  const bytes = Buffer.alloc(80);
  Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]).copy(bytes);
  bytes.writeUInt32BE(13, 8);
  bytes.write("IHDR", 12);
  bytes.writeUInt32BE(8, 33);
  bytes.write("acTL", 37);
  bytes.writeUInt32BE(3, 53);
  bytes.write("IDAT", 57);
  const runner = _makeProbeRunner(await _makeScratch());
  await _withProbeSource({
    bytes,
    check: async (inputUrl) => {
      await expect(
        probeMedia({ inputUrl, runner, signal: new AbortController().signal }),
      ).rejects.toThrow("processing_photo_not_still");
    },
  });
});
