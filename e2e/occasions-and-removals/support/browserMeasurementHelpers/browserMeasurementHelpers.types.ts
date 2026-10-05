/** Document width and active visual rendition captured after fonts load. */
export type DocumentMetrics = {
  scrollWidth: number;
  clientWidth: number;
  rendition: string | undefined;
};
/** Focused control colors and viewport bounds for visual review. */
export type ControlMetrics = {
  foreground: string;
  background: string;
  outline: string;
  left: number;
  right: number;
  width: number;
  scrollWidth: number;
  clientWidth: number;
};
