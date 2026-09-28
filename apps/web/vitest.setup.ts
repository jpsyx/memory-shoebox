import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";

/**
 * jsdom has no layout engine, so `matchMedia` is missing and Mantine's
 * `useMediaQuery` throws without it. Every query reports false, which is the
 * widest breakpoint and therefore the layout a smoke render should exercise.
 */
Object.defineProperty(window, "matchMedia", {
  writable: true,
  value: (query: string): MediaQueryList => {
    return {
      matches: false,
      media: query,
      onchange: null,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => {
        return false;
      },
    } as unknown as MediaQueryList;
  },
});

afterEach(() => {
  cleanup();
});
