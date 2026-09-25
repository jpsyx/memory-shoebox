# Product

## What Famgram is

Famgram is a self-hosted private social network for one family.

A parent runs an instance, invites the people who should see their children
grow up, and posts photos and videos. Those people log in, look, and comment.
That is the whole product.

## Who it is for

The primary user is a parent who:

- takes a lot of photos and videos of their kids,
- wants grandparents, siblings, and a few close friends to see them,
- does not want those images on a public social network or feeding a
  recommendation engine,
- is willing to run (or have someone run) a small service for them.

The secondary users are the people they invite. Those users are often much less
technical, frequently older, and often on a phone. The viewing experience has
to work for someone who will never read a setting, and the invitation flow has
to work for someone who does not want another account to manage.

Famgram was built for a family, but it is built as a product: nothing in the
codebase should assume one particular family, one particular deployment, or one
particular set of people.

## What makes it different

- **The circle is closed, not the content.** Everything in Famgram is
  linkable: every post, every photo, every video has its own URL you can paste
  into a text message. What those URLs do not do is work for a stranger. They
  resolve for members and nobody else. There is no discovery, no public
  profile, no follower graph, and no anonymous read path.
- **The archive is yours.** Media lives in your own object storage bucket in
  its original quality. Famgram indexes it; it does not own it. If the project
  disappeared tomorrow, your files would still be sitting in your bucket.
- **A small circle around a large archive.** These are different numbers and
  they pull in different directions. The audience stays in the tens: that is
  what lets one small machine be enough and lets features favor intimacy over
  throughput. The archive does not. A family that posts through a childhood
  accumulates many thousands of photos and videos over years, and it only ever
  grows. Anything that touches media has to assume that number, not the
  audience's.
- **It is cheap.** A family instance should cost a few dollars a month. Design
  decisions that would make it meaningfully more expensive to run need a good
  reason.

## Non-goals

These are not oversights. They are choices, and pull requests that add them
will be declined.

| Not building                   | Why                                                                                                                                                                                                                                                          |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Public or anonymous access     | Links are welcome, and every one of them requires a login. A URL is an address, never a credential. See "Sharing" below.                                                                                                                                     |
| An algorithmic feed            | The order is the order things happened in. Nobody wants their family ranked.                                                                                                                                                                                 |
| Follower counts, likes, reach  | This is a family, not an audience.                                                                                                                                                                                                                           |
| Advertising or tracking        | Non-negotiable.                                                                                                                                                                                                                                              |
| Multi-tenant SaaS hosting      | Famgram is software you run, not a service we run.                                                                                                                                                                                                           |
| Federation with other networks | Out of scope. It contradicts the closed circle.                                                                                                                                                                                                              |
| Scaling the audience           | An instance serves tens of people. Designing for thousands of concurrent viewers would cost the simplicity that makes a family instance cheap to run. This is about people, not about how much media an instance holds: the archive is expected to be large. |

## Product surface, roughly

The shape the project is heading toward, so architecture decisions have
something to aim at. None of this is built yet.

- **Accounts and invitations.** A small set of people with logins, created by
  invitation from an admin. No self-signup.
- **A chronological feed** of posts, each holding one or more photos or videos
  with a caption.
- **A permalink for every item.** Not just for each post, but for each
  individual photo and video inside it. A permalink is an ordinary app URL: it
  opens the item on its own page, and it prompts an unauthenticated visitor to
  log in rather than showing them anything.
- **Comments** on a post and on an individual photo or video, so a grandparent
  can say something without needing another app. Simple reactions alongside
  them.
- **Timestamped comments on videos.** A comment can be anchored to a moment in
  a video the way Loom does it: leave it at 0:42, and it shows up on the
  scrubber and in the thread with the time attached. Clicking it seeks there.
  This is the feature most likely to shape the comment data model, so it is
  worth designing for from the start rather than bolting on later.
- **Upload** from a phone or a computer, including the large video files
  phones now produce.
- **Finding things in a large archive.** Browsing by time and by person is the
  baseline, because the common question is "what did she look like last
  summer". Over years this becomes the difference between an archive and a
  pile: search, filtering, and fast scrolling through thousands of items are
  product requirements, not optimizations.
- **Notifications** that respect the fact that the audience is small and the
  volume is low. Email or push, not a badge economy.

## Sharing

Famgram is private, and it is still built around links. Those two only seem to
conflict, so it is worth being precise about what sharing means here.

**A link is an address, not a credential.** Every post, photo, and video has a
stable URL. Anyone can hold one; only a member can open one. Opening a link
while logged out leads to the login screen and then back to the item, never to
the content itself.

This rules out two shortcuts that are common elsewhere and will not be
accepted here:

- **Unguessable URLs as access control.** A long random token in a link is
  still a link that works for whoever ends up holding it, and links leak:
  forwarded messages, screenshots, browser history, link previews. Access is
  decided per viewer, not per URL.
- **Handing out raw storage URLs.** Famgram fetches media from object storage
  through short-lived signed URLs, and those genuinely are bearer links for as
  long as they live. They are an implementation detail of rendering a page, and
  are never what a user copies or shares. See
  [architecture.md](architecture.md#where-data-lives).

Whether a member can later be given a way to share something outside the
circle, deliberately and revocably, is an open question. It is not a non-goal,
but it is not designed yet, and nothing should assume it exists.

## Design

Aesthetics and interaction design are documented separately, once they exist.
The short version: Famgram should feel warm and family-friendly, not like a
dashboard.
