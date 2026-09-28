import { clsx } from "clsx";
import type { ReactNode } from "react";
import type { TextBlock } from "@/system/typography/TextBlock.types";
import classes from "@/system/system.module.css";

type Props = TextBlock;

/** A smaller heading: an index card title, the name in the top bar. */
export function TitleText({ children, className }: Readonly<Props>): ReactNode {
  return <h3 className={clsx(classes.title, className)}>{children}</h3>;
}
