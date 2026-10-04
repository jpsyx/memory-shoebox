import system from "@/system/system.module.css";
import { IconCheck, IconTag } from "@tabler/icons-react";
import { type ReactNode } from "react";
type Props = {
  selected: boolean | undefined;
  labelCount: number;
};

/** Shows independent selection and saved-label markers. */
export function UploadPrintMarkers({
  selected,
  labelCount,
}: Readonly<Props>): ReactNode {
  return (
    <>
      {selected ? (
        <span className={system.printTick} aria-hidden="true">
          <IconCheck size="1.15rem" />
        </span>
      ) : null}
      {labelCount > 0 ? (
        <span className={system.printLabels}>
          <IconTag size="0.85rem" aria-hidden="true" />
          <span className="visually-hidden">
            {labelCount} saved {labelCount === 1 ? "label" : "labels"}
          </span>
          {labelCount}
        </span>
      ) : null}
    </>
  );
}
