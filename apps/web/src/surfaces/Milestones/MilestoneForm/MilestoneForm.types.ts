import type {
  MilestoneFormOptions,
  useMilestoneForm,
} from "../useMilestoneForm/useMilestoneForm";
/** Shared editable form state and guarded presentation inputs. */
export type MilestoneFormPart = {
  form: ReturnType<typeof useMilestoneForm>;
  options: MilestoneFormOptions;
  isBlocked: boolean;
};
