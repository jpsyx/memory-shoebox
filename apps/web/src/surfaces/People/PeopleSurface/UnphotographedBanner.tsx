import type { ReactNode } from "react";
import { Banner } from "@/system/Chrome/Banner";

/** Somebody tagged but never photographed: why they are in the directory. */
export function UnphotographedBanner(): ReactNode {
  return (
    <Banner onPanel>
      <b>Somebody here has been tagged but never photographed.</b> They were
      added so that the moment somebody puts up a photograph with them in it, it
      lands on a name that already exists rather than making a second one.
    </Banner>
  );
}
