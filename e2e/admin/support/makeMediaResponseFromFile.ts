import { readFile } from "node:fs/promises";

/** Serve owned media with byte ranges so browser seeks match object storage. */
export async function makeMediaResponseFromFile({
  path,
  range,
}: Readonly<{
  path: string;
  range: string | undefined;
}>): Promise<{
  status: number;
  headers: Record<string, string>;
  body: Buffer;
}> {
  const bytes = await readFile(path);
  const headers: Record<string, string> = {
    "content-type": path.endsWith(".mp4")
      ? "video/mp4"
      : path.endsWith(".webm")
        ? "video/webm"
        : "image/jpeg",
    "accept-ranges": "bytes",
  };
  if (!range) {
    return { status: 200, headers, body: bytes };
  }
  const match = /^bytes=(\d+)-(\d*)$/.exec(range);
  const start = match ? Number(match[1]) : -1;
  const end = match?.[2]
    ? Math.min(Number(match[2]), bytes.length - 1)
    : bytes.length - 1;
  if (start < 0 || start > end) {
    return {
      status: 416,
      headers: { ...headers, "content-range": `bytes */${bytes.length}` },
      body: Buffer.alloc(0),
    };
  }
  return {
    status: 206,
    headers: {
      ...headers,
      "content-range": `bytes ${start}-${end}/${bytes.length}`,
    },
    body: bytes.subarray(start, end + 1),
  };
}
