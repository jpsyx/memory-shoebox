/** Restores a surviving queue destination when refresh removed the trigger. */
export function restoreRemovalQueueFocus(): void {
  if (
    document.activeElement !== document.body &&
    document.activeElement?.closest('[role="dialog"]') === null
  ) {
    return;
  }
  document
    .querySelector<HTMLElement>(
      '[data-removal-focus-fallback][aria-selected="true"], [data-removal-page-focus]',
    )
    ?.focus();
}
