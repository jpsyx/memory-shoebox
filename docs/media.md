# Generated cartoon media

The committed artwork in `e2e/fixtures/cartoon-media/web/` contains 118 files:
eight still scenes and thumbnails, a forty-five-frame cake burst and thumbnails,
and three ten-second animations (MP4, WebM, poster and thumbnail). These are
generated drawings, never family captures. Browser fixtures and the development
archive seed use the same bytes. Production modules do not import this directory.

The three generator modules and their tests live beside the artwork in
`e2e/fixtures/cartoon-media/generator/`. `cartoonScene.ts` defines shapes in a
unit square and deterministic motion phases; `cartoonSvg.ts` scales them into
SVG; `makeCartoonMedia.ts` calls `rsvg-convert`, `magick` and `ffmpeg` to produce
the committed raster and video files. Stills are about 1600px on the long edge,
with 400px thumbnails. Clips use H.264 and VP9 at 12fps.

```sh
# Regeneration needs librsvg, ImageMagick and ffmpeg on PATH.
pnpm media:generate
```

Fixed geometry, stripped metadata and bit-exact encoding preserve deterministic
output. Both source and output are retained so fresh clones need no media tools.
The narrow `.gitignore` exceptions cover only this generated set and the existing
upload fixtures; raw family media still belongs in the owner's object store.

## Development archive objects

The seed writes keys as `seed/<item key>/<purpose>/<file>`. `--no-objects` seeds
catalog metadata only, which is sufficient for ordinary archive browser tests;
media acceptance fixtures provide their own actual local bytes.

The server seed's default media path still points to the retired surface
package. Editing that server file was outside the approved scope, so a plain
object-seeding command currently needs an explicit override. From the repository
root, substitute the administrator's real address:

```sh
pnpm seed:archive --as admin@example.com --media-dir "$PWD/e2e/fixtures/cartoon-media/web"
```

This documented workaround avoids a second copy and preserves the server scope
boundary. The outstanding default-path correction is recorded in step 9 verification.
