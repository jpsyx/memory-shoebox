import { useEffect, useState } from "react";

/** Keeps the tick toolbar below the header as its navigation wraps or zooms. */
export function useTimelineToolbarTop(): number {
  const [top, setTop] = useState(0);
  useEffect(() => {
    const header = document.querySelector("header");
    if (!header) {
      return;
    }
    const measure = () => {
      setTop(header.getBoundingClientRect().height);
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(header);
    return () => {
      observer.disconnect();
    };
  }, []);
  return top;
}
