import classes from "./StreamBody.module.css";

import { Button } from "@mantine/core";

import { type ReactNode } from "react";

import type { RootRef, StreamProps } from "../DayStream.types";
import { StreamDays } from "../StreamDays";
type Props = StreamProps & {
  element: RootRef;
  startRef: RootRef;
  sentinelRef: RootRef;
};

/** Renders the owned StreamBody portion of the timeline. */
export function StreamBody({
  props,
  stream,
  element,
  startRef,
  sentinelRef,
  onCollapseBurst,
}: Readonly<Props>): ReactNode {
  const { focus, position } = stream;
  return (
    <div
      ref={element}
      className={classes.streamBody}
      onFocusCapture={(event) => {
        focus.onFocus(
          (event.target as HTMLElement).closest<HTMLElement>("[data-item-id]")
            ?.dataset.itemId,
        );
      }}
      onBlurCapture={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) {
          focus.onBlur();
        }
      }}
    >
      {position.hasRestoreError ? (
        <div>
          <p>Could not return to your place.</p>
          <Button onClick={position.retry}>
            Retry returning to your place
          </Button>
        </div>
      ) : null}
      <div
        ref={startRef}
        className={classes.streamBodyStart}
        aria-hidden="true"
      />
      <StreamDays
        props={props}
        stream={stream}
        onCollapseBurst={onCollapseBurst}
      />
      <div ref={sentinelRef} aria-hidden="true" />
    </div>
  );
}
