import type { ReactNode } from "react";
import { Chip } from "@/system/Chip/Chip";
import classes from "@/system/system.module.css";

type Props = {
  name: string;
  itemCount: number;
  active: boolean;
  onToggle: () => void;
};

/**
 * One type-ahead suggestion: a tag or a person, matched by what is typed.
 *
 * A press here fires `onToggle` immediately, never through the field's own
 * debounce: a press is a deliberate act and has to feel like one.
 */
export function TypeaheadChip({
  name,
  itemCount,
  active,
  onToggle,
}: Readonly<Props>): ReactNode {
  return (
    <Chip active={active} onClick={onToggle}>
      {name}{" "}
      <span className={classes.tabular}>
        {itemCount.toLocaleString("en-GB")}
      </span>
    </Chip>
  );
}
