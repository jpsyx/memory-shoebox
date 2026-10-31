# Comment tagging and member identity: UI/UX shape

**Status:** Complete proposed interaction brief for review. No product UI or
prototype code has been implemented. **Date:** 2026-10-31.

This is the detailed Impeccable `shape` companion to the
[feature scope](2026-10-31-comment-tagging-design.md). It owns proposed layout,
copy, interaction, responsive behavior, and recovery states. The scope owns
identity, permissions, storage, and notification policy. Confirmed user decisions
remain binding; details below are recommendations until reviewed.

## 1. Design direction and surface map

**The job:** help a family member get another member's attention, recognize who
is speaking, and find that person's photographs without learning a new part of
the app. People often arrive on a phone through an email link. They should be
able to finish with ordinary typing, clicking, or tapping.

**Direction:** extend the existing comments, My account, sign-in card, and
archive. Make identity recognizable through a unique name and a chosen photo.
Keep the photograph and conversation primary. There is no new public profile,
member dashboard, separate inbox, or global navigation destination.

| Surface                              | Mode       | Primary task                                                    | Entry and exit                                                          |
| ------------------------------------ | ---------- | --------------------------------------------------------------- | ----------------------------------------------------------------------- |
| A. Complete your profile             | Operate    | Claim a unique name; optionally choose a photo.                 | After verified first sign-in; continue to the original destination.     |
| B. My account / You                  | Operate    | Change name or avatar independently.                            | Existing My account; return through existing navigation.                |
| C. Adjust your photo                 | Operate    | Choose the visible crop and save it.                            | Add/change photo; return to its opener.                                 |
| D. Comment composer and typeahead    | Operate    | Select a member while writing.                                  | Photo/video composer, reply, or edit; post or keep writing.             |
| E. Posted comment and moment preview | Read       | Read the words and recognize a clickable comment tag.           | Existing conversation; tag link opens member collection.                |
| F. Member collection                 | Experience | Browse visible items uploaded by or photo-tagged with a member. | Comment-tag link; back to the originating conversation.                 |
| G. Photo-tag identities              | Operate    | Distinguish members from ad-hoc people.                         | Existing item/upload/bulk pickers, tags, People directory, and filters. |
| H. Email preference                  | Operate    | Control comment-tag email independently.                        | My account / Email or email footer.                                     |
| I. Comment-tag email                 | Read       | Understand who tagged the recipient and read their words.       | Inbox; View comment opens the exact conversation.                       |
| J. Email arrival                     | Operate    | Reach the tagged comment through authentication if needed.      | Email link; reveal and focus the matching comment.                      |

### Visual authority

Inherit [DESIGN.md](../../../DESIGN.md) and the current components. Use Archivo
for UI, Familjen Grotesk for existing headings, the active rendition's ink/print
tokens, and the established quiet borders. An unseen-content accent is never a
tag color or success/error color. State also appears through words, weight,
underlining, borders, and focus.

New fields, list panels, and ordinary dialogs follow the square application
controls. Preserve the current full-screen dock and its rounded composer/send
surfaces; this feature does not flatten or restyle that existing exception.
Profile photos use the identity circles already occupied by initials.

The current item layout places comments in a 360px desktop column, narrowing
to 320px before stacking below the media at 800px. Keep that arrangement.
My account keeps its existing reading-width sheet layout. New profile completion
inherits the sign-in card rather than adding a multi-step wizard.

Old reference captures were inspected: sign-in dated 2026-09-26 and video
conversation desktop/phone dated 2026-10-07. They predate current styling and
the theater. Their prototype brand, purple controls, rounded page shell, and
below-player details are not design authority. Current theme/components and
`docs/theater.md` settle those differences. No fresh running-app capture is
claimed by this planning document.

## 2. A: complete your profile

The first viewport contains the Shoebox bar and one form. On desktop, use the
existing centered sign-in card footprint. On a phone, use the same page gutter
and allow vertical scrolling when the keyboard is open. Do not open the keyboard
automatically on touch entry.

Content order:

1. **What should we call you?**
2. **Choose the name your family will see on your comments.**
3. **Your name** input, prefilled with an invitation suggestion when supplied.
4. Help: **Use a name people recognize. You can include spaces.**
5. Optional **Your photo** row: initials preview, **Add a photo**, and **Optional.
   You can add one later.**
6. Primary **Continue** and secondary **Sign out**.

There is no username field beside a second display-name field. This one name
is the handle; do not display an extra `@` inside the name input. An avatar
preview changes initials as the draft name changes, but no identity is published
until its name is saved.

| State           | Copy and response                                                                                                                                   |
| --------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| Empty submit    | **Enter the name your family knows you by.** Focus the input.                                                                                       |
| Taken name      | **That name is already taken. Try adding your last-name initial, like John M.** Keep the attempted name editable.                                   |
| Invalid name    | **Use your name without @ or line breaks.** Identify the field without silently changing meaningful characters.                                     |
| Too long        | **Keep your name to 80 characters or fewer.** Preserve input for correction.                                                                        |
| Saving          | Continue reads **Saving...**; prevent repeat saves and retain layout.                                                                               |
| Request fails   | **Couldn't save your name. Your changes are still here.** Continue retries.                                                                         |
| Name succeeds   | Continue to the original item, comment, or archive URL. No success screen in between.                                                               |
| Session expires | Explain that sign-in is needed again; preserve the intended destination, but never carry account-specific draft data into another member's session. |

Check availability on Continue rather than announcing it on every keystroke.
The server decides the final result even if a previous check passed. Inline
validation is associated with the input and announced once after submission.
Do not expose whose name is taken or their email.

A staged avatar is independent: a name conflict preserves its preview. Once
the name succeeds, a failed photo save offers **Try again** or **Continue without
a photo**. A profile image never becomes a barrier to viewing the family archive.
New members are not asked to choose email preferences during this flow.

## 3. B: My account / You

Keep the existing **You**, **Email**, **Devices**, and role-specific sheets.
Inside **You**, show an avatar row before the name field. An 80px preview sits
beside **Add a photo** or **Change photo** and, when set, **Remove photo**.
Below it, retain Your name / Save your name and the caller's own read-only email.
At narrow widths, photo actions wrap beneath the preview; the name field remains
full width.

Name changes and avatar changes save independently. Editing a name must not
disable photo actions or accidentally save the typed name when the avatar saves.
After a name save, show **Name saved.** directly beneath its action. For avatar
changes, show **Photo saved.** beside the photo controls. Both statuses are polite
announcements, not new toast notifications.

Name errors use the profile-completion wording. Save your name is disabled when
unchanged or already saving. A claimed name cannot be cleared: explain the empty
field error rather than reverting to the email address. Returning to the account
page reflects the saved name and image, not a stale initial render.

Remove photo opens a small confirmation with **Remove your photo?**, **Your
initials will appear instead.**, **Keep photo**, and **Remove photo**. Focus Keep
photo initially. Save failure keeps the existing avatar and offers retry inline.
Completion restores focus to Add a photo. Do not combine removal with account
deletion or photo-archive deletion.

## 4. C: adjust your photo

**Proposed default:** allow position and zoom adjustment. This improves the
center-crop-only recommendation in the first scope draft. The crop question was
offered during shaping; until explicitly confirmed this remains a recommendation.

Use one focused dialog because this is a temporary image-editing task. On phones,
make it a full-height sheet with a reachable footer; on desktop, use a compact
dialog large enough to inspect the face. Header **Adjust your photo**, close
button, then the preview and controls:

```text
Adjust your photo                         Close

          [ image with circular crop mask ]

Zoom                  [-] [------o----] [+]
Move photo            [Up] [Left] [Right] [Down]
Reset                 Choose another photo

Cancel                                Save photo
```

The circular mask previews the exact identity appearance. Repositioning changes
the image beneath it; the result always fills the circle. Dragging and pinch
zoom are optional shortcuts. The visible Zoom controls and arrow buttons provide
equivalent touch, keyboard, and assistive-technology paths. Label the slider
**Photo zoom**, name each move action, and keep focus on the operated control.
Reset restores the initial centered fit without changing the chosen file.

Use a gentle ink scrim outside the crop. No face detection, beautification,
filters, image-generation, album upload, or public-avatar URL input. Selecting a
new file discards only the staged crop. Cancel/Escape leaves the saved avatar
unchanged and restores focus to Add/Change photo. Do not dismiss a dirty crop
when clicking the backdrop; explicit Cancel is available.

| State                   | UI behavior                                                                                                                                                  |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Native picker cancelled | Keep the current dialog/account state. No error.                                                                                                             |
| Reading image           | Reserve the preview footprint and announce **Opening photo...**; Save photo unavailable.                                                                     |
| Ready                   | Preview and all adjustment controls available.                                                                                                               |
| Unsupported/corrupt     | **Choose a JPEG, PNG, or WebP photo.** or **We couldn't open that photo. Choose another.**                                                                   |
| Too large               | **Choose a photo smaller than 10 MB.** Use the same displayed unit as the implemented byte limit.                                                            |
| Excessive dimensions    | **That photo is too large to process. Choose a smaller copy.** Retain the previous saved image.                                                              |
| Saving                  | **Saving photo...**; keep preview visible and prevent duplicate save/removal.                                                                                |
| Upload fails            | **Couldn't save your photo. Try again.** Keep the file and crop for retry.                                                                                   |
| Saved elsewhere first   | **Your photo changed in another window.** Offer **Use latest photo** or **Save this photo instead** after reloading the latest version. No silent overwrite. |
| Success                 | Close, focus Change photo, update the avatar in all open identity surfaces, announce **Photo saved.**                                                        |

The avatar file picker is available to viewers as well as uploaders. Help near
the file action says **JPEG, PNG or WebP, up to 10 MB.** Images remain private to
members. The `avatars/` storage location is an implementation detail and does
not appear in this flow.

## 5. D: writing, replying, and editing

### Composition and selection

Keep the current comment field, author avatar position, optional video moment,
and send action. Add **Type @ to tag a member.** below the input. On narrow
screens, put this help on its own line so it never squeezes the moment or send
control. Use at least a 16px input size on phones to avoid input zoom; help and
secondary text stay at or above the design system's 15px floor.

```text
[your photo]  @Jo|

              +--------------------------------+
              | [photo] John M                  |
              | [photo] Jorge                   |
              | [ JM ]  José M                  |
              +--------------------------------+

Type @ to tag a member.
[Whole video / 0:18]                     [Send]
```

This is a layout schematic, not a new component style. Anchor the list to the
input, not to a moving caret. It is as wide as the usable field, expands upward
when needed, and stays inside the viewport. Keep the suggestion list in a portal
that belongs to the current item/full-screen host so neither scroll clipping
nor fullscreen hides it.

Each option has a 32px circular avatar and full account name, with a 48px minimum
row target. No emails, role badges, online dots, account IDs, counts, or ad-hoc
create action. A name can wrap to two or more lines when needed; row height grows
and the avatar keeps its alignment. An image failure immediately uses initials.

On a bare `@`, show eligible members alphabetically. With a query, place name
prefix matches first, then other substring matches, each alphabetically. Use the
same normalization as account names. Show five rows before scrolling on desktop;
fit as many complete rows as practical above the phone keyboard without covering
the active line. Keep a visible list scrollbar when content exceeds the panel.

The first result is highlighted, but nothing is committed until chosen. The
highlight uses ink wash plus a leading ink rule, never unseen accent.
Picking Jorge inserts `@Jorge `, visually distinguishes the selected name, closes
the list, and returns typing to after the space. Announce **Jorge added to
comment.** Keep typing in the same field.

### Trigger boundaries and keyboard rules

`@` opens suggestions at the start or after whitespace/opening punctuation.
Email addresses and an `@` inside another word do not. Spaces may be part of a
name query. Newline, another `@`, a closed selection, or leaving that range ends
the current query. Selecting a result replaces just its query range, never text
elsewhere. Pasted or typed names without a selection remain ordinary text.

| Input                | List open                                                                                                                      | List closed                                                           |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------- |
| Up/Down              | Move through options; scroll the active row into view.                                                                         | Normal multiline text navigation.                                     |
| Enter                | Choose the highlighted member. With no selectable result, insert a newline and close.                                          | Insert newline.                                                       |
| Cmd/Ctrl+Enter       | Choose the highlighted member only; a second shortcut can post after the menu closes. With no result, dismiss without posting. | Existing post/save shortcut.                                          |
| Tab / Shift+Tab      | Close without selecting; move focus normally.                                                                                  | Normal focus order.                                                   |
| Escape               | Close only suggestions and keep text/caret.                                                                                    | Respect the enclosing editor, preview, or full-screen close behavior. |
| Pointer/touch option | Choose without losing the caret or prematurely blurring the field.                                                             | Not applicable.                                                       |
| IME composition      | Keep composition intact; Enter does not select or send until composition ends.                                                 | Keep composition intact.                                              |

Typing more query characters may reopen an explicitly dismissed list; an ordinary
rerender must not. No keyboard command both selects a member and posts the comment.

### Tags while editing

A selected tag has a light ink wash and stronger weight. It is not a navigation
link while the field is being edited. It behaves as editable text: deleting or
editing inside it removes the tag association and leaves the edited words as
plain text. The disappearing styling communicates that change; announce
**Comment tag removed.** Deleting nearby text preserves the tag. Undo/redo
restores both words and tag identity. Pasting text cannot secretly notify anyone.

Use the same behavior in new comments, video replies, and Edit. Replies do not
automatically insert an `@` for their parent author. Editing opens with existing
tags marked, keeps the fixed timestamp, and provides **Save changes** and
**Cancel**. Cancel returns focus to Edit and restores the posted version.

### Empty, pending, and refusal states

| State                  | Copy / action / focus                                                                                                                 |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| Initial lookup         | **Finding members...** in the list; keep typing usable.                                                                               |
| No matches             | **No matching members.** Never offer create-name or invitation actions.                                                               |
| Nobody eligible        | **No members available to tag here.** Do not expose who is excluded or why.                                                           |
| Lookup failed          | **Couldn't load members.** / **Retry**. Ordinary commenting stays available.                                                          |
| Plain unmatched text   | It stays plain. No warning every time a member types an email or an unselected name.                                                  |
| Sending                | Keep the submitted content visible; prevent another post. Text typed after submission remains a newer draft.                          |
| Send/save failed       | **Couldn't post your comment. Your draft is still here.** or **Couldn't save your changes.** Existing action retries.                 |
| Tag no longer eligible | **Jorge can't be tagged here now.** / **Keep as plain text** / **Choose another member**. Resolve each affected tag before retry.     |
| Name changed           | **This member is now called Jorge M.** / **Use updated name**. Preserve surrounding words and the same member identity.               |
| Item access lost       | Use the existing item-unavailable state and clear its sensitive draft. Do not display the old conversation under a refusal.           |
| Too long               | Near the 4,000-character limit, show a quiet counter. Over-limit error identifies how many characters must be removed; keep all text. |

Posting success adds the confirmed comment, clears only the matching submitted
draft revision, and returns focus to the field only if the member has not moved
elsewhere. Never display “Email sent”: posting confirms the comment, not delivery
or the recipient's preference.

### Full screen and mobile

The full-screen conversation keeps its existing dock behavior. Opening a tag
list counts as an active nested interaction, so pointer travel into it cannot
trigger delayed dock closure. In window fullscreen, Escape closes the list,
then the comments dock, then the viewer. Browser-owned native-fullscreen Escape
may exit native fullscreen first; do not promise interception.

Keep the composer above the phone keyboard and size the list from the remaining
visible viewport. Scroll the conversation, not the photo stage, to reveal the
field. Selection never changes the captured video timestamp and never resumes
playback. Closing the list does not close the composer or discard a draft.

## 6. E: posted comments and previews

```text
[Ana's photo]  Ana       0:18       2 minutes ago
               @Jorge check this out!
               Love  Reply  Edit  Delete
```

The name and action examples are illustrative. Keep only actions this member is
allowed to use. A comment tag is an underlined, medium-weight link on a light ink
wash. Normal prose remains unchanged. Hover increases the wash slightly; focus
uses the existing visible outline. Visited links do not change to a new color.
Inline links wrap with the sentence and use natural inline target sizing; do not
inflate them into 48px-tall chips. Do not truncate comment names or body text.

In the author position, replace the current 30px initials with a cropped avatar
of the same footprint. Use initials immediately while it loads, without flicker
or layout shift. Replies retain that treatment. Moment-preview comment authors
also get their avatar; reaction emoji markers keep their existing meaning.
Do not put an avatar inside every inline tag or expand this into a reaction-bar
redesign. The commenter byline does not gain new navigation in this scope.

Screen readers hear the name link as **“Jorge, view photos and videos.”**
Pictures beside a visible name are decorative. A tag uses normal link behavior,
including opening in a new tab. Selecting/copying a comment yields readable
`@Jorge` text, not hidden markup.

Existing tags survive member renames/removal with stable identity. Historical
wording stays as posted; the destination shows the current name. A removed
account is absent from new suggestions but its historical collection still
works for readers with access. No follow, message, or invite controls appear.

## 7. F: the member collection

This is the existing filtered archive, with an identity header rather than a
profile page. The combined collection is the default and only new view; no
Uploaded / Photo-tagged tabs are needed for this request.

```text
[Back to comment]                     [existing bar actions]

[photo] Jorge
        Photos and videos uploaded by or photo-tagged with Jorge

[Jorge: uploaded or photo-tagged  x]   [existing date / Find]

[existing date spine]  [existing photo and video pile]
```

Use a 56px identity avatar, one heading, and the explanatory line. On phones,
stack the explanation beneath the name and allow the filter to wrap. Keep the
existing image proportions, dates, bursts, tidy/messy preference, and load-more
behavior. Do not replace the archive with a uniform profile grid.

The filter label explains the OR relationship. Remove it to return to the full
archive, keeping other filters subsequently chosen. Opening a name from a
comment starts with unrelated old filters cleared. A standalone bookmarked
collection has **Back to the timeline**; **Back to comment** appears only when
the member actually arrived through that journey. Never infer a return item
from an untrusted arbitrary URL.

| State                            | Presentation                                                                                                             |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| Initial load                     | Reserve the header/avatar space and reuse the archive loading state. Do not flash a zero total.                          |
| Valid member, nothing visible    | **No photos or videos to show.** / **Back to the timeline**. Do not reveal hidden totals or suggest someone must upload. |
| Additional filters match nothing | Existing no-results treatment with **Clear extra filters**; retain the member collection.                                |
| Unknown member ID                | **No photos or videos to show.** No raw ID or account-existence detail in the heading.                                   |
| Request fails                    | **Couldn't load these photos and videos.** / **Try again**. Preserve the selection.                                      |
| Next page fails                  | Keep loaded items and show retry at the end of the pile.                                                                 |
| Member renamed                   | Header/avatar reflect the current identity; historical comment wording remains unchanged.                                |

**Round-trip retention is a new requirement.** Following a comment tag and using
Back to comment restores the item, scroll/focus anchor, and unfinished main,
reply, or edit draft. Current item-visit memory does not provide this across
route departure. Keep this journey state only within the current signed-in tab
session, retire it on sign-out/account change or item-access loss, and do not
promise recovery after reload/tab close. Returning does not auto-resume a video.
If the originating comment was deleted, restore the item conversation with
**That comment is no longer available.** If the item is hidden/deleted, show the
normal unavailable page without cached content.

## 8. G: photo-tag identities everywhere

Names in photo tagging follow one visible grammar:

| Identity             | Label                    | Photo                                                                                           |
| -------------------- | ------------------------ | ----------------------------------------------------------------------------------------------- |
| Active account       | **Jorge**                | Its chosen avatar when an avatar is shown in that picker.                                       |
| Ad-hoc person        | **Jorge (not a member)** | Existing person-face behavior or initials; never borrow the member's avatar by matching names.  |
| Linked former member | **Jorge (not a member)** | Retain its established identity/face behavior, without making it selectable in comment tagging. |

The suffix is literal, always visible, and included in the accessible label.
It is regular-weight quiet text, not an error or warning. Use adequate contrast
in every rendition. At narrow widths let it wrap with the name; never ellipsize
away the only distinguishing part. Keep Remove/Manage actions outside its text.

Apply to item photo-tag suggestions and selected chips, upload label dialogs,
bulk-edit pickers, existing **In this one** tags, People cards, and active person
filters/facets. A newly added ad-hoc selection gains the suffix immediately.
The suffix is absent from the name-edit input and never saved into its name.
Names and suffixes are keyed by person identity, not by the rendered string.

In photo-tagging controls use **Photo-tag someone** rather than the ambiguous
**Tag somebody**. Help where creation is possible: **Choose a member or add
someone who isn't a member.** A create row reads **Add “Jorge” (not a member)**.
If a same-named member exists, show both independently, each with its proper
label. Creating the ad-hoc person never merges them or sends an email.

Existing photo-tag links continue to show items the person is photo-tagged in.
They do not silently switch to the combined member collection. The combined
collection's explanatory heading makes that separate entry point understandable.
Loading identity text uses a reserved placeholder, never a raw account/person ID.

## 9. H and I: email control and message

### My account / Email

Add **Somebody tags you in a comment** immediately after the existing
comments-on-your-uploads row. Description: **An email when someone uses @ to get
your attention.** Its switch defaults to on and saves immediately. Keep it
independent from conversation-reply and upload emails. All-off/all-on includes it.

The label wraps before the switch; the switch keeps its position and target.
On save failure, restore the actual saved value and show **Couldn't change that
email preference. Try again.** next to the row, with focus retained. Do not leave
a switched-off appearance that was never saved. An email settings link lands
on and focuses this row after any required sign-in.

Turning this off does not stop ordinary comment emails enabled by other switches.
Clarify this when the row is off with **You may still receive emails about your
uploads or conversations, depending on your other settings.** Do not expose a
recipient's choices to the author in the composer.

### Inbox message

Reuse the existing email masthead, readable single column, quotation treatment,
footer, and fallback fonts. The new message is text-first and works with images
blocked. No profile image, media attachment, hidden preheader, or external font
request is required.

```text
[Shoebox name]

Ana tagged you in a comment.
On a photo from 27 September 2026.

  @Jorge check this out!

View comment

You're receiving this because Ana tagged you in a comment.
Change comment-tag emails
[existing product/source footer]
```

For videos, use **On a video from 27 September 2026.**, adding **At 0:18** for
a moment. For replies, retain the same explicit comment-tag reason; do not imply
that replying alone necessarily tags someone. Use the item's capture date with
wording **from**, not **uploaded on**. Quote the full supported comment with line
breaks; keep tag labels readable as plain text. One primary **View comment** link
goes to the precise comment. The preference link opens the matching switch,
without silently unsubscribing on an ordinary page load.

HTML and plain text carry equivalent information. User-controlled names and
comments are escaped. The body does not claim who else received mail, and an
edit made after scheduling may differ from the quoted snapshot.

## 10. J: arriving from email

| Arrival                                 | Result                                                                                                  |
| --------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| Signed in, visible top-level comment    | Open the item, scroll/focus the comment, and apply a quiet ink outline to locate it.                    |
| Reply                                   | Reveal its parent and reply before focus. Keep the parent's context visible.                            |
| Full-screen presentation already active | Open the existing comments dock and reveal the target; do not create a second viewer.                   |
| Signed out                              | Existing code sign-in, then profile completion only if required, then the same target.                  |
| Comment deleted, item visible           | Show **That comment is no longer available.** and the remaining conversation.                           |
| Item unavailable                        | Existing refusal/removed-item experience; show no quoted comment or stale avatar from cached item data. |
| Network failure                         | Existing retry preserves the comment target.                                                            |

Focus the comment container temporarily rather than its first destructive
action. The locator outline lasts until focus/user interaction moves away;
do not rely on a fast flash. Respect reduced motion when scrolling. Arrival
does not open the keyboard, start a reply, or autoplay video. Its timestamp
remains an explicit action to seek to the moment.

## 11. Cross-surface behavior and review coverage

All new operations provide default, hover, focus, pressed, unavailable, pending,
error, and success treatment. Selection/focus are distinct. Errors retain work,
identify the affected field/action, and offer the retry in the place it failed.
Do not communicate identity, membership, tag status, or validation by color alone.

New action targets are at least 48px where practical; existing compact comment
actions retain their current footprint, and inline prose links stay inline.
Support 200% text zoom, long 80-character account names, a 4,000-character
comment, multiword/accented names, many tags in one paragraph, and tens of members.
No tiny text is introduced to make those cases fit. Repeated occurrences of a
member are allowed, with one email per applicable notification policy.

The keyboard stays in the writing task during suggestions; dialogs restore
focus to their openers; links move focus to meaningful page headings or targeted
comments. Use native form and link semantics and accurate autocomplete state.
Do not auto-focus every rerender or continuously announce the full result list.
Announce results after loading/query changes, then the active option through the
normal accessible autocomplete behavior. Reduced motion removes movement while
retaining all state feedback.

| Review set                         | Cases to inspect                                                                                                                    |
| ---------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| Desktop 1440 and intermediate 1024 | Composer in existing sidebar, account layout, menu overflow, crop dialog, archive header.                                           |
| Phone 390 and narrow 320           | Keyboard open, long name/suffix, wrapped actions, crop controls/footer, email body.                                                 |
| Short landscape/full screen        | Picker inside host, innermost Escape, comments dock held open, moment/send controls reachable.                                      |
| Existing renditions                | Day, Porcelain, Slate, Night; text/tag/selection/focus contrast and initials fallback.                                              |
| Keyboard and assistive technology  | Complete profile, choose/cancel tag, crop without drag, save failures, email deep link and return journey.                          |
| Realistic content                  | Jorge/Jorge (not a member), John conflict then John M, no avatar, failed avatar, renamed member, removed member, no visible photos. |
| Realistic interruptions            | Offline, expired session, member eligibility change, duplicate name race, stale avatar save, failed post, navigate away and return. |

During implementation, capture desktop and phone together, fix findings as one
batch, and confirm once. This shape has been reviewed against the incumbent
source and prior captures; interaction and visual acceptance still require a
running implementation. No new UI screenshot or interactive prototype is claimed.

## 12. Decisions and handoff

Confirmed requirements from the scope are unchanged. This shape makes the
following additional proposals concrete:

- Position/zoom avatar crop with visible keyboard-operable alternatives to drag.
- One compact profile-completion form, with a photo optional and independent.
- Existing archive as the combined member collection, without new tabs/profile.
- Name availability errors on save, without public lookup or noisy keystroke checks.
- Same-tab comment/collection round-trip restoration, including unfinished replies/edits.
- Explicit photo-tag wording and persistent `(not a member)` suffixes on every affected identity surface.

Review these proposals together with the surface/state rules above. Impeccable
shape ends with this brief and a confirmation/correction round; production UI,
interactive prototypes, and implementation plans are separate subsequent work.
