import type {
  PrefetchCandidate,
  SpeculativeMedia,
} from "./mediaPrefetch.types";

function _releaseImage(image: HTMLImageElement): void {
  image.onload = null;
  image.onerror = null;
  image.removeAttribute("src");
}

function _loadImage(
  candidate: Readonly<PrefetchCandidate>,
  signal: AbortSignal,
): Promise<SpeculativeMedia> {
  return new Promise((resolve, reject) => {
    let ownedImage: HTMLImageElement | undefined = new Image();
    const image = ownedImage;
    const release = () => {
      if (ownedImage !== undefined) {
        _releaseImage(ownedImage);
        ownedImage = undefined;
      }
    };
    image.onerror = () => {
      release();
      reject(new Error("Speculative image failed"));
    };
    image.onload = async () => {
      try {
        signal.throwIfAborted();
        if (candidate.decode) {
          await image.decode();
        }
        signal.throwIfAborted();
        image.onload = null;
        image.onerror = null;
        resolve({ release });
      } catch (failure) {
        release();
        reject(failure);
      }
    };
    image.decoding = "async";
    image.fetchPriority = "low";
    // No crossOrigin/referrerPolicy/srcset override: match the selected img.
    // Abort never resets src before load/error: that is not transport proof.
    image.src = candidate.source.url;
  });
}

/**
 * Warms an exact native-image URL. Abort suppresses decode/retention, but an
 * in-flight image settles only on load/error (and any active decode settling).
 * The caller keeps its operation and byte reservations until then.
 */
export async function loadSpeculativeMedia(
  candidate: Readonly<PrefetchCandidate>,
  signal: AbortSignal,
): Promise<SpeculativeMedia> {
  signal.throwIfAborted();
  if (
    candidate.kind === "video-metadata" ||
    !candidate.source.contentType.startsWith("image/")
  ) {
    throw new Error("Speculative video metadata awaits measured M2 acceptance");
  }
  return _loadImage(candidate, signal);
}
