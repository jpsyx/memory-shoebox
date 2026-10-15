# Generated processing fixtures

These are synthetic charts, deterministic noise and FFmpeg test patterns. They
contain no family media, fetched images or externally licensed recordings. The
source generator and small outputs are committed, following the existing
`e2e/fixtures/cartoon-media` convention. Generic media ignore patterns require
explicitly adding the named generated assets with `git add -f`.

Rebuild from the root with `pnpm exec tsx scripts/media/makeProcessingFixtures.ts`.
The generator needs native FFmpeg with libx264/libx265, Sharp from the server's
workspace dependencies, Docker, and the existing `memory-shoebox-media-tools`
image (`docker build --target media-tools -t memory-shoebox-media-tools .`).
No service credentials or web build secrets are needed. Encoder versions can
change compressed bytes; the tests assert decoded behavior, not golden hashes.

| Input                            | Purpose                                                                                                                                     |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| `detail.png`                     | 2400×1600 RGB quadrants with six-pixel white/blue detail stripes.                                                                           |
| `oriented.jpg`                   | That chart with EXIF orientation 6: display is 1600×2400.                                                                                   |
| `heavy.jpg`                      | Deterministic 400×400 noise at JPEG quality 100, over 128 KiB.                                                                              |
| `transparent.png`                | Fully transparent 80×40 red RGBA, flattened to white.                                                                                       |
| `primary.heic`                   | The B3 generated 32×64 oriented primary, red above green, with an 8×16 embedded thumbnail. Its provenance is in the runtime fixture README. |
| `audio.mp4`                      | 2.4 seconds of 1440×810 60fps testsrc2 and a 440Hz audio tone; BT.709 primaries/transfer, limited SMPTE170M matrix.                         |
| `rotated.mp4`                    | Same streams with a 90-degree display matrix, created by the shipping FFmpeg generation.                                                    |
| `vfr.mp4`                        | 320×180 silent H.264; frame selection changes from 30fps to 15fps.                                                                          |
| `hevc.mp4`                       | Silent 320×180, 24fps, 10-bit HEVC.                                                                                                         |
| `pq.mp4`, `hlg.mp4`              | One-second 320×212 10-bit HEVC color/detail charts, actually transfer-encoded as HDR.                                                       |
| `sdr-601-anamorphic.mp4`         | One-second H.264 red/lime/blue/white quadrants: coded 720×576, SAR 16:15, DAR 4:3, BT.709 primaries/transfer and limited SMPTE170M matrix.  |
| `sdr-601-anamorphic-rotated.mp4` | Same encoded pixels and SAR with a 90-degree display matrix.                                                                                |
| `untagged.mp4`                   | Untagged 64×48 H.264, used for conservative SDR/HDR colorimetry refusal.                                                                    |
| `tiny-display-aspect.mp4`        | Tagged 16×16 H.264 with SAR 1:16; cannot fit positive even square-pixel dimensions without upscaling.                                       |

The SDR chart uses FFmpeg's lavfi colors, which encode RGB color constants
with the limited BT.601/SMPTE170M YUV matrix. The fixture declares BT.709
primaries/transfer and the actual SMPTE170M matrix. This is a matrix conversion
regression: changing only tags gives the red patch green=24, while actual
conversion returns green near zero. The anamorphic fixture's square-pixel
result is 720×540, or 540×720 after the accepted 90-degree transform. Its SAR
is deliberately retained by the encoder. The ordinary testsrc2 fixtures now
also declare their source matrix, primaries and transfer; untagged input is
kept separately for refusal. `--review-only` regenerates the four new fixtures.

For the HDR inputs, zscale reads the chart as sRGB transfer (`iec61966-2-1`),
BT.709 primaries and RGB matrix (`gbr`). It converts the **pixels** to BT.2020
primaries, BT.2020 nonconstant-luminance matrix, and either SMPTE ST 2084 (PQ)
or ARIB STD-B67 (HLG), before 10-bit HEVC encoding. The output also carries the
matching tags. Scaling preserves their 3:2 display aspect using SAR 159:160
at coded 320×212; square-pixel playback is therefore 318×212. These are
transfer-converted synthetic colors, not SDR pixels
with HDR labels. They do not substitute for subjective family-footage review.

The ordinary recipe tests need native FFmpeg, ffprobe and heif-thumbnailer.
`MEDIA_TEST_CODECS=docker pnpm --filter @memory-shoebox/server exec vitest run
test/mediaProcessing/codecFixtures.test.ts` additionally exercises the shipping
FFmpeg/zscale for PQ, HLG, and missing-colorimetry refusal. With the same flag,
`videoRecipe.test.ts` also runs the encoded SDR matrix, anamorphic, rotation
and geometry/color refusal regressions through the shipping FFmpeg. The Docker adapter
serves its fixture through a loopback range source inside a network-disabled
container, then uses native Sharp for posters. These adapters establish codec
behavior only. They do not prove B2 accounting, cgroup memory/CPU isolation,
serving headroom, or the 512 MiB deployment envelope.
