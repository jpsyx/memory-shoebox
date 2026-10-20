# Theater mode prototype

Review prototype, October 20, 2026. Source: `prototypes/theater/`.
The approved design reference is retained independently. The production viewer
now implements the shared experience described in [theater](theater.md), using
the existing media and conversation components.

## Design brief

Family members should be able to stay inside a memory, move through the timeline,
and leave a comment without returning to the item page. The media leads; controls
stay at the edges. The selected direction extends the current viewer's fonts,
navy conversation ink, light comment surface, and emoji bar. The black stage,
rounded corner bubble, and morphing panel are intentional theater-specific
exceptions to the normal paper-frame presentation.

| Interaction  | Prototype behavior                                                                                                                                                                                                     |
| ------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Enter        | A shared application container enters browser fullscreen. If unavailable, theater fills the browser window.                                                                                                            |
| Media        | Photos and videos fit without cropping, preserving their proportions. Unused space is black. Matching proportions fill the stage.                                                                                      |
| Navigate     | Left/Right and previous/next buttons traverse one ordered sequence, including transitions between photos and videos. The endpoints do not wrap.                                                                        |
| Edge buttons | Desktop arrows appear in an 80–112px edge zone, without requiring an exact edge hit. Dark backing, a light outline, and a soft shadow preserve contrast. Keyboard focus also reveals them.                             |
| Typing       | Left/Right moves the cursor in the comment textbox. Editable fields and native sliders retain their own keyboard controls.                                                                                             |
| Video        | Starts automatically when opened, including after navigation. A blocked playback request leaves a Play control available. Play/pause, mute, seek, and speed are interactive.                                           |
| Comments     | Hover opens the bottom-right bubble into a conversation and composer. Expansion lasts about 390ms; autofocus starts during expansion.                                                                                  |
| Departure    | Moving between the bubble and panel keeps it open. Leaving both starts a 450ms close delay; returning cancels the delay.                                                                                               |
| Drafts       | Text and the chosen video moment survive closing and media navigation. Positions displayed as 0:00 mean Whole video. The × clears a later timestamp.                                                                   |
| Reactions    | The video emoji bar stays visible, including while comments are open. Buttons trigger a local reaction animation and acknowledgement.                                                                                  |
| Touch        | Arrows remain visible. Tapping the bubble opens comments. On narrow screens the playback and reaction controls move above the panel.                                                                                   |
| Keyboard     | Controls are focusable. Escape closes comments first; Back returns to the normal single-media view of the current item, not the entry item. Native fullscreen Escape returns to window theater, where Escape exits it. |
| Motion       | Reduced-motion preferences remove the morph and reaction travel.                                                                                                                                                       |

Opening the composer pauses the current video and captures its moment, matching
the existing comment behavior. Closing comments does not silently resume playback.
Photo/video navigation keeps the fullscreen container mounted. Playback speed
resets visibly to 1× on each new video; mute carries across navigation.

The title bar is one line: title · date · time · item/total. Its 48px height
matches Back, and its 12px corners match the playback bar. Long labels truncate
on narrow screens rather than wrapping; the complete label remains in the title
attribute. Leaving theater keeps the current media selection, and entering again
starts on that same photo or video. The prototype includes a normal single-media
screen to demonstrate this return path. Photos have no bottom hint bar; the
edge arrows provide navigation.

## Open the preview

From the worktree root:

```sh
pnpm --filter @memory-shoebox/web exec vite --config ../../prototypes/theater/vite.config.mjs
```

Open <http://127.0.0.1:4186/prototypes/theater/> and select **Enter theater**.
Choose **local media** to test your own photos and videos. Files remain on the
device and follow their selection order. The four built-in samples are ordered
chronologically and mix media types. The beach photograph is AI-generated;
the illustrations and short animations are existing repository fixtures.

## Review boundary

Comments and drafts live in browser memory and reset on reload. Reactions are
visual interaction probes, without server persistence. The prototype does not
read family records, send notifications, or call production services. Production
integration reuses the existing timeline-neighbor navigation, media loading,
permission checks, comment APIs, and reaction APIs. No prototype code is imported.

## Verification

TypeScript, lint, formatting, and the standalone production build pass. Browser
checks cover native fullscreen continuity, mixed navigation, edge visibility,
autoplay, comment autofocus and delayed dismissal, cursor keys while typing,
local posting, current-item return and reentry, single-line title sizing,
per-item draft timestamps, playback-speed consistency, touch
controls, reduced motion, and navigation after a media error. Desktop and phone
screenshots accompany this brief. Phone checks use browser touch emulation;
physical-device keyboards and platform-specific fullscreen remain unverified by
emulation. See [production verification](theater-verification.md) for the
implemented viewer evidence.
