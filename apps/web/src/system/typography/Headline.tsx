import { clsx } from "clsx";
import type { ReactNode } from "react";
import type { TextBlock } from "@/system/typography/TextBlock.types";
import classes from "@/system/system.module.css";

type Props = TextBlock;

/** A count or a section heading in figure type. */
export function Headline({ children, className }: Readonly<Props>): ReactNode {
  return <h2 className={clsx(classes.headline, className)}>{children}</h2>;
}
