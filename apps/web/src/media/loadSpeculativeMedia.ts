import type {
  DecodedPhoto,
  PrefetchCandidate,
  SpeculativeMedia,
} from "./mediaPrefetch.types";

function _releaseImage(image: HTMLImageElement): void {
  image.onload = null;
  image.onerror = null;
  image.remove();
  image.removeAttribute("src");
}

function _getDecodedPhoto(
  candidate: Readonly<PrefetchCandidate>,
  getOwnedImage: () => HTMLImageElement | undefined,
): DecodedPhoto | undefined {
  if (candidate.kind !== "photo" || !candidate.decode) return undefined;
  return {
    itemId: candidate.itemId,
    source: candidate.source,
    getImage: () => {
      const image = getOwnedImage();
      return image !== undefined &&
        Date.parse(candidate.source.expiresAt) > Date.now() &&
        (image.currentSrc || image.src) === candidate.source.url &&
        image.naturalWidth > 0 &&
        image.naturalHeight > 0
        ? image
        : undefined;
    },
  };
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
        const decodedPhoto = _getDecodedPhoto(candidate, () => {
          return ownedImage;
        });
        resolve({ release, decodedPhoto });
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
