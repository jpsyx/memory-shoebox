const VALUES = ["thumb", "poster", "display_small", "display"] as const;

/** Supported photo recipe purposes. */
export type ImageRecipePurpose = (typeof VALUES)[number];

/** Runtime values and validation for photo recipes. */
export const ImageRecipePurpose = {
  /** Every supported value, in stable order. */
  values: VALUES,
  /** Checks an untrusted value against the supported categories. */
  isValid: (value: unknown): value is ImageRecipePurpose => {
    return VALUES.some((candidate) => {
      return candidate === value;
    });
  },
} satisfies {
  values: readonly ImageRecipePurpose[];
  isValid: (value: unknown) => value is ImageRecipePurpose;
};
