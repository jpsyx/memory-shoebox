import type { ReactNode } from "react";
import { Prose } from "@/system/typography/Prose";
import type { RemovalAsk } from "../useRemovalAsk/useRemovalAsk";
type Props = { ask: RemovalAsk };
/** Announces create progress and stable failure copy beside retained words. */
export function RemovalAskFeedback({ ask }: Readonly<Props>): ReactNode {
  return (
    <>
      {ask.error === undefined ? null : <Prose role="alert">{ask.error}</Prose>}
      {ask.isPending ? (
        <Prose role="status">Recording your request…</Prose>
      ) : null}
    </>
  );
}
