import { Button } from "@mantine/core";
import type { ReactNode } from "react";
import { ChipRow } from "@/system/Chip/ChipRow";
import { Page } from "@/system/Chrome/Page";
import { TopBar } from "@/system/Chrome/TopBar";
import { Lede } from "@/system/typography/Lede";
import { Prose } from "@/system/typography/Prose";

type Props = {
  onRetry: () => void;
};

/**
 * A server fault or a dropped call, as distinct from "not here".
 *
 * Trying again is a genuine second open, so it is a button somebody presses
 * rather than a timer.
 */
export function ItemFailed({ onRetry }: Readonly<Props>): ReactNode {
  return (
    <>
      <TopBar back={{ label: "Back to the pile", to: "/" }} />
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
