import { Heading, Link, Text, Section } from "@react-email/components";
import type { DailyDigestEmailPayload } from "@memory-shoebox/shared";
import type { EmailTemplate } from "../emailTemplate.types.ts";
import { EmailShell } from "../lib/EmailShell/EmailShell.tsx";
import { renderEmail } from "../lib/renderEmail.ts";

function CommentSection({
  label,
  section,
}: Readonly<{
  label: string;
  section: DailyDigestEmailPayload["comments"];
}>): React.JSX.Element | null {
  if (section.totalEvents === 0) return null;
  return (
    <Section>
      <Heading as="h2">{label}</Heading>
      <Text>{`${section.totalEvents} notifications`}</Text>
      {section.entries.map((entry) => (
        <Text key={entry.sourceId}>
          <b>{entry.authorDisplayName}</b>
          {": "}
          {entry.excerpt}
          <br />
          <Link href={entry.url}>View comment</Link>
        </Text>
      ))}
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
      <Text>
        {payload.periodStart === payload.periodEnd
          ? payload.periodStart
          : `${payload.periodStart} to ${payload.periodEnd}`}
      </Text>
      {payload.uploads.totalEvents === 0 ? null : (
        <Section>
          <Heading as="h2">New photos/videos</Heading>
          <Text>{`${payload.uploads.totalVisibleItems} photos/videos in ${payload.uploads.totalEvents} uploads`}</Text>
          {payload.uploads.entries.map((entry) => (
            <Text key={entry.sourceId}>
              <Link
                href={entry.url}
              >{`${entry.uploaderDisplayName}: ${entry.visibleItemCount} photos/videos`}</Link>
            </Text>
          ))}
        </Section>
      )}
      <CommentSection label="Comments and replies" section={payload.comments} />
      <CommentSection label="Comment tags" section={payload.commentTags} />
      <Link href={payload.shoeboxUrl}>Open Shoebox</Link>
    </EmailShell>
  );
}
/** Queue registry entry for daily summaries. */
export const dailyDigestEmail: EmailTemplate<DailyDigestEmailPayload> = {
  subject: (payload) => `Your daily digest from ${payload.shoeboxName}`,
  render: (payload) => renderEmail(<DailyDigestEmail payload={payload} />),
};
