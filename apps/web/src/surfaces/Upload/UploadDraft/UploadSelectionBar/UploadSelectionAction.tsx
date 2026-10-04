import classes from "@/system/system.module.css";
import type { ReactNode } from "react";
type Props = {
  label: string;
  icon?: ReactNode;
  isDisabled: boolean;
  onClick: () => void;
};

/** A native selection action with the same disabled state as its toolbar. */
export function UploadSelectionAction({
  label,
  icon,
  isDisabled,
  onClick,
}: Readonly<Props>): ReactNode {
  return (
    <button
      type="button"
      disabled={isDisabled}
      className={classes.selectionButton}
      onClick={onClick}
    >
      {icon}
      {label}
    </button>
  );
}
