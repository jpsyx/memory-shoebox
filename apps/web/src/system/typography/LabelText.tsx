import { clsx } from "clsx";
import type { ReactNode } from "react";
import type { TextBlock } from "@/system/typography/TextBlock.types";
import classes from "@/system/system.module.css";

type Props = TextBlock & {
  component?: "p" | "span" | "h2" | "h3" | "h4" | "dt";
};

/** Tracked Archivo Narrow caps. Month names, section labels, markers. */
export function LabelText({
  children,
  className,
  component: Component = "p",
}: Readonly<Props>): ReactNode {
  return (
    <Component className={clsx(classes.label, className)}>{children}</Component>
  );
}
