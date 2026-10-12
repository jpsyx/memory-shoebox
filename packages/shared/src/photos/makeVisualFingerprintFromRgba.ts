import { VISUAL_FINGERPRINT_SIDE } from "./visualFingerprint.constants.ts";

const COSINES = Array.from({ length: 8 }, (_frequencyValue, frequency) => {
  return Array.from({ length: 32 }, (_, position) => {
    return Math.cos(((2 * position + 1) * frequency * Math.PI) / 64);
  });
});

function _getHexFromBits(bits: readonly boolean[]): string {
  return Array.from({ length: bits.length / 4 }, (_, group) => {
    return bits
      .slice(group * 4, group * 4 + 4)
      .reduce((value, bit) => {
        return value * 2 + Number(bit);
      }, 0)
      .toString(16);
  }).join("");
}

function _getDctHash(luminance: readonly number[]): string {
  const horizontal = COSINES.map((cosine) => {
    return Array.from({ length: 32 }, (_, row) => {
      return cosine.reduce((sum, weight, column) => {
        return sum + luminance[row * 32 + column]! * weight;
      }, 0);
    });
  });
  const coefficients = COSINES.flatMap((cosine) => {
    return horizontal.map((column) => {
      return column.reduce((sum, value, row) => {
        return sum + value * cosine[row]!;
      }, 0);
    });
  });
  const median = coefficients.slice(1).sort((first, second) => {
    return first - second;
  })[31]!;
  return _getHexFromBits(
    coefficients.map((value, index) => {
      return index > 0 && value > median;
    }),
  );
}

function _getCellMean(
  options: Readonly<{
    values: readonly number[];
    x: number;
    y: number;
    side: number;
  }>,
): number {
  const { values, x, y, side } = options;
  return (
    Array.from({ length: side * side }, (_, index) => {
      return values[(y + Math.floor(index / side)) * 32 + x + (index % side)]!;
    }).reduce((total, value) => {
      return total + value;
    }, 0) /
    (side * side)
  );
}

function _getGradientHash(luminance: readonly number[]): string {
  return _getHexFromBits(
    Array.from({ length: 240 }, (_, index) => {
      const x = (index % 15) * 2;
      const y = Math.floor(index / 15) * 2;
      return (
        _getCellMean({ values: luminance, x, y, side: 2 }) >
        _getCellMean({ values: luminance, x: x + 2, y, side: 2 })
      );
    }),
  );
}

function _getColorGrid(pixels: Uint8Array | Uint8ClampedArray): string {
  const channels = [0, 1, 2].map((channel) => {
    return Array.from({ length: 1024 }, (_, pixel) => {
      const opacity = pixels[pixel * 4 + 3]! / 255;
      return pixels[pixel * 4 + channel]! * opacity + 255 * (1 - opacity);
    });
  });
  return Array.from({ length: 64 }, (_, cell) => {
    return channels
      .map((values) => {
        return Math.round(
          _getCellMean({
            values,
            x: (cell % 8) * 4,
            y: Math.floor(cell / 8) * 4,
            side: 4,
          }),
        )
          .toString(16)
          .padStart(2, "0");
      })
      .join("");
  }).join("");
}

/** Fingerprints an oriented 32x32 sRGB image without changing its original. */
export function makeVisualFingerprintFromRgba(
  pixels: Uint8Array | Uint8ClampedArray,
): string | undefined {
  if (pixels.length !== VISUAL_FINGERPRINT_SIDE ** 2 * 4) {
    return undefined;
  }
  const luminance = Array.from({ length: 1024 }, (_, pixel) => {
    const offset = pixel * 4;
    const opacity = pixels[offset + 3]! / 255;
    return (
      (pixels[offset]! * 0.299 +
        pixels[offset + 1]! * 0.587 +
        pixels[offset + 2]! * 0.114) *
        opacity +
      255 * (1 - opacity)
    );
  });
  const mean =
    luminance.reduce((sum, value) => {
      return sum + value;
    }, 0) / 1024;
  const variance =
    luminance.reduce((sum, value) => {
      return sum + (value - mean) ** 2;
    }, 0) / 1024;
  if (variance < 144) {
    return undefined;
  }
  return `v1:${_getDctHash(luminance)}:${_getGradientHash(luminance)}:${_getColorGrid(pixels)}`;
}
