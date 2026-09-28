import type { ReactNode } from "react";

/** The shape every plain block of text in the system shares. */
export type TextBlock = {
  children: ReactNode;
  className?: string;
  id?: string;
};
