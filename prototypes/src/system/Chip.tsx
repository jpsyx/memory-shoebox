import { IconX } from "@tabler/icons-react";
import { clsx } from "clsx";
import type { ReactNode } from "react";
import { ICON_PROPS_SMALL } from "@/system/icons";
import classes from "@/system/system.module.css";

/** A row of chips that wraps rather than scrolling sideways. */
export function ChipRow({
  children,
}: {
  readonly children: ReactNode;
}): ReactNode {
  return <div className={classes.chipRow}>{children}</div>;
}

/**
 * A tag, a person, or a filter, as something you can press. Square, hairline
 * stroke, 2.75rem tall, and it inverts to solid ink when it is on. Never
 * accent: the accent means "not seen by you yet" and nothing else.
 */
export function Chip({
  children,
  active = false,
  onPanel = false,
  onClick,
  onRemove,
  removeLabel,
}: {
  readonly children: ReactNode;
  readonly active?: boolean;
  readonly onPanel?: boolean;
  readonly onClick?: () => void;
  readonly onRemove?: () => void;
  readonly removeLabel?: string;
}): ReactNode {
  const className = clsx(
    classes.chip,
    onPanel && classes.chipOnPanel,
    active && (onPanel ? classes.chipOnPanelActive : classes.chipActive),
  );

  if (onRemove === undefined) {
    return (
      <button
        type="button"
        className={className}
        aria-pressed={onClick === undefined ? undefined : active}
        onClick={onClick}
      >
        {children}
      </button>
    );
  }

  return (
    <span className={className}>
      {children}
      <button
        type="button"
        className={classes.chipRemove}
        onClick={onRemove}
        aria-label={removeLabel ?? "Remove"}
      >
        <IconX {...ICON_PROPS_SMALL} />
      </button>
    </span>
  );
}
