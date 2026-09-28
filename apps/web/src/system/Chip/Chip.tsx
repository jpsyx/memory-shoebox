import { IconX } from "@tabler/icons-react";
import { clsx } from "clsx";
import type { ReactNode } from "react";
import { ICON_PROPS_SMALL } from "@/system/icons";
import classes from "@/system/system.module.css";

type Props = {
  children: ReactNode;
  active?: boolean;
  onPanel?: boolean;
  /**
   * A filter that would leave nothing. It stays on the row and goes quiet
   * rather than disappearing: a row that reshuffles under a finger is worse,
   * and a nought is itself an answer.
   */
  quiet?: boolean;
  onClick?: () => void;
  onRemove?: () => void;
  removeLabel?: string;
};

/**
 * A tag, a person, or a filter, as something you can press. Square, hairline
 * stroke, 2.75rem tall, and it inverts to solid ink when it is on. Never
 * accent: the accent means "not seen by you yet" and nothing else.
 */
export function Chip({
  children,
  active = false,
  onPanel = false,
  quiet = false,
  onClick,
  onRemove,
  removeLabel,
}: Readonly<Props>): ReactNode {
  const className = clsx(
    classes.chip,
    onPanel && classes.chipOnPanel,
    quiet && !active && classes.chipQuiet,
    active && (onPanel ? classes.chipOnPanelActive : classes.chipActive),
  );

  if (onRemove === undefined) {
    return (
      <button
        type="button"
        className={className}
        aria-pressed={onClick === undefined ? undefined : active}
        aria-disabled={quiet && !active ? "true" : undefined}
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
