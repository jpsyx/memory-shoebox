import type { ReactNode } from "react";
import { Chip } from "@/system/Chip/Chip";
import { ChipRow } from "@/system/Chip/ChipRow";
import classes from "@/system/system.module.css";

/** One chip's shape, once a tag facet or a person facet is boiled down to it. */
export type FacetChipData = {
  id: string;
  name: string;
  isSelected: boolean;
  /** Undefined on a selected chip, where the server sends `ownCount` instead. */
  narrowedCount: number | undefined;
};

type Props = {
  chips: readonly FacetChipData[];
  onToggle: (id: string) => void;
};

/**
 * One row of facet chips: "Who is in it" or the tags, drawn identically.
 *
 * **The counts narrow.** Each number is what adding that chip to the current
 * selection would leave, not what the chip is worth alone, and a zero stays
 * on the row, quiet, rather than disappearing: a row that reshuffles under a
 * finger is worse than a row with a dead chip in it, and `0` is itself the
 * answer to "is there anything from the beach with Abuela in it".
 */
export function FacetChipRow({ chips, onToggle }: Readonly<Props>): ReactNode {
  return (
    <ChipRow>
      {chips.map((chip) => {
        const shown = chip.narrowedCount;
        return (
          <Chip
            key={chip.id}
            active={chip.isSelected}
            quiet={shown === 0}
            onClick={() => {
              onToggle(chip.id);
            }}
          >
            {chip.name}
            {shown === undefined ? null : (
              <>
                {" "}
                <span className={classes.tabular}>
                  {shown.toLocaleString("en-GB")}
                </span>
              </>
            )}
          </Chip>
        );
      })}
    </ChipRow>
  );
}
