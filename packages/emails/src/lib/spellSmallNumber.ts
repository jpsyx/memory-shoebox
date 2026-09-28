/**
 * Spells a small number in English, falling back to digits.
 *
 * The mockup reads "It works for ten minutes", and the payload carries `10` so
 * the copy cannot drift from the row. Hard-coding the word would defeat the
 * field, and printing "10" would not be the copy that was designed, so the
 * number is spelled.
 */
export function spellSmallNumber(value: number): string {
  const words = [
    "zero",
    "one",
    "two",
    "three",
    "four",
    "five",
    "six",
    "seven",
    "eight",
    "nine",
    "ten",
    "eleven",
    "twelve",
  ];
  return words[value] ?? String(value);
}
