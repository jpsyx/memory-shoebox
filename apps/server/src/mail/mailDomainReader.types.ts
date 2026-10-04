/** Read-only provider facts for one exact sending domain. */
export type MailDomainReader = (domain: string) => Promise<{
  isVerified: boolean;
  /** Sanitized provider error, absent when the domain list was read. */
  error: string | undefined;
}>;
