import { clsx } from "clsx";
import type { ComponentPropsWithRef, ReactNode } from "react";
import classes from "./PolaroidContainer.module.css";

type Props = {
  size?: "viewer" | "thumbnail";
} & (
  | ({ component?: "div" } & ComponentPropsWithRef<"div">)
  | ({ component: "button" } & ComponentPropsWithRef<"button">)
);

/** Shared paper edge and elevation for media viewers and timeline prints. */
export function PolaroidContainer({
  size = "viewer",
  className,
  ...props
}: Readonly<Props>): ReactNode {
  const frameClassName = clsx(
    classes.polaroidContainer,
    size === "thumbnail" && classes.polaroidContainerThumbnail,
    className,
  );
  if (props.component === "button") {
    const { component: _component, ...buttonProps } = props;
    return <button type="button" {...buttonProps} className={frameClassName} />;
  }
  const { component: _component, ...containerProps } = props;
  return <div {...containerProps} className={frameClassName} />;
}
