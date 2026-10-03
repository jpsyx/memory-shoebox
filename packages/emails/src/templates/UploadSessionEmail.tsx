import { Link, Text } from "@react-email/components";
import { renderEmail } from "../lib/renderEmail.ts";
import { EmailShell } from "../lib/EmailShell.tsx";
import { spellSmallNumber } from "../lib/spellSmallNumber.ts";
import type { EmailTemplate } from "../emailTemplate.types.ts";
import type { UploadSessionEmailPayload } from "@memory-shoebox/shared";

type Props = {
  payload: UploadSessionEmailPayload;
};

/**
 * One calendar day in English, formatted in UTC.
 *
 * A `YYYY-MM-DD` day is already local to `shoebox.timezone`, so there is no
 * zone left to convert it from. Formatting noon UTC in the Shoebox's zone, as
 * `CommentEmail.tsx` does, moves the day forward in any zone east of UTC+11.
 */
function _dayLabel(options: {
  day: string;
  format: Intl.DateTimeFormatOptions;
}): string {
  return new Intl.DateTimeFormat("en-GB", {
    ...options.format,
    timeZone: "UTC",
  }).format(new Date(`${options.day}T00:00:00.000Z`));
}

/** "14 September", as the subject says it. */
function _shortDayLabel(day: string): string {
  return _dayLabel({ day, format: { day: "numeric", month: "long" } });
}

/** "14 September 2026". */
function _longDayLabel(day: string): string {
  return _dayLabel({
    day,
    format: { day: "numeric", month: "long", year: "numeric" },
  });
}

/**
 * "Monday 14 September 2026", with no comma after the weekday.
 *
 * Composed from two formats because `en-GB` puts a comma there and the
 * prototype does not.
 */
function _weekdayDayLabel(day: string): string {
  const weekday = _dayLabel({ day, format: { weekday: "long" } });
  return `${weekday} ${_longDayLabel(day)}`;
}

/**
 * The first day of the span, "1 September", carrying its year only when the
 * span crosses into another one.
 */
function _spanStartLabel(payload: UploadSessionEmailPayload): string {
  const isSameYear =
    payload.firstCapturedOn.slice(0, 4) === payload.lastCapturedOn.slice(0, 4);
  return isSameYear
    ? _shortDayLabel(payload.firstCapturedOn)
    : _longDayLabel(payload.firstCapturedOn);
}

/** "210 photos", or "1 photo". */
function _photoCountLabel(count: number): string {
  return count === 1 ? "1 photo" : `${count} photos`;
}

/** "Eleven", for the multi-day lede that opens with the day count. */
function _dayCountWord(count: number): string {
  const word = spellSmallNumber(count);
  return `${word.charAt(0).toUpperCase()}${word.slice(1)}`;
}

/**
 * Surface 16's `upload` state, which is also `upload-narrowed`: the payload
 * cannot tell the two apart, because narrowing is only a smaller count.
 */
function _oneDayBody(payload: UploadSessionEmailPayload): React.JSX.Element {
  return (
    <>
      <Text style={styles.paragraph}>
        {`${_weekdayDayLabel(payload.capturedOn)}.`}
        {payload.milestoneName === null ? null : (
          <>
            {" That day is now a milestone: "}
            <b>{payload.milestoneName}</b>
            {"."}
          </>
        )}
      </Text>
      <Link style={styles.action} href={payload.dayUrl}>
        See the day
      </Link>
      <Text style={styles.paragraph}>
        This is one email for the whole lot, not one per photograph. It only
        ever arrives when somebody finishes putting a batch up.
      </Text>
      <Text style={styles.paragraph}>
        You are getting it because you can see at least one of them.
      </Text>
    </>
  );
}

/**
 * Surface 16's `upload-multi-day` state.
 *
 * Its milestone sentence says "the last of them", which is the only copy that
 * was drawn, so it renders only when the milestone's day is the last day.
 */
function _manyDaysBody(payload: UploadSessionEmailPayload): React.JSX.Element {
  const isMilestoneOnLastDay =
    payload.milestoneName !== null &&
    payload.capturedOn === payload.lastCapturedOn;
  return (
    <>
      <Text style={styles.paragraph}>
        {`${_dayCountWord(payload.visibleDayCount)} days between `}
        <b>{_spanStartLabel(payload)}</b>
        {" and "}
        <b>{_longDayLabel(payload.lastCapturedOn)}</b>
        {"."}
        {isMilestoneOnLastDay ? (
          <>
            {" The last of them is now a milestone: "}
            <b>{payload.milestoneName}</b>
            {"."}
          </>
        ) : null}
      </Text>
      <Text style={styles.paragraph}>
        <b>This is one email for the whole lot.</b>
        {` Not ${payload.visibleItemCount} emails, and not one per day.`}
      </Text>
      <Link style={styles.action} href={payload.dayUrl}>
        See them
      </Link>
      <Text style={styles.paragraph}>
        You are getting this because you can see at least one of them.
      </Text>
    </>
  );
}

/**
 * `upload_session`: surface 16, states `upload`, `upload-narrowed` and
 * `upload-multi-day`.
 *
 * One template in three shapes (step 6a design, decision 5). Narrowed is the
 * one-day shape with a smaller `visibleItemCount`, because the count is this
 * recipient's own (Decision 4); multi-day is `visibleDayCount > 1`.
 */
export function UploadSessionEmail({ payload }: Props): React.JSX.Element {
  return (
    <EmailShell
      shoeboxName={payload.shoeboxName}
      preferencesUrl={payload.preferencesUrl}
    >
      <Text style={styles.heading}>{uploadSessionEmail.subject(payload)}</Text>
      {payload.visibleDayCount > 1
        ? _manyDaysBody(payload)
        : _oneDayBody(payload)}
    </EmailShell>
  );
}

/** The kind's copy, as the queue consumes it. */
export const uploadSessionEmail: EmailTemplate<UploadSessionEmailPayload> = {
  /** Who put up how many of this reader's photos, and from when. */
  subject: (payload) => {
    const count = _photoCountLabel(payload.visibleItemCount);
    return payload.visibleDayCount > 1
      ? `${payload.uploaderDisplayName} put up ${count}, from ${payload.visibleDayCount} days`
      : `${payload.uploaderDisplayName} put up ${count} from ${_shortDayLabel(payload.capturedOn)}`;
  },

  /** Renders the full message, ready for the send queue. */
  render: (payload) => {
    return renderEmail(<UploadSessionEmail payload={payload} />);
  },
};

const styles = {
  heading: {
    fontSize: "24px",
    fontWeight: "bold",
    lineHeight: "1.2",
    margin: "24px 0 0",
  },

  paragraph: {
    margin: "16px 0 0",
  },

  action: {
    display: "inline-block",
    margin: "20px 0 0",
    textDecoration: "underline",
  },
};
