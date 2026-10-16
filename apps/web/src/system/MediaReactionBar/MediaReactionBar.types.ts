/** One generic reaction value and its visible and accessible labels. */
export type Choice<Value extends string> = {
  value: Value;
  emoji: string;
  label: string;
  title?: string;
};
