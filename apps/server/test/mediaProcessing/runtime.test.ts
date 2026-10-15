import {
  chmod,
  mkdtemp,
  readFile,
  readdir,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createMediaProcessRunner } from "../../src/mediaProcessing/runtime/createMediaProcessRunner.ts";
import { getMediaRuntimeCapabilities } from "../../src/mediaProcessing/runtime/getMediaRuntimeCapabilities.ts";
import { createTestApp } from "../helpers/createTestApp.ts";
import { createTestConfig } from "../helpers/createTestConfig.ts";

const directories: string[] = [];
afterEach(async () => {
  await Promise.all(
    directories.splice(0).map((path) => {
      return rm(path, { recursive: true, force: true });
    }),
  );
});
async function _makeScratch(): Promise<string> {
  const path = await mkdtemp(join(tmpdir(), "media-runtime-test-"));
  directories.push(path);
  return path;
}

it("disables automatic work without hard isolation while health remains 200", async () => {
  const scratchRoot = await _makeScratch();
  const capabilities = await getMediaRuntimeCapabilities({
    enabled: true,
    cgroupRoot: join(scratchRoot, "not-cgroup"),
    scratchRoot,
    clock: Date.now,
  });
  expect(capabilities.available).toBe(false);
  expect(capabilities.reason).toBe("processing_isolation_unavailable");
  const context = await createTestApp({
    config: createTestConfig({ MEDIA_PROCESSING_ENABLED: "true" }),
  });
  try {
    expect((await context.app.inject({ url: "/api/health" })).statusCode).toBe(
      200,
    );
  } finally {
    await context.close();
  }
});

it("keeps processing disabled unless explicitly enabled", async () => {
  const scratchRoot = await _makeScratch();
  expect(createTestConfig().mediaProcessing.enabled).toBe(false);
  expect(
    createTestConfig({ MEDIA_PROCESSING_ENABLED: "yes" }).mediaProcessing
      .enabled,
  ).toBe(false);
  expect(
    await getMediaRuntimeCapabilities({
      enabled: false,
      cgroupRoot: "/missing",
      scratchRoot,
      clock: Date.now,
    }),
  ).toEqual({ available: false, reason: "processing_disabled" });
});

it("refuses unisolated execution without touching sibling scratch", async () => {
  const scratchRoot = await _makeScratch();
  await writeFile(join(scratchRoot, "keep"), "owned by caller");
  const runner = createMediaProcessRunner({
    cgroupRoot: scratchRoot,
    scratchRoot,
    clock: Date.now,
  });
  await expect(
    runner.run({
      executable: process.execPath,
      args: ["-e", "process.stdout.write('unsafe')"],
      signal: new AbortController().signal,
      timeoutMs: 1000,
      stdoutLimitBytes: 100,
    }),
  ).rejects.toThrow("processing_isolation_unavailable");
  await runner.dispose();
  expect(await readFile(join(scratchRoot, "keep"), "utf8")).toBe(
    "owned by caller",
  );
  expect(await readdir(scratchRoot)).toEqual(["keep"]);
});

const cgroupRoot = process.env["MEDIA_TEST_CGROUP_ROOT"];
describe.skipIf(process.platform !== "linux" || cgroupRoot === undefined)(
  "delegated Linux integration (unverified without MEDIA_TEST_CGROUP_ROOT)",
  () => {
    async function _makeRunner() {
      const scratchRoot = await _makeScratch();
      return createMediaProcessRunner({
        cgroupRoot: cgroupRoot!,
        scratchRoot,
        clock: Date.now,
      });
    }
    it("contains job memory exhaustion while serving survives", async () => {
      const context = await createTestApp();
      const runner = await _makeRunner();
      try {
        await expect(
          runner.run({
            executable: process.execPath,
            args: [
              "-e",
              "const blocks=[]; setInterval(()=>blocks.push(Buffer.alloc(16*1024*1024,1)),1)",
            ],
            signal: new AbortController().signal,
            timeoutMs: 15_000,
            stdoutLimitBytes: 1024,
          }),
        ).rejects.toThrow("processing_memory_limit");
        expect(
          (await context.app.inject({ url: "/api/health" })).statusCode,
        ).toBe(200);
      } finally {
        await runner.dispose();
        await context.close();
      }
    }, 25_000);
    it("terminates excessive stdout and deadlines", async () => {
      const runner = await _makeRunner();
      try {
        await expect(
          runner.run({
            executable: process.execPath,
            args: ["-e", "process.stdout.write('x'.repeat(2048))"],
            signal: new AbortController().signal,
            timeoutMs: 2000,
            stdoutLimitBytes: 1024,
          }),
        ).rejects.toThrow("processing_stdout_limit");
        await expect(
          runner.run({
            executable: process.execPath,
            args: ["-e", "setInterval(()=>{},1000)"],
            signal: new AbortController().signal,
            timeoutMs: 50,
            stdoutLimitBytes: 1024,
          }),
        ).rejects.toThrow("processing_timeout");
      } finally {
        await runner.dispose();
      }
    });
    it("kills detached descendants and deletes only job scratch on shutdown", async () => {
      const runner = await _makeRunner();
      const running = runner.run({
        executable: process.execPath,
        args: [
          "-e",
          "require('child_process').spawn(process.execPath,['-e','setInterval(()=>{},1000)'],{detached:true,stdio:'ignore'}); setInterval(()=>{},1000)",
        ],
        signal: new AbortController().signal,
        timeoutMs: 10_000,
        stdoutLimitBytes: 1024,
      });
      const settlement = running.catch((error: unknown) => {
        return error;
      });
      await new Promise((resolve) => {
        return setTimeout(resolve, 200);
      });
      const scratchPath = runner.scratchPath;
      const sibling = join(dirname(scratchPath), "keep");
      await writeFile(sibling, "owned by caller");
      await runner.dispose();
      expect(await readFile(sibling, "utf8")).toBe("owned by caller");
      expect(await settlement).toBeInstanceOf(Error);
      await expect(readdir(scratchPath)).rejects.toMatchObject({
        code: "ENOENT",
      });
      expect(await readdir(cgroupRoot!)).not.toContain("memory-shoebox-job");
    });
  },
);

import type { MediaCgroup } from "../../src/mediaProcessing/runtime/mediaCgroup/mediaCgroup.ts";
import { runMediaChild } from "../../src/mediaProcessing/runtime/runMediaChild.ts";

async function _makeCommandContext() {
  const scratchPath = await _makeScratch();
  const wrapper = join(scratchPath, "prlimit");
  await writeFile(wrapper, '#!/bin/sh\nshift\nshift\nexec "$@"\n');
  await chmod(wrapper, 0o700);
  vi.stubEnv("PATH", `${scratchPath}:${process.env["PATH"]}`);
  const group: MediaCgroup = {
    path: scratchPath,
    kill: async () => {},
    checkHeadroom: async () => {},
    getOomKills: async () => {
      return 0;
    },
    dispose: async () => {},
  };
  return { group, scratchPath, checkDisk: async () => {}, clock: Date.now };
}
afterEach(() => {
  return vi.unstubAllEnvs();
});

describe("real child lifecycle with simulated cgroup and rlimit only", () => {
  it("bounds stdout without exposing private arguments or stderr", async () => {
    const context = await _makeCommandContext();
    const options = {
      executable: process.execPath,
      args: [
        "-e",
        "process.stderr.write('https://secret.invalid/token');process.stdout.write('x'.repeat(20000));setInterval(()=>{},1000)",
      ],
      signal: new AbortController().signal,
      timeoutMs: 2000,
      stdoutLimitBytes: 1024,
    };
    await expect(runMediaChild(options, context)).rejects.toThrow(
      /^processing_stdout_limit$/,
    );
  });
  it("enforces deadlines on a live child", async () => {
    const context = await _makeCommandContext();
    await expect(
      runMediaChild(
        {
          executable: process.execPath,
          args: ["-e", "setInterval(()=>{},1000)"],
          signal: new AbortController().signal,
          timeoutMs: 100,
          stdoutLimitBytes: 1024,
        },
        context,
      ),
    ).rejects.toThrow("processing_timeout");
  });
  it("cancels a live child and returns bounded successful stdout", async () => {
    const context = await _makeCommandContext();
    const controller = new AbortController();
    const running = runMediaChild(
      {
        executable: process.execPath,
        args: ["-e", "setInterval(()=>{},1000)"],
        signal: controller.signal,
        timeoutMs: 2000,
        stdoutLimitBytes: 1024,
      },
      context,
    );
    setTimeout(() => {
      return controller.abort();
    }, 50);
    await expect(running).rejects.toThrow("processing_cancelled");
    expect(
      await runMediaChild(
        {
          executable: process.execPath,
          args: ["-e", "process.stdout.write('ok')"],
          signal: new AbortController().signal,
          timeoutMs: 2000,
          stdoutLimitBytes: 1024,
        },
        context,
      ),
    ).toEqual({ stdout: "ok", exitCode: 0 });
  });
});

import { createServer } from "node:http";
import type { MediaProcessRunner } from "../../src/mediaProcessing/runtime/createMediaProcessRunner.ts";
import { probeMedia } from "../../src/mediaProcessing/runtime/probeMedia/probeMedia.ts";

async function _withProbeSource(
  bytes: Buffer,
  check: (inputUrl: string, getSent: () => number) => Promise<void>,
): Promise<void> {
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
  await _withProbeSource(bytes, async (inputUrl, getSent) => {
    await expect(
      probeMedia({ inputUrl, runner, signal: new AbortController().signal }),
    ).rejects.toThrow("processing_probe_invalid");
    expect(getSent()).toBe(16 * 1024 ** 2);
    expect((await stat(join(runner.scratchPath, "probe-input"))).size).toBe(
      16 * 1024 ** 2,
    );
  });
});

it("rejects nested playlists before any decoder command or secondary request", async () => {
  const runner = _makeProbeRunner(await _makeScratch());
  await _withProbeSource(
    Buffer.from(
      "#EXTM3U\n#EXT-X-STREAM-INF:BANDWIDTH=100\nhttp://external.invalid/private",
    ),
    async (inputUrl, getSent) => {
      await expect(
        probeMedia({ inputUrl, runner, signal: new AbortController().signal }),
      ).rejects.toThrow("processing_format_unsupported");
      expect(getSent()).toBe(32);
      expect(await readdir(runner.scratchPath)).toEqual([]);
    },
  );
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
  await _withProbeSource(bytes, async (inputUrl) => {
    await expect(
      probeMedia({ inputUrl, runner, signal: new AbortController().signal }),
    ).rejects.toThrow("processing_photo_not_still");
  });
});
