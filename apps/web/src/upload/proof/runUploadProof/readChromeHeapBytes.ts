/** `performance.memory`, Chrome's own and absent everywhere else. */
export function readChromeHeapBytes(): number | undefined {
  const memory: unknown = Reflect.get(performance, "memory");
  const used: unknown =
    typeof memory === "object" && memory !== null
      ? Reflect.get(memory, "usedJSHeapSize")
      : undefined;
  return typeof used === "number" ? used : undefined;
}
