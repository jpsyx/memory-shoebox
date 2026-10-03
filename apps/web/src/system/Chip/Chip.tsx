import { IconX } from "@tabler/icons-react";
import { clsx } from "clsx";
import type { ReactNode, Ref } from "react";
import { ICON_PROPS_SMALL } from "@/system/icons";
import classes from "@/system/system.module.css";

type Props = {
  children: ReactNode;
  /**
   * Whether a filter is on. Passed only by a chip that is a toggle, and then
   * always, `false` included: it is what makes the chip announce itself as
   * pressed or not. A chip that does something instead, such as "+ Add a
   * tag", leaves it out and is announced as a plain button.
   */
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
  /** The button, for a caller that gives focus back to it. Not with a cross. */
  ref?: Ref<HTMLButtonElement>;
};

/** The chip's classes: on panel or print, quiet, on or off. */
function _chipClassName(
  options: Readonly<{ active?: boolean; onPanel: boolean; quiet: boolean }>,
): string {
  const { active, onPanel, quiet } = options;
  return clsx(
    classes.chip,
    onPanel && classes.chipOnPanel,
    quiet && !active && classes.chipQuiet,
    active && (onPanel ? classes.chipOnPanelActive : classes.chipActive),
  );
}

/**
 * A tag, a person, or a filter, as something you can press. Square, hairline
 * stroke, 2.75rem tall, and it inverts to solid ink when it is on. Never
 * accent: the accent means "not seen by you yet" and nothing else.
 */
export function Chip({
  children,
  active,
  onPanel = false,
  quiet = false,
  onClick,
  onRemove,
  removeLabel,
  ref,
}: Readonly<Props>): ReactNode {
  const className = _chipClassName({ active, onPanel, quiet });

  if (onRemove === undefined) {
    return (
      <button
        ref={ref}
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
