import { clamp } from "@mantine/hooks";
import { Link } from "@tanstack/react-router";
import {
  useEffect,
  useRef,
  type KeyboardEvent,
  type ReactNode,
  type RefObject,
} from "react";
import type { BurstFrameRef } from "@memory-shoebox/shared";
import { framePositionLabel } from "@/system/labelHelpers/labelHelpers";
import classes from "@/system/system.module.css";

type Props = {
  frames: readonly BurstFrameRef[];
  currentItemId: string;
  /** The whole run, which can be more than `frames` holds. */
  frameCount: number;
};

/** Which link a key moves to, as an index, or undefined for any other key. */
function _getIndexFromKey(
  options: Readonly<{ key: string; index: number; last: number }>,
): number | undefined {
  const indexByKey: Record<string, number> = {
    ArrowRight: options.index + 1,
    ArrowLeft: options.index - 1,
    Home: 0,
    End: options.last,
  };
  const target = indexByKey[options.key];
  return target === undefined ? undefined : clamp(target, 0, options.last);
}

/** Moves focus along the strip when the key is one of the strip's. */
function _onStripKeyDown(event: KeyboardEvent<HTMLDivElement>): void {
  // With a modifier held the key is the browser's: Alt and the left arrow
  // is Back, and the strip must not swallow it.
  if (event.altKey || event.metaKey || event.ctrlKey) {
    return;
  }
  const links = [...event.currentTarget.querySelectorAll("a")];
  const index = links.findIndex((link) => {
    return link === document.activeElement;
  });
  const target = _getIndexFromKey({
    key: event.key,
    index,
    last: links.length - 1,
  });
  if (target !== undefined) {
    event.preventDefault();
    links[target]?.focus();
  }
}

/**
 * Brings the strip's tab stop into view inside the strip whenever it moves,
 * which is on arriving and whenever another frame is drawn. Only the strip
 * scrolls, never the page.
 */
function useCentredTabStop(
  tabStopId: string | undefined,
): RefObject<HTMLDivElement | null> {
  const stripRef = useRef<HTMLDivElement>(null);
  useEffect(
    function centreTabStop() {
      const strip = stripRef.current;
      const frame =
        strip?.querySelector<HTMLElement>('a[tabindex="0"]') ?? undefined;
      if (strip !== null && frame !== undefined) {
        const stripBox = strip.getBoundingClientRect();
        const frameBox = frame.getBoundingClientRect();
        // The strip's own `scrollLeft`, never `scrollIntoView`, which scrolls
        // every ancestor that can scroll, the page included.
        strip.scrollLeft +=
          frameBox.left - stripBox.left - (stripBox.width - frameBox.width) / 2;
      }
    },
    [tabStopId],
  );
  return stripRef;
}

/**
 * The frames, as one tab stop with the arrows moving along it.
 *
 * Forty-five links would be forty-five tab stops between the frame and the
 * comments, so only the open frame takes Tab and the arrow keys, Home and End
 * move between the rest; Enter opens one. Each image is decorative, because
 * forty-five readings of the same composed sentence help nobody: the link's
 * name is its position.
 *
 * The router marks a frame `aria-current="page"` as soon as the address
 * changes to it, which can be a moment before that frame's item is drawn;
 * the tab stop follows the item that is drawn.
 *
 * A move replaces the history entry, so Back leaves the burst rather than
 * stepping back through it, and leaves the page's scroll where it was
 * (`resetScroll={false}`), so the frame does not jump out from under the
 * reader.
 */
export function SiblingLinks({
  frames,
  currentItemId,
  frameCount,
}: Readonly<Props>): ReactNode {
  const hasCurrent = frames.some((frame) => {
    return frame.itemId === currentItemId;
  });
  const tabStopId = hasCurrent ? currentItemId : frames[0]?.itemId;
  const stripRef = useCentredTabStop(tabStopId);
  return (
    <div
      ref={stripRef}
      className={classes.siblings}
      onKeyDown={_onStripKeyDown}
    >
      {frames.map((frame) => {
        return (
          <Link
            key={frame.itemId}
            to="/items/$itemId"
            params={{ itemId: frame.itemId }}
            replace
            resetScroll={false}
            className={classes.sibling}
            tabIndex={frame.itemId === tabStopId ? 0 : -1}
            aria-label={framePositionLabel({
              position: frame.position,
              frameCount,
            })}
          >
            <img
              src={frame.thumb.url}
              alt=""
              width={frame.thumb.width}
              height={frame.thumb.height}
              loading="lazy"
            />
          </Link>
        );
      })}
    </div>
  );
}
