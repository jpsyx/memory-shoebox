const VALUES = [
  "move",
  "acknowledge",
  "widen",
] as const satisfies readonly string[];
/** A distinct explicit reconciliation action. */
export type Action = (typeof VALUES)[number];
/** The available explicit actions and their runtime validation. */
export const ReconcileAction = {
  /** Ordered actions used by the UI and its browser scenarios. */
  values: VALUES,
  /** Checks whether a runtime value names an explicit action. */
  isValid: (value: unknown): value is Action => {
    return VALUES.some((action) => {
      return action === value;
    });
  },
} satisfies {
  values: typeof VALUES;
  isValid: (value: unknown) => value is Action;
};
