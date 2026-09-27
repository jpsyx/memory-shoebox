import { useCallback, useEffect, useState } from "react";

/**
 * The four closed palettes and the two pile arrangements, held on the <html>
 * element so CSS can follow them.
 *
 * Both are product-level choices rather than harness toys: DESIGN.md settles
 * Day and Messy as the direction, and PRODUCT.md records the pile arrangement
 * as an instance-level setting chosen once by whoever runs the deployment.
 * They are switchable here only so the alternatives can still be compared.
 */
export const RENDITIONS = ["porcelain", "slate", "day", "night"] as const;
export type Rendition = (typeof RENDITIONS)[number];

export const PILE_MODES = ["tidy", "messy"] as const;
export type PileMode = (typeof PILE_MODES)[number];

const RENDITION_KEY = "shoebox-rendition";
const PILE_KEY = "shoebox-pile";

function readStored<T extends string>(
  key: string,
  allowed: readonly T[],
  fallback: T,
): T {
  try {
    const stored = window.localStorage.getItem(key);
    return allowed.includes(stored as T) ? (stored as T) : fallback;
  } catch {
    /* Private windows throw here. The page still works. */
    return fallback;
  }
}

function writeStored(key: string, value: string): void {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    /* Private windows throw here. */
  }
}

/** The current rendition, and a way to change it. Day is the default. */
export function useRendition(): [Rendition, (next: Rendition) => void] {
  const [rendition, setRenditionState] = useState<Rendition>(() => {
    return readStored(RENDITION_KEY, RENDITIONS, "day");
  });

  useEffect(() => {
    document.documentElement.dataset.rendition = rendition;
  }, [rendition]);

  const setRendition = useCallback((next: Rendition) => {
    writeStored(RENDITION_KEY, next);
    setRenditionState(next);
  }, []);

  return [rendition, setRendition];
}

/** The current pile arrangement, and a way to change it. Messy is default. */
export function usePileMode(): [PileMode, (next: PileMode) => void] {
  const [pileMode, setPileModeState] = useState<PileMode>(() => {
    return readStored(PILE_KEY, PILE_MODES, "messy");
  });

  useEffect(() => {
    document.documentElement.dataset.pile = pileMode;
  }, [pileMode]);

  const setPileMode = useCallback((next: PileMode) => {
    writeStored(PILE_KEY, next);
    setPileModeState(next);
  }, []);

  return [pileMode, setPileMode];
}
