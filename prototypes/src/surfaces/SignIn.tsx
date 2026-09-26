import { Anchor, Button, Stack, TextInput } from "@mantine/core";
import { IconAlertCircle } from "@tabler/icons-react";
import { INSTANCE_TITLE } from "@/data/fixtures";
import { Card, Centred, TopBar } from "@/system/Chrome";
import { ICON_PROPS } from "@/system/icons";
import { Lede, Prose } from "@/system/typography";
import classes from "@/system/system.module.css";
import type { Surface } from "@/surfaces/registry";

type SignInState =
  | "email"
  | "sent"
  | "wrong"
  | "expired"
  | "resent"
  | "unknown"
  | "link";

const LEDE: Record<SignInState, string> = {
  email: "Sign in to Our circle.",
  sent: "Check your email.",
  wrong: "Check your email.",
  expired: "Check your email.",
  resent: "Check your email.",
  unknown: "Check your email.",
  link: "Somebody sent you a link into Our circle.",
};

/**
 * The code field. One wide field with tracked tabular figures rather than six
 * separate boxes: six boxes are fiddly to fill on a phone, they break paste,
 * and they are the sort of invented control this audience has to be taught.
 */
function CodeField({
  value,
  error,
}: {
  readonly value: string;
  readonly error?: string;
}) {
  return (
    <TextInput
      label="The six digits we just emailed you"
      inputMode="numeric"
      autoComplete="one-time-code"
      maxLength={6}
      defaultValue={value}
      error={
        error === undefined ? undefined : (
          <>
            <IconAlertCircle {...ICON_PROPS} />
            {error}
          </>
        )
      }
      classNames={{ input: classes.codeField }}
    />
  );
}

function SignInSurface({ state }: { readonly state: SignInState }) {
  const wantsCode = state !== "email" && state !== "link";

  return (
    <>
      <TopBar title={INSTANCE_TITLE} detail="Sign in" />
      <Centred>
        <Card>
          <Stack gap="sm">
            <Lede>{LEDE[state]}</Lede>

            {state === "link" ? (
              <Prose>
                Sign in and it opens on the one you were sent. Only people in
                this circle can see inside, so the link on its own will not do
                it.
              </Prose>
            ) : state === "email" ? (
              <Prose>
                We will email you a six-digit code. There is no password to
                remember and nothing to install.
              </Prose>
            ) : state === "resent" ? (
              <Prose>
                A new code is on its way to <b>abuela@example.com</b>. The old
                one has stopped working. It usually arrives in about a minute.
              </Prose>
            ) : state === "unknown" ? (
              <Prose>
                If <b>somebody@example.com</b> is in this circle, a six-digit
                code is on its way there now.
              </Prose>
            ) : (
              <Prose>
                We sent a six-digit code to <b>abuela@example.com</b>. It
                arrives in about a minute and it works for ten.
              </Prose>
            )}
          </Stack>

          <Stack gap="md" mt="lg">
            <TextInput
              label="Your email"
              type="email"
              autoComplete="email"
              inputMode="email"
              defaultValue={
                state === "email"
                  ? ""
                  : state === "unknown"
                    ? "somebody@example.com"
                    : "abuela@example.com"
              }
              placeholder="you@example.com"
            />

            {state === "sent" || state === "resent" || state === "unknown" ? (
              <CodeField value="" />
            ) : null}
            {state === "wrong" ? (
              <CodeField
                value="410233"
                error="That is not the code in the email. Two tries left before we send you a new one."
              />
            ) : null}
            {state === "expired" ? (
              <CodeField
                value="410233"
                error="That code has expired. They last ten minutes. Send another and use the newest email."
              />
            ) : null}

            <Button type="button">
              {wantsCode ? "Open the photos" : "Email me a code"}
            </Button>

            {wantsCode ? (
              <Prose>
                No code? <Anchor href="#resend">Send another</Anchor>. Check the
                junk folder too: it comes from a machine, and machines end up
                there.
              </Prose>
            ) : (
              <Prose>
                Only people who have been invited can sign in. There is no way
                to make an account here.
              </Prose>
            )}
          </Stack>
        </Card>
      </Centred>
    </>
  );
}

export const signInSurface: Surface = {
  id: "sign-in",
  number: 1,
  title: "Sign in",
  who: "anyone",
  group: "member",
  blurb:
    "First contact for the least technical person in the circle, and the only surface where failure means no access at all.",
  states: [
    {
      id: "email",
      label: "Email entry",
      note: "Nothing but an address. No password, no sign-up path, and no hint that the circle exists behind it.",
      render: () => {
        return <SignInSurface state="email" />;
      },
    },
    {
      id: "sent",
      label: "Code entry",
      note: "One wide tabular field rather than six boxes: six boxes break paste and have to be taught.",
      render: () => {
        return <SignInSurface state="sent" />;
      },
    },
    {
      id: "wrong",
      label: "Wrong code",
      note: "A 2px ink border, a bold label and a stroked icon. No red, so the state survives anyone who cannot separate the hue.",
      render: () => {
        return <SignInSurface state="wrong" />;
      },
    },
    {
      id: "expired",
      label: "Expired code",
      note: "Says what expired, how long they last, and which email to use. A generic failure here strands a grandmother.",
      render: () => {
        return <SignInSurface state="expired" />;
      },
    },
    {
      id: "resent",
      label: "Resent",
      note: "States plainly that the old code has stopped working, which is the part people get wrong.",
      render: () => {
        return <SignInSurface state="resent" />;
      },
    },
    {
      id: "unknown",
      label: "Unknown address",
      note: "Byte for byte the same as a known address. The form cannot be used to discover who is a member.",
      render: () => {
        return <SignInSurface state="unknown" />;
      },
    },
    {
      id: "link",
      label: "Arriving from a link",
      note: "Names the archive the URL already names, and nothing else: not the sharer, not the item, not a count. Open question in the summary.",
      render: () => {
        return <SignInSurface state="link" />;
      },
    },
  ],
};
