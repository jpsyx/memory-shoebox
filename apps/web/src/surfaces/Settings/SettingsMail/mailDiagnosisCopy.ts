import type { MailDiagnosis } from "@memory-shoebox/shared";
/** Safe diagnosis facts come from the server's sanitizing response boundary. */
export function mailDiagnosisCopy(diagnosis: Readonly<MailDiagnosis>): string {
  switch (diagnosis.code) {
    case "base_url_unset":
      return "The public address is unset. Set PUBLIC_BASE_URL in the deployment configuration, following docs/configuration.md, then recheck mail health.";
    case "from_address_unset":
      return "Set a sending address here, then verify its domain with Resend.";
    case "domain_unverified":
      return `${diagnosis.domain} is not verified with Resend. Add the DNS records Resend gives you, then recheck mail health.${diagnosis.providerError === null ? "" : ` ${diagnosis.providerError}`}`;
    case "provider_rejecting":
      return `The provider is refusing mail since ${new Date(diagnosis.failingSince).toLocaleString()}.${diagnosis.providerStatus === null ? "" : ` Status: ${diagnosis.providerStatus}.`}${diagnosis.providerMessage === null ? "" : ` ${diagnosis.providerMessage}`} Check the provider and deployment mail configuration, then recheck health.`;
    case "backlog":
      return `${diagnosis.queuedCount} messages are waiting, with the oldest queued at ${new Date(diagnosis.oldestQueuedAt).toLocaleString()}. Check the mail worker and provider, then recheck health.`;
  }
}
