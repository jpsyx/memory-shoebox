import { clsx } from "clsx";
import type { ReactNode } from "react";
import type { TextBlock } from "@/system/typography/TextBlock.types";
import classes from "@/system/system.module.css";

type Props = TextBlock;

/** The single lede on a surface, capped at 24ch. Familjen Grotesk 700. */
export function Lede({ children, className, id }: Readonly<Props>): ReactNode {
  return (
    <h1 className={clsx(classes.lede, className)} id={id}>
      {children}
    </h1>
  );
}
