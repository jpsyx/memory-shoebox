import {
  meResponseSchema,
  setupStatusResponseSchema,
} from "@memory-shoebox/shared";

type Answer = { body: unknown; status?: number };

/** Composes the fake server's existing state into its navigation response. */
export async function getBootstrapAnswerFromReader(
  read: (path: string) => Answer | Promise<Answer>,
): Promise<Answer> {
  const status = await read("/api/setup");
  if ((status.status ?? 200) >= 400) {
    return status;
  }
  const setup = setupStatusResponseSchema.parse(status.body);
  if (setup.isRequired) {
    return { body: { setup, account: null, progress: null } };
  }
  const account = await read("/api/me");
  if (account.status === 401) {
    return { body: { setup, account: null, progress: null } };
  }
  if ((account.status ?? 200) >= 400) {
    return account;
  }
  const me = meResponseSchema.parse(account.body);
  const progress =
    me.me.role === "admin" ? await read("/api/setup/progress") : { body: null };
  if ((progress.status ?? 200) >= 400) {
    return progress;
  }
  return { body: { setup, account: me, progress: progress.body } };
}
