/**
 * Whether focus is nowhere anybody put it: on the page itself, which is where
 * a browser drops it when the focused element goes.
 */
export function isFocusLost(): boolean {
  const focused = document.activeElement;
  return focused === null || focused === document.body;
}

/**
 * Whether focus is lost, or still somewhere inside `element`.
 *
 * Asked before moving focus once something has finished, so that somebody
 * who has moved on while it was out keeps their place.
 */
export function isFocusLostOrWithin(element: Element | undefined): boolean {
  return isFocusLost() || (element?.contains(document.activeElement) ?? false);
}
