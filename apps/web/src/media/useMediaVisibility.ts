import { useEffect, useState, type RefObject } from "react";
/** Actual intersection only: mounted or overscanned nodes are not visible. */
export function useMediaVisibility(
  element: RefObject<Element | null>,
): boolean {
  const [isVisible, setIsVisible] = useState(false);
  useEffect(() => {
    const node = element.current;
    if (node === null) {
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries.find((candidate) => {
          return candidate.target === node;
        });
        if (entry !== undefined) {
          setIsVisible(entry.isIntersecting && entry.intersectionRatio > 0);
        }
      },
      { rootMargin: "0px", threshold: 0 },
    );
    observer.observe(node);
    return () => {
      observer.disconnect();
    };
  }, [element]);
  return isVisible;
}
