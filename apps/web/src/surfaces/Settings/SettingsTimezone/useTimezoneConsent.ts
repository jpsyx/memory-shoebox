import { useEffect, useRef, useState } from "react";
import type { UpdateSettingsResponse } from "@memory-shoebox/shared";
import { useSettingsPreview } from "@/surfaces/Settings/useSettingsPreview";
/** Consent belongs to one candidate and one uninterrupted saved baseline. */
export function useTimezoneConsent(
  draft: string,
  canonicalZone: string,
): {
  preview: ReturnType<typeof useSettingsPreview>;
  previewResult: UpdateSettingsResponse | null;
  resetPreview: () => void;
  onPreview: () => void;
} {
  const [result, setResult] = useState<UpdateSettingsResponse | null>(null);
  const baselineVersion = useRef(0);
  const requestedVersion = useRef(0);
  useEffect(
    function discardChangedBaselineConsent() {
      baselineVersion.current += 1;
      setResult(null);
    },
    [canonicalZone],
  );
  const preview = useSettingsPreview((response) => {
    if (requestedVersion.current === baselineVersion.current) {
      setResult(response);
    }
  });
  const resetPreview = () => {
    setResult(null);
    preview.reset();
  };
  const onPreview = () => {
    requestedVersion.current = baselineVersion.current;
    setResult(null);
    preview.mutate(draft);
  };
  const previewResult =
    result?.timezoneImpact?.fromZone === canonicalZone &&
    result.timezoneImpact.toZone === draft
      ? result
      : null;
  return { preview, previewResult, resetPreview, onPreview };
}
