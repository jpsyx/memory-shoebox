# Video conversation prototypes

Research and disposable interactive probes, October 7, 2026. Requested outcome:
video playback, moment-specific comments and emoji reactions that look and feel
like Loom. This document records the original visual exploration. The sidebar
was approved and integrated into the production viewer; see
[video conversations](video-conversations.md) for the current implementation.

## Preview

From the repository root:

```sh
pnpm --filter @memory-shoebox/web exec vite --config ../../prototypes/video-comments/vite.config.mjs
```

Open <http://127.0.0.1:4178/prototypes/video-comments/>. Juan Pablo selected
**Comments beside**, closest to the Loom reference. The prototype now uses
**Video.js React 10.0.1** and becomes a single column on phones. The composition
switcher was removed after selection. The toolbar can load a local
video via a browser object URL; it does not upload the file. Shared preview URLs
cannot transfer a locally chosen video to another browser.

The sample clip is the repository's generated ten-second `first-steps.mp4`.
All names and conversations are illustrative. Comments and reactions exist only
in React state and reset on reload. The web package and workspace lockfile now include `@videojs/react@10.0.1`.
The standalone preview remains disposable. The subsequent production integration
adds persistence and the video viewer described in the linked implementation notes.

## Library findings

| Option                                                                                                  | Playback                                                                          | Timed comments/reactions                    | Assessment                                                                                                                                                                        |
| ------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- | ------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [Video.js 10 React](https://videojs.org/docs/guides/installation/react)                                 | React components, player controls and custom skins                                | Custom application layer required           | Recommended candidate if replacing the existing player. Official docs show `@videojs/react@10.0.1`.                                                                               |
| [ReactPlayer](https://github.com/cookpete/react-player)                                                 | React player for files and multiple hosting providers, with media events and refs | Custom application layer required           | Useful for multiple providers, which Shoebox does not currently need.                                                                                                             |
| [Contently annotation comments](https://github.com/trilogy-group/contently-videojs-annotation-comments) | Plugin on Video.js                                                                | Moment/range annotations, comments, replies | Closest existing commenting package found, but README targets Video.js 7. No documented Loom-style emoji reaction layer. Compatibility with Video.js 10 has not been established. |
| [Vidstack](https://vidstack.io/docs/player/)                                                            | React and web-component players                                                   | Custom application layer required           | Official docs now say security-only maintenance until January 2028 and direct new work to Video.js 10.                                                                            |
| [Media Chrome](https://www.media-chrome.org/)                                                           | Customizable media controls                                                       | Custom application layer required           | Official home page now directs users toward Video.js.                                                                                                                             |

No researched package provides the complete Loom presentation and timed social
interactions as a ready-made React component. This is a scoped finding, not a
claim that no such package exists anywhere. A player handles media; our application
still owns identities, permissions, persisted comments and reaction events.

The selected prototype wraps its page in Video.js `VideoPlayer`, renders its
media through `Video` inside `Container`, and uses the library's `PlayButton`,
`MuteButton` and `FullscreenButton`. The custom timeline, comment composer and
reaction layer stay connected through the forwarded native media ref. The source
is still local fixture bytes or a browser object URL, with no hosting or analytics
service required.

The approved production integration uses a separate moment-specific reaction
collection alongside the existing one-reaction-per-member/item contract.

## Loom evidence and visual interpretation

[Loom's official interaction guide](https://support.atlassian.com/loom/docs/react-to-videos-with-emojis-and-in-video-comments)
describes comments and emojis appearing on the timeline, hover expansion,
a side comments panel and replies. It also documents a smile control for
additional emojis and a maximum of 50 recent reactions displayed by the player.
This prototype does not reproduce Loom's authentication or public embed rules.
Shoebox remains member-only.

[How to interact with a video](https://www.loom.com/community/how-to-interact-with-a-video)
is Loom's own explanatory walkthrough.

The inspected [Loom onboarding article](https://www.growthmates.news/p/onboarding-at-loom-the-impact-of)
contains a [watch-page screenshot](https://substack-post-media.s3.amazonaws.com/public/images/245f3dd4-534a-4e6e-b81e-7882a9f8d8d8_1534x1186.png)
with a pale-gray player area, white right-hand rail, purple comment timestamps,
a purple active-tab rule, an emoji capsule below the video, and an adjacent
Comment action. Those elements anchor the prototype's visual treatment.
The screenshot is historical evidence, not proof of the exact current signed-in
Loom UI. Loom's logo, camera bubble, AI chapters, sharing permissions and business
navigation are outside this prototype. Archivo reuses a local project font.

## Interaction decisions to try

- Clicking a comment timestamp or timeline marker seeks the actual video.
- Focusing the composer pauses playback and captures the current time. Moving
  the playhead afterward does not move a draft's anchor.
- The timestamp chip switches between a moment and the whole video.
- An emoji tap records the current media time, briefly floats the emoji, and
  adds a focusable timeline marker. Comment hearts are a separate interaction.
- Replies stay within their parent thread and do not create new timeline marks.
- Keyboard arrows operate the native range input; controls have accessible names.
- The selected desktop composition keeps the conversation beside the player;
  phones place it beneath the video.
- Empty-state and sample-restoration controls make the initial experience reviewable.

## Deliberate prototype limits

No persistence, networking, notifications, real membership or production error
recovery. No captions supplied for the generated silent clip. Reactions animate
on entry, not on subsequent playback passes. Dense marker clustering and precise
subsecond labeling need a production decision. Touch targets and older-family
readability need review on real phones before adopting Loom's compact proportions.
The Loom palette applies only to this prototype; it is not a replacement for
Memory Shoebox's existing design system.

These prototype limits are addressed separately in the approved production
design, implementation and tests. The preview itself intentionally retains local state.

## Verification of this probe

Chromium checks passed for real playback, seeking from a comment, a draft keeping
its captured timestamp after seeking, timestamped reactions, replies, pause on
compose, whole-video comments, empty state, keyboard seeking and timestamp URLs.
Local-file playback and unsupported-media feedback were exercised. Desktop (1440px)
and phone (390px) captures were inspected; neither prototype layout overflowed.
The research page also fits at 390px. An independent visual review requested one
fix: local media must not retain the synthetic sample caption. That was corrected
and verified in both sizes. Prototype TypeScript, oxlint and formatting checks pass.
These checks describe the standalone prototype; production checks are recorded
in the implementation plan.

## Library adoption verification

After selecting the sidebar, Chromium verified Video.js play/pause, mute, enter/exit
fullscreen and playback-rate changes. Seeking from comments, retaining a draft's
original timestamp after seeking, and recording emoji reactions at the current
time also passed. The preview server resolves the package's published entry points
from the web workspace rather than guessing internal paths for browser imports.
