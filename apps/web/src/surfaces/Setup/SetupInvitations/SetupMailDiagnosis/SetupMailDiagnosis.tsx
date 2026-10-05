import { mailHealthQueryOptions } from "@/api/mailHealth";
import { Button, Stack, Text } from "@mantine/core";
import type { MailDiagnosis } from "@memory-shoebox/shared";
import { useQuery } from "@tanstack/react-query";
import type { ReactNode } from "react";
import classes from "./SetupMailDiagnosis.module.css";

function _mailDiagnosis(diagnosis: MailDiagnosis): string {
  switch (diagnosis.code) {
    case "base_url_unset":
      return "Set the public URL in Shoebox settings so invitation links can open here.";
    case "from_address_unset":
      return "Set a sender email in Shoebox settings before queued invitations can be sent.";
    case "domain_unverified":
      return `Verify ${diagnosis.domain} with the email provider before queued invitations can be sent.`;
    case "provider_rejecting":
      return "The email provider is refusing messages. Check the server email configuration.";
    case "backlog":
      return "Email is waiting in the queue. Invitations may take a little longer.";
  }
}
/** Actual provider diagnosis does not gate account creation or skipping. */
export function SetupMailDiagnosis(): ReactNode {
  const health = useQuery(mailHealthQueryOptions);
  if (health.isError) {
    return (
      <Stack>
        <Text className={classes.setupMailDiagnosisError}>
          Could not check email delivery. You can still queue invitations or
          skip.
        </Text>
        <Button
          variant="default"
          onClick={() => {
            void health.refetch();
          }}
        >
          Check email again
        </Button>
      </Stack>
    );
  }
  if (health.data?.diagnosis == null) {
    return null;
  }
  return (
    <Text role="status" className={classes.setupMailDiagnosisNotice}>
      {_mailDiagnosis(health.data.diagnosis)} You can skip and start uploading
      now.
    </Text>
  );
}
