# Product

<!-- impeccable:product-schema 1 -->

The durable product record for Memory Shoebox: who it is for, what it does, and the
facts every future change has to preserve. Visual and interaction design are
not here. They live in `DESIGN.md`, which does not exist yet.

## Platform

web

## Users

**The owner (poster, admin).** A parent who takes a lot of photos and videos of
their kids, wants grandparents, siblings, and a few close friends to see them,
does not want those images on a public social network or feeding a
recommendation engine, and is willing to run (or have someone run) a small
service for them. They deploy the instance, invite people, and post. They are
usually on a phone, posting shortly after the moment or in a batch later.

**Posters.** A small set of members, typically both parents, who upload and
invite. Confirmed model: posting and inviting are a privilege, not the default.

**Viewers.** Everyone else who gets invited: grandparents, siblings,
godparents, close friends. They view, comment, and react. They never upload,
and the interface should not show them affordances for it.

Viewers are the audience that sets the difficulty. They are often much less
technical than the owner, frequently older, and usually on a phone. They arrive
by opening a link someone sent them. They will never open a settings screen,
and many do not want another account to manage. A viewer who cannot work out
how to leave a comment is a product failure, not a user error.

Memory Shoebox was built for one family, but it is built as a product: nothing in the
codebase should assume one particular family, one particular deployment, or one
particular set of people.

## Product Purpose

Memory Shoebox is a self-hosted private social network for one family.

A parent runs an instance, invites the people who should see their children
grow up, and posts photos and videos. Those people log in, look, and comment.
That is the whole product.

It exists because the ordinary ways of doing this are all bad in different
ways: a public social network turns children into ad inventory and training
data, a big-tech shared album is still someone else's servers and rules, and a
group chat compresses everything and loses it in the scroll.

Success is two things, and the second is the one that is easy to forget:

1. The people who were invited actually look, and say something back.
2. The archive is still worth opening in ten years. It has to stay findable and
   pleasant at many thousands of items, and the original files have to still be
   the owner's.

## Positioning

The closed circle around a large personal archive, on storage the owner
controls.

Three things a neighboring product could not truthfully copy:

- **The circle is closed, not the content.** Everything in Memory Shoebox is linkable:
  every post, every photo, every video has its own URL you can paste into a
  text message. What those URLs do not do is work for a stranger. They resolve
  for members and nobody else. There is no discovery, no public profile, no
  follower graph, and no anonymous read path.
- **The archive is yours, in bulk.** Media lives in the owner's own object
  storage bucket in its original quality, all of it, not a selection. Memory Shoebox
  indexes it; it does not own it. If the project disappeared tomorrow, the
  files would still be sitting in that bucket.
- **A small circle around a large, unsorted archive.** These are different
  numbers and they pull in different directions. The audience stays in the
  tens: that is what lets one small machine be enough and lets features favor
  intimacy over throughput. The archive does not. A family that posts through
  a childhood accumulates many thousands of photos and videos over years, and
  it only ever grows.
- **Nobody curates, and that is the point.** Memory Shoebox is a shared dump, closer
  to handing someone a folder of everything than to publishing an album. A
  parent raising small children has no time to pick the best six shots of a
  birthday and send them round individually, so Memory Shoebox asks them not to: put
  all of it up, and let the people who care browse it themselves. The archive
  is therefore full of near-duplicates, bursts, mistakes, and dozens of frames
  of the same moment. That is the normal state of the data, not a defect to
  design around, and any surface that only looks right with a curated set of
  hero images has failed.

## Operating Context

- **Self-hosted, one instance per family.** The owner deploys it themselves.
  The target is a single Fly.io app with a Backblaze B2 bucket, costing a few
  dollars a month. That cost estimate comes from the deployment shape, not from
  a measured bill.
- **Links are the entry point.** Viewers usually arrive by opening a URL
  someone sent them in a text message or an email, not by navigating from a
  home page. Deep entry is the normal case, not the exception.
- **Phones dominate for viewing.** Uploads come from phones and computers, and
  include the large video files modern phones produce.
- **The archive grows for years and never shrinks.** Browsing, searching, and
  scrolling have to stay fast at thousands of items.
- **It is cheap on purpose.** Design decisions that make an instance
  meaningfully more expensive to run need a good reason.

## Capabilities and Constraints

Confirmed product facts and the constraints around them. The forward-looking
feature list is under "Product surface" below.

**Roles.** Two, confirmed: posters (upload, comment, invite) and viewers (view,
comment, react). No self-signup; membership is by invitation only.

**Addressing.** Every post, and every individual photo and video inside a post,
has a stable permalink. Access is decided per viewer, never per URL. See
"Sharing" below, which is a hard constraint rather than a preference.

**Comments.** On a post and on an individual photo or video. A comment on a
video can be anchored to a moment in it, the way Loom does it. This is the
requirement most likely to shape the comment data model, so it is designed for
rather than added later.

**Storage.** Media lives in Backblaze B2 and is fetched by the browser directly
through short-lived signed URLs. SQLite holds metadata only. Consequence for
design: the server never streams media, and a signed URL is an implementation
detail of rendering a page, never something a user copies.

**Licensing.** Memory Shoebox is AGPL-3.0. Section 13 obliges a modified version
offered over a network to offer its source to users, so the interface needs a
reachable way to get at the source. That is a product requirement, not a legal
footnote to solve later.

**Instance settings.** Some choices belong to the deployment rather than to a
person, and the settings model has to allow for both from the start. The first
confirmed instance-level setting is the **pile arrangement**: whether the
archive is laid out tidily or stuck up crooked and overlapping is decided once
by whoever runs the instance, and every member sees the same wall. It is
deliberately not a per-viewer preference, because the arrangement is part of
what the place looks like rather than a comfort adjustment. Not built yet;
recorded so it is designed for rather than retrofitted.

**Terminology.** Instance (one family's deployment), member, poster, viewer,
item (a single photo or video), permalink, burst (a run of near-identical
frames taken seconds apart, collapsed as one object until opened).

**Explicitly undecided.** Do not treat any of these as settled:

- The product name. "Memory Shoebox" is a deliberately dry placeholder and is
  expected to change. It is also not what members mostly see: each deployment
  carries an instance title the admin sets, shown in its place.
- Whether a member can deliberately and revocably share something outside the
  circle.
- How notifications are delivered (email, push, or both).
- The data model. Nothing is built yet and there are no tables.

## Brand Commitments

- **The name is provisional, and it must not drive the design.** "Memory
  Shoebox" is a placeholder, and each deployment overrides it with its own
  instance title anyway. An earlier working name once produced an entire visual
  direction derived from the name itself, which was a misreading of the name
  rather than an interpretation of the product, and it was discarded. Design
  should not build an identity that is expensive to rename, and should never
  take the name as a brief.
- **Sunmiento LLC is the copyright holder and nothing more.** Memory Shoebox carries
  its own identity and inherits no Sunmiento logo, palette, or typography.
- **No identity assets exist.** No logo, wordmark, favicon, palette, or
  typeface has been chosen. The Mantine theme is empty. Nothing here is being
  preserved, so nothing here constrains a future visual world.
- **Voice, as established in the existing documentation.** Plain, direct, and
  unhurried. Warm without being cute. It explains the reason behind a decision
  rather than asserting it. It does not use em dashes, which is a project-wide
  writing rule, not a stylistic accident.

## Evidence on Hand

Almost nothing, and future work must not invent what is missing.

- **No real content.** There are no family photos, no demo dataset, and no
  seeded fixtures in the repository. Mockups and prototypes need placeholder
  media that reads as placeholder.
- **No users, no testimonials, no press, no case studies, no benchmarks, no
  pricing.** The product has never been run for real. Do not fabricate any of
  these, in an interface or in copy.
- **No brand assets.** Confirmed by inspection: no logo, favicon, or image file
  exists anywhere in the repository.
- **What does exist:** working scaffolding (a React SPA, a Fastify API, a
  SQLite catalog, a Backblaze client, a health endpoint) and the documentation
  in `docs/`. No product feature is built.

## Product Principles

1. **Private by construction.** Nothing is public. There is no anonymous read
   path and no third-party tracking. Privacy is the architecture, not a
   setting.
2. **A link is an address, never a credential.** Sharing is welcome; access is
   granted to people, not to URLs.
3. **Small circle, large archive.** Two numbers that pull in opposite
   directions. Never optimize one into the other's problem.
4. **The least technical viewer sets the bar.** If an 80-year-old on a phone
   cannot do it without being told how, it is not done.
5. **The archive outlives the software.** The owner's files stay theirs, in
   their original quality, in storage they control.

## Accessibility & Inclusion

**WCAG 2.2 AA is the standard,** and it is a floor rather than a target,
because AA alone permits type and tap targets that the real audience will
struggle with.

On top of AA, these are binding for every surface:

- Large default type, with a comfortable reading size before any zoom.
- Generous tap targets, sized for imprecise touch.
- Fully usable at 200% zoom, with no horizontal scrolling and nothing clipped.
- No interaction that depends on hover, long-press, precise dragging, or a
  gesture the user has to discover.

The reason is the audience, not compliance: viewers skew older, are mostly on
phones, and will not be trained on the interface by anyone.

## Non-goals

These are not oversights. They are choices, and pull requests that add them
will be declined.

| Not building                   | Why                                                                                                                                                                                                                                                          |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Public or anonymous access     | Links are welcome, and every one of them requires a login. A URL is an address, never a credential. See "Sharing" below.                                                                                                                                     |
| An algorithmic feed            | The order is the order things happened in. Nobody wants their family ranked, and picking favourites is the work we are removing.                                                                                                                             |
| Follower counts, likes, reach  | This is a family, not an audience.                                                                                                                                                                                                                           |
| Advertising or tracking        | Non-negotiable.                                                                                                                                                                                                                                              |
| Multi-tenant SaaS hosting      | Memory Shoebox is software you run, not a service we run.                                                                                                                                                                                                    |
| Federation with other networks | Out of scope. It contradicts the closed circle.                                                                                                                                                                                                              |
| Scaling the audience           | An instance serves tens of people. Designing for thousands of concurrent viewers would cost the simplicity that makes a family instance cheap to run. This is about people, not about how much media an instance holds: the archive is expected to be large. |

## Product surface, roughly

The shape the project is heading toward, so architecture decisions have
something to aim at. None of this is built yet.

- **Accounts and invitations.** A small set of people with logins, created by
  invitation from a poster. No self-signup.
- **Bulk upload with no curation step.** Select a day's worth off a phone and
  it all goes up: the good ones, the blurry ones, the twelve near-identical
  shots of the same candle. Choosing between them is work the owner does not
  have time for, and the product's promise is that they never have to.
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
- **Browsing a pile, not a gallery.** A chronological archive grouped by day,
  where a single day can hold hundreds of items. Viewers scroll it at their
  leisure and stop at whatever catches them.
- **Making a pile browsable without sorting it.** The archive is a pile by
  design, so the work moves from the person uploading to the software. Fast
  scrolling through thousands of items, grouping by day and event, collapsing
  a burst of near-identical frames so it does not bury the rest of the day,
  and browsing by time and by person are product requirements rather than
  optimizations. The common question is "what did she look like last summer",
  and it has to be answerable without anyone having tidied up first.
- **Notifications** that respect the fact that the audience is small and the
  volume is low. Email or push, not a badge economy.

## Sharing

Memory Shoebox is private, and it is still built around links. Those two only seem to
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
- **Handing out raw storage URLs.** Memory Shoebox fetches media from object storage
  through short-lived signed URLs, and those genuinely are bearer links for as
  long as they live. They are an implementation detail of rendering a page, and
  are never what a user copies or shares. See
  [architecture.md](architecture.md#where-data-lives).

Whether a member can later be given a way to share something outside the
circle, deliberately and revocably, is an open question. It is not a non-goal,
but it is not designed yet, and nothing should assume it exists.

## Design

Aesthetics and interaction design are documented separately, in a `DESIGN.md`
that does not exist yet. The short version, and the only visual commitment made
so far: Memory Shoebox should feel warm and family-friendly, not like a dashboard.
