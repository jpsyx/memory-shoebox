# Video conversations prototype

Prototype spike requested by Juan Pablo: inspect Loom, evaluate React players,
and make reviewable prototypes of timestamped comments and emoji reactions.
Sample-only, in-memory interactions; no server, authentication, or schema changes.
Operate mode for family members watching and responding, often on a phone.

## Direction contract

**THESIS:** Make responding to a particular moment as immediate as Loom.
The pinned reference is Loom's watch page, with a second expanded player layout.
**OWN-WORLD:** White and pale cool-gray surfaces, dark neutral text, purple
interactive accents, rounded video corners and a compact emoji reaction capsule.
Use the existing Archivo font, not Loom's logo or proprietary font.
**FIRST VIEWPORT:** Desktop: wide video at left, 360px comments rail at right,
lightweight title header, timeline with avatars and emojis, reaction tray directly
under the player. Phone: full-width player, reaction tray, comments beneath.
**SIGNATURE:** Tap an emoji at the current time: it floats briefly over the video
and leaves a seekable marker. Start typing: pause and capture a stable timestamp.
**BOUNDARIES:** Two compositions, working local media and sample conversations.
Preserve production DESIGN.md, current UI and backend contracts; add the selected
Video.js dependency to the web package.
**PROOF:** Verify actual playback, seek from comments and markers, stable composer
time, replies, non-timestamped comments, reactions, keyboard seek, phone overflow,
empty state and unsupported-media recovery. Seed: user-pinned Loom; no random roll.

The reference is an online Loom screenshot and official interaction documentation,
not a pixel-certified capture of Loom's current signed-in app. The wider layout
and mobile adaptation are proposed designs. These are disposable design probes.

## Selected direction

Juan Pablo selected Comments beside and the recommended Video.js React library.
The preview now uses Video.js 10.0.1 player context, native video adapter, and
play/mute/fullscreen controls. Sidebar only; phone comments remain below the player.
Production scope is pending clarification, with no production route or schema edits.
