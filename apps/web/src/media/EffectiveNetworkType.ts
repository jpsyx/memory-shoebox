const VALUES = ["slow-2g", "2g", "3g", "4g", "unknown"] as const;

/** Supported browser connection categories. */
export type EffectiveNetworkType = (typeof VALUES)[number];

/** Runtime values and validation for speculative connection policy. */
export const EffectiveNetworkType = {
  /** Every supported value, in stable order. */
  values: VALUES,
  /** Checks an untrusted value against the supported categories. */
  isValid: (value: unknown): value is EffectiveNetworkType => {
    return VALUES.some((candidate) => {
      return candidate === value;
    });
  },
} satisfies {
  values: readonly EffectiveNetworkType[];
  isValid: (value: unknown) => value is EffectiveNetworkType;
};
