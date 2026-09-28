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

/*
 * jsdom performs no layout: every element's bounding rect, and the document's
 * own client size, come back as 0x0. Floating UI, which Mantine's Popover and
 * every dropdown in this design system sit on, reads both to ask whether its
 * target has been clipped out of view. A 0x0 target inside a 0x0 viewport
 * reads as fully clipped, so it renders the dropdown `display: none` and
 * leaves it there: no amount of waiting opens it.
 *
 * These stand-ins give it a plausible box on both sides of that check. They
 * are here rather than in one test file because the reactions picker, the
 * people field's dropdown and the comment menus all meet the same wall.
 */
Element.prototype.getBoundingClientRect = (): DOMRect => {
  return {
    x: 0,
    y: 0,
    width: 100,
    height: 40,
    top: 0,
    left: 0,
    right: 100,
    bottom: 40,
    toJSON() {
      return this;
    },
  };
};

/**
 * jsdom has no `ResizeObserver`, and Mantine's `ScrollArea` (what a
 * `Select`, `MultiSelect` or `TagsInput` dropdown scrolls its options in)
 * calls it to size itself. This stub never fires a callback; nothing here
 * asserts on a resize, only that the dropdown mounts at all.
 */
class MockResizeObserver {
  observe(): void {}
  unobserve(): void {}
  disconnect(): void {}
}
window.ResizeObserver = MockResizeObserver;

[document.documentElement, document.body].forEach((element) => {
  Object.defineProperty(element, "clientWidth", {
    configurable: true,
    value: 1024,
  });
  Object.defineProperty(element, "clientHeight", {
    configurable: true,
    value: 768,
  });
});

/**
 * Testing Library registers its own cleanup only when `afterEach` is a global,
 * which needs Vitest's `globals: true`. This config does not set it, so without
 * this the DOM of one test is still standing in the next.
 */
afterEach(() => {
  cleanup();
});
