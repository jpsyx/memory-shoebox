import { clsx } from "clsx";
import type { ReactNode } from "react";
import type { TextBlock } from "@/system/typography/TextBlock.types";
import classes from "@/system/system.module.css";

type Props = TextBlock & {
  component?: "p" | "h2" | "h3" | "h4";
};

/** A smaller heading: an index card title, the name in the top bar. */
export function TitleText({
  children,
  className,
  component: Component = "h3",
}: Readonly<Props>): ReactNode {
  return (
    <Component className={clsx(classes.title, className)}>{children}</Component>
  );
}
