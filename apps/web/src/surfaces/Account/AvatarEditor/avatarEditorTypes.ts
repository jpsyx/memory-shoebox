import type { AvatarCrop, MeDto, MeResponse } from "@memory-shoebox/shared";

/** Completion stages a crop, then explicitly saves it after the name claim. */
export type DeferredAvatarSave = {
  onStagedChange: (save: (() => void) | undefined) => void;
  onFailure: () => void;
};
/** Required editor contract and its optional deferred completion owner. */
export type AvatarEditorOptions = {
  me: MeDto;
  onSaved: (response: MeResponse) => void;
  completion?: DeferredAvatarSave;
};
/** One chosen original and the version captured when it was selected. */
export type AvatarSelection = {
  file: File;
  url: string;
  expectedAvatarId: string | null;
};
/** Browser-oriented decoded dimensions and the independently staged crop. */
export type AvatarDraft = {
  width: number;
  height: number;
  crop: AvatarCrop;
  isConfirmed: boolean;
};
/** Explicit own-account photo operations. */
export type AvatarOperation =
  | { kind: "save" | "overwrite"; selection: AvatarSelection; crop: AvatarCrop }
  | { kind: "remove"; expectedAvatarId: string | null }
  | { kind: "latest" };
