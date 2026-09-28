import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";

/**
 * jsdom has no `matchMedia`, and Mantine's internals call it: `Modal` is the
 * one this design system uses. Nothing here calls `useMediaQuery`, `useMatches`,
 * `hiddenFrom` or `visibleFrom`, so what the shim answers barely matters; false
 * to everything means Mantine falls back to its `base` value, the narrowest.
 *
 * No test asserts a layout on top of this. The design system's responsiveness
 * is `@media` in its CSS modules, which jsdom does not evaluate at all, and the
 * three breakpoints are checked in a real browser instead.
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
    };
  },
});

/**
 * Testing Library registers its own cleanup only when `afterEach` is a global,
 * which needs Vitest's `globals: true`. This config does not set it, so without
 * this the DOM of one test is still standing in the next.
 */
afterEach(() => {
  cleanup();
});
