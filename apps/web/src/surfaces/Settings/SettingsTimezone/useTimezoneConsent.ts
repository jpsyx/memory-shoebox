import { useEffect, useRef, useState } from "react";
import type { UpdateSettingsResponse } from "@memory-shoebox/shared";
import { useSettingsPreview } from "@/surfaces/Settings/useSettingsPreview";
type TimezoneConsent = {
  preview: ReturnType<typeof useSettingsPreview>;
  previewResult: UpdateSettingsResponse | undefined;
  resetPreview: () => void;
  onPreview: () => void;
};

/** Consent belongs to one candidate and one uninterrupted saved baseline. */
export function useTimezoneConsent({
  draft,
  canonicalZone,
}: Readonly<{ draft: string; canonicalZone: string }>): TimezoneConsent {
  const [result, setResult] = useState<UpdateSettingsResponse | undefined>(
    undefined,
  );
  const baselineVersion = useRef(0);
  const requestedVersion = useRef(0);
  useEffect(
    function discardChangedBaselineConsent() {
      baselineVersion.current += 1;
      setResult(undefined);
    },
    [canonicalZone],
  );
  const preview = useSettingsPreview((response) => {
    if (requestedVersion.current === baselineVersion.current) {
      setResult(response);
    }
  });
  const resetPreview = () => {
    setResult(undefined);
    preview.reset();
  };
  const onPreview = () => {
    requestedVersion.current = baselineVersion.current;
    setResult(undefined);
    preview.mutate(draft);
  };
  const previewResult =
    result?.timezoneImpact?.fromZone === canonicalZone &&
    result.timezoneImpact.toZone === draft
      ? result
      : undefined;
  return { preview, previewResult, resetPreview, onPreview };
}
