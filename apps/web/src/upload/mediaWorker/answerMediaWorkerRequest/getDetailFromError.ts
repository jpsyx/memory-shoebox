/** A thrown value as one line, for a `failed` response and the admin's eye. */
export function getDetailFromError(error: unknown): string {
  return error instanceof Error
    ? `${error.name}: ${error.message}`
    : String(error);
}
