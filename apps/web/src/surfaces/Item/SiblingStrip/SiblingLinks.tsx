import { Link } from "@tanstack/react-router";
import type { KeyboardEvent, ReactNode } from "react";
import type { BurstFrameRef } from "@memory-shoebox/shared";
import { framePositionLabel } from "@/system/labelHelpers/labelHelpers";
import classes from "@/system/system.module.css";

type Props = {
  frames: readonly BurstFrameRef[];
  currentItemId: string;
  count: number;
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
  return target === undefined
    ? undefined
    : Math.min(Math.max(target, 0), options.last);
}

/** Moves focus along the strip when the key is one of the strip's. */
function _moveFocus(event: KeyboardEvent<HTMLDivElement>): void {
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
 * The frames, as one tab stop with the arrows moving along it.
 *
 * Forty-five links would be forty-five tab stops between the frame and the
 * comments, so only the open frame takes Tab and the arrow keys, Home and End
 * move between the rest; Enter opens one. Each image is decorative, because
 * forty-five readings of the same composed sentence help nobody: the link's
 * name is its position. The router marks the open one `aria-current="page"`.
 *
 * A move replaces the history entry, so Back leaves the burst rather than
 * stepping back through it.
 */
export function SiblingLinks({
  frames,
  currentItemId,
  count,
}: Readonly<Props>): ReactNode {
  const hasCurrent = frames.some((frame) => {
    return frame.itemId === currentItemId;
  });
  const tabStopId = hasCurrent ? currentItemId : frames[0]?.itemId;
  return (
    <div className={classes.siblings} onKeyDown={_moveFocus}>
      {frames.map((frame) => {
        return (
          <Link
            key={frame.itemId}
            to="/items/$itemId"
            params={{ itemId: frame.itemId }}
            replace
            className={classes.sibling}
            tabIndex={frame.itemId === tabStopId ? 0 : -1}
            aria-label={framePositionLabel({ position: frame.position, count })}
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
