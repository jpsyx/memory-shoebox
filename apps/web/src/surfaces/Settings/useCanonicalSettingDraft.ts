import {
  useEffect,
  useRef,
  useState,
  type Dispatch,
  type SetStateAction,
} from "react";
/** Accept fresh baselines without overwriting dirty input or pending operations. */
export function useCanonicalSettingDraft<Value extends string>(
  canonical: Value,
  blocked: boolean,
): {
  draft: Value;
  savedValue: Value;
  setDraft: Dispatch<SetStateAction<Value>>;
  onSaved: (value: Value) => void;
} {
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
      setDraft((previous) => {
        return previous === savedValue ? canonical : previous;
      });
    },
    [canonical, blocked, savedValue],
  );
  const onSaved = (value: Value) => {
    setSavedValue(value);
    setDraft(value);
  };
  return { draft, savedValue, setDraft, onSaved };
}
