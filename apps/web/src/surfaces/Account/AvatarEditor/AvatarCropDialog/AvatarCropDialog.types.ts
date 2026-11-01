import type { AvatarCrop } from "@memory-shoebox/shared";
/** Controlled crop-dialog values and actions. */
export type AvatarCropDialogOptions = {
  opened: boolean;
  url: string;
  dimensions: { width: number; height: number } | undefined;
  crop: AvatarCrop;
  onCrop: (crop: AvatarCrop) => void;
  onSave: () => void;
  onCancel: () => void;
  onChoose: () => void;
  onClosed?: () => void;
  isSaving: boolean;
  error?: string;
  onUseLatest?: () => void;
  onOverwrite?: () => void;
};
