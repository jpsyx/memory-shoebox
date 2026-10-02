import { Button } from "@mantine/core";
import type { ReactNode } from "react";
import { ChipRow } from "@/system/Chip/ChipRow";
import { Page } from "@/system/Chrome/Page";
import { TopBar } from "@/system/Chrome/TopBar";
import { Lede } from "@/system/typography/Lede";
import { Prose } from "@/system/typography/Prose";
import { useWayBack } from "@/surfaces/Item/ItemViewer/useWayBack";

type Props = {
  onRetry: () => void;
};

/**
 * A server fault or a dropped call, as distinct from "not here".
 *
 * A server fault has been asked about twice by the time this shows: the
 * item's query retries a `5xx` once by itself (`_isWorthRetryingAnOpen` in
 * `api/items/items.ts`), so one that clears in a moment never reaches here.
 * Past that, every attempt is another open, and a press may count two under
 * the same rule, so trying again waits for somebody to ask rather than for a
 * timer.
 */
export function ItemFailed({ onRetry }: Readonly<Props>): ReactNode {
  const wayBack = useWayBack(undefined);
  return (
    <>
      <TopBar
        back={{
          label: "Back to the pile",
          to: "/",
          search: wayBack.search,
          onClick: wayBack.onBackClick,
        }}
      />
      <Page>
        <Lede>This one did not open.</Lede>
        <Prose onPanel>
          Something went wrong between here and the Shoebox. It is worth another
          try.
        </Prose>
        <ChipRow>
          <Button onClick={onRetry}>Try again</Button>
        </ChipRow>
      </Page>
    </>
  );
}
