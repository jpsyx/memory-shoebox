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

## Problem Statement

A parent has thousands of photographs and videos of their children and nowhere
good to put them.

Every ordinary option fails a different way, and the failures are not
preferences. A public social network turns a child into ad inventory and
training data before they can consent to it. A big-tech shared album is still
somebody else's servers, somebody else's rules, and somebody else's decision
about how long it lasts. A group chat compresses everything, buries it in
scroll, and is gone the day somebody leaves. Emailing files does not scale past
one occasion.

So the photographs stay on a phone. The grandparents, who are the people who
most want to see them and have the least ability to go looking, see a handful
by text message and miss the rest. The friction is felt most by the person with
the least technical confidence, which is exactly the wrong way round.

The second failure is slower and worse. An archive nobody can search in ten
years is an archive nobody opens, and the files quietly become unreachable:
stuck in a dead service, or on a drive nobody can find.

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

## User Stories

Written from the member's side. The capability, then why it is not obvious.

**As the parent who runs it,**

- I can put up everything from an occasion in one go, without choosing between
  them first, because choosing is the work that stops me doing it at all.
- I can decide who sees a particular photograph, without that decision being
  visible to the people it excludes.
- I can find a photograph from two summers ago without having tidied anything.
- I can see whether the people I invited are actually here.
- I can be sure the original files are mine, and would survive this software
  disappearing.

**As a grandparent who was invited,**

- I can get in from a link somebody texted me, without making up a password or
  installing anything.
- I can tell what is new since I last looked, without remembering when that
  was.
- I can say something back, and be certain it reached them.
- I can stay signed in on the one device I use, and not be asked again every
  time.

**As anybody in the circle,**

- I can ask for a photograph of me to come down, and know somebody heard me.
- I can turn off the emails I do not want without turning off the ones that
  bring me back.
- I can be sure that nobody outside the circle can see any of it, including
  anybody who is forwarded a link.

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
rather than added later. Videos now place comments beside the player, with
one-level replies and moment-specific emoji reactions. These events are separate
from a member's reaction to the whole item. See [video conversations](video-conversations.md).

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
what the place looks like rather than a comfort adjustment.

The second is the **Shoebox timezone**, for the same reason in a less obvious
place: the day a photograph lands on is part of how the archive is organised,
so it must not depend on where the uploader happened to be standing. One zone
for the whole Shoebox, seeded from the admin's own. It also settles two things
that previously had no zone at all: when a day ends in the activity log, and
what time the weekly removal reminder goes out.

**Terminology.** Shoebox (one family's deployment, named by its admin and
defaulting to "My Shoebox"), member, poster, viewer, item or media (a single
photo or video), permalink, burst (a run of near-identical frames taken seconds
apart, collapsed as one object until opened), milestone (a dated occasion,
which is a span of days rather than a single date). A **reaction bar**, **emoji
bar**, or **react bar** is the compact row of emoji choices used for video
moments and video-comment reactions.

**Explicitly undecided.** Do not treat any of these as settled:

- ~~The product name.~~ Settled: the product is **Memory Shoebox** and the
  repository is named for it. It is still not what members mostly see: each
  deployment is a **Shoebox** carrying a name the admin sets, shown in its
  place and defaulting to "My Shoebox".
- Whether a member can deliberately and revocably share something outside the
  circle.
- ~~How notifications are delivered.~~ Settled: **email only**, never push, and
  switchable per kind by each member. Sign-in codes are the exception and
  cannot be switched off.
- ~~The data model.~~ Settled in [tech-specs/data-models.md](prds/2026-09-27-memory-shoebox/tech-specs/data-models.md): every
  table, key, cascade and index, derived from the eighteen mocked surfaces
  rather than guessed at in advance. Not built yet, but no longer undecided.

## How it works

Settled during surface design and durable from here on. The surfaces that
present these rules are in
[`design-spec.md`](prds/2026-09-27-memory-shoebox/design-spec.md); the schema
that enforces them is in
[`tech-specs/data-models.md`](prds/2026-09-27-memory-shoebox/tech-specs/data-models.md).

### Naming

Two different names, and they must not be conflated.

|                  |                                                                                                                                                    |
| ---------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Product name** | _Memory Shoebox_. Settled, and the repository is named for it.                                                                                     |
| **A Shoebox**    | One deployment of it. A family runs a Shoebox; the admin surface is therefore the **Shoebox settings**.                                            |
| **Shoebox name** | Set by the admin in Shoebox settings, and shown in place of the product name throughout. It defaults to **My Shoebox** and is meant to be changed. |

The product name appears in the project, the documentation and the deployment
instructions. Inside a running Shoebox a member should mostly see its name,
because they are visiting their family's archive and not a product.

### Roles

Three, and they are a strict ladder. Every capability of a lower role belongs
to the higher ones.

|                                               | Viewer | Uploader | Admin |
| --------------------------------------------- | :----: | :------: | :---: |
| View what they are permitted to see           |   ✓    |    ✓     |   ✓   |
| Comment, including pinned to a video moment   |   ✓    |    ✓     |   ✓   |
| React to an item or a comment                 |   ✓    |    ✓     |   ✓   |
| Request removal of an item they are tagged in |   ✓    |    ✓     |   ✓   |
| See and sign out their own devices            |   ✓    |    ✓     |   ✓   |
| Upload                                        |        |    ✓     |   ✓   |
| Set item visibility                           |        |    ✓     |   ✓   |
| Add tags, people tags and milestones          |        |    ✓     |   ✓   |
| Delete their own uploads                      |        |    ✓     |   ✓   |
| Invite members, set roles                     |        |          |   ✓   |
| Manage groups                                 |        |          |   ✓   |
| Set the instance title                        |        |          |   ✓   |
| Delete anything                               |        |          |   ✓   |
| Sign out any member's device                  |        |          |   ✓   |
| **See every item, always**                    |        |          |   ✓   |

An admin's visibility is absolute and cannot be restricted by anyone,
including another admin. This is a deliberate trust model: the admin is the
person who runs the family's archive, and the archive holds nothing from them.
It should be stated plainly wherever an uploader sets visibility, so nobody
believes they have hidden something that they have not.

### Visibility

Per item. Not per day, not per album.

**Default is everyone.** The upload flow asks who can see the batch, arriving
pre-filled with everyone, so it reads as a step you skip rather than a decision
you make. Keeping the control in the flow rather than buried in a setting is
what makes it discoverable; defaulting it is what keeps the promise that the
uploader never has to curate.

Three modes:

| Mode         | Meaning                                                      |
| ------------ | ------------------------------------------------------------ |
| **Everyone** | Every member. The default.                                   |
| **Only**     | An allow list of members and groups.                         |
| **Except**   | A deny list of members and groups. Everyone else may see it. |

Subjects are members, groups, or a mix. Groups are evaluated **at read time**,
so adding somebody to _cousins_ later grants them everything already restricted
to _cousins_, and removing them takes it away. Nothing is snapshotted at the
moment of upload.

Visibility can be changed after the fact, on a single item or on a selection,
**by the item's own uploader, or by an admin**. It is not open to any uploader,
unlike tags and people tags: narrowing or widening a photograph changes who can
see something somebody else put there, which belongs to whoever put it there.
The split is settled in
[`tech-specs/apis/conventions.md`](prds/2026-09-27-memory-shoebox/tech-specs/apis/conventions.md)
§ Who may change an item, and it splits by consequence rather than by table.

**A hidden item vanishes.** It does not appear, and it is not counted. A day
holding 212 items reads as 204 to somebody restricted from 8 of them. Two
members comparing notes will see different totals, which is confusing but never
revealing; the alternative announces that something is being kept from them,
which is worse.

**A people tag is never a key.** Tagging somebody in a photo says who is in it,
not who may open it. A photo restricted to admins can carry a tag for whoever
appears in it, and that tag is simply invisible to everyone who cannot see the
photo. Any other rule turns a label into a silent permission grant.

Comments and reactions inherit their item's visibility exactly: if you can open
the item, you can read and write its comments and react to it.

### Authentication

Built in house. No third-party identity provider.

1. Enter an email address.
2. Receive a **six-digit code**, not a link.
3. Enter the code.

Mail goes through [Resend](https://resend.com). See Dependencies below: it is
the one piece of the system whose failure locks everybody out.

A link is a credential that travels; a code has to be typed by the person
holding the inbox. It is also far easier to explain over the phone to somebody
who is not confident with a browser, which the audience often is not.

Only invited addresses may sign in. There is no self-signup, and entering an
unknown address must look identical to entering a known one, so the form cannot
be used to discover who is a member.

**An invitation carries no credential.** The email names the address, links to
a join page with that address as a plain query parameter, and says a code will
be emailed when you get there. Accepting an invitation is simply signing in for
the first time. A forwarded invitation therefore grants nothing, which is the
same rule as everywhere else: a link is an address, never a key.

**Sessions last 30 days per device and slide.** Signing in again on a device
already known resets its 30 days. A device the member has not used in 30 days
falls out and needs a fresh code.

This requires device identity, and therefore a device list. Every member sees
their own signed-in devices with last-used dates and can sign any of them out;
an admin can sign out any member's device. Without this, a lost or handed-down
phone is a month of silent access to a family's photographs with no way to
close it.

### The archive

**Items.** A single photo or video. The atom of the system. Every item has a
capture time, an uploader, a visibility rule, and a permalink.

**Days.** Items group by capture date. The day is the timeline's unit, carrying
its own count. There are no albums, and there is no manual grouping, because
both are curation.

**Bursts.** A run of near-identical frames taken seconds apart collapses into
one object in the pile and fans open on demand, so forty shots of one candle
never bury the rest of the day. Detection is automatic, and its only signal is
capture time within a single upload: frames no more than **10 seconds** apart,
**three or more** of them, become one stack. Both numbers live in
[`app.config.ts`](../app.config.ts) with the reasoning beside them, and both
are safe to change later because the threshold that produced each burst is
stored on the burst row.

**Milestones.** A dated occasion: a birthday, a first day of school, a week at
the grandparents'. It is a **span**, not a point: a one-day milestone is simply
one whose span starts and ends on the same date, so nothing downstream carries
two shapes. Items associate with it, and an item does not have to fall inside
the span, because a party on Saturday gets photographed on Sunday. A milestone
has no separate view; it appears inline in the timeline across its days, opened
by a full band on the first of them you meet and continued by a quiet strip on
the rest, so five days of a visit read as one occasion. Created by uploaders
and admins, either from a selection of items or from nothing.

**Tags.** Free text, many per item, used to filter and sort. Created by
uploaders and admins.

**People tags.** A separate concept from ordinary tags. A person may be a
member or may not be: a grandmother worth tracking in the archive need not
have an account. A person who is not a member is a first-class record, so that
inviting them later can link the two without losing their history. Tagging is
an association, never face coordinates on the image.

**People are a filter, not a profile.** Filtering the timeline by a person is
the path, with a plain people directory as a way in. No per-person pages.

### Groups

Named sets of members: _family_, _cousins_, _the grandparents_. Flat, with no
nesting. A member may belong to any number. Groups exist to make visibility
expressible without naming individuals one at a time, and are managed by
admins.

### Notifications

By email. Never push, at least to begin with: the audience is the least likely
to grant a notification permission and the most likely to be confused by the
prompt.

**Batched per event, never per item.** A 200-photo upload sends one message. A
reply on something you posted or commented on sends one message.

**A reaction never sends anything.** It is one tap and it is meant to cost the
person leaving it nothing, which it stops doing the moment it costs somebody
else an email. Reactions are seen when somebody next opens the thing.

| Trigger                                   | Goes to                                                  |
| ----------------------------------------- | -------------------------------------------------------- |
| An upload session finishes                | Everyone who can see at least one item in it             |
| A comment on an item                      | The uploader, plus everyone else who has commented on it |
| A removal request                         | The uploader and every admin                             |
| A removal request resolved                | The requester, and the uploader when the item came down  |
| A removal request unanswered after a week | Whoever can still act on it, weekly until somebody does  |
| An invitation                             | The invited address                                      |

**Silence is the failure mode the removal flow exists to avoid**, so it is the
one trigger that chases. A request answered with nothing turns back into the
awkward phone call the feature replaced.

**Each kind can be turned off separately** in My account: uploads, comments on
your own things, replies on threads you are in, and removal requests. There is
also a "turn them all off", which just writes all four.

**Sign-in codes are not on that list and cannot be turned off**, because
without them there is no way back in. A member who has silenced everything
else, or whose address has bounced into suppression, still receives them.

### Deletion and takedown

An uploader deletes what they uploaded. An admin deletes anything. Deletion
removes the record and the stored object; it is not a hidden flag, because a
family member who asks for a photograph to come down expects it to be gone.

**Anyone can request removal of an item they are people-tagged in**, which
notifies the uploader and every admin. "Please take that one down" is a normal
and frequent request in a family and deserves a path rather than an awkward
text message.

## Dependencies

A self-hoster now needs three accounts, not two.

|                  | For                                     | Failure mode                  |
| ---------------- | --------------------------------------- | ----------------------------- |
| **Fly.io**       | The app and the SQLite volume           | The instance is down          |
| **Backblaze B2** | Every photograph and video              | Pages load, media does not    |
| **Resend**       | The sign-in code and every notification | **Nobody can sign in at all** |

Resend is the one worth dwelling on. Authentication by emailed code means the
deployment is no longer Fly plus Backblaze plus SQLite: a provider outage, an
expired key, or an unverified sending domain locks every member out, the admin
included. Two things follow. An existing session must keep working while mail
is failing, so an outage costs new sign-ins rather than the whole archive. And
the failure needs a diagnostic an admin can act on, rather than a generic error
shown to a grandmother typing her address in.

## Still open

Nothing. All five are answered, and each answer is recorded where it is now
enforced rather than only here.

| Was open                                              | Answered                                                                                                                          | Recorded in                              |
| ----------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------- |
| How a burst is detected                               | Capture-time proximity within one upload, with a 10-second gap and a 3-frame minimum, both tunable with the reasoning beside them | `app.config.ts`, `docs/configuration.md` |
| What an uploader sees when setting visibility         | One combobox with typeahead and pills, mixing members and groups. It is the same component everywhere people are chosen           | Surface 8, `PeopleField`                 |
| Whether an admin can change roles, and the last admin | Yes, including demoting another admin. The last admin cannot be demoted or removed                                                | `data-models.md`, "The last admin"       |
| A removal request nobody acts on                      | A weekly reminder to whoever can act, until somebody does. It never expires silently                                              | `data-models.md`, `removal_reminder`     |
| The sending address                                   | `mail.from_address` and `mail.from_name` settings, with domain verification part of first-run setup                               | Surface 11, `settings`                   |

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
  seeded fixtures in the repository. Mockups and tests need placeholder
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

### Settled during surface design

- **Sharing with anyone outside the circle.** No public links, no expiring
  tokens, no bearer URLs, ever. To send one photograph to somebody who is not a
  member, download it and send it yourself. This protects the strongest claim
  the product makes: a URL is an address, never a credential.
- Self-signup, public profiles, discovery, follower counts, an algorithmic
  feed, federation, multi-tenant hosting.

### Standing non-goals

These are not oversights. They are choices, and pull requests that add them
will be declined.

| Not building                          | Why                                                                                                                                                                                                                                                                                                                                                              |
| ------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Public or anonymous access            | Links are welcome, and every one of them requires a login. A URL is an address, never a credential. See "Sharing" below.                                                                                                                                                                                                                                         |
| An algorithmic feed                   | The order is the order things happened in. Nobody wants their family ranked, and picking favourites is the work we are removing.                                                                                                                                                                                                                                 |
| Follower counts, public totals, reach | This is a family, not an audience. Reactions themselves are in: they are how most of a circle will ever answer a photograph, and one tap is the whole of what a grandmother owes anybody. What is out is turning them into a score: no ranking by them, no leaderboard, no number anyone is meant to grow.                                                       |
| Advertising or tracking               | Non-negotiable.                                                                                                                                                                                                                                                                                                                                                  |
| Multi-tenant SaaS hosting             | Memory Shoebox is software you run, not a service we run.                                                                                                                                                                                                                                                                                                        |
| Federation with other networks        | Out of scope. It contradicts the closed circle.                                                                                                                                                                                                                                                                                                                  |
| Scaling the audience                  | An instance serves tens of people. Designing for thousands of concurrent viewers would cost the simplicity that makes a family instance cheap to run. This is about people, not about how much media an instance holds: the archive is expected to be large.                                                                                                     |
| Localisation                          | **The interface and every email are in English.** Not an oversight: some text is composed on the server and stored, notably generated alt text and an email payload frozen at enqueue, so a second language is a data decision rather than a string table. Dates render in `shoebox.timezone` with English month names, for one instance rather than per reader. |

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

Aesthetics and interaction design are documented separately, in
[DESIGN.md](../DESIGN.md), and all eighteen surfaces are implemented in `apps/web` and `packages/emails`. The
short version: Memory Shoebox should feel warm and family-friendly, not like a
dashboard.
