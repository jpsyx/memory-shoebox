# Feature and surface spec

The working spec for what has to be built. It exists to be argued with and
settled; once it is, the durable parts move into
[`PRODUCT.md`](../../PRODUCT.md) and this file stops being the authority.

Visual decisions are not here. They live in [`DESIGN.md`](../../../DESIGN.md).

## Naming

Two different names, and they must not be conflated.

|                  |                                                                                                                                                    |
| ---------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Product name** | _Memory Shoebox_. Settled, and the repository is named for it.                                                                                     |
| **A Shoebox**    | One deployment of it. A family runs a Shoebox; the admin surface is therefore the **Shoebox settings**.                                            |
| **Shoebox name** | Set by the admin in Shoebox settings, and shown in place of the product name throughout. It defaults to **My Shoebox** and is meant to be changed. |

The product name appears in the project, the documentation and the deployment
instructions. Inside a running Shoebox a member should mostly see its name,
because they are visiting their family's archive and not a product.

## Roles

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

## Visibility

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
by any uploader or admin.

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

## Authentication

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

## The archive

**Items.** A single photo or video. The atom of the system. Every item has a
capture time, an uploader, a visibility rule, and a permalink.

**Days.** Items group by capture date. The day is the timeline's unit, carrying
its own count. There are no albums, and there is no manual grouping, because
both are curation.

**Bursts.** A run of near-identical frames taken seconds apart collapses into
one object in the pile and fans open on demand, so forty shots of one candle
never bury the rest of the day. Detection is automatic, and its threshold is
the one thing still genuinely undecided in
[`data-model.md`](data-model.md).

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

## Groups

Named sets of members: _family_, _cousins_, _the grandparents_. Flat, with no
nesting. A member may belong to any number. Groups exist to make visibility
expressible without naming individuals one at a time, and are managed by
admins.

## Notifications

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

## Deletion and takedown

An uploader deletes what they uploaded. An admin deletes anything. Deletion
removes the record and the stored object; it is not a hidden flag, because a
family member who asks for a photograph to come down expects it to be gone.

**Anyone can request removal of an item they are people-tagged in**, which
notifies the uploader and every admin. "Please take that one down" is a normal
and frequent request in a family and deserves a path rather than an awkward
text message.

## Out of scope, decided

- **Sharing with anyone outside the circle.** No public links, no expiring
  tokens, no bearer URLs, ever. To send one photograph to somebody who is not a
  member, download it and send it yourself. This protects the strongest claim
  the product makes: a URL is an address, never a credential.
- Self-signup, public profiles, discovery, follower counts, an algorithmic
  feed, federation, multi-tenant hosting.

## Surfaces to build

Seventeen. Five settled the visual language first; all seventeen are now
mocked in `prototypes/`. Each row names the states that have to be designed,
not just the happy path, because the states are where these go wrong.

### Member surfaces

| #   | Surface               | Who      | States that have to be designed                                                                                                                                                                                                                                                                                           | Status     |
| --- | --------------------- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------- |
| 1   | **Sign in**           | anyone   | Email entry; code entry; wrong code; expired code; resend; unknown address, which must look identical to a known one                                                                                                                                                                                                      | prototyped |
| 2   | **The timeline**      | all      | The pile by day; a burst closed and fanned; a milestone inline; a milestone spanning several days; a milestone with nothing attached; a day with one item; filtered; the end of the archive                                                                                                                               | prototyped |
| 3   | **One photo**         | all      | Full frame; its burst siblings; comments; tags and people; the visibility control for uploaders; delete for the uploader                                                                                                                                                                                                  | prototyped |
| 4   | **One video**         | all      | Playing and paused; comments pinned to a moment; a comment being pinned; no comments yet                                                                                                                                                                                                                                  | prototyped |
| 5   | **Empty archive**     | all      | Brand new instance, nothing uploaded; and a viewer who can see nothing because everything is restricted                                                                                                                                                                                                                   | prototyped |
| 6   | **Filter and search** | all      | By tag, by person, by date range; several filters at once; no results; clearing back to the whole pile                                                                                                                                                                                                                    | new        |
| 7   | **People directory**  | all      | Everyone tagged in the archive; members and non-members shown alike; somebody with no photographs yet                                                                                                                                                                                                                     | new        |
| 8   | **Upload**            | uploader | Select; grouped by capture day, because one upload is routinely several; a selection and the bulk actions on it (tag, person, milestone) and what each looks like once applied; the visibility step pre-filled to everyone; in progress; partial failure; a file type refused; done. **The product's promise lives here** | new        |
| 9   | **My account**        | all      | Email, which can never be changed; my name, which can be corrected; a switch per kind of notification and a turn-them-all-off; my devices with last-used; signing a device out; signing out the one I am on                                                                                                               | new        |
| 10  | **Request removal**   | all      | Asking, with an optional reason; already requested; the uploader's and admin's view of the request                                                                                                                                                                                                                        | new        |

### Admin surfaces

| #   | Surface                  | States that have to be designed                                                                                                                                                                                                                                                    | Status |
| --- | ------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ |
| 11  | **Shoebox settings**     | The Shoebox's name, and the pile arrangement, both deployment-wide rather than per person                                                                                                                                                                                          | new    |
| 12  | **Members**              | The list with roles; invite by email; invitation pending; resend or revoke an invitation; change a role; remove a member; revoke any device                                                                                                                                        | new    |
| 13  | **Groups**               | The list; create; rename; add and remove members; delete a group that visibility rules still reference                                                                                                                                                                             | new    |
| 14  | **Milestones**           | Create with a date and create one that ran for days; create from nothing and then find its photographs; edit; attach items; reconcile items captured outside the span; delete; a milestone with nothing attached                                                                   | new    |
| 15  | **Removal requests**     | Open requests; acting on one by deleting; declining one, and what the requester is told                                                                                                                                                                                            | new    |
| 16  | **Transactional emails** | Sign-in code; invitation; upload session; new comment; removal request; a request resolved by deletion; a request declined, carrying the decliner's own words; the weekly reminder on one nobody has answered. Each has to read well in a plain client and survive being forwarded | new    |
| 17  | **Who has been looking** | A row per member: last signed in, days active, items opened, comments written, reactions left, ordered by who is most present; who has opened one photograph; a member who has never signed in; and a plain statement of what is not recorded                                      | new    |

Three carry more weight than the rest:

- **Upload (8)** is where "dump it all" either survives or quietly becomes
  curation. The visibility step must read as a step you skip.
- **Sign in (1)** is first contact for the least technical person in the
  circle, and the only surface where failure means no access at all.
- **Emails (16)** are the only surface most viewers see regularly, because
  they are the thing that brings somebody back.

**Surface 17 is admin only** and answers the question the owner asked in those
words: who cares. Not analytics. The figures are all "is this person here", and
the surface says out loud what the product refuses to record, which is most of
what analytics would collect.

## Data model, sketched

Entities, not schema. **The schema itself now exists**, in
[`data-model.md`](data-model.md), with every table, key, cascade and index.
This sketch is kept because it is the shortest way to see the shape, and where
the two disagree the schema wins.

```
member         id, email, name, role, notify x4, created
device         id, member, label, last_seen, expires      -> the sliding session
invite         id, member, invited_by, expires          -> carries no credential

person         id, display_name, member?                  -> a tagged person may
                                                             or may not be a member
group          id, name
group_member   group, member

item           id, kind, captured_at, uploaded_by, burst?, storage_key
burst          id, day, detected_from                     -> a run of near-identical frames
milestone      id, name, happened_on
item_milestone item, milestone

tag            id, name
item_tag       item, tag
item_person    item, person                               -> never grants access

visibility     item, mode(everyone|only|except)
visibility_subject  visibility, member? , group?          -> mixed subjects allowed

comment        id, item, author, body, at_seconds?, created
reaction       id, member, kind, item? | comment?          -> one per member per
                                                             thing; on the media
                                                             and on a comment
removal_request id, item, requested_by, reason?, state, created

setting        key, value                                 -> instance title, pile mode
```

Two things are load-bearing and easy to get wrong:

**Visibility is evaluated, never stored per member.** An item is visible to a
member when that member is an admin, or the mode is _everyone_, or the mode is
_only_ and the member is among the expanded subjects, or the mode is _except_
and they are not. Expanding groups at read time is what makes group membership
retroactive. Counts must come from the same evaluation, or a hidden item leaks
through a total.

**A person is not a member.** Conflating them makes it impossible to tag
somebody before they are invited, and impossible to keep tagging somebody who
never will be.

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

## Open questions

One left. The other four were answered by building the surfaces and then the
schema; their answers are recorded where they are now enforced.

1. **How is a burst detected?** Capture-time proximity within one upload is
   assumed, and the threshold and the detector version are stored on the burst
   so both can change without losing anybody's manual grouping. The threshold
   itself is still unchosen, and it changes how the pile reads.

| Was open                                              | Answered                                                                                                                | Recorded in                         |
| ----------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- | ----------------------------------- |
| What an uploader sees when setting visibility         | One combobox with typeahead and pills, mixing members and groups. It is the same component everywhere people are chosen | Surface 8, `PeopleField`            |
| Whether an admin can change roles, and the last admin | Yes, including demoting another admin. The last admin cannot be demoted or removed                                      | `data-model.md`, "The last admin"   |
| A removal request nobody acts on                      | A weekly reminder to whoever can act, until somebody does. It never expires silently                                    | `data-model.md`, `removal_reminder` |
| The sending address                                   | `mail.from_address` and `mail.from_name` settings, with domain verification part of first-run setup                     | Surface 11, `settings`              |
