/** Immutable contract for fixed test literals, including nested arrays. */
export type FixedFixture<Value> =
  Value extends ReadonlyArray<infer Entry>
    ? ReadonlyArray<FixedFixture<Entry>>
    : Value extends object
      ? { readonly [Key in keyof Value]: FixedFixture<Value[Key]> }
      : Value;
