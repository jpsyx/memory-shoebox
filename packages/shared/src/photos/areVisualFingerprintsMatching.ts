import { visualFingerprintSchema } from "./visualFingerprint.constants.ts";

const BIT_COUNTS = [0, 1, 1, 2, 1, 2, 2, 3, 1, 2, 2, 3, 2, 3, 3, 4];

function _getHammingDistance(
  options: Readonly<{ first: string; second: string }>,
): number {
  const { first, second } = options;
  return [...first].reduce((distance, character, index) => {
    return (
      distance +
      BIT_COUNTS[
        Number.parseInt(character, 16) ^ Number.parseInt(second[index]!, 16)
      ]!
    );
  }, 0);
}

function _hasMatchingColors(
  options: Readonly<{ first: string; second: string }>,
): boolean {
  const { first, second } = options;
  const squaredDifference = Array.from(
    { length: first.length / 2 },
    (_, pixel) => {
      const index = pixel * 2;
      return (
        (Number.parseInt(first.slice(index, index + 2), 16) -
          Number.parseInt(second.slice(index, index + 2), 16)) **
        2
      );
    },
  ).reduce((total, value) => {
    return total + value;
  }, 0);
  return squaredDifference / (first.length / 2) <= 16;
}

/** Conservative re-export matching; not proof that originals have equal bytes. */
export function areVisualFingerprintsMatching(
  options: Readonly<{ first: string; second: string }>,
): boolean {
  const { first, second } = options;
  if (
    !visualFingerprintSchema.safeParse(first).success ||
    !visualFingerprintSchema.safeParse(second).success
  ) {
    return false;
  }
  const [, firstHash, firstGradient, firstColors] = first.split(":");
  const [, secondHash, secondGradient, secondColors] = second.split(":");
  return (
    _getHammingDistance({ first: firstHash!, second: secondHash! }) <= 2 &&
    _getHammingDistance({ first: firstGradient!, second: secondGradient! }) <=
      24 &&
    _hasMatchingColors({ first: firstColors!, second: secondColors! })
  );
}

/** Four exact lookup bands: a hash within two bits shares at least one band. */
export function getVisualFingerprintBandsFromFingerprint(
  fingerprint: string,
): string[] {
  return [0, 1, 2, 3].map((band) => {
    return fingerprint.slice(3 + band * 4, 7 + band * 4);
  });
}
