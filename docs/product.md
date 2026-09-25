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

- **The circle is closed.** There is no discovery, no public profile, no
  follower graph, no link that works for a stranger. People get in by
  invitation and no other way.
- **The archive is yours.** Media lives in your own object storage bucket in
  its original quality. Famgram indexes it; it does not own it. If the project
  disappeared tomorrow, your files would still be sitting in your bucket.
- **The scale is small on purpose.** Famgram expects tens of people per
  instance. That assumption buys simplicity everywhere: SQLite is enough, one
  machine is enough, and features can favor intimacy over throughput.
- **It is cheap.** A family instance should cost a few dollars a month. Design
  decisions that would make it meaningfully more expensive to run need a good
  reason.

## Non-goals

These are not oversights. They are choices, and pull requests that add them
will be declined.

| Not building                     | Why                                                                                                             |
| -------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| Public or link-shareable content | The entire point is that content is not public.                                                                 |
| An algorithmic feed              | Nobody needs an algorithm to rank thirty photos of their own grandchild.                                        |
| Follower counts, likes, reach    | This is a family, not an audience.                                                                              |
| Advertising or tracking          | Non-negotiable.                                                                                                 |
| Multi-tenant SaaS hosting        | Famgram is software you run, not a service we run.                                                              |
| Federation with other networks   | Out of scope. It contradicts the closed circle.                                                                 |
| Infinite scale                   | Optimizing for thousands of users would cost the simplicity that makes a family instance cheap and easy to run. |

## Product surface, roughly

The shape the project is heading toward, so architecture decisions have
something to aim at. None of this is built yet.

- **Accounts and invitations.** A small set of people with logins, created by
  invitation from an admin. No self-signup.
- **A chronological feed** of posts, each holding one or more photos or videos
  with a caption.
- **Comments and simple reactions** on a post, so a grandparent can say
  something without needing another app.
- **Upload** from a phone or a computer, including the large video files
  phones now produce.
- **Browsing by time and by person**, because the common question is "what did
  she look like last summer".
- **Notifications** that respect the fact that the audience is small and the
  volume is low. Email or push, not a badge economy.

Aesthetics and interaction design are documented separately, once they exist.
The short version: Famgram should feel warm and family-friendly, not like a
dashboard.
