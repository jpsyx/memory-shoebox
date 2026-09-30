# The cartoon media (`prototypes/scripts/media/`)

Every photograph and every clip in this repository is generated cartoon
artwork: eight scenes, a forty-five frame burst and three ten-second
animations, authored as data and rasterised by a script that is committed
beside its own output. The prototypes render from it, and the development
archive seed uploads the same files into a bucket. **Nothing here is a real
family file, and nothing here is product data.**

```sh
pnpm --filter @memory-shoebox/prototypes media
```

## Why the artwork is generated

`prototypes/media/` used to hold 68MB of real family photographs and one
video, resized into `prototypes/public/media/web/`, which `.gitignore`
excluded. Neither half could be committed, so a fresh clone rendered every
mockup as a wall of broken images, and neither half could be pushed into a
bucket from anywhere but one laptop.

The burst is the second reason. A stack exists to collapse a run of
near-identical frames, and `app.config.ts` § `burst.maxGapSeconds` was tuned
against a real run of forty-five shots between 06:41 and 06:44. A set that
cannot reproduce that run cannot exercise the component built for it, and
collecting forty-five near-identical photographs by hand is not something to
ask of the next person.

## What it produces

118 files, 1.8MB in total, all in `prototypes/public/media/web/`.

| Piece     | Files                                                       | What                                                                                      |
| --------- | ----------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| Stills    | `<scene>.jpg` and `<scene>-thumb.jpg`, eight of each        | Cot, bath, high chair, pram, first steps, cake, beach and arrival, landscape and portrait |
| The burst | `burst_001.jpg` to `burst_045.jpg`, and a thumbnail of each | One cake scene, the flame and an arm moving a tenth of a swing across the whole run       |
| Clips     | `<name>.mp4`, `.webm`, `-poster.jpg` and `-thumb.jpg`       | First steps, splashing and the walk: ten seconds at 12fps, h264 and vp9                   |

Stills are about 1600px on the long edge and thumbnails 400px, which is the
pair a print draws from. Every clip ships twice because no one codec is safe
everywhere, and each carries a poster so a video in the pile is a still until
it is asked to play.

## How it is drawn

Three modules, and the split is what keeps the artwork editable:

| Module                | What it holds                                                                                               |
| --------------------- | ----------------------------------------------------------------------------------------------------------- |
| `cartoonScene.ts`     | The eight scenes as shapes in a 0..1 unit square, and `phase`, which moves the one thing in each that moves |
| `cartoonSvg.ts`       | Unit shapes to an SVG document at a pixel size, each axis scaled independently                              |
| `makeCartoonMedia.ts` | The CLI: what to render at what size, and the three programs it shells out to                               |

A scene in unit coordinates serves a landscape still, a portrait still and a
video frame without being authored three times, and `phase` is what turns one
scene into forty-five burst frames or a hundred and twenty clip frames.

The script shells out to **`rsvg-convert`** (SVG to PNG), **`magick`** (PNG to
JPEG) and **`ffmpeg`** (frames to mp4 and webm), so re-running it needs those
three on the path. On macOS that is
`brew install librsvg imagemagick ffmpeg`.

## It is deterministic, and that is load bearing

Nothing in the scenes is random. `phase` is a pure function of the frame's
index, the coordinates are fixed, `magick -strip` drops the timestamps and
tool metadata a JPEG would otherwise carry, and both `ffmpeg` calls run
bit-exact so that the WebM muxer stops writing a random `SegmentUID` and
neither container stamps the encoder's version. Run the generator twice and
`git status` is clean, so a regenerate is an empty diff unless somebody
actually changed the artwork, and a change to a scene can be reviewed as a
diff of the files it moved.

That is checked rather than hoped for: the three WebM files did change on
every run until the bit-exact flags went in, which is what a claim like this
is worth without one run to test it.

## Both the generator and its output are committed

The generator makes the set reproducible and adjustable. The output makes a
fresh clone render without `rsvg-convert`, `magick` or `ffmpeg` installed,
which is the ordinary case for somebody opening the mockups for the first
time. Committing only one of the two would cost one of those two properties
and there is no reason to.

`.gitignore` is what makes that safe rather than careless. It excludes `*.jpg`
and `*.mp4` everywhere, belt and braces so that a stray capture or a
`git add -A` in the wrong directory cannot put a real photograph in this
repository, and then un-excludes those two extensions under
`prototypes/public/media/web/` alone. `.webm` needs no exception, because no
rule excludes it. `prototypes/media/`, the old hand-made source folder, stays
excluded so a leftover local copy cannot be committed by accident.

## The archive seed uploads the same files

`pnpm seed:archive` writes a development catalog and then puts one object in
the bucket for every rendition it wrote
([configuration.md § Something to look at](configuration.md)). It mints each
key as `seed/<item key>/<purpose>/<file>`, where the last segment is the
cartoon file's own name, so the uploader reads it straight out of
`prototypes/public/media/web/` and everything the seed owns sits under one
prefix in the bucket. `--no-objects` skips that step entirely, which is what
the end-to-end run uses.

There is no second copy of the artwork for the server to read. The seed
reaches across to the prototypes' directory by path, which is a file read
rather than an import and so is not the boundary `AGENTS.md` forbids. That is
also the one thing to remember when step 9 deletes `prototypes/`: this set has
to move rather than go with it, or the seed loses its objects.
