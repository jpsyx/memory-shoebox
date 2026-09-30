import { Link, Text } from "@react-email/components";
import { renderEmail } from "../lib/renderEmail.ts";
import { EmailShell } from "../lib/EmailShell.tsx";
import { EMAIL_THEME } from "../lib/emailTheme.ts";
import type { EmailTemplate } from "../emailTemplate.types.ts";
import type { CommentEmailPayload } from "@memory-shoebox/shared";

type Props = {
  payload: CommentEmailPayload;
};

/** "14 September 2026", in the Shoebox's own zone and one language. */
function _formatCapturedOn(payload: CommentEmailPayload): string {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: payload.timezone,
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(new Date(`${payload.itemCapturedOn}T12:00:00.000Z`));
}

/** Whose photograph it is, and how this reader is connected to it. */
function _lede(payload: CommentEmailPayload): string {
  const day = _formatCapturedOn(payload);
  return payload.relation === "uploader"
    ? `On a photo you put up on ${day}.`
    : `${payload.uploaderDisplayName} put it up on ${day}, and you wrote on it.`;
}

/** Why this message arrived, which is different for each reader. */
function _reason(payload: CommentEmailPayload): string {
  return payload.relation === "uploader"
    ? "You are getting this because you put the photo up. Everyone else who has written on it got one too: one email each, not one per reply."
    : "You are getting this because you wrote on it too. Turn this one off on its own if you would rather only hear about your own photos.";
}

/**
 * `comment`: surface 16, states `comment` and `comment-reply`.
 *
 * The comment itself is quoted, because a grandmother who never opens the
 * link still reads what was said. That is also the limit the product cannot
 * fix: an edit cannot catch a message already delivered.
 */
export function CommentEmail({ payload }: Props): React.JSX.Element {
  return (
    <EmailShell
      shoeboxName={payload.shoeboxName}
      preferencesUrl={payload.preferencesUrl}
    >
      <Text style={styles.heading}>{commentEmail.subject(payload)}</Text>
      <Text style={styles.paragraph}>{_lede(payload)}</Text>
      <Text style={styles.quote}>{payload.body}</Text>
      <Link style={styles.action} href={payload.itemUrl}>
        Read it and answer
      </Link>
      <Text style={styles.paragraph}>{_reason(payload)}</Text>
    </EmailShell>
  );
}

/** The kind's copy, as the queue consumes it. */
export const commentEmail: EmailTemplate<CommentEmailPayload> = {
  subject: (payload) => {
    return payload.relation === "uploader"
      ? `${payload.authorDisplayName} wrote on one of your photos`
      : `${payload.authorDisplayName} has written on that photo too`;
  },

  render: (payload) => {
    return renderEmail(<CommentEmail payload={payload} />);
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

  quote: {
    borderLeft: `2px solid ${EMAIL_THEME.ink}`,
    fontStyle: "italic" as const,
    margin: "16px 0 0",
    padding: "0 0 0 16px",
  },

  action: {
    display: "inline-block",
    margin: "20px 0 0",
    textDecoration: "underline",
  },
};
