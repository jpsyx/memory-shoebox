import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { mkdir, mkdtemp, readFile, realpath, rm, stat } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import type { MediaProcessRunner } from "../../src/mediaProcessing/runtime/createMediaProcessRunner.ts";
import type { MediaProbe } from "../../src/mediaProcessing/runtime/mediaRuntime.types.ts";
import { getProbeFromFfprobe } from "../../src/mediaProcessing/runtime/probeMedia/probeMedia.helpers.ts";

/** Synthetic fixture path, never a user's photo or bucket. */
export function getFixturePath(name: string): string {
  return fileURLToPath(
    new URL(`../fixtures/media-processing/${name}`, import.meta.url),
  );
}

/** Actual codecs only: this adapter deliberately proves NO OS isolation. */
export async function createVerificationRunner(): Promise<MediaProcessRunner> {
  const scratchPath = await realpath(
    await mkdtemp(join(tmpdir(), "recipe-verification-")),
  );
  await mkdir(join(scratchPath, "output"));
  return {
    scratchPath,
    run: async (command) => {
      command.signal.throwIfAborted();
      const result = await promisify(execFile)(
        command.executable === "/bin/true" ? "true" : command.executable,
        [...command.args],
        {
          signal: command.signal,
          timeout: command.timeoutMs,
          maxBuffer: Math.max(command.stdoutLimitBytes, 1024 * 1024),
        },
      );
      if (Buffer.byteLength(result.stdout) > command.stdoutLimitBytes) {
        throw new Error("processing_stdout_limit");
      }
      return { stdout: result.stdout, exitCode: 0 };
    },
    dispose: async () => {
      await rm(scratchPath, { recursive: true, force: true });
    },
  };
}

type FileMetadata = {
  streams: Array<{
    codec_type: string;
    codec_name: string;
    pix_fmt: string;
    width: number;
    height: number;
    avg_frame_rate: string;
    duration: string;
    start_time: string;
    bit_rate: string;
    color_transfer?: string;
    color_primaries?: string;
    color_space?: string;
    color_range?: string;
    sample_aspect_ratio?: string;
    display_aspect_ratio?: string;
    side_data_list?: Array<{ rotation?: number }>;
  }>;
  format: { duration: string };
};

/** Reads actual final streams for independent recipe assertions. */
export async function getMetadataFromFile(path: string): Promise<FileMetadata> {
  const result = await promisify(execFile)("ffprobe", [
    "-v",
    "error",
    "-show_streams",
    "-show_format",
    "-of",
    "json",
    path,
  ]);
  return JSON.parse(result.stdout) as FileMetadata;
}

/** Feeds the real metadata parser used by admission. */
export async function getVideoProbe(path: string): Promise<MediaProbe> {
  return getProbeFromFfprobe({
    kind: "video",
    stdout: JSON.stringify(await getMetadataFromFile(path)),
  });
}

/** Makes preservation assertions independent from codec behavior. */
export async function getHashFromFile(path: string): Promise<string> {
  return createHash("sha256")
    .update(await readFile(path))
    .digest("hex");
}

/** Local range fixture with an optional terminal upstream cutoff. */
export async function createFixtureReader(
  path: string,
  byteLimit = Infinity,
): Promise<{ url: string; close: () => Promise<void> }> {
  const size = (await stat(path)).size;
  let consumed = 0;
  const server = createServer((request, response) => {
    const range = /^bytes=(\d+)-(\d*)$/.exec(request.headers.range ?? "");
    const start = Number(range?.[1] ?? 0);
    const end = Math.min(Number(range?.[2] || size - 1), size - 1);
    if (consumed >= byteLimit) {
      response.writeHead(429).end();
      return;
    }
    const availableEnd = Math.min(end, start + byteLimit - consumed - 1);
    consumed += availableEnd - start + 1;
    response.writeHead(range ? 206 : 200, {
      "Content-Type": "video/mp4",
      "Content-Length": end - start + 1,
      "Accept-Ranges": "bytes",
      "Content-Range": `bytes ${start}-${end}/${size}`,
    });
    const stream = createReadStream(path, { start, end: availableEnd });
    if (availableEnd < end) {
      stream.on("end", () => {
        response.destroy();
      });
    }
    stream.pipe(response);
  });
  await new Promise<void>((ready) => {
    server.listen(0, "127.0.0.1", ready);
  });
  const address = server.address();
  if (address === null || typeof address === "string") {
    throw new Error("test server unavailable");
  }
  return {
    url: `http://127.0.0.1:${address.port}/source`,
    close: async () => {
      server.closeAllConnections();
      await new Promise<void>((done) => {
        server.close(() => {
          done();
        });
      });
    },
  };
}

/** Docker supplies zscale only; Sharp stays native. No isolation is asserted. */
export async function createDockerVerificationRunner(
  sourcePath: string,
): Promise<MediaProcessRunner> {
  const runner = await createVerificationRunner();
  const bridge = `
    const {execFile}=require('node:child_process');
    const {createServer}=require('node:http');
    const {createReadStream,statSync}=require('node:fs');
    const [source,timeout,...args]=process.argv.slice(1);
    const url=args.find(arg=>arg.startsWith('http://127.0.0.1:'));
    const server=createServer((request,response)=>{
      const size=statSync(source).size;
      const match=/^bytes=(\\d+)-(\\d*)$/.exec(request.headers.range||'');
      const start=Number(match?.[1]||0), end=Math.min(Number(match?.[2]||size-1),size-1);
      response.writeHead(match?206:200,{'Content-Length':end-start+1,'Content-Range':\`bytes \${start}-\${end}/\${size}\`});
      createReadStream(source,{start,end}).pipe(response);
    });
    const run=()=>execFile('ffmpeg',args,{timeout:Number(timeout),maxBuffer:1048576},(error,stdout,stderr)=>{
      process.stdout.write(stdout); process.stderr.write(stderr);
      if(error)process.exitCode=1;
      server.closeAllConnections(); server.close();
    });
    if(url)server.listen(Number(new URL(url).port),'127.0.0.1',run);else run();
  `;
  return {
    ...runner,
    run: async (command) => {
      if (command.executable !== "ffmpeg") {
        return runner.run(command);
      }
      const result = await promisify(execFile)(
        "docker",
        [
          "run",
          "--rm",
          "--network",
          "none",
          "-v",
          `${runner.scratchPath}:${runner.scratchPath}`,
          "-v",
          `${sourcePath}:${sourcePath}:ro`,
          "memory-shoebox-media-tools",
          "node",
          "-e",
          bridge,
          sourcePath,
          String(command.timeoutMs),
          ...command.args,
        ],
        {
          signal: command.signal,
          timeout: command.timeoutMs + 5000,
          maxBuffer: 1024 * 1024,
        },
      );
      return { stdout: result.stdout, exitCode: 0 };
    },
  };
}

/** Reads actual IDR timestamps rather than only inspecting encoder arguments. */
export async function getKeyframeTimesFromFile(
  path: string,
): Promise<number[]> {
  const result = await promisify(execFile)("ffprobe", [
    "-v",
    "error",
    "-select_streams",
    "v:0",
    "-skip_frame",
    "nokey",
    "-show_frames",
    "-show_entries",
    "frame=best_effort_timestamp_time",
    "-of",
    "json",
    path,
  ]);
  const metadata = JSON.parse(result.stdout) as {
    frames: Array<{ best_effort_timestamp_time: string }>;
  };
  return metadata.frames.map((frame) => {
    return Number(frame.best_effort_timestamp_time);
  });
}
