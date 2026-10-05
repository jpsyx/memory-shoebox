import type { ReactNode } from "react";
import { Banner } from "@/system/Chrome/Banner";
import { Prose } from "@/system/typography/Prose";
/** Explains why offset-less files share one instance-wide clock. */
export function TimezoneExplanation(): ReactNode {
  return (
    <>
      <Prose>
        Most photographs carry the offset they were taken at and are unaffected
        by this. It decides the rest: a scan, a file whose camera never knew
        where it was, a video from an app that stripped the metadata.
      </Prose>
      <Banner>
        <b>One clock for the whole Shoebox, not one per person.</b> Otherwise a
        photograph taken at half past eleven at night lands on the 14th for your
        aunt and the 15th for you, and the archive stops having one shape. The
        same rule settles when a day ends in the activity log and what time the
        weekly reminders go out.
      </Banner>
    </>
  );
}
