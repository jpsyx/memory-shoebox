import {
  useEffect,
  useRef,
  useState,
  type Dispatch,
  type SetStateAction,
} from "react";
type CanonicalSettingDraft<Value extends string> = {
  draft: Value;
  savedValue: Value;
  setDraft: Dispatch<SetStateAction<Value>>;
  onSaved: (value: Value) => void;
};

/**
 * Accept fresh baselines without overwriting dirty input or pending operations.
 */
export function useCanonicalSettingDraft<Value extends string>({
  canonical,
  blocked,
}: Readonly<{
  canonical: Value;
  blocked: boolean;
}>): CanonicalSettingDraft<Value> {
  const accepted = useRef(canonical);
  const [savedValue, setSavedValue] = useState(canonical);
  const [draft, setDraft] = useState(canonical);
  useEffect(
    function acceptFreshSettingBaseline() {
      if (blocked || accepted.current === canonical) {
        return;
      }
      accepted.current = canonical;
      setSavedValue(canonical);
      setDraft((previousDraft) => {
        return previousDraft === savedValue ? canonical : previousDraft;
      });
    },
    [canonical, blocked, savedValue],
  );
  const onSaved = (value: Value) => {
    accepted.current = value;
    setSavedValue(value);
    setDraft(value);
  };
  return { draft, savedValue, setDraft, onSaved };
}
