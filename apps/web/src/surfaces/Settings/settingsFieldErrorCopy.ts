import { ZodError } from "zod";
/**
 * Converts local schema refusals into field-specific copy; server refusal
 * messages stay intact.
 */
export function settingsFieldErrorCopy({
  error,
  field,
}: Readonly<{
  error: Error | undefined;
  field: "name" | "sender" | "baseUrl";
}>): string | undefined {
  if (error === undefined) {
    return undefined;
  }
  if (error instanceof ZodError && field === "baseUrl") {
    return "Enter a full URL starting with http:// or https://.";
  }
  return error instanceof ZodError
    ? field === "sender"
      ? "Enter a valid sending address."
      : "Enter a Shoebox name."
    : error.message;
}
