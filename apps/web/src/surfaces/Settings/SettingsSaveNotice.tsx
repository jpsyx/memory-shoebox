import type { ReactNode } from "react";
import { Prose } from "@/system/typography/Prose";
import { useSettingsSnapshot } from "@/surfaces/Settings/useSettingsSnapshot";
/**
 * Announces the actual field most recently saved without inventing delivery
 * success.
 */
export function SettingsSaveNotice({
  field,
}: Readonly<{ field: string }>): ReactNode {
  const snapshot = useSettingsSnapshot();
  return snapshot.field === field ? (
    <Prose role="status">{snapshot.message}</Prose>
  ) : null;
}
