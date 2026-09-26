# Feature and surface spec

The working spec for what has to be built. It exists to be argued with and
settled; once it is, the durable parts move into
[`PRODUCT.md`](PRODUCT.md) and this file stops being the authority.

Visual decisions are not here. They live in [`../DESIGN.md`](../DESIGN.md).

## Naming

Two different names, and they must not be conflated.

|                    |                                                                                                                                            |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------ |
| **Product name**   | _Memory Shoebox_. A deliberately dry placeholder, still expected to change.                                                                |
| **Instance title** | Set by the admin in settings. What a given family calls their own deployment, shown in place of the product name throughout that instance. |

The product name appears in the project, the documentation and the deployment
instructions. Inside a running instance a member should mostly see the instance
title, because they are visiting their family's archive and not a product.

## Roles

Three, and they are a strict ladder. Every capability of a lower role belongs
to the higher ones.

|                                               | Viewer | Uploader | Admin |
| --------------------------------------------- | :----: | :------: | :---: |
| View what they are permitted to see           |   ✓    |    ✓     |   ✓   |
| Comment, including pinned to a video moment   |   ✓    |    ✓     |   ✓   |
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

Comments inherit their item's visibility exactly: if you can open the item, you
can read and write its comments.

## Authentication

Built in house. No third-party identity provider.

1. Enter an email address.
2. Receive a **six-digit code**, not a link.
3. Enter the code.

A link is a credential that travels; a code has to be typed by the person
holding the inbox. It is also far easier to explain over the phone to somebody
who is not confident with a browser, which the audience often is not.

Only invited addresses may sign in. There is no self-signup, and entering an
unknown address must look identical to entering a known one, so the form cannot
be used to discover who is a member.

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
never bury the rest of the day. Detection is automatic and is an open question
below.

**Milestones.** A dated event: a birthday, a first day of school. Items
associate with it. A milestone has no separate view; it appears inline in the
timeline at its date, given a treatment that makes it read as an occasion
rather than another day. Created by uploaders and admins.

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

| Trigger                    | Goes to                                                  |
| -------------------------- | -------------------------------------------------------- |
| An upload session finishes | Everyone who can see at least one item in it             |
| A comment on an item       | The uploader, plus everyone else who has commented on it |
| A removal request          | The uploader and every admin                             |
| An invitation              | The invited address                                      |

Every member can turn their own email off.

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
- Self-signup, public profiles, discovery, follower counts, reactions beyond
  comments, an algorithmic feed, federation, multi-tenant hosting.

## Surfaces to build

Five exist as prototypes and settle the visual language. The rest are new.

### Member surfaces

|     | Surface                                                           | Status     |
| --- | ----------------------------------------------------------------- | ---------- |
| 1   | Sign in: email, then code                                         | prototyped |
| 2   | The timeline: the pile, by day, with bursts and milestones inline | prototyped |
| 3   | One photo: full frame, its burst, comments, tags, people          | prototyped |
| 4   | One video: timestamped comments on a measured scrubber            | prototyped |
| 5   | Empty archive                                                     | prototyped |
| 6   | Filter and search: by tag, by person, by date                     | new        |
| 7   | People directory                                                  | new        |
| 8   | Upload: select, visibility step, progress, failures               | new        |
| 9   | My account: email, notification switch, my devices                | new        |
| 10  | Request removal                                                   | new        |

### Admin surfaces

|     | Surface                                         | Status |
| --- | ----------------------------------------------- | ------ |
| 11  | Settings: instance title                        | new    |
| 12  | Members: invite by email, roles, revoke devices | new    |
| 13  | Groups: create, edit, membership                | new    |
| 14  | Milestones: create and edit                     | new    |
| 15  | Removal requests                                | new    |

### System surfaces

|     | Surface                                                          | Status |
| --- | ---------------------------------------------------------------- | ------ |
| 16  | Transactional emails: code, invitation, upload, comment, request | new    |

The upload flow (8) is the one that carries the product's promise, and the
visibility step inside it is the single place where "dump it all" either
survives or quietly becomes curation.

## Data model, sketched

Entities, not schema. The schema follows once this is agreed.

```
member         id, email, role, notify, created
device         id, member, label, last_seen, expires      -> the sliding session
invite         id, email, role, token, invited_by, expires

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

## Open questions

1. **How is a burst detected?** By capture-time proximity within one upload,
   with a threshold? By visual similarity? Time proximity is far cheaper and
   probably sufficient, but the threshold needs choosing and it changes how the
   pile reads.
2. **Email delivery is a new dependency.** Authentication by emailed code means
   the deployment can no longer be Fly plus Backblaze plus SQLite alone; it
   needs a transactional email provider, which is a new account, a new secret,
   a new cost, and a new failure mode where nobody can sign in. This needs a
   decision and belongs in the deployment runbook.
3. **Does the repository get renamed?** The product is now _Memory Shoebox_
   while the repository, package names and Fly app are all `famgram`. Renaming
   is cheap today and progressively less so.
4. **What does an uploader see when setting visibility?** Group names and
   member names are one list, or two. Minor, but it shapes surface 8.
5. **Can an admin change somebody's role after the fact**, including demoting
   another admin, and can the last admin be removed?
