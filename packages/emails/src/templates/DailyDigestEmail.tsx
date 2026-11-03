import { Heading, Link, Text, Section } from "@react-email/components";
import type { DailyDigestEmailPayload } from "@memory-shoebox/shared";
import type { EmailTemplate } from "../emailTemplate.types.ts";
import { EmailShell } from "../lib/EmailShell/EmailShell.tsx";
import { renderEmail } from "../lib/renderEmail.ts";
import {
  EMAIL_PARAGRAPH_STYLE,
  EMAIL_ACTION_STYLE,
} from "../lib/emailReadingStyles.constants.ts";

function CommentSection({
  label,
  section,
}: Readonly<{
  label: string;
  section: DailyDigestEmailPayload["comments"];
}>): React.JSX.Element | null {
  if (section.totalEvents === 0) {
    return null;
  }
  const itemIds = [
    ...new Set(
      section.entries.map((entry) => {
        return entry.itemId;
      }),
    ),
  ];
  return (
    <Section>
      <Heading as="h2">{label}</Heading>
      <Text
        style={EMAIL_PARAGRAPH_STYLE}
      >{`${section.totalEvents} ${section.totalEvents === 1 ? "notification" : "notifications"}`}</Text>
      {itemIds.map((itemId) => {
        return (
          <Section key={itemId}>
            {section.entries
              .filter((entry) => {
                return entry.itemId === itemId;
              })
              .map((entry) => {
                return (
                  <Text key={entry.sourceId} style={EMAIL_PARAGRAPH_STYLE}>
                    <b>{entry.authorDisplayName}</b>
                    {": "}
                    {entry.excerpt}
                    <br />
                    <Link href={entry.url}>View comment</Link>
                  </Text>
                );
              })}
          </Section>
        );
      })}
    </Section>
  );
}

function UploadSection({
  section,
}: Readonly<{
  section: DailyDigestEmailPayload["uploads"];
}>): React.JSX.Element | null {
  if (section.totalEvents === 0) {
    return null;
  }
  return (
    <Section>
      <Heading as="h2">New photos/videos</Heading>
      <Text
        style={EMAIL_PARAGRAPH_STYLE}
      >{`${section.totalVisibleItems} photos/videos in ${section.totalEvents} uploads`}</Text>
      {section.entries.map((entry) => {
        return (
          <Text key={entry.sourceId} style={EMAIL_PARAGRAPH_STYLE}>
            <Link
              href={entry.url}
            >{`${entry.uploaderDisplayName}: ${entry.visibleItemCount} photos/videos`}</Link>
          </Text>
        );
      })}
    </Section>
  );
}

/** One combined daily email, with empty sections omitted. */
export function DailyDigestEmail({
  payload,
}: Readonly<{ payload: DailyDigestEmailPayload }>): React.JSX.Element {
  return (
    <EmailShell
      shoeboxName={payload.shoeboxName}
      preferencesUrl={payload.preferencesUrl}
      preferencesLabel="Change email preferences"
    >
      <Heading>Your daily digest</Heading>
      <Text style={EMAIL_PARAGRAPH_STYLE}>
        {payload.periodStart === payload.periodEnd
          ? payload.periodStart
          : `${payload.periodStart} to ${payload.periodEnd}`}
      </Text>
      <UploadSection section={payload.uploads} />
      <CommentSection label="Comments and replies" section={payload.comments} />
      <CommentSection label="Comment tags" section={payload.commentTags} />
      <Link style={EMAIL_ACTION_STYLE} href={payload.shoeboxUrl}>
        Open Shoebox
      </Link>
    </EmailShell>
  );
}

/** Queue registry entry for daily summaries. */
export const dailyDigestEmail: EmailTemplate<DailyDigestEmailPayload> = {
  subject: (payload) => {
    return `Your daily digest from ${payload.shoeboxName}`;
  },
  render: (payload) => {
    return renderEmail(<DailyDigestEmail payload={payload} />);
  },
};
