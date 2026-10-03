import { renderEmail } from "../../lib/renderEmail.ts";
import type { EmailTemplate } from "../../emailTemplate.types.ts";
import type { UploadSessionEmailPayload } from "@memory-shoebox/shared";
import { UploadSessionEmail } from "./UploadSessionEmail.tsx";
import { uploadSessionSubject } from "./uploadSessionCopyHelpers.ts";
/** The upload kind's copy, as the queue consumes it. */
export const uploadSessionEmail: EmailTemplate<UploadSessionEmailPayload> = {
  /** Who put up how many of this reader's photos, and from when. */
  subject: uploadSessionSubject,
  /** Renders the full message, ready for the send queue. */
  render: (payload) => {
    return renderEmail(<UploadSessionEmail payload={payload} />);
  },
};
