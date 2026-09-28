import {
  Body,
  Container,
  Head,
  Hr,
  Html,
  Link,
  Section,
  Text,
} from "@react-email/components";
import { EMAIL_THEME, SOURCE_URL } from "./emailTheme.ts";
import type { ReactNode } from "react";

type Props = {
  /**
   * The instance's own name, resolved at enqueue and carried in the payload.
   */
  shoeboxName: string;
  /**
   * Null for `sign_in_code`, and only for it: offering to turn off a message
   * that cannot be turned off is a lie.
   */
  preferencesUrl: string | null;
  children: ReactNode;
};

/**
 * The masthead, the column and the footer every message shares.
 *
 * **There is deliberately no preview line.** react-email's `Preview` hides a
 * line of text for the inbox list, and that text reappears at the top of the
 * plain-text rendering, where it reads as the message saying itself twice.
 */
export function EmailShell({
  shoeboxName,
  preferencesUrl,
  children,
}: Readonly<Props>): React.JSX.Element {
  return (
    <Html>
      <Head />
      <Body style={styles.body}>
        <Container style={styles.container}>
          <Text style={styles.masthead}>{shoeboxName}</Text>
          <Hr style={styles.mastheadRule} />
          <Section>{children}</Section>
          <Hr style={styles.footerRule} />
          <Section>
            <Text style={styles.footerText}>
              {`This went to you because you are in ${shoeboxName}. Nobody outside it can see anything here.`}
            </Text>
            <Text style={styles.footerText}>
              {preferencesUrl === null ? null : (
                <>
                  <Link href={preferencesUrl} style={styles.footerLink}>
                    Turn these emails off
                  </Link>
                  {" · "}
                </>
              )}
              {"Memory Shoebox, which you can "}
              <Link href={SOURCE_URL} style={styles.footerLink}>
                get the source of
              </Link>
              {"."}
            </Text>
          </Section>
        </Container>
      </Body>
    </Html>
  );
}

const styles = {
  body: {
    backgroundColor: EMAIL_THEME.paper,
    color: EMAIL_THEME.ink,
    fontFamily: EMAIL_THEME.fontFamily,
    fontSize: "16px",
    lineHeight: "1.5",
    margin: 0,
    padding: "24px",
  },

  container: {
    margin: "0 auto",
    maxWidth: EMAIL_THEME.columnWidth,
  },

  masthead: {
    fontSize: "18px",
    fontWeight: "bold",
    margin: 0,
  },

  mastheadRule: {
    borderColor: EMAIL_THEME.ink,
    borderTopWidth: "2px",
    margin: "12px 0 0",
  },

  footerRule: {
    borderColor: EMAIL_THEME.rule,
    margin: "28px 0 16px",
  },

  footerText: {
    color: EMAIL_THEME.quietInk,
    fontSize: "14px",
    margin: "0 0 8px",
  },

  footerLink: {
    color: EMAIL_THEME.ink,
  },
};
