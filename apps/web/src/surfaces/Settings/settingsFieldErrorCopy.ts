import { ZodError } from "zod";
/**
 * Converts local schema refusals into field-specific copy; server refusal
 * messages stay intact.
 */
export function settingsFieldErrorCopy(
  error: Error | null,
  field: "name" | "sender",
): string | undefined {
  if (error === null) {
    return undefined;
  }
  if (error instanceof ZodError) {
    return field === "sender"
      ? "Enter a valid sending address."
      : "Enter a Shoebox name.";
  }
  return error.message;
}
