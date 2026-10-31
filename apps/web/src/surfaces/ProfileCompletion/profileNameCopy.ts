import { accountNameSchema } from "@memory-shoebox/shared";
import { ApiRequestError } from "@/api/clientHelpers/clientHelpers";

/** Validation copy shared by profile completion and account rename. */
export function profileNameError(name: string): string | undefined {
  if (!name.trim()) return "Enter the name your family knows you by.";
  const parsed = accountNameSchema.safeParse(name);
  if (parsed.success) return undefined;
  return parsed.error.issues.some((issue) => {
    return issue.code === "too_big";
  })
    ? "Keep your name to 80 characters or fewer."
    : "Use your name without @ or line breaks.";
}

/** A name-save refusal without disclosing the owner of a claimed name. */
export function profileNameFailure(error: unknown): string {
  if (error instanceof ApiRequestError && error.code === "name_taken") {
    return "That name is already taken. Try adding your last-name initial, like John M.";
  }
  if (error instanceof ApiRequestError && error.code === "invalid_request") {
    return error.details?.fieldErrors?.displayName?.some((message) => {
      return /80|too (big|long)/iu.test(message);
    })
      ? "Keep your name to 80 characters or fewer."
      : "Use your name without @ or line breaks.";
  }
  return "Couldn't save your name. Your changes are still here.";
}
