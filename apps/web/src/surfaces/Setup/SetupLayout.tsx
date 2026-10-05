import type { ReactNode } from "react";
import { Centred } from "@/system/Chrome/Centred";
import { Sheet } from "@/system/Chrome/Sheet";
import { TopBar } from "@/system/Chrome/TopBar";
import classes from "./Setup.module.css";

type Props = { shoeboxName: string; children: ReactNode };
/** The incumbent narrow sheet and setup bar shared by the two steps. */
export function SetupLayout({
  shoeboxName,
  children,
}: Readonly<Props>): ReactNode {
  return (
    <>
      <TopBar title={shoeboxName} detail="Setup" />
      <Centred>
        <Sheet className={classes.sheet}>{children}</Sheet>
      </Centred>
    </>
  );
}
