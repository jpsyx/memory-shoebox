import { Banner } from "@/system/Chrome/Banner";
import { ICON_PROPS_SMALL } from "@/system/icons";
import { IconAlertTriangle } from "@tabler/icons-react";
import type { ReactNode } from "react";

/** Announces a refresh limitation without interrupting the current upload. */
export function UploadRecoveryStorageNotice({
  warning,
}: Readonly<{ warning?: string }>): ReactNode {
  return warning ? (
    <div role="status">
      <Banner
        icon={<IconAlertTriangle {...ICON_PROPS_SMALL} aria-hidden="true" />}
      >
        {warning}
      </Banner>
    </div>
  ) : null;
}
