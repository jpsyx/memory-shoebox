import { ZodError } from "zod";
/**
 * Converts local schema refusals into field-specific copy; server refusal
 * messages stay intact.
 */
export function settingsFieldErrorCopy({
  error,
  field,
}: Readonly<{ error: Error | undefined; field: "name" | "sender" }>):
  | string
  | undefined {
  if (error === undefined) {
    return undefined;
  }
  return error instanceof ZodError
    ? field === "sender"
      ? "Enter a valid sending address."
      : "Enter a Shoebox name."
    : error.message;
}
