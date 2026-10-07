import type { ReactNode } from "react";
import { Banner } from "@/system/Chrome/Banner";
import { Prose } from "@/system/typography/Prose";
/** Explains why offset-less files share one instance-wide clock. */
export function TimezoneExplanation(): ReactNode {
  return (
    <>
      <Prose>
        This sets the date and time for photographs and videos with no recorded
        timezone offset. Files with a recorded offset are unaffected.
      </Prose>
      <Banner>
        This timezone also sets the days in the activity log and the timing of
        weekly reminders.
      </Banner>
    </>
  );
}
