import { Text } from "@react-email/components";

import { renderEmail } from "../lib/renderEmail.ts";

import { EmailShell } from "../lib/EmailShell/EmailShell.tsx";

import { EMAIL_THEME } from "../lib/emailTheme.ts";

import { spellSmallNumber } from "../lib/spellSmallNumber.ts";

import type { EmailTemplate } from "../emailTemplate.types.ts";

import type { SignInCodeEmailPayload } from "@memory-shoebox/shared";

type Props = {
  payload: SignInCodeEmailPayload;
};

const REASSURANCE =
  "If you did not ask for this, somebody typed your address by mistake. Nothing has happened and you can ignore it.";

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

  render: (payload) => {
    return renderEmail(<SignInCodeEmail payload={payload} />);
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
    fontSize: "16px",
    lineHeight: "24px",
    margin: "16px 0 0",
  },
};
