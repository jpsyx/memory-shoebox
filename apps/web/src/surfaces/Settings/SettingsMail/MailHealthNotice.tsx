import type { MailHealthResponse } from "@memory-shoebox/shared";
import type { UseQueryResult } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { Banner } from "@/system/Chrome/Banner";
import { Prose } from "@/system/typography/Prose";
import { MailHealthResult } from "@/surfaces/Settings/SettingsMail/MailHealthResult/MailHealthResult";
type Props = { health: UseQueryResult<MailHealthResponse>; timezone: string };

/**
 * Diagnosis rechecks bypass completed provider checks and never imply test
 * delivery.
 */
export function MailHealthNotice({
  health,
  timezone,
}: Readonly<Props>): ReactNode {
  return (
    <>
      <MailHealthResult health={health} timezone={timezone} />
      <Prose>
        Rechecking asks Resend for a fresh domain check. This does not send a
        message or guarantee delivery.
      </Prose>
      <Banner>
        <b>Sign-in codes go by email.</b> If mail stops, nobody can sign in on a
        new device. Devices already signed in keep working until their sessions
        expire.
      </Banner>
    </>
  );
}
