# Photo transition review

Reviewed 19 October 2026 on `fix/photo-handoff`, using Impeccable's polish and
motion guidance. Scope: timeline photo click, loading, flight, viewer handoff,
return navigation and interruption. The existing paper, blue inset and shadow
remain the visual authority.

## Diagnosis

The previous fix measured the destination after decode, but left it visible
while waiting. A local browser reproduction with a 300ms decode delay recorded
the viewer visible at 66ms, decoded at 416ms, then hidden at 432ms when the flight
started. It reappeared at 982ms. This is the reported flash: the final photo
appeared before the entrance animation. Earlier landing-position checks did not
cover this interval.

| Rank | Finding                                                                        | Resolution                                                                                   |
| ---- | ------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------- |
| P1   | Destination paints before the delayed flight.                                  | Hide matching previews and final frames before paint; retain the clicked print immediately.  |
| P1   | Loading and animation use separate visible representations.                    | One inert frame owns the photo from click through landing; the destination is revealed once. |
| P2   | Unequal horizontal and vertical scaling can stretch letterboxed photos.        | Animate the isolated frame's dimensions while the image uses `object-fit: contain`.          |
| P2   | 560ms feels slow for repeated navigation.                                      | Use 420ms opening and 300ms return with the existing decelerating easing.                    |
| P2   | Scrolling during loading can leave a floating print and trigger a late flight. | Cancel on wheel, touch movement and scroll keys, while allowing route scroll restoration.    |

## Motion and loading contract

The clicked print stays visible at its source position while the destination
loads. Once selected pixels have decoded and the final layout has committed,
the same frame travels to the viewer. Its paper edge, blue backdrop and shadow
match the destination. No route delay or new animation dependency is introduced.

The holding period is bounded at 1.5 seconds. Expiry restores ordinary content
and prevents a late zoom. Navigation elsewhere, resize, scrolling, Escape,
unmount and membership cleanup also release retained pixels. Reduced motion and
unsupported animation APIs keep ordinary navigation. Accessibility uses the real
frame; the temporary photograph has no controls and is hidden from assistive
technology.

Only the fixed temporary frame changes dimensions. This preserves photo
proportions without reflowing the page, at a small, bounded painting cost.

## Verification

| Check                          | Evidence                                                                                                                                                     |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Regression before the fix      | Both desktop and mobile browser tests failed because the first viewer frame was already visible.                                                             |
| First paint through completion | Four regression cases passed in Chromium and WebKit at 1280px and 390px. They inspect animation frames through the entire sequence.                          |
| Delayed decoding               | With 300ms added delay, the viewer stayed hidden from its first paint at 69ms until completion at 832ms. Holding changed to flight at 415ms.                 |
| Landing and styling            | Manual 1600px desktop check matched the destination bounds exactly; mobile and rotated return differed by less than one CSS pixel. Blue backgrounds matched. |
| Repeated navigation            | Repeat opening and the 300ms in-app return completed with one retained frame.                                                                                |
| Fallbacks                      | Reduced motion showed ordinary content. Wheel interruption and a decode exceeding the 1.5s limit restored the viewer with no later flight.                   |
| Lifecycle coverage             | All 2,207 web tests passed. The 61 focused tests include preview replacement, stale cleanup, expiry, failed animation and interruption.                      |
| Performance sample             | No main-thread task over 50ms was recorded during the delayed desktop journey. This is a local sample, not a guarantee for every device.                     |

Build, type, lint and formatting checks accompany the change. The Impeccable
mechanical scan returned no findings. An independent code review identified the
holding-period scroll case; its regression failed before the cancellation fix
and passed afterward. Screenshots capture the moving and landing frames at
desktop and mobile sizes in the accompanying Downloads evidence folder.
