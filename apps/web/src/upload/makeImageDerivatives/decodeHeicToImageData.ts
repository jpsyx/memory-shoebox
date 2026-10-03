import createLibheifModule from "libheif-js/libheif-wasm/libheif.js";
import libheifWasmUrl from "libheif-js/libheif-wasm/libheif.wasm?url";

/*
 * libheif, compiled to WebAssembly: the HEIC decoder for a browser that has
 * none (decision 1). This module is only ever reached through a dynamic
 * `import()` in `makeImageDerivatives`, so its 90 KB of glue is its own chunk
 * and the 1.4 MB `.wasm` is an asset fetched on first use: a Safari uploader,
 * whose browser decodes HEIC natively, downloads neither.
 *
 * The package's own declaration types the Emscripten runtime and not the
 * `HeifDecoder` its glue adds, so the part used here is typed below.
 */

/** One image inside a HEIF file. */
type LibheifImage = {
  get_width: () => number;
  get_height: () => number;
  is_primary: () => boolean;
  display: (
    target: ImageData,
    onDecoded: (decoded: ImageData | null) => void,
  ) => void;
  free: () => void;
};

/** A parsed HEIF file. `decoder` is the native context, freed by hand. */
type LibheifDecoder = {
  decoder: number | null;
  decode: (bytes: Uint8Array) => LibheifImage[];
};

/**
 * The options object handed to the Emscripten factory.
 *
 * The factory decorates and returns this same object, so once
 * `onRuntimeInitialized` has run it also carries `HeifDecoder` and the
 * exported C functions.
 */
type LibheifRuntime = {
  wasmBinary: ArrayBuffer;
  onRuntimeInitialized: () => void;
  onAbort: (reason: unknown) => void;
  HeifDecoder?: new () => LibheifDecoder;
  heif_context_free?: (context: number) => void;
};

let runtimePromise: Promise<LibheifRuntime> | undefined;

/**
 * Starts libheif once per worker.
 *
 * The `.wasm` is fetched and handed over as `wasmBinary` rather than located
 * by the glue, so the URL is the hashed asset Vite emitted and the glue's own
 * synchronous fallback never runs. A failed start is forgotten, so the next
 * HEIC tries again rather than inheriting the failure.
 */
function _loadLibheif(): Promise<LibheifRuntime> {
  runtimePromise ??= (async () => {
    const response = await fetch(libheifWasmUrl);
    const wasmBinary = await response.arrayBuffer();
    return new Promise<LibheifRuntime>((settle, fail) => {
      const runtime: LibheifRuntime = {
        wasmBinary,
        onRuntimeInitialized: () => {
          settle(runtime);
        },
        onAbort: (reason) => {
          fail(new Error(`libheif aborted: ${String(reason)}`));
        },
      };
      createLibheifModule(runtime);
    });
  })().catch((error: unknown) => {
    runtimePromise = undefined;
    throw error;
  });
  return runtimePromise;
}

/** The primary image's pixels, decoded with libheif's own transforms. */
function _displayPrimary(image: LibheifImage): Promise<ImageData> {
  const target = new ImageData(image.get_width(), image.get_height());
  return new Promise((settle, fail) => {
    image.display(target, (decoded) => {
      if (decoded === null) {
        fail(new Error("libheif could not decode the image"));
      } else {
        settle(decoded);
      }
    });
  });
}

/**
 * Decodes a HEIC or HEIF file's primary image to upright RGBA pixels.
 *
 * libheif applies the file's own rotation and mirror boxes, so the result is
 * the picture as it is meant to be seen and its size is the displayed one;
 * EXIF orientation is not applied on top, because for HEIF it describes the
 * same turn. Every native handle is released before this returns, but the
 * WebAssembly heap never shrinks, which is why the engine recycles a worker
 * after `appConfig.upload.heicWorkerRecycleCount` of these.
 *
 * @param file The picked HEIC or HEIF file.
 * @returns Full-resolution pixels: 96 MB for a 24 MP photograph.
 */
export async function decodeHeicToImageData(file: Blob): Promise<ImageData> {
  const runtime = await _loadLibheif();
  if (runtime.HeifDecoder === undefined) {
    throw new Error("libheif started without a HeifDecoder");
  }
  const decoder = new runtime.HeifDecoder();
  const images = decoder.decode(new Uint8Array(await file.arrayBuffer()));
  try {
    const primary =
      images.find((image) => {
        return image.is_primary();
      }) ?? images[0];
    if (primary === undefined) {
      throw new Error("libheif found no image in the file");
    }
    return await _displayPrimary(primary);
  } finally {
    images.forEach((image) => {
      image.free();
    });
    if (decoder.decoder !== null) {
      runtime.heif_context_free?.(decoder.decoder);
      decoder.decoder = null;
    }
  }
}
