import type { MailHealthResponse } from "@memory-shoebox/shared";
import type { ReactNode } from "react";
import { Prose } from "@/system/typography/Prose";
import { mailDiagnosisCopy } from "@/surfaces/Settings/SettingsMail/mailDiagnosisCopy";
import classes from "./MailHealthFacts.module.css";

type Props = {
  data: MailHealthResponse;
  checkedAt: number;
  isPrevious: boolean;
  timezone: string;
};

/** Keeps the diagnosis and its last successful read time together on error. */
export function MailHealthFacts({
  data,
  checkedAt,
  isPrevious,
  timezone,
}: Readonly<Props>): ReactNode {
  const checkedDate = new Date(checkedAt);
  return (
    <>
      {isPrevious ? (
        <Prose>
          Previous result:{" "}
          {data.status === "ok"
            ? "No current mail problems found."
            : "Mail needs attention."}
        </Prose>
      ) : null}
      {data.diagnosis === null ? null : (
        <Prose>{mailDiagnosisCopy(data.diagnosis)}</Prose>
      )}
      <Prose>
        {isPrevious ? "Last successful check at " : "Checked at "}
        <time
          className={classes.mailHealthFactsTime}
          dateTime={checkedDate.toISOString()}
        >
          {checkedDate.toLocaleTimeString("en-US", {
            hour: "numeric",
            minute: "2-digit",
            second: "2-digit",
            timeZone: timezone,
            timeZoneName: "short",
          })}
        </time>
        .
      </Prose>
    </>
  );
}
