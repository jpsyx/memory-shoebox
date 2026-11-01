import { Link, Text } from "@react-email/components";
import type { CommentTagEmailPayload } from "@memory-shoebox/shared";
import type { EmailTemplate } from "../emailTemplate.types.ts";
import { EmailShell } from "../lib/EmailShell/EmailShell.tsx";
import { renderEmail } from "../lib/renderEmail.ts";
import { EMAIL_THEME } from "../lib/emailTheme.ts";
import {
  EMAIL_ACTION_STYLE,
  EMAIL_PARAGRAPH_STYLE,
} from "../lib/emailReadingStyles.constants.ts";

type Props = { payload: CommentTagEmailPayload };

function _captureDate(payload: CommentTagEmailPayload): string {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "UTC",
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(new Date(`${payload.itemCapturedOn}T12:00:00Z`));
}

function _momentLabel(seconds: number): string {
  return `At ${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, "0")}`;
}

/** Text-first explicit tag notification with a precise comment destination. */
export function CommentTagEmail({
  payload,
}: Readonly<Props>): React.JSX.Element {
  return (
    <EmailShell
      shoeboxName={payload.shoeboxName}
      preferencesUrl={payload.preferencesUrl}
      preferencesLabel="Change comment-tag emails"
    >
      <Text style={styles.heading}>{commentTagEmail.subject(payload)}</Text>
      <Text
        style={EMAIL_PARAGRAPH_STYLE}
      >{`On a ${payload.itemKind} from ${_captureDate(payload)}.`}</Text>
      {payload.atSeconds === null ? null : (
        <Text style={EMAIL_PARAGRAPH_STYLE}>
          {_momentLabel(payload.atSeconds)}
        </Text>
      )}
      <Text style={styles.quote}>
        {payload.body.split("\n").map((line, index) => {
          return (
            <span key={index}>
              {index === 0 ? null : <br />}
              {line}
            </span>
          );
        })}
      </Text>
      <Link style={EMAIL_ACTION_STYLE} href={payload.itemUrl}>
        View comment
      </Link>
      <Text
        style={EMAIL_PARAGRAPH_STYLE}
      >{`You're receiving this because ${payload.authorDisplayName} tagged you in a comment.`}</Text>
    </EmailShell>
  );
}

/** Queue registry entry for explicit comment tags. */
export const commentTagEmail: EmailTemplate<CommentTagEmailPayload> = {
  subject: (payload) => {
    return `${payload.authorDisplayName} tagged you in a comment.`;
  },
  render: (payload) => {
    return renderEmail(<CommentTagEmail payload={payload} />);
  },
};

const styles = {
  heading: {
    fontSize: "24px",
    fontWeight: "bold",
    lineHeight: "1.2",
    margin: "24px 0 0",
  },
  quote: {
    fontSize: "16px",
    lineHeight: "24px",
    borderLeft: `2px solid ${EMAIL_THEME.ink}`,
    fontStyle: "italic" as const,
    margin: "16px 0 0",
    padding: "0 0 0 16px",
  },
};
