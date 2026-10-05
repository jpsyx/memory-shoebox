import { useSettingsSnapshot } from "@/surfaces/Settings/useSettingsSnapshot";
import { SettingsReadState } from "@/surfaces/Settings/SettingsSurface/SettingsReadState";
import { useQuery } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { adminSettingsQueryOptions } from "@/api/updateAdminSettings/updateAdminSettings";
import { mailHealthQueryOptions } from "@/api/mailHealth";
import { useMemberReadAuthority } from "@/surfaces/Members/useMemberReadAuthority";
import { SettingsRecovery } from "@/surfaces/Settings/SettingsRecovery";
import { SettingsName } from "@/surfaces/Settings/SettingsName/SettingsName";
import { SettingsArrangement } from "@/surfaces/Settings/SettingsArrangement/SettingsArrangement";
import { SettingsTimezone } from "@/surfaces/Settings/SettingsTimezone/SettingsTimezone";
import { SettingsMail } from "@/surfaces/Settings/SettingsMail/SettingsMail";
import { SettingsStorage } from "@/surfaces/Settings/SettingsStorage";
import { Banner } from "@/system/Chrome/Banner";
import { mailDiagnosisCopy } from "@/surfaces/Settings/SettingsMail/mailDiagnosisCopy";
/** Privileged reads are mounted only under the surface's active-role gate. */
export function SettingsSheets(): ReactNode {
  const settings = useQuery(adminSettingsQueryOptions);
  const health = useQuery(mailHealthQueryOptions);
  const snapshot = useSettingsSnapshot();
  const data = snapshot.hasCommitted
    ? (snapshot.result ?? settings.data)
    : settings.data;
  useMemberReadAuthority(settings.error ?? health.error ?? undefined);
  if (data === undefined) {
    return (
      <>
        <SettingsRecovery />
        <SettingsReadState settings={settings} />
      </>
    );
  }
  return (
    <>
      <SettingsRecovery />
      {health.data?.diagnosis === null || health.data === undefined ? null : (
        <Banner onPanel>
          <strong>Mail needs attention.</strong>{" "}
          {mailDiagnosisCopy(health.data.diagnosis)} Nobody new can sign in
          while mail cannot send; sessions already signed in keep working.
        </Banner>
      )}
      <SettingsName name={data.shoebox.name} />
      <SettingsArrangement arrangement={data.pile.arrangement} />
      <SettingsTimezone timezone={data.shoebox.timezone} />
      <SettingsMail
        fromAddress={data.mail.fromAddress ?? undefined}
        health={health}
      />
      <SettingsStorage storage={data.storage} />
    </>
  );
}
