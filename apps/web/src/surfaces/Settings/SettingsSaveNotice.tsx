import type { ReactNode } from "react";
import { Prose } from "@/system/typography/Prose";
import { useSettingsSnapshot } from "@/surfaces/Settings/useSettingsSnapshot";
type Props = { field: string };

/**
 * Announces the actual field most recently saved without inventing delivery
 * success.
 */
export function SettingsSaveNotice({ field }: Readonly<Props>): ReactNode {
  const snapshot = useSettingsSnapshot();
  return snapshot.field === field ? (
    <Prose role="status">{snapshot.message}</Prose>
  ) : null;
}
