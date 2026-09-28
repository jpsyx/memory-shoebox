import { Text } from "@react-email/components";
import { render } from "@react-email/render";
import { EmailShell } from "../lib/EmailShell.tsx";
import { EMAIL_THEME } from "../lib/emailTheme.ts";
import { spellSmallNumber } from "../lib/spellSmallNumber.ts";
import type { EmailTemplate } from "../emailTemplate.types.ts";
import type { SignInCodeEmailPayload } from "@memory-shoebox/shared";

const REASSURANCE =
  "If you did not ask for this, somebody typed your address by mistake. Nothing has happened and you can ignore it.";

/**
 * Columns the plain-text alternative wraps at.
 *
 * 58 rather than a rounder number because it is the width the mockups in
 * `prototypes/src/surfaces/Emails.tsx` were written at: at 58 the sign-in
 * code's two wrapped sentences break exactly where the prototype breaks them.
 */
const PLAIN_TEXT_COLUMNS = 58;

type Props = {
  payload: SignInCodeEmailPayload;
};

/**
 * `sign_in_code`: surface 16, state `code`.
 *
 * The six digits are in the subject deliberately, so the code reads off a lock
 * screen without opening anything. That is also why both the payload and the
 * subject are scrubbed once the row is terminal: the subject column is
 * otherwise a permanent log of live-looking codes sitting beside the address
 * each was sent to.
 *
 * The footer carries no preferences link, because a sign-in code is the one
 * message nobody may turn off.
 */
export function SignInCodeEmail({ payload }: Props): React.JSX.Element {
  return (
    <EmailShell
      shoeboxName={payload.shoeboxName}
      preferencesUrl={payload.preferencesUrl}
    >
      <Text style={styles.heading}>Your code</Text>
      <Text style={styles.code}>{payload.code}</Text>
      <Text style={styles.paragraph}>
        {`Type it into the page you left open. It works for ${spellSmallNumber(payload.expiresInMinutes)} minutes and then it stops.`}
      </Text>
      <Text style={styles.paragraph}>{REASSURANCE}</Text>
    </EmailShell>
  );
}

/** The kind's copy, as the queue consumes it. */
export const signInCodeEmail: EmailTemplate<SignInCodeEmailPayload> = {
  subject: (payload) => {
    return `Your code is ${payload.code}`;
  },

  render: async (payload) => {
    const element = <SignInCodeEmail payload={payload} />;
    return {
      html: await render(element),
      text: await render(element, {
        plainText: true,
        htmlToTextOptions: { wordwrap: PLAIN_TEXT_COLUMNS },
      }),
    };
  },
};

const styles = {
  heading: {
    fontSize: "24px",
    fontWeight: "bold",
    lineHeight: "1.2",
    margin: "24px 0 0",
  },

  code: {
    border: `2px solid ${EMAIL_THEME.ink}`,
    fontFamily: "'Courier New',Courier,monospace",
    fontSize: "34px",
    fontWeight: "bold",
    letterSpacing: "0.35em",
    margin: "20px 0 0",
    padding: "16px",
    textAlign: "center" as const,
  },

  paragraph: {
    margin: "16px 0 0",
  },
};
