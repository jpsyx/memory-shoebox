import { Button } from "@mantine/core";
import { useRef, type ReactNode } from "react";
import { UploadDropzone } from "./UploadDropzone";
import uploadClasses from "../upload.module.css";
type Props = {
  onPick: (files: readonly File[]) => void;
  isDisabled?: boolean;
  isDropzone?: boolean;
};
/** Passes every pick to declaration, including unsupported originals. */
export function UploadFilePicker({
  onPick,
  isDisabled = false,
  isDropzone = false,
}: Readonly<Props>): ReactNode {
  const input = useRef<HTMLInputElement>(null);
  return (
    <>
      <input
        ref={input}
        type="file"
        tabIndex={-1}
        multiple
        className={uploadClasses.fileInput}
        aria-label="Choose photographs and videos"
        disabled={isDisabled}
        onChange={(event) => {
          const files = Array.from(event.currentTarget.files ?? []);
          event.currentTarget.value = "";
          if (files.length > 0) {
            onPick(files);
          }
        }}
      />
      {isDropzone ? (
        <UploadDropzone
          onPick={onPick}
          isDisabled={isDisabled}
          onOpen={() => {
            input.current?.click();
          }}
        />
      ) : (
        <Button
          onClick={() => {
            input.current?.click();
          }}
          disabled={isDisabled}
        >
          Choose the files again
        </Button>
      )}
    </>
  );
}
