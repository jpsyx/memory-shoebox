import {
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rm,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { brotliDecompressSync, gunzipSync } from "node:zlib";
import { build } from "vite";
import { afterEach, expect, it } from "vitest";
import { precompressStaticAssets } from "../../build/precompressStaticAssets";

const TEMPORARY_DIRECTORIES: string[] = [];

afterEach(async () => {
  await Promise.all(
    TEMPORARY_DIRECTORIES.splice(0).map((directory) => {
      return rm(directory, { recursive: true, force: true });
    }),
  );
});

it("precompresses emitted text, public text and module workers after output generation", async () => {
  const root = await mkdtemp(join(tmpdir(), "shoebox-precompress-"));
  TEMPORARY_DIRECTORIES.push(root);
  await mkdir(join(root, "public/assets"), { recursive: true });
  const publicFiles = {
    "details.json": JSON.stringify({
      description: "family memories ".repeat(200),
    }),
    "logo.svg": `<svg xmlns="http://www.w3.org/2000/svg">${"<path/>".repeat(200)}</svg>`,
    "assets/family-portrait.jpg": "public photograph ".repeat(200),
    "photo.jpg": "media must not be recompressed ".repeat(200),
    "movie.mp4": "media must not be recompressed ".repeat(200),
    "codec.wasm": "binary must not be recompressed ".repeat(200),
    "existing.js.gz": "already compressed ".repeat(200),
    "existing.js.br": "already compressed ".repeat(200),
    "tiny.js": "x",
  };
  await Promise.all(
    Object.entries(publicFiles).map(([filename, contents]) => {
      return writeFile(join(root, "public", filename), contents);
    }),
  );
  await writeFile(
    join(root, "index.html"),
    `<html><body>${"family ".repeat(200)}<script type="module" src="/entry.js"></script></body></html>`,
  );
  await writeFile(
    join(root, "entry.js"),
    `import './style.css'; new Worker(new URL('./worker.js', import.meta.url), { type: 'module' }); console.log(${JSON.stringify("entry ".repeat(200))});`,
  );
  await writeFile(
    join(root, "worker.js"),
    `import('./worker-dependency.js').then(({message}) => postMessage(message)); console.log(${JSON.stringify("worker ".repeat(200))});`,
  );
  await writeFile(
    join(root, "worker-dependency.js"),
    `export const message = ${JSON.stringify("worker dependency ".repeat(200))};`,
  );
  await writeFile(
    join(root, "style.css"),
    `body::after { content: ${JSON.stringify("style ".repeat(200))}; }`,
  );
  await build({
    root,
    configFile: false,
    logLevel: "silent",
    plugins: [precompressStaticAssets()],
    worker: { format: "es" },
  });

  const output = join(root, "dist");
  const filenames = await readdir(output, { recursive: true });
  const textFiles = filenames.filter((filename) => {
    return /\.(html|js|css|json|svg)$/.test(filename) && filename !== "tiny.js";
  });
  expect(
    textFiles.some((filename) => {
      return /worker-[\w-]{8}\.js$/.test(filename);
    }),
  ).toBe(true);
  expect(
    textFiles.some((filename) => {
      return /worker-dependency-[\w-]{8}\.js$/.test(filename);
    }),
  ).toBe(true);
  expect(
    textFiles.some((filename) => {
      return filename.endsWith(".css");
    }),
  ).toBe(true);
  expect(textFiles).toContain("details.json");
  expect(textFiles).toContain("logo.svg");
  expect(filenames).toContain("index.html.br");
  expect(filenames).toContain("index.html.gz");
  const emittedFiles: unknown = JSON.parse(
    await readFile(join(output, ".vite/static-assets.json"), "utf8"),
  );
  expect(emittedFiles).toEqual(
    expect.arrayContaining(
      textFiles.filter((filename) => {
        return filename.startsWith("assets/");
      }),
    ),
  );
  [
    "details.json",
    "logo.svg",
    "photo.jpg",
    "assets/family-portrait.jpg",
  ].forEach((filename) => {
    expect(filenames).toContain(filename);
    expect(emittedFiles).not.toContain(filename);
  });
  await Promise.all(
    textFiles.map(async (filename) => {
      const original = await readFile(join(output, filename));
      const brotli = await readFile(join(output, `${filename}.br`));
      const gzip = await readFile(join(output, `${filename}.gz`));
      expect(brotli.byteLength).toBeLessThan(original.byteLength);
      expect(gzip.byteLength).toBeLessThan(original.byteLength);
      expect(brotliDecompressSync(brotli)).toEqual(original);
      expect(gunzipSync(gzip)).toEqual(original);
    }),
  );
  expect(
    filenames.filter((filename) => {
      return /\.(jpg|mp4|wasm|gz|br|tiny\.js)\.(br|gz)$/.test(filename);
    }),
  ).toEqual([]);
});
