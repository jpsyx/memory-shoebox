import { Button } from "@mantine/core";
import { useRef, type ReactNode } from "react";
import { UploadDropzone } from "../UploadDropzone";
import uploadClasses from "./UploadFilePicker.module.css";
type Props = {
  onPick: (files: readonly File[]) => void;
  isDisabled?: boolean;
  isDropzone?: boolean;
  label?: string;
  variant?: "filled" | "default";
};
/** Passes every pick to declaration, including unsupported originals. */
export function UploadFilePicker({
  onPick,
  isDisabled = false,
  isDropzone = false,
  label = "Choose the files again",
  variant = "filled",
}: Readonly<Props>): ReactNode {
  const input = useRef<HTMLInputElement>(null);
  return (
    <>
      <input
        ref={input}
        type="file"
        tabIndex={-1}
        multiple
        className={uploadClasses.uploadFilePickerFileInput}
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
          variant={variant}
          onClick={() => {
            input.current?.click();
          }}
          disabled={isDisabled}
        >
          {label}
        </Button>
      )}
    </>
  );
}
