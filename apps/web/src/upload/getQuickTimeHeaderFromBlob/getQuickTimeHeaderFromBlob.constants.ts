/**
 * How many atoms one walk may step over before it gives up.
 *
 * A real movie has a handful at each level (`ftyp`, `wide`, `mdat`, `moov`,
 * perhaps `free`; `mvhd`, a few `trak`, `udta`), so this only ever bites on a
 * file that is not one, where it stops a garbage size field from turning into
 * thousands of tiny reads.
 */
export const MAX_ATOMS_PER_LEVEL = 64;

/** The bytes of an `mvhd` body this reads: version 1 is the longer one. */
export const MVHD_BODY_BYTES = 32;

/** The bytes of a `tkhd` body this reads: version 1 is the longer one. */
export const TKHD_BODY_BYTES = 96;
