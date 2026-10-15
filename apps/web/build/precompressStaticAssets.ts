import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { promisify } from "node:util";
import { brotliCompress, gzip } from "node:zlib";
import type { Plugin } from "vite";

const COMPRESSIBLE_TEXT = /\.(html|js|css|json|svg)$/i;

async function _precompressFile(filename: string): Promise<void> {
  const original = await readFile(filename);
  await Promise.all(
    [
      { suffix: "br", compress: promisify(brotliCompress) },
      { suffix: "gz", compress: promisify(gzip) },
    ].map(async ({ suffix, compress }) => {
      const compressed = await compress(original);
      if (compressed.byteLength < original.byteLength) {
        await writeFile(`${filename}.${suffix}`, compressed);
      }
    }),
  );
}

/** Writes smaller static text representations after Vite emits its output. */
export function precompressStaticAssets(): Plugin {
  return {
    name: "memory-shoebox:precompress-static-assets",
    apply: "build",
    writeBundle: {
      order: "post",
      sequential: true,
      handler: async (options, bundle) => {
        if (!options.dir) {
          return;
        }
        const outputDirectory = options.dir;
        await mkdir(join(outputDirectory, ".vite"), { recursive: true });
        await writeFile(
          join(outputDirectory, ".vite/static-assets.json"),
          JSON.stringify(Object.keys(bundle)),
        );
        const entries = await readdir(outputDirectory, {
          recursive: true,
          withFileTypes: true,
        });
        await Promise.all(
          entries
            .filter((entry) => {
              return entry.isFile() && COMPRESSIBLE_TEXT.test(entry.name);
            })
            .map((entry) => {
              return _precompressFile(join(entry.parentPath, entry.name));
            }),
        );
      },
    },
  };
}
