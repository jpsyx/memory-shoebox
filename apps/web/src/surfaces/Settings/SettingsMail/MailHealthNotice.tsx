import type { MailHealthResponse } from "@memory-shoebox/shared";
import type { UseQueryResult } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { Banner } from "@/system/Chrome/Banner";
import { Prose } from "@/system/typography/Prose";
type Props = { health: UseQueryResult<MailHealthResponse> };

/**
 * Diagnosis rechecks retain provider cache caveats and never imply test
 * delivery.
 */
export function MailHealthNotice({ health }: Readonly<Props>): ReactNode {
  return (
    <>
      {health.error === null ? null : (
        <Prose role="alert">{health.error.message}</Prose>
      )}
      {health.isPending ? (
        <Prose role="status">Reading mail health…</Prose>
      ) : health.data?.status === "ok" ? (
        <Prose role="status">
          Mail health reports no current delivery problem.
        </Prose>
      ) : null}
      <Prose>
        Rechecking reads the current diagnosis; Resend domain checks may be
        cached for 60 seconds. This does not send a message or guarantee
        delivery.
      </Prose>
      <Banner>
        <b>Sign-in codes go by email.</b> If mail stops, nobody can sign in on a
        new device. Devices already signed in keep working until their sessions
        expire.
      </Banner>
    </>
  );
}
