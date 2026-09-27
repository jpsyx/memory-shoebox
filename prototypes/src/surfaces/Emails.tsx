import { Stack } from "@mantine/core";
import type { ReactNode } from "react";
import { SHOEBOX_NAME } from "@/data/fixtures";
import { TopBar } from "@/system/Chrome";
import { LabelText, Lede, Prose } from "@/system/typography";
import classes from "@/system/system.module.css";
import mail from "@/surfaces/Emails.module.css";
import type { Surface } from "@/surfaces/registry";

interface Envelope {
  readonly from: string;
  readonly to: string;
  readonly subject: string;
  readonly preview: string;
}

/**
 * One email, shown twice: as a client with images and styles on would render
 * it, and as the plain-text alternative a client with them off will show
 * instead. Both have to stand on their own, because for some members in this
 * audience the second one is the only version that ever arrives.
 */
function Email({
  envelope,
  children,
  plain,
}: {
  readonly envelope: Envelope;
  readonly children: ReactNode;
  readonly plain: string;
}) {
  return (
    <div className={mail.client}>
      <div className={classes.sheet}>
        <div className={mail.envelope}>
          <span className={mail.envelopeLabel}>From</span>
          <span className={mail.envelopeValue}>{envelope.from}</span>
          <span className={mail.envelopeLabel}>To</span>
          <span className={mail.envelopeValue}>{envelope.to}</span>
          <span className={mail.envelopeLabel}>Subject</span>
          <span className={`${mail.envelopeValue} ${mail.envelopeSubject}`}>
            {envelope.subject}
          </span>
          <span className={mail.envelopeLabel}>Preview</span>
          <span className={mail.envelopeValue}>{envelope.preview}</span>
        </div>
        <div className={mail.body}>
          <div className={mail.sheetInner}>
            <p className={mail.masthead}>{SHOEBOX_NAME}</p>
            {children}
            <div className={mail.footer}>
              <p>
                This went to you because you are in {SHOEBOX_NAME}. Nobody
                outside it can see anything here.
              </p>
              <p>
                <a href="#settings">Turn these emails off</a> · Memory Shoebox,
                which you can <a href="#source">get the source of</a>.
              </p>
            </div>
          </div>
        </div>
      </div>

      <div className={mail.plain}>
        <LabelText component="h3">The plain-text version</LabelText>
        <pre className={mail.plainBody}>{plain}</pre>
      </div>
    </div>
  );
}

type EmailState =
  | "code"
  | "invitation"
  | "upload"
  | "upload-narrowed"
  | "comment"
  | "removal-request"
  | "removal-gone"
  | "removal-declined"
  | "removal-reminder"
  | "removal-withdrawn";

function EmailsSurface({ state }: { readonly state: EmailState }) {
  return (
    <>
      <TopBar back="Back to my account" />
      <main className={classes.pageWide}>
        <Stack gap="lg">
          <Lede>
            {state === "code"
              ? "The sign-in code."
              : state === "invitation"
                ? "The invitation."
                : state === "upload"
                  ? "A day went up."
                  : state === "upload-narrowed"
                    ? "The same batch, to somebody who can see three of it."
                    : state === "comment"
                      ? "Somebody wrote something."
                      : state === "removal-gone"
                        ? "It is gone."
                        : state === "removal-declined"
                          ? "It is staying up, and why."
                          : state === "removal-reminder"
                            ? "Still waiting, a week later."
                            : state === "removal-withdrawn"
                              ? "Never mind, she says."
                              : "Somebody asked for a photograph to come down."}
          </Lede>
          <Prose onPanel>
            Emails are the only surface most viewers see regularly, because they
            are the thing that brings somebody back. Each one has to read well
            in a plain client and survive being forwarded, so none of them uses
            the archive's typefaces, its palette, or any layout that needs a
            modern renderer.
          </Prose>

          {state === "code" ? (
            <Email
              envelope={{
                from: `${SHOEBOX_NAME} <shoebox@example.com>`,
                to: "rosa@example.com",
                subject: "Your code is 410233",
                preview: "It works for ten minutes. Nobody else can use it.",
              }}
              plain={`${SHOEBOX_NAME.toUpperCase()}

Your code is

    410233

Type it into the page you left open. It works for ten
minutes and then it stops.

If you did not ask for this, somebody typed your address
by mistake. Nothing has happened and you can ignore it.

--
This went to you because you are in ${SHOEBOX_NAME}.`}
            >
              <h1 className={mail.heading}>Your code</h1>
              <p className={mail.code}>410233</p>
              <p className={mail.paragraph}>
                Type it into the page you left open. It works for ten minutes
                and then it stops.
              </p>
              <p className={mail.paragraph}>
                If you did not ask for this, somebody typed your address by
                mistake. Nothing has happened and you can ignore it.
              </p>
            </Email>
          ) : null}

          {state === "invitation" ? (
            <Email
              envelope={{
                from: `${SHOEBOX_NAME} <shoebox@example.com>`,
                to: "tomas@example.com",
                subject: `Papá has added you to ${SHOEBOX_NAME}`,
                preview:
                  "2,147 photos and videos of Mateo, and nobody else can see them.",
              }}
              plain={`${SHOEBOX_NAME.toUpperCase()}

Papá has added you to ${SHOEBOX_NAME}.

It holds 2,147 photos and videos of Mateo and the rest of
the family. Only the nine people in it can see
them. There is nothing to install and no password.

To open it, go to

    https://example.com/join

and put in this address: tomas@example.com
We will email you a six-digit code to type in.

This invitation lasts seven days.

--
Sent by Papá (andres@example.com).`}
            >
              <h1 className={mail.heading}>
                Papá has added you to {SHOEBOX_NAME}
              </h1>
              <p className={mail.paragraph}>
                It holds 2,147 photos and videos of Mateo and the rest of the
                family. Only the nine people in it can see them. There is
                nothing to install and no password to make up.
              </p>
              <a className={mail.action} href="#join">
                Open {SHOEBOX_NAME}
              </a>
              <p className={mail.paragraph}>
                It will ask for this address, <b>tomas@example.com</b>, and then
                email you a six-digit code to type in. That is the whole thing.
              </p>
              <p className={mail.paragraph}>
                This invitation lasts seven days. Sent by Papá
                (andres@example.com).
              </p>
            </Email>
          ) : null}

          {state === "upload" ? (
            <Email
              envelope={{
                from: `${SHOEBOX_NAME} <shoebox@example.com>`,
                to: "rosa@example.com",
                subject: "Papá put up 210 photos from 14 September",
                preview: "Mateo is born. One email for the whole lot.",
              }}
              plain={`${SHOEBOX_NAME.toUpperCase()}

Papá put up 210 photos and videos from
Monday 14 September 2026.

That day is now a milestone: Mateo is born.

See them:
    https://example.com/day/2026-09-14

This is one email for the whole lot, not one per
photograph. It only ever arrives when somebody finishes
putting a batch up.

--
This went to you because you can see at least one of them.`}
            >
              <h1 className={mail.heading}>
                Papá put up 210 photos from 14 September
              </h1>
              <p className={mail.paragraph}>
                Monday 14 September 2026. That day is now a milestone:{" "}
                <b>Mateo is born</b>.
              </p>
              <a className={mail.action} href="#day">
                See the day
              </a>
              <p className={mail.paragraph}>
                This is one email for the whole lot, not one per photograph. It
                only ever arrives when somebody finishes putting a batch up.
              </p>
              <p className={mail.paragraph}>
                You are getting it because you can see at least one of them.
              </p>
            </Email>
          ) : null}

          {state === "comment" ? (
            <Email
              envelope={{
                from: `${SHOEBOX_NAME} <shoebox@example.com>`,
                to: "andres@example.com",
                subject: "Abuela Rosa wrote on one of your photos",
                preview: "Ay, mi amor. I have been awake since four waiting...",
              }}
              plain={`${SHOEBOX_NAME.toUpperCase()}

Abuela Rosa wrote on a photo you put up on
14 September 2026.

    "Ay, mi amor. I have been awake since four waiting
    for this. He has your father's chin, I am telling
    you now so you cannot argue later."

Read it and answer:
    https://example.com/item/4620

You are getting this because you put the photo up.
Everyone else who has written on it got it too, in one
email each, not one per reply.

--
This went to you because you are in ${SHOEBOX_NAME}.`}
            >
              <h1 className={mail.heading}>
                Abuela Rosa wrote on one of your photos
              </h1>
              <p className={mail.paragraph}>
                On a photo you put up on 14 September 2026.
              </p>
              <p className={mail.quote}>
                Ay, mi amor. I have been awake since four waiting for this. He
                has your father's chin, I am telling you now so you cannot argue
                later.
              </p>
              <a className={mail.action} href="#item">
                Read it and answer
              </a>
              <p className={mail.paragraph}>
                You are getting this because you put the photo up. Everyone else
                who has written on it got one too: one email each, not one per
                reply.
              </p>
            </Email>
          ) : null}

          {state === "removal-request" ? (
            <Email
              envelope={{
                from: `${SHOEBOX_NAME} <shoebox@example.com>`,
                to: "andres@example.com, and 2 admins",
                subject: "Inés has asked for a photo to come down",
                preview: "She is tagged in it. Nothing has happened yet.",
              }}
              plain={`${SHOEBOX_NAME.toUpperCase()}

Prima Ines has asked for a photo to come down.

She is tagged in it. You put it up on
14 September 2026.

What she said:

    "I am mid-sentence and it is not a good one.
    Sorry to be a bother."

Nothing has happened to the photo. It is still there and
everybody who could see it still can, until you or an
admin does something.

Have a look:
    https://example.com/requests

You can delete it, or keep it and tell her why. Either is
fine; leaving it is not, because she is waiting.

--
This went to you and to every admin.`}
            >
              <h1 className={mail.heading}>
                Inés has asked for a photo to come down
              </h1>
              <p className={mail.paragraph}>
                She is tagged in it. You put it up on 14 September 2026.
              </p>
              <p className={mail.quote}>
                I am mid-sentence and it is not a good one. Sorry to be a
                bother.
              </p>
              <p className={mail.paragraph}>
                <b>Nothing has happened to the photo.</b> It is still there and
                everybody who could see it still can, until you or an admin does
                something.
              </p>
              <a className={mail.action} href="#requests">
                Have a look
              </a>
              <p className={mail.paragraph}>
                You can delete it, or keep it and tell her why. Either is fine;
                leaving it is not, because she is waiting.
              </p>
              <p className={mail.paragraph}>
                This went to you and to every admin.
              </p>
            </Email>
          ) : null}

          {state === "upload-narrowed" ? (
            <Email
              envelope={{
                from: `${SHOEBOX_NAME} <shoebox@example.com>`,
                to: "ines@example.com",
                subject: "Papá put up 3 photos from 14 September",
                preview: "The same morning, counted for you.",
              }}
              plain={`${SHOEBOX_NAME.toUpperCase()}

Papa put up 3 photos and videos from
Monday 14 September 2026.

That day is now a milestone: Mateo is born.

See them:
    https://example.com/day/2026-09-14

--
This went to you because you can see at least one of them.`}
            >
              <h1 className={mail.heading}>
                Papá put up 3 photos from 14 September
              </h1>
              <p className={mail.paragraph}>
                Monday 14 September 2026. That day is now a milestone:{" "}
                <b>Mateo is born</b>.
              </p>
              <a className={mail.action} href="#day">
                See them
              </a>
              <p className={mail.paragraph}>
                You are getting this because you can see at least one of them.
              </p>
            </Email>
          ) : null}

          {state === "removal-gone" ? (
            <Email
              envelope={{
                from: `${SHOEBOX_NAME} <shoebox@example.com>`,
                to: "ines@example.com",
                subject: "That photo has come down",
                preview: "Papá took it down. It is gone.",
              }}
              plain={`${SHOEBOX_NAME.toUpperCase()}

The photo you asked about has come down.

Papa took it down on 16 September 2026. It is gone: the
picture and the file behind it. Nobody in ${SHOEBOX_NAME} can
open it any more.

You do not have to do anything, and you do not have to
thank anybody. Asking was the right thing to do.

--
This went to you because you asked.`}
            >
              <h1 className={mail.heading}>That photo has come down</h1>
              <p className={mail.paragraph}>
                Papá took it down on 16 September 2026. It is gone: the picture
                and the file behind it. Nobody in {SHOEBOX_NAME} can open it any
                more.
              </p>
              <p className={mail.paragraph}>
                You do not have to do anything, and you do not have to thank
                anybody. Asking was the right thing to do.
              </p>
            </Email>
          ) : null}

          {state === "removal-declined" ? (
            <Email
              envelope={{
                from: `${SHOEBOX_NAME} <shoebox@example.com>`,
                to: "ines@example.com",
                subject: "Papá has kept that photo up, and said why",
                preview:
                  "It is the only one with all four of you in it, so I have...",
              }}
              plain={`${SHOEBOX_NAME.toUpperCase()}

Papa has kept that photo up.

What he said:

    "It is the only one with all four of you in it, so
    I have made it so only the six of us can see it
    rather than everybody. If you still want it gone,
    say so and it goes."

The photo is still there. Who can see it may have
changed.

Have a look:
    https://example.com/item/4691

If you are not happy with that, ask again, or tell an
admin. Nobody will think less of you for it.

--
This went to you because you asked.`}
            >
              <h1 className={mail.heading}>
                Papá has kept that photo up, and said why
              </h1>
              <p className={mail.quote}>
                It is the only one with all four of you in it, so I have made it
                so only the six of us can see it rather than everybody. If you
                still want it gone, say so and it goes.
              </p>
              <p className={mail.paragraph}>
                The photo is still there. Who can see it may have changed.
              </p>
              <a className={mail.action} href="#item">
                Have a look
              </a>
              <p className={mail.paragraph}>
                If you are not happy with that, ask again, or tell an admin.
                Nobody will think less of you for it.
              </p>
            </Email>
          ) : null}

          {state === "removal-reminder" ? (
            <Email
              envelope={{
                from: `${SHOEBOX_NAME} <shoebox@example.com>`,
                to: "andres@example.com, and 2 admins",
                subject: "Inés is still waiting on that photo",
                preview: "Asked a week ago. Nothing has happened yet.",
              }}
              plain={`${SHOEBOX_NAME.toUpperCase()}

Prima Ines asked for a photo to come down a week ago,
on 14 September 2026, and nothing has happened yet.

What she said:

    "I am mid-sentence and it is not a good one.
    Sorry to be a bother."

Take a look:
    https://example.com/requests

Delete it, or keep it and tell her why. Either is an
answer. This will keep arriving once a week until one of
you does one or the other, because she has no way of
knowing whether anybody saw it.

--
This went to you and to every admin.`}
            >
              <h1 className={mail.heading}>
                Inés is still waiting on that photo
              </h1>
              <p className={mail.paragraph}>
                She asked a week ago, on 14 September 2026, and nothing has
                happened yet.
              </p>
              <p className={mail.quote}>
                I am mid-sentence and it is not a good one. Sorry to be a
                bother.
              </p>
              <a className={mail.action} href="#requests">
                Take a look
              </a>
              <p className={mail.paragraph}>
                Delete it, or keep it and tell her why. Either is an answer.
                This will keep arriving once a week until one of you does one or
                the other, because she has no way of knowing whether anybody saw
                it.
              </p>
            </Email>
          ) : null}

          {state === "removal-withdrawn" ? (
            <Email
              envelope={{
                from: `${SHOEBOX_NAME} <shoebox@example.com>`,
                to: "andres@example.com, and 2 admins",
                subject: "Never mind about that photo",
                preview: "Inés has taken her request back. Nothing to do.",
              }}
              plain={`${SHOEBOX_NAME.toUpperCase()}

Prima Ines has taken back what she asked.

She asked about a photo from 14 September 2026, and on
17 September she withdrew it. There is nothing for you
to do.

The photo has not been touched. It is still there and
the same people can still see it.

Have a look:
    https://example.com/item/4691

--
This went to you and to every admin, because you were
the ones asked.`}
            >
              <h1 className={mail.heading}>Never mind about that photo</h1>
              <p className={mail.paragraph}>
                Prima Inés asked about a photo from 14 September 2026, and on 17
                September she took the request back. There is nothing for you to
                do.
              </p>
              <p className={mail.paragraph}>
                The photo has not been touched. It is still there and the same
                people can still see it.
              </p>
              <a className={mail.action} href="#item">
                Have a look
              </a>
            </Email>
          ) : null}
        </Stack>
      </main>
    </>
  );
}

export const emailsSurface: Surface = {
  id: "emails",
  number: 16,
  title: "Transactional emails",
  who: "every member",
  group: "admin",
  blurb:
    "The only surface most viewers see regularly, because it is the thing that brings somebody back. Each has to read well in a plain client and survive being forwarded.",
  states: [
    {
      id: "code",
      label: "Sign-in code",
      note: "Six digits in monospace at 34px, selectable as text. The subject line carries the code so it can be read from a lock screen.",
      render: () => {
        return <EmailsSurface state="code" />;
      },
    },
    {
      id: "invitation",
      label: "Invitation",
      note: "Names the person who invited them and says what they are joining. Also says there is nothing to install and no password.",
      render: () => {
        return <EmailsSurface state="invitation" />;
      },
    },
    {
      id: "upload",
      label: "Upload session",
      note: "One email for a 210-photo batch, and it says so, because a member who fears 210 emails turns notifications off forever.",
      render: () => {
        return <EmailsSurface state="upload" />;
      },
    },
    {
      id: "upload-narrowed",
      label: "The same batch, counted for one person",
      note: "Prima Inés can see three of those 210, so her email says three. The count is never a shared total: that would be a side channel saying how much exists beyond what she can open.",
      render: () => {
        return <EmailsSurface state="upload-narrowed" />;
      },
    },
    {
      id: "comment",
      label: "New comment",
      note: "The comment itself is in the email, so a grandmother who never opens the link still reads what was said.",
      render: () => {
        return <EmailsSurface state="comment" />;
      },
    },
    {
      id: "removal-request",
      label: "Removal request",
      note: "Leads with the fact that nothing has happened yet, because that is the thing the uploader will otherwise assume wrongly.",
      render: () => {
        return <EmailsSurface state="removal-request" />;
      },
    },
    {
      id: "removal-gone",
      label: "The photo came down",
      note: "Closes the loop for the person who asked, so they never have to work up the nerve to ask a second time. It also tells them they were right to ask.",
      render: () => {
        return <EmailsSurface state="removal-gone" />;
      },
    },
    {
      id: "removal-declined",
      label: "It is staying up, and why",
      note: "Carries the uploader's own words rather than a template. A no with a reason is a conversation; a no without one is the phone call this whole flow exists to prevent.",
      render: () => {
        return <EmailsSurface state="removal-declined" />;
      },
    },
    {
      id: "removal-reminder",
      label: "A week later, still nothing",
      note: "Silence is the failure mode the removal flow is built to avoid, so it is the one email in the product that chases. It says it will keep coming, and why.",
      render: () => {
        return <EmailsSurface state="removal-reminder" />;
      },
    },
    {
      id: "removal-withdrawn",
      label: "Never mind",
      note: "The mirror of the request, to the people who were asked rather than the one who asked. They were told somebody wanted a photograph down and chased weekly about it, so they are told when that stops. It is the shortest email in the product on purpose: the whole message is the removal of a task, and a second sentence makes it read like a new one.",
      render: () => {
        return <EmailsSurface state="removal-withdrawn" />;
      },
    },
  ],
};
