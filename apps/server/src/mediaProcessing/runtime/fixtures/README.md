# Tiny generated primary-image capability fixture

`primary.heic` is a generated 64×32 chart: the left half is RGB (230,20,30),
the right half (20,210,30). A clockwise 90-degree container transform produces
a 32×64 primary, red above green. Its embedded thumbnail is only 8×16.
There are no personal photos or external fixture licenses.

The source PNG was generated with the repository's Sharp package from raw RGB
pixels. Encoding used libheif 1.23.6:

```sh
heif-enc -q 95 -t 16 --rotate-cw 90 \
  -p x265:pools=none -p x265:frame-threads=1 \
  codec-source.png -o primary.heic
```

The Docker runtime's libheif 1.15.1 decodes this file with
`heif-thumbnailer -p -s 2048`. The capability check asserts 32×64 output and
red/green sample positions, then repeats the color check after JPEG/WebP
encoding. Without `-p`, the dimensions would expose thumbnail substitution.
