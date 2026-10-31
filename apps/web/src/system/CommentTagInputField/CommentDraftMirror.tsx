import { useLayoutEffect, useRef, type ReactNode, type RefObject } from "react";
import type { CommentDraft } from "../commentDraftHelpers/commentDraftHelpers";
import classes from "./CommentTagInputField.module.css";
type Props = {
  value: CommentDraft;
  fieldRef: RefObject<HTMLTextAreaElement | null>;
};
/** Paints selected ranges without changing the native input's glyph metrics. */
export function CommentDraftMirror({
  value,
  fieldRef,
}: Readonly<Props>): ReactNode {
  const mirror = useRef<HTMLDivElement>(null);
  useMirrorLayout(fieldRef, mirror, value);
  let cursor = 0;
  const parts = value.commentTags.flatMap((tag, index) => {
    const before = value.body.slice(cursor, tag.start);
    cursor = tag.end;
    return [
      before,
      <span className={classes.selectedTag} key={index}>
        {value.body.slice(tag.start, tag.end)}
      </span>,
    ];
  });
  return (
    <div ref={mirror} className={classes.mirror} aria-hidden="true">
      {parts}
      {value.body.slice(cursor)}
      {"\u200b"}
    </div>
  );
}

function useMirrorLayout(
  fieldRef: Props["fieldRef"],
  mirror: RefObject<HTMLDivElement | null>,
  value: CommentDraft,
): void {
  useLayoutEffect(() => {
    const field = fieldRef.current;
    const layer = mirror.current;
    if (!field || !layer) {
      return;
    }
    const sync = () => {
      _syncMirrorMetrics(field, layer);
      layer.scrollTop = field.scrollTop;
      layer.scrollLeft = field.scrollLeft;
    };
    const observer = new ResizeObserver(sync);
    observer.observe(field);
    field.addEventListener("scroll", sync);
    sync();
    return () => {
      observer.disconnect();
      field.removeEventListener("scroll", sync);
    };
  }, [fieldRef, mirror, value]);
}

function _syncMirrorMetrics(
  field: HTMLTextAreaElement,
  layer: HTMLDivElement,
): void {
  const style = getComputedStyle(field);
  [
    "fontFamily",
    "fontSize",
    "fontWeight",
    "fontStyle",
    "lineHeight",
    "letterSpacing",
    "wordSpacing",
    "textIndent",
    "textTransform",
    "tabSize",
    "paddingTop",
    "paddingRight",
    "paddingBottom",
    "paddingLeft",
  ].forEach((property) => {
    layer.style[property as "fontFamily"] = style[property as "fontFamily"];
  });
  layer.style.width = `${field.clientWidth}px`;
  layer.style.height = `${field.clientHeight}px`;
  layer.style.left = `${field.offsetLeft + field.clientLeft}px`;
  layer.style.top = `${field.offsetTop + field.clientTop}px`;
}
